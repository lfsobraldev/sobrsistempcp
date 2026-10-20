import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirApontamentos } from "@/lib/pcp-schema";
import { diagnosticarOperacoes } from "@/lib/apontamento";
import { estimarPedidos, identificarGargalos, resumoPorProcesso, HORIZONTE_DIAS_PADRAO, atingimentoMeta, type Capacidade, type OpPlan } from "@/lib/pcp-planejamento";
import { normalizarPedido, prazoReferencia, hojeISO } from "@/lib/carteira";

export const runtime = "nodejs";
type Db = ReturnType<typeof sql>;
const existe = async (db: Db, t: string) => (await db`select to_regclass(${"public." + t}) as n`)[0]?.n != null;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const dt = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export async function GET(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const url = new URL(req.url);
    const db = sql();
    await garantirApontamentos(db);
    const hor = Number(url.searchParams.get("horizonte"));
    const horizonte = Number.isFinite(hor) && hor >= 1 && hor <= 30 ? hor : HORIZONTE_DIAS_PADRAO;
    const pid = url.searchParams.get("programacaoId")?.trim() || "";
    const [prog] = pid ? await db`select id,filtro from pcp_programacoes where id=${pid} limit 1` : await db`select id,filtro from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
    if (!prog) return NextResponse.json({ programacaoId: "", filtro: "", vazio: true });

    const [tCtl, tPed, tPerdas, tMetas, tDiaria, tAndon] = await Promise.all(["pcp_controle_entregas", "pcp_pedido_controle", "pcp_perdas_producao", "pcp_metas_maquina", "pcp_producao_diaria_maquina", "pcp_andon"].map((t) => existe(db, t)));
    const [ops, produtos, caps] = await Promise.all([
      db`select o.id,o.produto_id,p.pedido,p.of,o.processo,o.sequencia,o.status,o.quantidade_planejada::float planejada,o.quantidade_produzida::float produzida,o.quantidade_refugo::float refugo,o.percentual::float percentual from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where p.programacao_id=${prog.id}`,
      db`select p.id,p.pedido,p.of,p.produto from pcp_produtos p where p.programacao_id=${prog.id}`,
      db`select processo,maquina,turno,pecas_hora::float,minutos_disponiveis::float,eficiencia::float from pcp_capacidades_maquina`.catch(() => []),
    ]);
    const capacidades: Capacidade[] = (caps as any[]).map((c) => ({ processo: c.processo, maquina: c.maquina, turno: c.turno, pecasHora: c.pecas_hora, minutos: c.minutos_disponiveis, eficiencia: c.eficiencia }));
    const opsPlan: OpPlan[] = (ops as any[]).map((o) => ({ id: o.id, produtoId: o.produto_id, pedido: o.pedido, of: o.of, processo: o.processo, sequencia: o.sequencia, status: o.status, planejada: num(o.planejada), produzida: num(o.produzida), refugo: num(o.refugo) }));

    const diag = diagnosticarOperacoes(
      (produtos as any[]).map((p) => ({ produtoId: p.id, pedido: p.pedido, of: p.of, produto: p.produto })),
      (ops as any[]).map((o) => ({ id: o.id, produtoId: o.produto_id, pedido: o.pedido, of: o.of, processo: o.processo, sequencia: o.sequencia, status: o.status, planejada: num(o.planejada), produzida: num(o.produzida), refugo: num(o.refugo), percentual: num(o.percentual) })),
    );
    const divPorProc: Record<string, number> = {};
    for (const d of diag) if (d.processo) divPorProc[d.processo] = (divPorProc[d.processo] || 0) + 1;

    // prazos por pedido: mesma regra da carteira (cliente → PCP → logística)
    const [ctl, ped] = await Promise.all([
      tCtl ? db`select pedido,previsao_informada::text previsao_informada,previsao_entrega::text previsao_entrega from pcp_controle_entregas` : [],
      tPed ? db`select pedido,data_entrega::text data_entrega from pcp_pedido_controle where programacao_id=${prog.id}` : [],
    ]);
    const mc = new Map<string, any>((ctl as any[]).map((c) => [normalizarPedido(c.pedido), c]));
    const mp = new Map<string, any>((ped as any[]).map((c) => [normalizarPedido(c.pedido), c]));
    const prazos: Record<string, string | null> = {};
    for (const p of new Set(opsPlan.map((o) => o.pedido))) {
      const c = mc.get(normalizarPedido(p)), pc = mp.get(normalizarPedido(p));
      prazos[p] = prazoReferencia({ previsaoInformada: dt(c?.previsao_informada), prazoPcp: dt(pc?.data_entrega), previsaoEntrega: dt(c?.previsao_entrega) }).data;
    }

    const hoje = hojeISO();
    const processos = resumoPorProcesso(opsPlan, capacidades, divPorProc, horizonte);
    const estimativas = estimarPedidos(opsPlan, capacidades, prazos, hoje);

    const [perdas, andon, diaria, metas, lanc] = await Promise.all([
      tPerdas ? db`select processo,motivo,coalesce(sum(minutos),0)::float minutos,coalesce(sum(quantidade_perdida),0)::float pecas,count(*)::int ocorrencias from pcp_perdas_producao where inicio>=now()-interval '7 days' group by processo,motivo order by 3 desc limit 50` : [],
      tAndon ? db`select processo,count(*)::int abertos from pcp_andon where status<>'RESOLVIDO' group by processo` : [],
      tDiaria ? db`select data::text data,processo,sum(produzido)::float produzido from pcp_producao_diaria_maquina where data>=current_date-interval '6 days' group by data,processo order by data desc` : [],
      tMetas ? db`select data::text data,processo,sum(meta)::float meta from pcp_metas_maquina where data>=current_date-interval '6 days' group by data,processo` : [],
      db`select data_producao::text data,processo,sum(case when tipo in('PRODUCAO','CORRECAO','FINALIZACAO') then quantidade else 0 end)::float apontado from pcp_apontamentos where data_producao>=current_date-interval '6 days' group by 1,2 order by 1 desc`,
    ]);
    const mm = new Map<string, number>((metas as any[]).map((m) => [m.data + "|" + m.processo, m.meta]));
    const produtividade = (diaria as any[]).map((d) => ({ ...d, meta: mm.get(d.data + "|" + d.processo) ?? null, atingimentoPct: atingimentoMeta(d.produzido, mm.get(d.data + "|" + d.processo) ?? null) }));

    const plan = opsPlan.reduce((s, o) => s + o.planejada, 0), prod = opsPlan.reduce((s, o) => s + Math.min(o.produzida, o.planejada), 0);
    const rest = processos.reduce((s, l) => s + l.restante, 0);
    const cont = (st: string) => opsPlan.filter((o) => o.status === st).length;
    const risco = (r: string) => estimativas.filter((e) => e.risco === r).length;
    return NextResponse.json({
      programacaoId: String(prog.id), filtro: String(prog.filtro || ""), horizonte, hoje,
      indicadores: {
        pedidos: new Set(opsPlan.map((o) => o.pedido)).size, ofs: new Set(opsPlan.map((o) => o.of).filter(Boolean)).size, operacoes: opsPlan.length,
        planejada: plan, realizada: prod, restante: rest, pctRealizado: plan > 0 ? (prod / plan) * 100 : 0,
        concluidas: cont("CONCLUIDA"), emAndamento: cont("EM_ANDAMENTO"), liberadas: cont("LIBERADA"), pendentes: cont("PENDENTE"), bloqueadas: cont("BLOQUEADA") + cont("DIVERGENCIA"),
        refugo: opsPlan.reduce((s, o) => s + o.refugo, 0), semRoteiro: diag.filter((d) => d.codigo === "SEM_ROTEIRO").length,
        divergencias: diag.length, pedidosPrazoVencido: risco("PRAZO_VENCIDO"), pedidosAtrasoProvavel: risco("ATRASO_PROVAVEL"), pedidosSemEstimativa: risco("SEM_ESTIMATIVA"),
        minutosParados7d: (perdas as any[]).reduce((s, p) => s + p.minutos, 0), andonAbertos: (andon as any[]).reduce((s, a) => s + a.abertos, 0),
      },
      processos, gargalos: identificarGargalos(processos), estimativas: estimativas.slice(0, 300),
      divergencias: diag.slice(0, 300), divergenciasTotal: diag.length,
      perdas, andon, produtividade, apontadoPorDia: lanc,
      fontes: { capacidades: capacidades.length, prazos: tCtl || tPed },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    const f = e?.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: f ? "Sem permissão." : e?.message || "Falha ao montar o painel." }, { status: f ? 403 : 500 });
  }
}
