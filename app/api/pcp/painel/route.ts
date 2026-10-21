import { lerFiltrosPCP, recortePCP, OPCOES_PCP_SQL } from "@/lib/pcp-filters";
import { ZodError } from "zod";
import { unidadeHandler } from "@/lib/unidades/handler";
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

async function unidadeGET(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const url = new URL(req.url);
    const db = sql();
    await garantirApontamentos(db);
    const hor = Number(url.searchParams.get("horizonte"));
    const horizonte = Number.isFinite(hor) && hor >= 1 && hor <= 30 ? hor : HORIZONTE_DIAS_PADRAO;
    const filtros = lerFiltrosPCP(url.searchParams);
    const recorte = recortePCP(filtros);
    const base = `from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where ${recorte.sql}`;
    const opcoesRows = await db.query(OPCOES_PCP_SQL);
    const opcoes = opcoesRows[0];
    const [tCtl, tPed, tPerdas, tMetas, , tAndon] = await Promise.all(["pcp_controle_entregas", "pcp_pedido_controle", "pcp_perdas_producao", "pcp_metas_maquina", "pcp_producao_diaria_maquina", "pcp_andon"].map((t) => existe(db, t)));
    const [ops, produtos, caps] = await Promise.all([
      db.query(`select o.id,o.produto_id,p.pedido,p.of,o.processo,o.sequencia,o.status,o.quantidade_planejada::float planejada,o.quantidade_produzida::float produzida,o.quantidade_refugo::float refugo,o.percentual::float percentual from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id join pcp_programacoes g on g.id=p.programacao_id where ${recorte.sql}`, recorte.values),
      db.query(`select p.id,p.pedido,p.of,p.produto,p.quantidade::float quantidade,g.id programacao_id,to_char(g.data_programacao,'YYYY-MM-DD') data ${base}`, recorte.values),
      db`select processo,maquina,turno,pecas_hora::float,minutos_disponiveis::float,eficiencia::float from pcp_capacidades_maquina`.catch(() => []),
    ]);
    const programacaoIds = [...new Set(produtos.map(p=>String(p.programacao_id)))];
    const opIds = ops.map(o=>String(o.id));
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
      tPed ? db`select pedido,data_entrega::text data_entrega from pcp_pedido_controle where programacao_id=any(${programacaoIds}::uuid[])` : [],
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

    const [perdas, andon, metas, lanc] = await Promise.all([
      tPerdas ? db`select processo,motivo,coalesce(sum(minutos),0)::float minutos,coalesce(sum(quantidade_perdida),0)::float pecas,count(*)::int ocorrencias from pcp_perdas_producao where operacao_id=any(${opIds}::uuid[]) group by processo,motivo order by 3 desc limit 50` : [],
      tAndon ? db`select processo,count(*)::int abertos from pcp_andon where status<>'RESOLVIDO' and operacao_id=any(${opIds}::uuid[]) group by processo` : [],
      tMetas ? db`select data::text data,processo,sum(meta)::float meta from pcp_metas_maquina where processo=any(${[...new Set(opsPlan.map(o=>o.processo))]}::text[]) group by data,processo` : [],
      db`select data_producao::text data,processo,sum(case when tipo in('PRODUCAO','CORRECAO','FINALIZACAO') then quantidade else 0 end)::float apontado from pcp_apontamentos where operacao_id=any(${opIds}::uuid[]) group by 1,2 order by 1 desc`,
    ]);
    const diaria = lanc.map(l=>({...l,produzido:l.apontado}));
    const datasMap = new Map<string,{data:string;quantidade:number;itens:number}>();
    for(const p of produtos){const atual=datasMap.get(p.data)||{data:p.data,quantidade:0,itens:0};atual.quantidade+=num(p.quantidade);atual.itens++;datasMap.set(p.data,atual);}
    const mm = new Map<string, number>((metas as any[]).map((m) => [m.data + "|" + m.processo, m.meta]));
    const produtividade = (diaria as any[]).map((d) => ({ ...d, meta: mm.get(d.data + "|" + d.processo) ?? null, atingimentoPct: atingimentoMeta(d.produzido, mm.get(d.data + "|" + d.processo) ?? null) }));

    const plan = opsPlan.reduce((s, o) => s + o.planejada, 0), prod = opsPlan.reduce((s, o) => s + Math.min(o.produzida, o.planejada), 0);
    const rest = processos.reduce((s, l) => s + l.restante, 0);
    const cont = (st: string) => opsPlan.filter((o) => o.status === st).length;
    const risco = (r: string) => estimativas.filter((e) => e.risco === r).length;
    return NextResponse.json({
      programacaoId: programacaoIds.length===1?programacaoIds[0]:"", filtro: filtros.filtros.join(", ") || "Todos no período", horizonte, hoje, filtros, opcoes, vazio:produtos.length===0, datas:[...datasMap.values()].sort((a,b)=>a.data.localeCompare(b.data)),
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
    if(/relation .* does not exist|column .* does not exist/.test(String(e?.message)))return NextResponse.json({error:'Módulo aguardando migração',codigo:'MIGRACAO_PENDENTE'},{status:503,headers:{'Cache-Control':'no-store'}});
    if(e instanceof ZodError)return NextResponse.json({error:"Filtros inválidos.",detalhes:e.issues},{status:400});
    const f = e?.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: f ? "Sem permissão." : e?.message || "Falha ao montar o painel." }, { status: f ? 403 : 500 });
  }
}

export const GET = unidadeHandler(unidadeGET);
