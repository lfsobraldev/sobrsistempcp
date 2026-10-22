import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
const nonNeg = (v: unknown, msg: string) => { const n = Number(String(v ?? "").replace(",", ".")); if (!Number.isFinite(n) || n < 0) throw new Error(msg); return n; };
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const of = url.searchParams.get("of");
    if (of) {
      const [r] = await q(`select cst_of_analise($1::uuid) a`, [need(of, "OF inválida.")]);
      const ops = await q(`select po.id,po.processo,po.sequencia,h.minutos from pcp_operacoes po left join cst_horas_of h on h.of_id=po.of_id and h.operacao_id=po.id where po.of_id=$1 order by po.sequencia`, [of]);
      return NextResponse.json({ analise: r.a, operacoes: ops }, { headers: { "Cache-Control": "no-store" } });
    }
    const [taxas, centros, precos, padroes, ofs, valorizacao, pedidos, produtos] = await Promise.all([
      q(`select t.*,c.processo,c.maquina,c.turno from cst_taxas t join pcp_capacidades_maquina c on c.id=t.centro_id order by c.processo,c.maquina,t.vigencia_inicio desc`),
      q(`select id,processo,maquina,turno from pcp_capacidades_maquina order by processo,maquina,turno`),
      q(`select distinct on (p.produto_id) p.produto_id,p.vigencia_inicio,p.custo_unitario,e.codigo,e.descricao from cst_precos_padrao p join est_produtos e on e.id=p.produto_id order by p.produto_id,p.vigencia_inicio desc`),
      q(`select distinct on (d.produto_id) d.id,d.produto_id,d.data_ref,d.lote,d.material,d.mao_obra,d.maquina,d.gastos_gerais,d.total,d.detalhe,d.criado_em,e.codigo,e.descricao from cst_padrao d join est_produtos e on e.id=d.produto_id order by d.produto_id,d.criado_em desc`),
      q(`select o.id,o.numero,o.status,o.quantidade,o.prazo,e.codigo,e.descricao,(r.of_id is not null) registrado,r.analise->'totais' totais from erp_ordens_fabricacao o join est_produtos e on e.id=o.produto_estoque_id left join cst_of_resultados r on r.of_id=o.id where o.snapshot is not null order by o.numero desc limit 200`),
      q(`select * from cst_v_valorizacao order by valor desc limit 500`),
      q(`select *,(receita-custo) margem,(receita-custo-comissao) margem_liquida from cst_v_margem_pedidos order by numero desc limit 500`),
      q(`select id,codigo,descricao,classificacao from est_produtos where ativo order by codigo limit 3000`),
    ]);
    return NextResponse.json({ taxas, centros, precos, padroes, ofs, valorizacao, pedidos, produtos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha ao consultar custos." }, { status: forbidden ? 403 : /does not exist/.test(m) ? 503 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...READ]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const ator = user.usuario;
    const data = clean(b.data, 10) || new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    if (!isDate(data)) throw new Error("Data inválida.");
    if (acao === "TAXA") {
      await q(`insert into cst_taxas(centro_id,custo_hora_mo,custo_hora_maq,gg_percentual,vigencia_inicio,criado_por) values($1,$2,$3,$4,$5,$6)`,
        [need(clean(b.centroId, 40), "Selecione o centro."), nonNeg(b.custoHoraMo, "Custo/hora de mão de obra inválido."), nonNeg(b.custoHoraMaq, "Custo/hora de máquina inválido."), nonNeg(b.ggPercentual, "Gastos gerais inválido."), data, ator]);
    } else if (acao === "PRECO") {
      await q(`insert into cst_precos_padrao(produto_id,vigencia_inicio,custo_unitario,origem,criado_por) values($1,$2,$3,$4,$5)`, [need(clean(b.produtoId, 40), "Selecione o produto."), data, nonNeg(b.custoUnitario, "Custo inválido."), clean(b.origem, 120) || "MANUAL", ator]);
    } else if (acao === "CALCULAR_PADRAO") {
      const lote = nonNeg(b.lote || 1, "Lote inválido.");
      if (!(lote > 0)) throw new Error("Lote inválido.");
      const [r] = await q(`select cst_calcular_padrao($1::uuid,$2::date,$3::numeric,$4) id`, [need(clean(b.produtoId, 40), "Selecione o produto."), data, lote, ator]);
      return NextResponse.json({ ok: true, id: r.id });
    } else if (acao === "HORAS") {
      await q(`insert into cst_horas_of(of_id,operacao_id,minutos,informado_por) values($1,$2,$3,$4) on conflict(of_id,operacao_id) do update set minutos=excluded.minutos,informado_por=excluded.informado_por,informado_em=now()`,
        [need(clean(b.ofId, 40), "OF inválida."), need(clean(b.operacaoId, 40), "Operação inválida."), nonNeg(b.minutos, "Minutos inválidos."), ator]);
    } else if (acao === "REGISTRAR") {
      const [r] = await q(`select cst_of_registrar($1::uuid,$2) a`, [need(clean(b.ofId, 40), "OF inválida."), ator]);
      return NextResponse.json({ ok: true, analise: r.a });
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /duplicate key/.test(m) ? "Já existe registro nessa vigência." : m || "Falha ao gravar." }, { status: forbidden ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
