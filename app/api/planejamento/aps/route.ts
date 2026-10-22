import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { escopoCiclo, exigirCiclo } from "@/lib/ciclo-industrial";
import { programar, proximosMeses, simularUrgente, sop, type CentroCap, type OfEntrada } from "@/lib/aps-fina";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO"] as const;
const WRITE = ["PCP", "GERENTE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
type Row = Record<string, any>;
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const database = () => sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> };

async function centros(): Promise<CentroCap[]> {
  const rows = await database().query(`select id,processo,maquina,turno,minutos_disponiveis,calendario from pcp_capacidades_maquina order by processo,maquina,turno`);
  return rows.map((r) => {
    const dias = Array.isArray(r.calendario?.dias) && r.calendario.dias.length ? r.calendario.dias.map(Number).filter((d: number) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5];
    return { id: r.id, nome: `${r.processo} · ${r.maquina}${r.turno ? ` (${r.turno})` : ""}`, minutosDia: Number(r.minutos_disponiveis ?? 0), dias };
  });
}
async function ofsAbertas(): Promise<OfEntrada[]> {
  const [ops, agenda] = await Promise.all([
    database().query(`select * from erp_v_ops_abertas order by of_numero,sequencia`),
    database().query(`select of_id,inicio_fixo::text inicio_fixo from erp_of_agenda`),
  ]);
  const fixo = new Map(agenda.map((a) => [a.of_id, String(a.inicio_fixo).slice(0, 10)]));
  const m = new Map<string, OfEntrada>();
  for (const o of ops) {
    const e: OfEntrada = m.get(o.of_id) ?? { id: o.of_id, numero: Number(o.of_numero), produto: o.produto, prazo: String(o.prazo).slice(0, 10), inicioFixo: fixo.get(o.of_id) ?? null, operacoes: [] };
    e.operacoes.push({ sequencia: Number(o.sequencia), processo: o.processo, centroId: o.centro_id ?? null, minutos: Number(o.minutos) });
    m.set(o.of_id, e);
  }
  return [...m.values()];
}

async function unidadeGET() {
  try {
    await requireRoles([...READ]);
    const hoje = hojeBR();
    const [cs, ofs, mrp] = await Promise.all([centros(), ofsAbertas(), database().query(`select * from erp_mrp_liquido()`)]);
    const agenda = programar(ofs, cs, hoje);
    const demanda: Record<string, number> = {};
    for (const o of ofs) demanda[o.prazo.slice(0, 7)] = (demanda[o.prazo.slice(0, 7)] ?? 0) + o.operacoes.reduce((s, x) => s + x.minutos, 0);
    return NextResponse.json({ hoje, centros: cs, agenda, mrp, sop: sop(demanda, cs, proximosMeses(hoje, 6)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha ao consultar o planejamento." }, { status: forbidden ? 403 : /does not exist/.test(m) ? 503 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const db = database();
    if (acao === "MOVER") {
      const ofId = need(clean(b.ofId, 40), "OF inválida."), inicio = clean(b.inicio, 10);
      if (!isDate(inicio)) throw new Error("Data inválida.");
      const [o] = await db.query(`select status from erp_ordens_fabricacao where id=$1`, [ofId]);
      if (!o || !["PLANEJADA", "LIBERADA"].includes(o.status)) throw new Error("Somente OF planejada ou liberada pode ser reprogramada.");
      await db.query(`insert into erp_of_agenda(of_id,inicio_fixo,motivo,atualizado_por) values($1,$2,$3,$4) on conflict(of_id) do update set inicio_fixo=excluded.inicio_fixo,motivo=excluded.motivo,atualizado_por=excluded.atualizado_por,atualizado_em=now()`, [ofId, inicio, clean(b.motivo, 300), user.usuario]);
    } else if (acao === "LIMPAR") {
      await db.query(`delete from erp_of_agenda where of_id=$1`, [need(clean(b.ofId, 40), "OF inválida.")]);
    } else if (acao === "SIMULAR") {
      const produtoId = need(clean(b.produtoId, 40), "Selecione o produto."), qtd = Number(b.quantidade), prazo = clean(b.prazo, 10);
      if (!(qtd > 0) || !isDate(prazo)) throw new Error("Informe quantidade e prazo.");
      const [v] = await db.query(`select r.operacoes from erp_versoes_producao v join erp_roteiros r on r.id=v.roteiro_id where v.produto_id=$1 and v.inicio<=current_date and (v.fim is null or v.fim>=current_date) and v.minimo<=$2 and (v.maximo is null or v.maximo>=$2) limit 1`, [produtoId, qtd]);
      if (!v) throw new Error("Produto sem versão de produção válida (BOM + roteiro aprovados).");
      const hoje = hojeBR();
      const urgente: OfEntrada = { id: "URGENTE", numero: 999999, produto: "URGENTE", prazo, inicioFixo: hoje, operacoes: (v.operacoes as Row[]).map((o) => ({ sequencia: Number(o.sequencia), processo: String(o.processo), centroId: o.centro_id ?? null, minutos: Number(o.setup ?? 0) + qtd * Number(o.ciclo ?? 0) })) };
      return NextResponse.json({ ok: true, simulacao: simularUrgente(await ofsAbertas(), urgente, await centros(), hoje) });
    } else if (acao === "MRP_GERAR_OF") {
      await exigirCiclo(sql());
      const s = await escopoCiclo(sql());
      const qtd = Number(b.quantidade), prazo = clean(b.prazo, 10);
      if (!(qtd > 0) || !isDate(prazo)) throw new Error("Informe quantidade e prazo.");
      const [r] = await db.query(`select erp_mrp_gerar_of($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::date,$6::uuid,$7) id`, [s.empresa_id, s.filial_id, need(clean(b.produtoId, 40), "Produto inválido."), qtd, prazo, need(clean(b.localId, 40), "Selecione o depósito."), user.usuario]);
      return NextResponse.json({ ok: true, id: r.id });
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const hoje = hojeBR();
    return NextResponse.json({ ok: true, agenda: programar(await ofsAbertas(), await centros(), hoje) });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : m || "Falha ao gravar." }, { status: forbidden ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
