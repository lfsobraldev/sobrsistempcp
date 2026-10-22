import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { criarProvedorCobranca, pixCopiaECola } from "@/lib/financeiro/cobranca";
import { parseCsvExtrato, parseOfx, sugerirConciliacao } from "@/lib/financeiro/extrato";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isComp = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
const money = (v: unknown, msg: string) => { const n = Number(String(v ?? "").replace(",", ".")); if (!Number.isFinite(n) || n <= 0) throw new Error(msg); return Math.round(n * 100) / 100; };
const data = (v: unknown, msg: string) => { const s = clean(v, 10); if (!isDate(s)) throw new Error(msg); return s; };
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const h = { headers: { "Cache-Control": "no-store" } };
    const fluxo = url.searchParams.get("fluxo");
    if (fluxo) { const d = Math.max(7, Math.min(180, Number(fluxo) || 60)); return NextResponse.json({ fluxo: await q(`select dia::text,entradas,saidas,saldo_dia,saldo_acum from fin_fluxo($1::date,$2)`, [hoje(), d]), saldo: (await q(`select fin_saldo_caixa($1::date) s`, [hoje()]))[0].s }, h); }
    const rel = url.searchParams.get("dre") ?? url.searchParams.get("balancete");
    if (rel) {
      const [ini, fim] = rel.split("|");
      if (!isDate(ini) || !isDate(fim)) throw new Error("Período inválido.");
      return NextResponse.json(url.searchParams.get("dre") ? { dre: (await q(`select ctb_dre($1::date,$2::date) d`, [ini, fim]))[0].d } : { balancete: await q(`select * from ctb_balancete($1::date,$2::date)`, [ini, fim]) }, h);
    }
    const razao = url.searchParams.get("razao");
    if (razao) { const [c, ini, fim] = razao.split("|"); if (!isDate(ini) || !isDate(fim)) throw new Error("Período inválido."); return NextResponse.json({ razao: await q(`select data::text,numero,historico,debito,credito,saldo from ctb_razao($1::uuid,$2::date,$3::date)`, [need(c, "Conta inválida."), ini, fim]) }, h); }
    const orc = url.searchParams.get("orcado");
    if (orc) { const [ini, fim] = orc.split("|"); if (!isComp(ini) || !isComp(fim)) throw new Error("Competência inválida."); return NextResponse.json({ orcado: await q(`select * from ctb_orcado_realizado($1,$2)`, [ini, fim]) }, h); }
    const concil = url.searchParams.get("conciliacao");
    if (concil) {
      const contaId = need(concil, "Conta inválida.");
      const ext = await q(`select id,fitid,data::text data,descricao,valor::float8 valor from fin_extratos where conta_id=$1 and baixa_id is null order by data`, [contaId]);
      const tit = await q(`select id,tipo,(valor-valor_baixado)::float8 saldo,vencimento::text vencimento,parceiro from fin_titulos where status in('ABERTO','PARCIAL')`);
      return NextResponse.json({ extratos: ext, titulos: tit, sugestoes: sugerirConciliacao(ext as never, tit as never) }, h);
    }
    const pix = url.searchParams.get("pix");
    if (pix) {
      const [t] = await q(`select numero,tipo,(valor-valor_baixado) saldo from fin_titulos where id=$1`, [need(pix, "Título inválido.")]);
      const [c] = await q(`select * from fin_contas_bancarias where id=$1`, [need(url.searchParams.get("conta") ?? "", "Selecione a conta de recebimento.")]);
      if (!t || t.tipo !== "RECEBER") throw new Error("PIX só para título a receber.");
      return NextResponse.json({ copiaECola: pixCopiaECola({ chave: c.pix_chave, nome: c.pix_nome || c.nome, cidade: c.pix_cidade, valor: Number(t.saldo), txid: `T${t.numero}` }) }, h);
    }
    const tipo = url.searchParams.get("tipo"), status = url.searchParams.get("status");
    const [titulos, contas, centros, plano, regras, pendencias, kpi] = await Promise.all([
      q(`select * from fin_titulos where ($1::text is null or tipo=$1) and ($2::text is null or status=$2) order by (status in('ABERTO','PARCIAL')) desc,vencimento limit 400`, [tipo, status]),
      q(`select * from fin_contas_bancarias order by nome`),
      q(`select * from fin_centros_custo order by codigo`),
      q(`select * from ctb_contas order by codigo`),
      q(`select r.evento,r.ativo,d.codigo debito,c.codigo credito from ctb_regras_lancamento r join ctb_contas d on d.id=r.conta_debito_id join ctb_contas c on c.id=r.conta_credito_id order by r.evento`),
      q(`select evento,count(*)::int n,sum(valor) valor from ctb_pendencias group by evento order by evento`),
      q(`select coalesce(sum(case when tipo='RECEBER' then valor-valor_baixado end),0) receber,coalesce(sum(case when tipo='PAGAR' then valor-valor_baixado end),0) pagar,
          coalesce(sum(case when tipo='RECEBER' and vencimento<current_date then valor-valor_baixado end),0) receber_vencido,coalesce(sum(case when tipo='PAGAR' and vencimento<current_date then valor-valor_baixado end),0) pagar_vencido,
          fin_saldo_caixa(current_date) caixa from fin_titulos where status in('ABERTO','PARCIAL')`),
    ]);
    return NextResponse.json({ titulos, contas, centros, plano, regras, pendencias, kpi: kpi[0] }, h);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha ao consultar o financeiro." }, { status: forbidden ? 403 : /does not exist/.test(m) ? 503 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...READ]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const ator = user.usuario;
    if (acao === "CONTA") {
      if (!clean(b.nome, 120)) throw new Error("Informe o nome da conta.");
      await q(`insert into fin_contas_bancarias(nome,banco,agencia,conta,pix_chave,pix_cidade,pix_nome,saldo_inicial,saldo_inicial_data,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [clean(b.nome, 120), clean(b.banco, 60), clean(b.agencia, 20), clean(b.conta, 30), clean(b.pixChave, 140), clean(b.pixCidade, 15), clean(b.pixNome, 25), Number(String(b.saldoInicial ?? 0).replace(",", ".")) || 0, clean(b.saldoInicialData, 10) ? data(b.saldoInicialData, "Data inválida.") : hoje(), ator]);
    } else if (acao === "CENTRO") {
      await q(`insert into fin_centros_custo(codigo,nome) values($1,$2)`, [clean(b.codigo, 30).toUpperCase(), clean(b.nome, 120)]);
    } else if (acao === "SEMEAR") {
      const [r] = await q(`select ctb_semear_plano($1) n`, [ator]);
      return NextResponse.json({ ok: true, criadas: r.n });
    } else if (acao === "PLANO") {
      const tipo = clean(b.tipo, 10).toUpperCase();
      await q(`insert into ctb_contas(codigo,nome,tipo,analitica) values($1,$2,$3,$4)`, [clean(b.codigo, 30), clean(b.nome, 160), tipo, b.analitica !== false]);
    } else if (acao === "REGRA") {
      await q(`insert into ctb_regras_lancamento(evento,conta_debito_id,conta_credito_id) values($1,$2,$3) on conflict(evento) do update set conta_debito_id=excluded.conta_debito_id,conta_credito_id=excluded.conta_credito_id,ativo=true`,
        [clean(b.evento, 40).toUpperCase(), need(clean(b.debitoId, 40), "Conta de débito inválida."), need(clean(b.creditoId, 40), "Conta de crédito inválida.")]);
    } else if (acao === "REPROCESSAR") {
      const [r] = await q(`select ctb_reprocessar($1) n`, [ator]);
      return NextResponse.json({ ok: true, processados: r.n });
    } else if (acao === "TITULO") {
      const tipo = clean(b.tipo, 7).toUpperCase();
      if (!["RECEBER", "PAGAR"].includes(tipo)) throw new Error("Tipo inválido.");
      const [r] = await q(`select fin_criar_titulo($1,'MANUAL',gen_random_uuid(),$2,1,$3,null,$4,$5::date,$6::numeric,$7::uuid,$8) id`,
        [tipo, clean(b.ref, 80), clean(b.parceiro, 240), clean(b.descricao, 300), data(b.vencimento, "Vencimento inválido."), money(b.valor, "Valor inválido."), clean(b.centroId, 40) ? need(clean(b.centroId, 40), "Centro inválido.") : null, ator]);
      return NextResponse.json({ ok: true, id: r.id });
    } else if (acao === "BAIXAR") {
      await q(`select fin_baixar($1::uuid,$2::uuid,$3::date,$4::numeric,null,$5)`, [need(clean(b.tituloId, 40), "Título inválido."), need(clean(b.contaId, 40), "Selecione a conta."), clean(b.data, 10) ? data(b.data, "Data inválida.") : hoje(), money(b.valor, "Valor inválido."), ator]);
    } else if (acao === "ESTORNAR_BAIXA") {
      await q(`select fin_estornar_baixa($1::uuid,$2)`, [need(clean(b.baixaId, 40), "Baixa inválida."), ator]);
    } else if (acao === "CANCELAR") {
      await q(`select fin_cancelar_titulo($1::uuid,$2)`, [need(clean(b.tituloId, 40), "Título inválido."), ator]);
    } else if (acao === "EXTRATO_IMPORTAR") {
      const contaId = need(clean(b.contaId, 40), "Selecione a conta.");
      const texto = String(b.texto ?? "");
      const linhas = /<STMTTRN>/i.test(texto) ? parseOfx(texto) : parseCsvExtrato(texto);
      if (linhas.length > 5000) throw new Error("Extrato com linhas demais (máximo 5000).");
      const r = await q(`insert into fin_extratos(conta_id,data,descricao,valor,fitid,criado_por) select $1::uuid,x.data,x.descricao,x.valor,x.fitid,$3 from jsonb_to_recordset($2::jsonb) x(data date,descricao text,valor numeric,fitid text) on conflict(conta_id,fitid) do nothing returning id`, [contaId, JSON.stringify(linhas), ator]);
      return NextResponse.json({ ok: true, lidas: linhas.length, novas: r.length });
    } else if (acao === "CONCILIAR") {
      await q(`select fin_conciliar($1::uuid,$2::uuid,$3)`, [need(clean(b.extratoId, 40), "Linha inválida."), need(clean(b.tituloId, 40), "Título inválido."), ator]);
    } else if (acao === "ORCAMENTO") {
      const comp = clean(b.competencia, 7);
      if (!isComp(comp)) throw new Error("Competência inválida.");
      await q(`insert into fin_orcamento(centro_custo_id,conta_id,competencia,valor_orcado) values($1,$2,$3,$4) on conflict(centro_custo_id,conta_id,competencia) do update set valor_orcado=excluded.valor_orcado`,
        [need(clean(b.centroId, 40), "Centro inválido."), need(clean(b.contaId, 40), "Conta inválida."), comp, Math.max(0, Number(String(b.valor ?? 0).replace(",", ".")) || 0)]);
    } else if (acao === "LANCAMENTO") {
      const partidas = (Array.isArray(b.partidas) ? b.partidas : []).map((p: Row) => ({ conta_id: need(clean(p.contaId, 40), "Conta inválida."), debito: Number(String(p.debito ?? 0).replace(",", ".")) || 0, credito: Number(String(p.credito ?? 0).replace(",", ".")) || 0, centro_custo_id: clean(p.centroId, 40) || null }));
      const [r] = await q(`select ctb_lancar($1::date,$2,null,null,$3::jsonb,$4) id`, [data(b.data, "Data inválida."), clean(b.historico, 300) || "Lançamento manual", JSON.stringify(partidas), ator]);
      return NextResponse.json({ ok: true, id: r.id });
    } else if (acao === "ESTORNAR_LANCAMENTO") {
      await q(`select ctb_estornar($1::uuid,$2::date,$3)`, [need(clean(b.lancamentoId, 40), "Lançamento inválido."), hoje(), ator]);
    } else if (acao === "BOLETO") {
      const [t] = await q(`select numero,(valor-valor_baixado) saldo,vencimento::text vencimento,parceiro from fin_titulos where id=$1 and tipo='RECEBER'`, [need(clean(b.tituloId, 40), "Título inválido.")]);
      if (!t) throw new Error("Título a receber não encontrado.");
      const boleto = await criarProvedorCobranca(clean(b.adaptador, 40).toUpperCase() || "EXTERNO", clean(b.ambiente, 12).toUpperCase() || "HOMOLOGACAO").gerarBoleto({ numero: Number(t.numero), valor: Number(t.saldo), vencimento: t.vencimento, pagador: t.parceiro });
      return NextResponse.json({ ok: true, boleto });
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
