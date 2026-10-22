import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { unidadeAtual } from "@/lib/unidades/context";
import { gerarTokenPortal } from "@/lib/integracoes";
import { agruparPorFornecedor, conferirNfe, lerNfeXml, melhorProposta, perfilExigido, podeAprovar, totalPC, type Alcada } from "@/lib/compras";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO"] as const;
const WRITE = ["PCP", "GERENTE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
type Row = Record<string, any>;
const db = () => sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]>; transaction: (q: unknown[]) => Promise<Row[][]> };
const q = (t: string, p: unknown[] = []) => db().query(t, p);

async function alcadas(): Promise<Alcada[]> {
  return (await q("select valor_ate,perfil_aprovador from cmp_alcadas")).map((a) => ({ valorAte: a.valor_ate == null ? null : Number(a.valor_ate), perfil: a.perfil_aprovador }));
}
async function itensPedido(itens: any[]) {
  if (!Array.isArray(itens) || !itens.length || itens.length > 300) throw new Error("Informe de 1 a 300 itens.");
  return itens.map((i) => ({ produtoId: need(clean(i.produtoId, 40), "Produto inválido."), quantidade: Number(i.quantidade), precoUnitario: Number(i.precoUnitario) }));
}
async function criarPC(fornecedorId: string, itens: { produtoId: string; quantidade: number; precoUnitario: number }[], usuario: string, extra: { solicitacaoId?: string | null; previsao?: string | null; obs?: string } = {}) {
  const total = totalPC(itens);
  const exigido = perfilExigido(total, await alcadas());
  const id = randomUUID();
  const d = db();
  await d.transaction([
    d.query(`insert into cmp_pedidos(id,fornecedor_id,solicitacao_id,total,aprovador_exigido,previsao,observacoes,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8)`, [id, fornecedorId, extra.solicitacaoId ?? null, total, exigido, extra.previsao || null, extra.obs ?? "", usuario]),
    d.query(`insert into cmp_pedido_itens(pedido_id,linha,produto_id,quantidade,preco_unitario) select $1::uuid,x.linha,x.produto::uuid,x.q,x.p from jsonb_to_recordset($2::jsonb) as x(linha int,produto text,q numeric,p numeric)`,
      [id, JSON.stringify(itens.map((i, n) => ({ linha: n + 1, produto: i.produtoId, q: i.quantidade, p: i.precoUnitario })))]),
  ] as unknown[]);
  return id;
}

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const u = new URL(req.url);
    const id = clean(u.searchParams.get("id"), 40);
    if (id) {
      need(id, "Pedido inválido.");
      const [pc] = await q(`select p.*,f.razao_social fornecedor_nome from cmp_pedidos p join cmp_fornecedores f on f.id=p.fornecedor_id where p.id=$1`, [id]);
      if (!pc) throw new Error("Pedido não encontrado.");
      const [itens, receb] = await Promise.all([
        q(`select i.*,pr.codigo,pr.descricao,(i.quantidade-i.quantidade_recebida) pendente from cmp_pedido_itens i join est_produtos pr on pr.id=i.produto_id where i.pedido_id=$1 order by i.linha`, [id]),
        q(`select r.*,(select json_agg(x order by x.linha) from cmp_recebimento_itens x where x.recebimento_id=r.id) itens from cmp_recebimentos r where r.pedido_id=$1 order by r.criado_em desc`, [id]),
      ]);
      return NextResponse.json({ pedido: pc, itens, recebimentos: receb }, { headers: { "Cache-Control": "no-store" } });
    }
    const [fornecedores, pedidos, solicitacoes, sugestao, abc, terceiros, produtos, locais, aprovacao] = await Promise.all([
      q(`select * from cmp_fornecedores order by ativo desc,razao_social limit 1000`),
      q(`select p.id,p.numero,p.status,p.total,p.previsao,p.aprovador_exigido,f.razao_social fornecedor_nome from cmp_pedidos p join cmp_fornecedores f on f.id=p.fornecedor_id order by p.numero desc limit 200`),
      q(`select s.*,(select json_agg(json_build_object('linha',i.linha,'produto_id',i.produto_id,'codigo',p.codigo,'descricao',p.descricao,'quantidade',i.quantidade,'propostas',(select coalesce(json_agg(json_build_object('fornecedor_id',c.fornecedor_id,'fornecedor',f.razao_social,'preco',c.preco_unitario,'prazo',c.prazo_dias,'escolhida',c.escolhida)),'[]'::json) from cmp_cotacao_propostas c join cmp_fornecedores f on f.id=c.fornecedor_id where c.solicitacao_id=i.solicitacao_id and c.linha=i.linha)) order by i.linha) from cmp_solicitacao_itens i join est_produtos p on p.id=i.produto_id where i.solicitacao_id=s.id) itens from cmp_solicitacoes s order by s.numero desc limit 100`),
      q(`select * from cmp_sugestao_compra() limit 300`),
      q(`select * from cmp_curva_abc_xyz(180) limit 300`),
      q(`select t.*,f.razao_social fornecedor,p.codigo from cmp_saldo_terceiros t join cmp_fornecedores f on f.id=t.fornecedor_id join est_produtos p on p.id=t.produto_id where t.saldo<>0 or t.custo_servico>0 order by f.razao_social`),
      q(`select id,codigo,descricao,classificacao,estoque_minimo,estoque_seguranca,lead_time_dias,lote_compra from est_produtos where ativo order by codigo limit 3000`),
      q(`select id,codigo,descricao from est_locais where ativo order by codigo`),
      alcadas(),
    ]);
    return NextResponse.json({ fornecedores, pedidos, solicitacoes, sugestao, abc, terceiros, produtos, locais, alcadas: aprovacao }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : m || "Falha ao consultar compras." }, { status: forbidden ? 403 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const uname = user.usuario;

    if (acao === "FORNECEDOR") {
      const nome = clean(b.razaoSocial, 240);
      if (!nome) throw new Error("Informe a razão social.");
      const prazo = Number(b.prazoMedioDias ?? 0);
      if (!Number.isInteger(prazo) || prazo < 0) throw new Error("Prazo médio inválido.");
      await q(`insert into cmp_fornecedores(razao_social,documento,email,telefone,condicao_pagamento,prazo_medio_dias,terceirizador,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [nome, clean(b.documento, 40), clean(b.email), clean(b.telefone, 50), clean(b.condicaoPagamento, 120), prazo, !!b.terceirizador, uname]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "PARAMETROS") {
      const n = (v: unknown) => { const x = Number(v ?? 0); if (!Number.isFinite(x) || x < 0) throw new Error("Parâmetro inválido."); return x; };
      await q(`update est_produtos set estoque_minimo=$2,estoque_seguranca=$3,lead_time_dias=$4,lote_compra=$5 where id=$1`, [need(clean(b.produtoId, 40), "Produto inválido."), n(b.estoqueMinimo), n(b.estoqueSeguranca), Math.round(n(b.leadTimeDias)), n(b.loteCompra)]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "SOLICITACAO") {
      const itens = await itensPedido((b.itens ?? []).map((i: any) => ({ ...i, precoUnitario: 0 })));
      const id = randomUUID(), d = db();
      await d.transaction([
        d.query(`insert into cmp_solicitacoes(id,motivo,criado_por) values($1,$2,$3)`, [id, clean(b.motivo, 300), uname]),
        d.query(`insert into cmp_solicitacao_itens(solicitacao_id,linha,produto_id,quantidade) select $1::uuid,x.linha,x.produto::uuid,x.q from jsonb_to_recordset($2::jsonb) as x(linha int,produto text,q numeric)`, [id, JSON.stringify(itens.map((i, n) => ({ linha: n + 1, produto: i.produtoId, q: i.quantidade })))]),
      ] as unknown[]);
      return NextResponse.json({ ok: true, id });
    }
    if (acao === "SOLICITACAO_APROVAR") {
      const r = await q(`update cmp_solicitacoes set status='APROVADA',aprovado_por=$2,aprovado_em=now() where id=$1 and status='RASCUNHO' returning id`, [need(clean(b.id, 40), "Solicitação inválida."), uname]);
      if (!r.length) throw new Error("Solicitação não está em rascunho.");
      return NextResponse.json({ ok: true });
    }
    if (acao === "PROPOSTA") {
      const preco = Number(b.precoUnitario), prazo = Number(b.prazoDias ?? 0);
      if (!Number.isFinite(preco) || preco < 0 || !Number.isInteger(prazo) || prazo < 0) throw new Error("Preço/prazo inválido.");
      const sol = need(clean(b.solicitacaoId, 40), "Solicitação inválida.");
      const [s] = await q(`select status from cmp_solicitacoes where id=$1`, [sol]);
      if (s?.status !== "APROVADA") throw new Error("Cotação só em solicitação aprovada.");
      await q(`insert into cmp_cotacao_propostas(solicitacao_id,linha,fornecedor_id,preco_unitario,prazo_dias,criado_por) values($1,$2,$3,$4,$5,$6)
        on conflict(solicitacao_id,linha,fornecedor_id) do update set preco_unitario=excluded.preco_unitario,prazo_dias=excluded.prazo_dias,escolhida=false`, [sol, Number(b.linha), need(clean(b.fornecedorId, 40), "Fornecedor inválido."), preco, prazo, uname]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "COTACAO_GERAR_PEDIDOS") {
      const sol = need(clean(b.solicitacaoId, 40), "Solicitação inválida.");
      const [s] = await q(`select status from cmp_solicitacoes where id=$1`, [sol]);
      if (s?.status !== "APROVADA") throw new Error("Solicitação não está aprovada.");
      const itens = await q(`select i.linha,i.produto_id,i.quantidade from cmp_solicitacao_itens i where solicitacao_id=$1 order by linha`, [sol]);
      const props = await q(`select linha,fornecedor_id,preco_unitario,prazo_dias from cmp_cotacao_propostas where solicitacao_id=$1`, [sol]);
      const escolhas: { fornecedorId: string; produtoId: string; quantidade: number; precoUnitario: number; linha: number }[] = [];
      for (const it of itens) {
        const m = melhorProposta(props.filter((p) => p.linha === it.linha).map((p) => ({ linha: p.linha, fornecedorId: p.fornecedor_id, precoUnitario: Number(p.preco_unitario), prazoDias: p.prazo_dias })));
        if (!m) throw new Error(`Linha ${it.linha} sem proposta.`);
        escolhas.push({ fornecedorId: m.fornecedorId, produtoId: it.produto_id, quantidade: Number(it.quantidade), precoUnitario: m.precoUnitario, linha: it.linha });
      }
      const marc = await q(`update cmp_solicitacoes set status='ATENDIDA' where id=$1 and status='APROVADA' returning id`, [sol]);
      if (!marc.length) throw new Error("Solicitação já atendida.");
      await q(`update cmp_cotacao_propostas c set escolhida=true where solicitacao_id=$1 and (linha,fornecedor_id) in (select * from jsonb_to_recordset($2::jsonb) as x(linha int,fornecedor_id uuid))`, [sol, JSON.stringify(escolhas.map((e) => ({ linha: e.linha, fornecedor_id: e.fornecedorId })))]);
      const ids: string[] = [];
      for (const [forn, its] of agruparPorFornecedor(escolhas)) ids.push(await criarPC(forn, its, uname, { solicitacaoId: sol }));
      return NextResponse.json({ ok: true, pedidos: ids });
    }
    if (acao === "PEDIDO") {
      const id = await criarPC(need(clean(b.fornecedorId, 40), "Fornecedor inválido."), await itensPedido(b.itens), uname, { previsao: clean(b.previsao, 10) || null, obs: clean(b.observacoes, 2000) });
      return NextResponse.json({ ok: true, id });
    }
    if (acao === "PEDIDO_ENVIAR" || acao === "PEDIDO_APROVAR" || acao === "PEDIDO_CANCELAR") {
      const id = need(clean(b.id, 40), "Pedido inválido.");
      const [pc] = await q(`select status,aprovador_exigido from cmp_pedidos where id=$1`, [id]);
      if (!pc) throw new Error("Pedido não encontrado.");
      if (acao === "PEDIDO_APROVAR" && !podeAprovar(user.perfil, pc.aprovador_exigido)) throw new Error(`Este pedido exige aprovação do perfil ${pc.aprovador_exigido === "GERENTE" ? "Gerente" : "PCP ou Gerente"} (alçada).`);
      const [de, para] = acao === "PEDIDO_ENVIAR" ? [["RASCUNHO"], "EM_APROVACAO"] : acao === "PEDIDO_APROVAR" ? [["EM_APROVACAO"], "APROVADO"] : [["RASCUNHO", "EM_APROVACAO", "APROVADO"], "CANCELADO"];
      if (para === "CANCELADO" && clean(b.motivo, 500).length < 5) throw new Error("Informe o motivo do cancelamento.");
      const r = await q(`update cmp_pedidos set status=$3,atualizado_em=now(),aprovado_por=case when $3='APROVADO' then $4 else aprovado_por end,aprovado_em=case when $3='APROVADO' then now() else aprovado_em end,cancelado_motivo=case when $3='CANCELADO' then $5 else cancelado_motivo end
        where id=$1 and status=any($2::text[]) and not (status='APROVADO' and exists(select 1 from cmp_pedido_itens where pedido_id=$1 and quantidade_recebida>0)) returning id`, [id, de, para, uname, clean(b.motivo, 500)]);
      if (!r.length) throw new Error("Transição inválida ou pedido já alterado por outro usuário.");
      return NextResponse.json({ ok: true });
    }
    if (acao === "XML_CONFERIR") {
      const nfe = lerNfeXml(String(b.xml ?? ""));
      const id = need(clean(b.pedidoId, 40), "Pedido inválido.");
      const itens = await q(`select i.linha,p.codigo,(i.quantidade-i.quantidade_recebida) pendente,i.preco_unitario from cmp_pedido_itens i join est_produtos p on p.id=i.produto_id where i.pedido_id=$1`, [id]);
      const [forn] = await q(`select f.documento from cmp_pedidos p join cmp_fornecedores f on f.id=p.fornecedor_id where p.id=$1`, [id]);
      const digitos = (s: string) => s.replace(/\D/g, "");
      const emitenteConfere = !forn?.documento || digitos(forn.documento) === digitos(nfe.emitenteDocumento);
      const [dup] = await q(`select 1 x from cmp_recebimentos where chave_nfe=$1`, [nfe.chave]);
      return NextResponse.json({ nfe, emitenteConfere, jaRecebida: !!dup, conferencia: conferirNfe(nfe, itens.map((i) => ({ linha: i.linha, codigo: i.codigo, pendente: Number(i.pendente), precoUnitario: Number(i.preco_unitario) }))) });
    }
    if (acao === "PORTAL_LINK") {
      const pedidoId = need(clean(b.pedidoId, 40), "Pedido inválido.");
      const [pc] = await q("select status from cmp_pedidos where id=$1::uuid", [pedidoId]);
      if (!pc || !["APROVADO", "PARCIAL"].includes(pc.status)) throw new Error("O link só é gerado para pedido aprovado.");
      const t = gerarTokenPortal(unidadeAtual() ?? "SUL");
      await q("update cmp_portal_tokens set revogado_em=now() where pedido_id=$1::uuid and revogado_em is null", [pedidoId]);
      await q("insert into cmp_portal_tokens(pedido_id,token_hash,expira_em,criado_por) values($1::uuid,$2,now()+interval '30 days',$3)", [pedidoId, t.hash, user.usuario]);
      return NextResponse.json({ ok: true, caminho: `/portal-fornecedor?t=${t.token}`, aviso: "Envie este link ao fornecedor. Vale por 30 dias e o link anterior deixa de funcionar." });
    }
    if (acao === "RECEBER") {
      const itens = (Array.isArray(b.itens) ? b.itens : []).map((i: any) => ({ linha: Number(i.linha), quantidade: Number(i.quantidade), precoNf: i.precoNf == null || i.precoNf === "" ? null : Number(i.precoNf) }));
      const [r] = await q(`select cmp_receber($1::uuid,$2,$3,$4::uuid,$5::jsonb,$6) id`, [need(clean(b.pedidoId, 40), "Pedido inválido."), clean(b.notaNumero, 40), clean(b.chave, 44) || null, need(clean(b.localId, 40), "Selecione o depósito."), JSON.stringify(itens), uname]);
      return NextResponse.json({ ok: true, id: r.id });
    }
    if (acao === "TERCEIRO") {
      const tipo = clean(b.tipo, 10).toUpperCase();
      const [r] = await q(`select cmp_terceiro_mov($1,$2::uuid,$3::uuid,$4::uuid,$5::numeric,$6::numeric,$7::uuid,$8,null,$9) id`,
        [tipo, need(clean(b.fornecedorId, 40), "Fornecedor inválido."), need(clean(b.produtoId, 40), "Produto inválido."), clean(b.produtoRetornoId, 40) || null, Number(b.quantidade), Number(b.custoServico ?? 0), need(clean(b.localId, 40), "Selecione o depósito."), clean(b.notaNumero, 40), uname]);
      return NextResponse.json({ ok: true, id: r.id });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    const dup = m.includes("duplicate key");
    return NextResponse.json({ error: forbidden ? "Sem permissão." : dup ? "Registro duplicado (documento ou chave da NF-e já cadastrados)." : m || "Falha ao gravar." }, { status: forbidden ? 403 : dup ? 409 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
