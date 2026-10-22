import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "LIDER"] as const;
const WRITE = ["PCP", "GERENTE", "ENCARREGADO", "LIDER"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const h = { headers: { "Cache-Control": "no-store" } };
    const ind = url.searchParams.get("indicadores");
    if (ind) {
      const [ini, fim] = ind.split("|");
      if (Number.isNaN(Date.parse(ini)) || Number.isNaN(Date.parse(fim))) throw new Error("Período inválido.");
      return NextResponse.json({ indicadores: await q(`select * from mnt_indicadores($1::timestamptz,$2::timestamptz)`, [ini, `${fim}T23:59:59-03:00`]) }, h);
    }
    const [ativos, planos, ordens, paradas, centros, produtos, locais] = await Promise.all([
      q(`select a.*,c.processo cp,c.maquina from mnt_ativos a left join pcp_capacidades_maquina c on c.id=a.centro_id order by a.codigo`),
      q(`select p.*,a.codigo ativo,(coalesce(p.ultima_execucao,p.criado_em::date)+p.periodicidade_dias) proxima from mnt_planos p join mnt_ativos a on a.id=p.ativo_id order by proxima`),
      q(`select o.*,a.codigo ativo,a.nome ativo_nome,(select coalesce(json_agg(json_build_object('codigo',e.codigo,'quantidade',x.quantidade)),'[]'::json) from mnt_pecas x join est_produtos e on e.id=x.produto_id where x.ordem_id=o.id) pecas from mnt_ordens o join mnt_ativos a on a.id=o.ativo_id order by (o.status in('ABERTA','EM_EXECUCAO')) desc,o.aberta_em desc limit 200`),
      q(`select p.*,a.codigo ativo from mnt_paradas p join mnt_ativos a on a.id=p.ativo_id order by p.inicio desc limit 50`),
      q(`select id,processo,maquina,turno from pcp_capacidades_maquina order by processo,maquina`),
      q(`select id,codigo,descricao from est_produtos where ativo order by codigo limit 3000`),
      q(`select id,codigo from est_locais where ativo order by codigo`),
    ]);
    return NextResponse.json({ ativos, planos, ordens, paradas, centros, produtos, locais }, h);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha ao consultar a manutenção." }, { status: forbidden ? 403 : /does not exist/.test(m) ? 503 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const ator = user.usuario;
    if (acao === "ATIVO") {
      if (!clean(b.codigo, 40) || !clean(b.nome, 160)) throw new Error("Informe código e nome.");
      await q(`insert into mnt_ativos(codigo,nome,processo,centro_id,criticidade,criado_por) values($1,$2,$3,$4,$5,$6)`, [clean(b.codigo, 40).toUpperCase(), clean(b.nome, 160), clean(b.processo, 80), clean(b.centroId, 40) ? need(clean(b.centroId, 40), "Centro inválido.") : null, clean(b.criticidade, 5).toUpperCase() || "MEDIA", ator]);
    } else if (acao === "PLANO") {
      const dias = Math.round(Number(b.periodicidadeDias));
      if (!(dias > 0)) throw new Error("Periodicidade inválida.");
      await q(`insert into mnt_planos(ativo_id,descricao,periodicidade_dias,criado_por) values($1,$2,$3,$4)`, [need(clean(b.ativoId, 40), "Ativo inválido."), clean(b.descricao, 300) || (() => { throw new Error("Descreva o plano."); })(), dias, ator]);
    } else if (acao === "ORDEM") {
      const tipo = clean(b.tipo, 10).toUpperCase();
      if (!["PREVENTIVA", "CORRETIVA"].includes(tipo)) throw new Error("Tipo inválido.");
      await q(`insert into mnt_ordens(ativo_id,tipo,origem,prioridade,descricao,criado_por) values($1,$2,'MANUAL',$3,$4,$5)`, [need(clean(b.ativoId, 40), "Ativo inválido."), tipo, clean(b.prioridade, 7).toUpperCase() || "MEDIA", clean(b.descricao, 1000), ator]);
    } else if (acao === "INICIAR") {
      await q(`select mnt_iniciar($1::uuid,$2)`, [need(clean(b.ordemId, 40), "Ordem inválida."), ator]);
    } else if (acao === "CONCLUIR") {
      await q(`select mnt_concluir($1::uuid,$2,$3,$4)`, [need(clean(b.ordemId, 40), "Ordem inválida."), clean(b.causa, 500), clean(b.solucao, 1000), ator]);
    } else if (acao === "CANCELAR") {
      await q(`select mnt_cancelar($1::uuid,$2)`, [need(clean(b.ordemId, 40), "Ordem inválida."), ator]);
    } else if (acao === "PECA") {
      await q(`select mnt_consumir_peca($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5)`, [need(clean(b.ordemId, 40), "Ordem inválida."), need(clean(b.produtoId, 40), "Selecione a peça."), need(clean(b.localId, 40), "Selecione o depósito."), Number(String(b.quantidade).replace(",", ".")), ator]);
    } else if (acao === "GERAR_PREVENTIVAS") {
      const [r] = await q(`select mnt_gerar_preventivas(current_date,$1) n`, [ator]);
      return NextResponse.json({ ok: true, geradas: r.n });
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /duplicate key/.test(m) ? "Registro duplicado." : m || "Falha ao gravar." }, { status: forbidden ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
