import { NextResponse } from "next/server";
import { identitySql } from "@/lib/db";
import { verificarBanco } from "@/lib/unidades/access";
import { multiAtiva, unidadeSchema } from "@/lib/unidades/core";
import { criarLimitador, hashToken, unidadeDoTokenPortal } from "@/lib/integracoes";

export const runtime = "nodejs";
/** Portal do fornecedor (público, por link): consulta o pedido e confirma a previsão de entrega. */
const H = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const limitado = criarLimitador(30);
const nao = (s: number, m: string) => NextResponse.json({ error: m }, { status: s, headers: H });

async function banco(token: string) {
  const un = unidadeDoTokenPortal(token);
  if (!un) return null;
  if (!multiAtiva()) return identitySql();
  const p = unidadeSchema.safeParse(un);
  return p.success ? verificarBanco(p.data) : null;
}
async function verificarTokenPortal(db: ReturnType<typeof identitySql>, token: string) {
  const [t] = await db`select t.id,t.pedido_id from cmp_portal_tokens t where t.token_hash=${hashToken(token)} and t.revogado_em is null and t.expira_em>now()`;
  return t ?? null;
}

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!/^sbp\.[A-Z0-9_-]{2,20}\.[0-9a-f]{48}$/i.test(token)) return nao(400, "Link inválido.");
    if (limitado(hashToken(token))) return nao(429, "Muitas tentativas. Aguarde um minuto.");
    const db = await banco(token);
    if (!db) return nao(400, "Link inválido.");
    const t = await verificarTokenPortal(db, token);
    if (!t) return nao(404, "Link expirado ou revogado. Solicite um novo ao comprador.");
    const [pc] = await db`select p.numero,p.status,p.previsao,f.razao_social fornecedor from cmp_pedidos p join cmp_fornecedores f on f.id=p.fornecedor_id where p.id=${t.pedido_id}`;
    const itens = await db`select i.linha,pr.codigo,pr.descricao,i.quantidade::float,i.quantidade_recebida::float recebida from cmp_pedido_itens i join est_produtos pr on pr.id=i.produto_id where i.pedido_id=${t.pedido_id} order by i.linha`;
    const conf = await db`select previsao_entrega,observacao,criado_em from cmp_confirmacoes where pedido_id=${t.pedido_id} order by id desc limit 5`;
    return NextResponse.json({ pedido: pc, itens, confirmacoes: conf }, { headers: H });
  } catch { return nao(503, "Não foi possível atender a requisição."); }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const token = String(b.t ?? "");
    if (!/^sbp\.[A-Z0-9_-]{2,20}\.[0-9a-f]{48}$/i.test(token)) return nao(400, "Link inválido.");
    if (limitado(hashToken(token))) return nao(429, "Muitas tentativas. Aguarde um minuto.");
    const previsao = String(b.previsao ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(previsao) || Number.isNaN(Date.parse(previsao))) return nao(400, "Informe uma data válida.");
    const db = await banco(token);
    if (!db) return nao(400, "Link inválido.");
    const t = await verificarTokenPortal(db, token);
    if (!t) return nao(404, "Link expirado ou revogado. Solicite um novo ao comprador.");
    await db`select cmp_confirmar_entrega(${t.pedido_id}::uuid,${previsao}::date,${String(b.observacao ?? "").slice(0, 500)},'FORNECEDOR')`;
    await db`update cmp_portal_tokens set usado_em=now() where id=${t.id}`;
    return NextResponse.json({ ok: true }, { headers: H });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return nao(400, /Data de entrega|não aceita/.test(m) ? m.replace(/^.*?: /, "") : "Não foi possível registrar a confirmação.");
  }
}
