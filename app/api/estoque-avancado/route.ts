import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"] as const;
const WRITE = ["PCP", "GERENTE", "ENCARREGADO"] as const;
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
const qtd = (v: unknown, msg = "Quantidade inválida.") => { const n = Number(String(v ?? "").replace(",", ".")); if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw new Error(msg); return n; };
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const H = { "Cache-Control": "no-store" };
const erro = (e: unknown, fb: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || fb }, { status: proibido ? 403 : 400 });
};

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const visao = new URL(req.url).searchParams.get("visao") || "enderecos";
    if (visao === "enderecos") {
      const [locais, enderecos, saldos, pendentes] = await Promise.all([
        q("select id,codigo from est_locais where ativo order by codigo"),
        q("select e.id,e.local_id,l.codigo deposito,e.codigo,e.descricao,e.capacidade::float,e.ativo,coalesce((select sum(s.quantidade) from est_endereco_saldos s where s.endereco_id=e.id),0)::float ocupado from est_enderecos e join est_locais l on l.id=e.local_id order by l.codigo,e.codigo"),
        q("select s.endereco_id,s.produto_id,p.codigo,p.descricao,s.quantidade::float from est_endereco_saldos s join est_produtos p on p.id=s.produto_id order by p.codigo limit 1000"),
        q("select produto_id,codigo,descricao,local_id,deposito,fisico::float,enderecado::float,pendente::float from est_v_pendente_enderecar where pendente>0 order by codigo limit 300"),
      ]);
      return NextResponse.json({ locais, enderecos, saldos, pendentes }, { headers: H });
    }
    if (visao === "ciclico") {
      const [devidos, contagens, regras] = await Promise.all([
        q("select * from est_ciclico_devidos($1::date) limit 300", [hoje()]),
        q("select c.id,c.numero,p.codigo,p.descricao,l.codigo deposito,c.classe,c.saldo_sistema::float,c.contado::float,c.status,c.motivo,c.aberta_em,c.contada_em from est_ciclico_contagens c join est_produtos p on p.id=c.produto_id join est_locais l on l.id=c.local_id order by c.numero desc limit 200"),
        q("select classe,frequencia_dias from est_ciclico_regras order by classe"),
      ]);
      return NextResponse.json({ devidos, contagens, regras }, { headers: H });
    }
    if (visao === "peps") {
      const prod = new URL(req.url).searchParams.get("produto") || "";
      if (prod) {
        need(prod, "Produto inválido.");
        return NextResponse.json({ camadas: await q("select * from est_peps_camadas($1::uuid)", [prod]) }, { headers: H });
      }
      return NextResponse.json({ resumo: await q("select * from est_peps_resumo() where saldo>0 limit 500") }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar o estoque."); }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const ator = user.usuario;
    if (acao === "ENDERECO") {
      const cap = b.capacidade === "" || b.capacidade == null ? null : qtd(b.capacidade, "Capacidade inválida.");
      const codigo = clean(b.codigo, 40).toUpperCase();
      if (!codigo) throw new Error("Informe o código do endereço.");
      await q("insert into est_enderecos(local_id,codigo,descricao,capacidade,criado_por) values($1::uuid,$2,$3,$4,$5)", [need(clean(b.localId, 40), "Selecione o depósito."), codigo, clean(b.descricao, 160), cap, ator]);
    } else if (acao === "ENDERECO_ATIVO") {
      await q("update est_enderecos set ativo=$2 where id=$1::uuid and ($2 or not exists(select 1 from est_endereco_saldos s where s.endereco_id=est_enderecos.id and s.quantidade>0))", [need(clean(b.id, 40), "Endereço inválido."), b.ativo === true]);
    } else if (acao === "MOVER") {
      const de = clean(b.deId, 40), para = clean(b.paraId, 40);
      await q("select est_endereco_mover($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5)", [need(clean(b.produtoId, 40), "Produto inválido."), de ? need(de, "Origem inválida.") : null, para ? need(para, "Destino inválido.") : null, qtd(b.quantidade), ator]);
    } else if (acao === "CICLICO_ABRIR") {
      const [r] = await q("select est_ciclico_abrir($1::date,$2::int,$3) n", [hoje(), Math.min(500, Math.max(1, Number(b.limite) || 20)), ator]);
      return NextResponse.json({ ok: true, abertas: Number(r.n) });
    } else if (acao === "CICLICO_CONTAR") {
      const n = Number(String(b.contado ?? "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Error("Contagem inválida.");
      const [r] = await q("select est_ciclico_contar($1::uuid,$2::numeric,$3) r", [need(clean(b.id, 40), "Contagem inválida."), n, ator]);
      return NextResponse.json({ ok: true, status: r.r });
    } else if (acao === "CICLICO_AJUSTAR") {
      if (!["PCP", "GERENTE"].includes(user.perfil)) throw new Error("SEM_PERMISSAO");
      await q("select est_ciclico_ajustar($1::uuid,$2,$3)", [need(clean(b.id, 40), "Contagem inválida."), clean(b.motivo, 300), ator]);
    } else if (acao === "CICLICO_CANCELAR") {
      await q("select est_ciclico_cancelar($1::uuid,$2)", [need(clean(b.id, 40), "Contagem inválida."), ator]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/duplicate key/.test(m)) return NextResponse.json({ error: "Endereço já existe neste depósito." }, { status: 409 });
    return erro(e, "Falha ao gravar.");
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
