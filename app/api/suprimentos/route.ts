import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { q, clean, need, dec, inteiro, dia, H, erro } from "@/lib/api-util";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE", "LOGISTICA"] as const;
const WRITE = ["PCP", "GERENTE", "QUALIDADE"] as const;

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "cotacoes";
    if (visao === "cotacoes") {
      const sol = await q(`select s.id,s.numero,s.status,s.motivo,s.criado_em,(select count(*) from cmp_solicitacao_itens i where i.solicitacao_id=s.id)::int itens,
        (select count(distinct fornecedor_id) from cmp_cotacao_propostas p where p.solicitacao_id=s.id)::int fornecedores from cmp_solicitacoes s where s.status in('RASCUNHO','APROVADA') order by s.numero desc limit 100`);
      const forn = await q("select id,razao_social from cmp_fornecedores where ativo order by razao_social limit 500");
      return NextResponse.json({ solicitacoes: sol, fornecedores: forn }, { headers: H });
    }
    if (visao === "comparativo") {
      const id = need(url.searchParams.get("id"), "Solicitação inválida.");
      const itens = await q(`select i.linha,pr.codigo,pr.descricao,i.quantidade::float from cmp_solicitacao_itens i join est_produtos pr on pr.id=i.produto_id where i.solicitacao_id=$1::uuid order by i.linha`, [id]);
      const props = await q(`select linha,fornecedor_id,fornecedor,preco_unitario::float,frete::float,prazo_dias,condicao_pagamento,validade,escolhida,motivo_escolha,total_proposta::float,pos_preco::int,pos_prazo::int,menor_preco from cmp_v_cotacao_comparativa where solicitacao_id=$1::uuid order by linha,pos_preco`, [id]);
      return NextResponse.json({ itens, propostas: props }, { headers: H });
    }
    if (visao === "avaliacao") {
      const score = await q("select fornecedor_id,razao_social,recebimentos::int,otd_pct::float,ncs::int,nota_manual::float,score::float,classe from cmp_v_fornecedor_score where ativo order by score desc nulls last, razao_social limit 500");
      return NextResponse.json({ score }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar suprimentos."); }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    if (acao === "PROPOSTA") {
      await q(`insert into cmp_cotacao_propostas(solicitacao_id,linha,fornecedor_id,preco_unitario,frete,prazo_dias,condicao_pagamento,validade,criado_por)
        values($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8::date,$9)
        on conflict(solicitacao_id,linha,fornecedor_id) do update set preco_unitario=excluded.preco_unitario,frete=excluded.frete,prazo_dias=excluded.prazo_dias,condicao_pagamento=excluded.condicao_pagamento,validade=excluded.validade`,
        [need(b.id, "Solicitação inválida."), inteiro(b.linha, "Linha inválida."), need(b.fornecedorId, "Fornecedor inválido."), dec(b.preco, "Preço inválido."), dec(b.frete ?? 0, "Frete inválido."), inteiro(b.prazo ?? 0, "Prazo inválido.", 0, 1000), clean(b.condicao, 120), clean(b.validade, 10) ? dia(b.validade, "Validade inválida.") : null, user.usuario]);
    } else if (acao === "ESCOLHER") {
      await q("select cmp_cotacao_escolher($1::uuid,$2,$3::uuid,$4,$5)", [need(b.id, "Solicitação inválida."), inteiro(b.linha, "Linha inválida."), need(b.fornecedorId, "Fornecedor inválido."), clean(b.motivo, 500), user.usuario]);
    } else if (acao === "AVALIAR") {
      const comp = clean(b.competencia, 7);
      if (!/^\d{4}-\d{2}$/.test(comp)) throw new Error("Competência inválida (AAAA-MM).");
      await q(`insert into cmp_fornecedor_avaliacoes(fornecedor_id,competencia,nota_atendimento,nota_documentacao,observacao,criado_por) values($1::uuid,$2,$3,$4,$5,$6)
        on conflict(fornecedor_id,competencia) do update set nota_atendimento=excluded.nota_atendimento,nota_documentacao=excluded.nota_documentacao,observacao=excluded.observacao`,
        [need(b.fornecedorId, "Fornecedor inválido."), comp, dec(b.atendimento, "Nota inválida (0–10).", 0, 10), dec(b.documentacao, "Nota inválida (0–10).", 0, 10), clean(b.observacao, 500), user.usuario]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: H });
  } catch (e) { return erro(e, "Falha ao gravar."); }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
