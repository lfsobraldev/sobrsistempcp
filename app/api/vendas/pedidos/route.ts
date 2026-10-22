import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { escopoCiclo, exigirCiclo } from "@/lib/ciclo-industrial";
import {
  calcularComissaoPedido, calcularItens, calcularTotais, comissaoEstorno, comissaoProporcional, competenciaDe,
  exigeAprovacaoPorDesconto, pedidoEditavel, podeTransicionarPedido, STATUS_PEDIDO, statusAoEnviar, toCents, fromCents, verificarCredito,
  type RegraComissao,
} from "@/lib/vendas";

export const runtime = "nodejs";

const READ_ROLES = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL"] as const;
const WRITE_ROLES = ["PCP", "GERENTE", "COMERCIAL"] as const;
const FIN_ROLES = ["PCP", "GERENTE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const limiteDesconto = () => { const n = Number(process.env.VENDAS_DESCONTO_SEM_APROVACAO ?? 5); return Number.isFinite(n) && n >= 0 ? n : 5; };
const hoje = () => new Date().toISOString().slice(0, 10);
const CONFLITO = "O pedido foi alterado por outro usuário. Atualize a tela e tente novamente.";
const ABERTOS = ["APROVADO", "EM_PRODUCAO", "PARCIAL", "ATENDIDO"];

type Db = ReturnType<typeof sql>;
type Row = Record<string, any>;
const q = (db: Db, text: string, params: unknown[] = []) => (db as any).query(text, params) as Promise<Row[]>;

async function emAbertoCliente(db: Db, clienteId: string, excluirId: string | null) {
  const [r] = await q(db, `select coalesce(sum(case when status = any($2::text[]) then total - faturado_valor
      when status='FATURADO' then greatest(0, faturado_valor - devolvido_valor - recebido_valor) else 0 end),0)::numeric aberto
    from crm_pedidos_venda where cliente_id=$1 and ($3::uuid is null or id<>$3)`, [clienteId, ABERTOS, excluirId]);
  return Number(r?.aberto ?? 0);
}

async function regrasDe(db: Db, representanteId: string): Promise<RegraComissao[]> {
  const rows = await q(db, `select * from crm_comissao_regras where representante_id=$1 and ativo`, [representanteId]);
  return rows.map((r) => ({
    id: r.id, representanteId: r.representante_id, clienteId: r.cliente_id, itemCodigo: r.item_codigo, familia: r.familia,
    faixaMin: r.faixa_min == null ? null : Number(r.faixa_min), faixaMax: r.faixa_max == null ? null : Number(r.faixa_max),
    percentual: Number(r.percentual), base: r.base, vigenciaInicio: String(r.vigencia_inicio).slice(0, 10),
    vigenciaFim: r.vigencia_fim ? String(r.vigencia_fim).slice(0, 10) : null, ativo: r.ativo,
  }));
}

async function carregar(db: Db, id: string) {
  if (!isUuid(id)) throw new Error("Pedido inválido.");
  const [p] = await q(db, `select p.*, c.razao_social cliente_nome, c.nome_fantasia cliente_fantasia, c.limite_credito, r.nome representante_nome
    from crm_pedidos_venda p join crm_clientes c on c.id=p.cliente_id left join crm_representantes r on r.id=p.representante_id where p.id=$1`, [id]);
  if (!p) throw new Error("Pedido não encontrado.");
  return p;
}

/** Atualiza status de forma atômica (e opcionalmente cria a provisão de comissão). */
async function mudarStatus(db: Db, p: Row, de: string[], para: string, evento: string, usuario: string, extra: { aprovar?: boolean; motivo?: string } = {}) {
  if (!podeTransicionarPedido(p.status, para) || !de.includes(p.status)) throw new Error(`Transição inválida: ${p.status} → ${para}.`);
  let valor = 0, valorBase = 0, base = "FATURADO";
  if (extra.aprovar && p.representante_id) {
    const itens = await q(db, `select * from crm_pedido_venda_itens where pedido_id=$1 order by linha`, [p.id]);
    const [rep] = await q(db, `select comissao_percentual from crm_representantes where id=$1`, [p.representante_id]);
    const calc = calcularComissaoPedido(
      calcularItens(itens.map((i) => ({ itemCodigo: i.item_codigo, familia: i.familia, descricao: i.descricao, unidade: i.unidade, quantidade: Number(i.quantidade), precoUnitario: Number(i.preco_unitario), descontoPercentual: Number(i.desconto_percentual) }))),
      await regrasDe(db, p.representante_id), { id: p.representante_id, percentualPadrao: Number(rep?.comissao_percentual ?? 0) }, p.cliente_id, hoje(), Number(p.desconto_percentual),
    );
    valor = calc.valor; valorBase = calc.valorBase; base = calc.base;
  }
  const r = await q(db, `with u as (
      update crm_pedidos_venda set status=$3, atualizado_por=$4, atualizado_em=now(),
        aprovado_por=case when $5::boolean then $4 else aprovado_por end, aprovado_em=case when $5::boolean then now() else aprovado_em end,
        cancelado_motivo=case when $3='CANCELADO' then $6 else cancelado_motivo end
      where id=$1 and status=any($2::text[]) returning id, representante_id),
    ins as (insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,criado_por)
      select u.id,u.representante_id,'PROVISAO',$7,$8::numeric,$9::numeric,'PREVISTA',$10,$4 from u where u.representante_id is not null and $5::boolean
      on conflict do nothing returning id),
    est as (update crm_comissoes set status='ESTORNADA' where pedido_id=$1 and tipo='PROVISAO' and status='PREVISTA' and $3='CANCELADO' and exists(select 1 from u) returning id),
    h as (insert into crm_pedido_venda_historico(pedido_id,evento,de,para,usuario,detalhe) select id,$11,$12,$3,$4,jsonb_build_object('motivo',$6::text) from u returning id)
    select (select count(*) from u)::int atualizados`,
    [p.id, de, para, usuario, !!extra.aprovar, extra.motivo ?? "", base, valorBase, valor, competenciaDe(hoje()), evento, p.status]);
  if (!r[0]?.atualizados) throw new Error(CONFLITO);
}

async function salvar(db: Db, body: any, usuario: string) {
  const id = clean(body.id, 40);
  const clienteId = clean(body.clienteId, 40);
  if (!isUuid(clienteId)) throw new Error("Selecione o cliente.");
  const representanteId = clean(body.representanteId, 40) || null;
  if (representanteId && !isUuid(representanteId)) throw new Error("Representante inválido.");
  const itens = calcularItens(body.itens);
  const desconto = Number(body.descontoPercentual ?? 0), frete = Number(body.frete ?? 0);
  const tot = calcularTotais(itens, desconto, frete);
  const dataEntrega = clean(body.dataEntrega, 10);
  if (dataEntrega && !isDate(dataEntrega)) throw new Error("Data de entrega inválida.");
  const [cli] = await q(db, `select limite_credito, condicao_pagamento from crm_clientes where id=$1 and ativo`, [clienteId]);
  if (!cli) throw new Error("Cliente não encontrado ou inativo.");
  const cred = verificarCredito(Number(cli.limite_credito), await emAbertoCliente(db, clienteId, id || null), tot.total);
  const requer = exigeAprovacaoPorDesconto(tot.descontoMaximo, limiteDesconto());
  const itensJson = JSON.stringify(itens);
  const novoId = id || randomUUID();
  const comuns = [clienteId, representanteId, clean(body.pedidoCliente, 80), clean(body.pedidoPcp, 40), clean(body.condicaoPagamento, 120) || cli.condicao_pagamento || "",
    desconto, frete, tot.totalBruto, tot.total, requer, !cred.ok, cred.excedente, dataEntrega || null, clean(body.observacoes, 3000), usuario];
  const insItens = `insert into crm_pedido_venda_itens(pedido_id,linha,item_codigo,familia,descricao,unidade,quantidade,preco_unitario,desconto_percentual,total,data_entrega)
    select $1::uuid,x.linha,x."itemCodigo",x.familia,x.descricao,x.unidade,x.quantidade,x."precoUnitario",x."descontoPercentual",x.total,x."dataEntrega"
    from jsonb_to_recordset($2::jsonb) as x(linha int,"itemCodigo" text,familia text,descricao text,unidade text,quantidade numeric,"precoUnitario" numeric,"descontoPercentual" numeric,total numeric,"dataEntrega" date)`;
  if (!id) {
    await (db as any).transaction([
      (db as any).query(`insert into crm_pedidos_venda(id,cliente_id,representante_id,pedido_cliente,pedido_pcp,proposta_id,condicao_pagamento,desconto_percentual,frete,total_bruto,total,requer_aprovacao,bloqueio_credito,credito_excedente,data_entrega,observacoes,criado_por,atualizado_por)
        values($1,$2,$3,$4,$5,$17,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)`, [novoId, ...comuns, clean(body.propostaId, 40) || null]),
      (db as any).query(insItens, [novoId, itensJson]),
      (db as any).query(`insert into crm_pedido_venda_historico(pedido_id,evento,para,usuario) values($1,'CRIADO','RASCUNHO',$2)`, [novoId, usuario]),
    ]);
    return novoId;
  }
  const res = await (db as any).transaction([
    (db as any).query(`update crm_pedidos_venda set cliente_id=$2,representante_id=$3,pedido_cliente=$4,pedido_pcp=$5,condicao_pagamento=$6,desconto_percentual=$7,frete=$8,total_bruto=$9,total=$10,
        requer_aprovacao=$11,bloqueio_credito=$12,credito_excedente=$13,data_entrega=$14,observacoes=$15,atualizado_por=$16,atualizado_em=now()
        where id=$1 and status in ('RASCUNHO','EM_APROVACAO') returning id`, [id, ...comuns]),
    (db as any).query(`delete from crm_pedido_venda_itens where pedido_id=$1 and exists(select 1 from crm_pedidos_venda where id=$1 and status in ('RASCUNHO','EM_APROVACAO') and atualizado_em>=now()-interval '5 seconds')`, [id]),
    (db as any).query(insItens + ` where exists(select 1 from crm_pedidos_venda where id=$1 and status in ('RASCUNHO','EM_APROVACAO') and atualizado_em>=now()-interval '5 seconds')`, [id, itensJson]),
    (db as any).query(`insert into crm_pedido_venda_historico(pedido_id,evento,usuario) select $1,'EDITADO',$2 where exists(select 1 from crm_pedidos_venda where id=$1 and atualizado_em>=now()-interval '5 seconds')`, [id, usuario]),
  ]);
  if (!res[0]?.length) throw new Error("Pedido não está mais editável (status alterado).");
  return id;
}

async function lancamentos(db: Db, pedidoId: string) {
  const [r] = await q(db, `select
    coalesce(max(valor) filter (where tipo='PROVISAO' and status<>'ESTORNADA'),0)::numeric provisao,
    coalesce(sum(valor) filter (where tipo='LIBERACAO'),0)::numeric liberado,
    coalesce(-sum(valor) filter (where tipo='ESTORNO'),0)::numeric estornado,
    (array_agg(id) filter (where tipo='PROVISAO'))[1] provisao_id,
    (array_agg(base) filter (where tipo='PROVISAO'))[1] base,
    (array_agg(representante_id) filter (where tipo='PROVISAO'))[1] representante_id
    from crm_comissoes where pedido_id=$1`, [pedidoId]);
  return { provisao: Number(r.provisao), liberado: Number(r.liberado), estornado: Number(r.estornado), provisaoId: r.provisao_id as string | null, base: (r.base ?? "FATURADO") as string, representanteId: r.representante_id as string | null };
}

async function financeiro(db: Db, body: any, usuario: string, acao: "FATURAR" | "RECEBER" | "DEVOLVER") {
  const p = await carregar(db, clean(body.id, 40));
  const v = Number(body.valor);
  if (!Number.isFinite(v) || v <= 0) throw new Error("Informe um valor maior que zero.");
  const total = Number(p.total), fat = Number(p.faturado_valor), rec = Number(p.recebido_valor), dev = Number(p.devolvido_valor);
  const l = await lancamentos(db, p.id);
  let novoFat = fat, novoRec = rec, novoDev = dev, status = p.status, lanc: { tipo: string; valorBase: number; valor: number } | null = null;
  if (acao === "FATURAR") {
    if (!ABERTOS.includes(p.status)) throw new Error("Somente pedidos aprovados podem ser faturados.");
    if (toCents(fat) + toCents(v) > toCents(total)) throw new Error("Valor faturado excede o total do pedido.");
    novoFat = fromCents(toCents(fat) + toCents(v));
    if (novoFat === total) status = "FATURADO";
    if (l.base === "FATURADO" && l.provisaoId) {
      const valor = comissaoProporcional(l.provisao, total, novoFat, l.liberado);
      if (valor > 0) lanc = { tipo: "LIBERACAO", valorBase: v, valor };
    }
  } else if (acao === "RECEBER") {
    if (fat <= 0) throw new Error("Nada faturado para receber.");
    if (toCents(rec) + toCents(v) > toCents(fat)) throw new Error("Valor recebido excede o faturado.");
    novoRec = fromCents(toCents(rec) + toCents(v));
    if (l.base === "RECEBIDO" && l.provisaoId) {
      const valor = comissaoProporcional(l.provisao, total, novoRec, l.liberado);
      if (valor > 0) lanc = { tipo: "LIBERACAO", valorBase: v, valor };
    }
  } else {
    if (fat <= 0) throw new Error("Nada faturado para devolver.");
    if (toCents(dev) + toCents(v) > toCents(fat)) throw new Error("Devolução maior que o valor faturado.");
    novoDev = fromCents(toCents(dev) + toCents(v));
    if (l.provisaoId) {
      const valor = comissaoEstorno(l.liberado, fat, novoDev, l.estornado);
      if (valor > 0) lanc = { tipo: "ESTORNO", valorBase: v, valor: -valor };
    }
  }
  const r = await q(db, `with u as (
      update crm_pedidos_venda set faturado_valor=$3,recebido_valor=$4,devolvido_valor=$5,status=$6,atualizado_por=$7,atualizado_em=now()
      where id=$1 and faturado_valor=$8 and recebido_valor=$9 and devolvido_valor=$10 returning id),
    c as (insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,criado_por)
      select u.id,$11::uuid,$12,$13,$14::numeric,$15::numeric,'A_PAGAR',$16,$17::uuid,$7 from u where $12::text is not null returning id),
    h as (insert into crm_pedido_venda_historico(pedido_id,evento,de,para,usuario,detalhe) select id,$2,$18,$6,$7,jsonb_build_object('valor',$19::numeric) from u returning id)
    select (select count(*) from u)::int atualizados`,
    [p.id, acao, novoFat, novoRec, novoDev, status, usuario, fat, rec, dev, l.representanteId, lanc?.tipo ?? null, l.base, lanc?.valorBase ?? 0, lanc?.valor ?? 0, competenciaDe(hoje()), l.provisaoId, p.status, v]);
  if (!r[0]?.atualizados) throw new Error(CONFLITO);
}

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ_ROLES]);
    const db = sql();
    const url = new URL(req.url);
    const id = clean(url.searchParams.get("id"), 40);
    if (id) {
      const p = await carregar(db, id);
      const [itens, historico, comissoes] = await Promise.all([
        q(db, `select * from crm_pedido_venda_itens where pedido_id=$1 order by linha`, [id]),
        q(db, `select * from crm_pedido_venda_historico where pedido_id=$1 order by criado_em desc limit 200`, [id]),
        q(db, `select * from crm_comissoes where pedido_id=$1 order by criado_em`, [id]),
      ]);
      const aberto = await emAbertoCliente(db, p.cliente_id, id);
      return NextResponse.json({ pedido: p, itens, historico, comissoes, credito: verificarCredito(Number(p.limite_credito), aberto, Number(p.total)) }, { headers: { "Cache-Control": "no-store" } });
    }
    const status = clean(url.searchParams.get("status"), 20).toUpperCase();
    const cliente = clean(url.searchParams.get("cliente"), 40);
    const rep = clean(url.searchParams.get("representante"), 40);
    const mes = clean(url.searchParams.get("mes"), 7);
    const busca = clean(url.searchParams.get("q"), 80);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const size = 50;
    if (status && !(STATUS_PEDIDO as readonly string[]).includes(status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
    if ((cliente && !isUuid(cliente)) || (rep && !isUuid(rep))) return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });
    const where = `($1='' or p.status=$1) and ($2='' or p.cliente_id=$2::uuid) and ($3='' or p.representante_id=$3::uuid)
      and ($4='' or to_char(coalesce(p.data_entrega,p.data_emissao),'YYYY-MM')=$4)
      and ($5='' or p.pedido_cliente ilike '%'||$5||'%' or p.pedido_pcp ilike '%'||$5||'%' or c.razao_social ilike '%'||$5||'%' or p.numero::text=$5)`;
    const args = [status, cliente, rep, mes, busca];
    const [lista, [cont], resumo] = await Promise.all([
      q(db, `select p.*, c.razao_social cliente_nome, c.nome_fantasia cliente_fantasia, r.nome representante_nome
        from crm_pedidos_venda p join crm_clientes c on c.id=p.cliente_id left join crm_representantes r on r.id=p.representante_id
        where ${where} order by p.numero desc limit ${size} offset ${(page - 1) * size}`, args),
      q(db, `select count(*)::int n from crm_pedidos_venda p join crm_clientes c on c.id=p.cliente_id where ${where}`, args),
      q(db, `select status, count(*)::int qtd, coalesce(sum(total),0)::numeric total from crm_pedidos_venda group by status`),
    ]);
    const extra = page === 1 ? {
      clientes: await q(db, `select id,razao_social,nome_fantasia,limite_credito,condicao_pagamento from crm_clientes where ativo order by razao_social limit 2000`),
      representantes: await q(db, `select id,nome,comissao_percentual from crm_representantes where ativo order by nome limit 1000`),
    } : {};
    return NextResponse.json({ pedidos: lista, total: cont.n, page, size, resumo, ...extra }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const forbidden = e instanceof Error && e.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : e instanceof Error ? e.message : "Falha ao consultar pedidos." }, { status: forbidden ? 403 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const body = await req.json();
    const acao = clean(body.acao, 20).toUpperCase();
    const fin = acao === "FATURAR" || acao === "RECEBER" || acao === "DEVOLVER" || acao === "APROVAR";
    const user = await requireRoles(acao === "GERAR_OFS" ? ["PCP", "GERENTE", "ENCARREGADO"] : [...(fin ? FIN_ROLES : WRITE_ROLES)]);
    const db = sql();
    if (acao === "SALVAR") return NextResponse.json({ ok: true, id: await salvar(db, body, user.usuario) });
    if (acao === "DE_PROPOSTA") {
      const [pr] = await q(db, `select p.id,p.itens,o.cliente_id,o.representante_id from crm_propostas p join crm_oportunidades o on o.id=p.oportunidade_id where p.id=$1 and p.status='ACEITA'`, [clean(body.propostaId, 40)]);
      if (!pr) throw new Error("Proposta aceita não encontrada.");
      const [jaTem] = await q(db, `select id from crm_pedidos_venda where proposta_id=$1 and status<>'CANCELADO'`, [pr.id]);
      if (jaTem) throw new Error("Esta proposta já gerou um pedido de venda.");
      const itens = (pr.itens as any[]).map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, precoUnitario: i.valorUnitario }));
      return NextResponse.json({ ok: true, id: await salvar(db, { clienteId: pr.cliente_id, representanteId: pr.representante_id, propostaId: pr.id, itens }, user.usuario) });
    }
    if (acao === "FATURAR" || acao === "RECEBER" || acao === "DEVOLVER") { await financeiro(db, body, user.usuario, acao); return NextResponse.json({ ok: true }); }
    if (acao === "GERAR_OFS") {
      await exigirCiclo(db);
      const s = await escopoCiclo(db);
      const id = clean(body.id, 40), localId = clean(body.localId, 40);
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Pedido inválido.");
      const local = /^[0-9a-f-]{36}$/i.test(localId) ? localId : (await q(db, `select id from est_locais where ativo order by codigo limit 1`, []))[0]?.id;
      if (!local) throw new Error("Cadastre um depósito para gerar as OFs.");
      const rows = await q(db, `select * from erp_gerar_ofs_pedido($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5)`, [id, s.empresa_id, s.filial_id, local, user.usuario]);
      return NextResponse.json({ ok: true, resultado: rows });
    }
    const p = await carregar(db, clean(body.id, 40));
    if (acao === "ENVIAR") {
      if (!pedidoEditavel(p.status)) throw new Error("Pedido já enviado.");
      const itens = await q(db, `select 1 from crm_pedido_venda_itens where pedido_id=$1 limit 1`, [p.id]);
      if (!itens.length) throw new Error("Pedido sem itens.");
      const novo = statusAoEnviar(p.requer_aprovacao, p.bloqueio_credito);
      await mudarStatus(db, p, ["RASCUNHO", "EM_APROVACAO"], novo === "EM_APROVACAO" && p.status === "EM_APROVACAO" ? "EM_APROVACAO" : novo, "ENVIADO", user.usuario, { aprovar: novo === "APROVADO" });
    } else if (acao === "APROVAR") {
      await mudarStatus(db, p, ["EM_APROVACAO"], "APROVADO", "APROVADO", user.usuario, { aprovar: true });
    } else if (acao === "CANCELAR") {
      const motivo = clean(body.motivo, 500);
      if (motivo.length < 5) throw new Error("Informe o motivo do cancelamento.");
      if (Number(p.faturado_valor) > 0) throw new Error("Pedido com faturamento não pode ser cancelado; registre devolução.");
      await mudarStatus(db, p, ["RASCUNHO", "EM_APROVACAO", "APROVADO", "EM_PRODUCAO", "PARCIAL"], "CANCELADO", "CANCELADO", user.usuario, { motivo });
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const forbidden = e instanceof Error && e.message === "SEM_PERMISSAO";
    const dup = e instanceof Error && e.message.includes("duplicate key");
    return NextResponse.json({ error: forbidden ? "Sem permissão." : dup ? "Já existe pedido com este número (cliente/PCP)." : e instanceof Error ? e.message : "Falha ao gravar pedido." }, { status: forbidden ? 403 : dup ? 409 : 400 });
  }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
