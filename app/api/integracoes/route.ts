import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { unidadeHandler } from "@/lib/unidades/handler";
import { unidadeAtual } from "@/lib/unidades/context";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ESCOPOS, EVENTOS, MAX_TENTATIVAS, assinarWebhook, gerarToken, proximaTentativaMin, urlWebhookSegura } from "@/lib/integracoes";

export const runtime = "nodejs";
const ROLES = ["GERENTE"] as const;
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = (e: unknown, fb: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || fb }, { status: proibido ? 403 : 400 });
};

async function unidadeGET() {
  try {
    await requireRoles([...ROLES]);
    const [tokens, webhooks, fila] = await Promise.all([
      q("select id,nome,prefixo,escopos,ativo,expira_em,ultimo_uso,criado_por,criado_em,revogado_em from sys_tokens_api order by criado_em desc limit 100"),
      q("select id,nome,url,eventos,ativo,criado_por,criado_em,(select count(*) from sys_webhook_fila f where f.webhook_id=w.id and f.status='PENDENTE') pendentes,(select count(*) from sys_webhook_fila f where f.webhook_id=w.id and f.status='FALHA') falhas from sys_webhooks w order by criado_em desc"),
      q("select f.id,w.nome webhook,f.evento,f.status,f.tentativas,f.ultimo_erro,f.criado_em,f.enviado_em from sys_webhook_fila f join sys_webhooks w on w.id=f.webhook_id order by f.id desc limit 50"),
    ]);
    return NextResponse.json({ tokens, webhooks, fila, escopos: ESCOPOS, eventos: EVENTOS }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(e, "Falha ao consultar as integrações."); }
}

async function entregar() {
  const pend = await q("select f.id,f.evento,f.payload,f.tentativas,w.url,w.segredo from sys_webhook_fila f join sys_webhooks w on w.id=f.webhook_id where f.status='PENDENTE' and f.proxima_em<=now() and w.ativo order by f.id limit 20");
  let ok = 0, falhas = 0;
  for (const f of pend) {
    const corpo = JSON.stringify({ id: String(f.id), evento: f.evento, dados: f.payload });
    const ts = Math.floor(Date.now() / 1000);
    try {
      if (!urlWebhookSegura(f.url)) throw new Error("URL não permitida");
      const r = await fetch(f.url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json", "X-Sobral-Evento": f.evento, "X-Sobral-Timestamp": String(ts), "X-Sobral-Assinatura": assinarWebhook(corpo, f.segredo, ts) }, body: corpo });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await q("update sys_webhook_fila set status='ENVIADO',enviado_em=now(),tentativas=tentativas+1,ultimo_erro='' where id=$1", [f.id]);
      ok++;
    } catch (e) {
      const t = Number(f.tentativas) + 1;
      await q("update sys_webhook_fila set tentativas=$2,status=$3,proxima_em=now()+($4||' minutes')::interval,ultimo_erro=$5 where id=$1", [f.id, t, t >= MAX_TENTATIVAS ? "FALHA" : "PENDENTE", String(proximaTentativaMin(t)), clean(e instanceof Error ? e.message : "Falha", 200)]);
      falhas++;
    }
  }
  return { processados: pend.length, ok, falhas };
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...ROLES]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    if (acao === "TOKEN") {
      const nome = clean(b.nome, 120);
      if (!nome) throw new Error("Informe o nome da integração.");
      const escopos = (Array.isArray(b.escopos) ? b.escopos : ["leitura"]).filter((e: string) => (ESCOPOS as readonly string[]).includes(e));
      if (!escopos.length) throw new Error("Selecione ao menos um escopo.");
      const dias = Math.min(365, Math.max(1, Number(b.dias) || 90));
      const t = gerarToken(unidadeAtual() ?? "SUL");
      await q("insert into sys_tokens_api(nome,token_hash,prefixo,escopos,expira_em,criado_por) values($1,$2,$3,$4::text[],now()+($5||' days')::interval,$6)", [nome, t.hash, t.prefixo, escopos, String(dias), user.usuario]);
      return NextResponse.json({ token: t.token, aviso: "Guarde agora: o token não será exibido novamente." });
    }
    if (acao === "TOKEN_REVOGAR") {
      const id = clean(b.id, 40); if (!isUuid(id)) throw new Error("Token inválido.");
      await q("update sys_tokens_api set ativo=false,revogado_por=$2,revogado_em=now() where id=$1 and ativo", [id, user.usuario]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "WEBHOOK") {
      const url = clean(b.url, 500);
      if (!urlWebhookSegura(url)) throw new Error("URL deve ser https pública (sem localhost, IP interno ou credenciais).");
      const eventos = (Array.isArray(b.eventos) ? b.eventos : []).filter((e: string) => (EVENTOS as readonly string[]).includes(e));
      if (!eventos.length || !clean(b.nome, 120)) throw new Error("Informe nome e ao menos um evento.");
      const segredo = randomBytes(24).toString("hex");
      await q("insert into sys_webhooks(nome,url,segredo,eventos,criado_por) values($1,$2,$3,$4::text[],$5)", [clean(b.nome, 120), url, segredo, eventos, user.usuario]);
      return NextResponse.json({ segredo, aviso: "Guarde o segredo: ele assina cada envio (X-Sobral-Assinatura)." });
    }
    if (acao === "WEBHOOK_ATIVO") {
      const id = clean(b.id, 40); if (!isUuid(id)) throw new Error("Webhook inválido.");
      await q("update sys_webhooks set ativo=$2 where id=$1", [id, b.ativo === true]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "ENTREGAR") return NextResponse.json(await entregar());
    throw new Error("Ação inválida.");
  } catch (e) { return fail(e, "Falha na operação."); }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
