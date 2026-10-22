import { test } from "node:test";
import assert from "node:assert/strict";
import { bancoCompleto } from "./helpers-chain";

test("Postgres: embalagem, MRP por horizonte e demais fases do ERP", async () => {
  const { db, one, all, n } = await bancoCompleto();
  try {
    // ---------- Fase 2: plano de embalagem
    const plano = JSON.stringify([
      { tipo: "PORTA", limiteM3: 2, volumeM3: 1.2, limiteQtd: 32, status: "VALIDO", regra: "HS: 32 portas", itens: [{ descricao: "Porta 80x210", medida: "80x210", quantidade: 10 }, { descricao: "Porta 70x210", medida: "70x210", quantidade: 5 }] },
      { tipo: "BATENTE", limiteM3: 2, volumeM3: 0.8, status: "VALIDO", regra: "250 jogos", itens: [{ descricao: "Batente 15cm", quantidade: 20 }] },
      { tipo: "PORTA", limiteM3: 2, volumeM3: 2.4, status: "INVALIDO", regra: "excede m³", itens: [{ descricao: "Porta 90", quantidade: 40 }] },
    ]);
    await assert.rejects(one("select emb_plano_criar('','HS','[]'::jsonb,'t')"), /pedido/);
    await assert.rejects(one("select emb_plano_criar('5000','HS','[]'::jsonb,'t')"), /não tem pallets/);
    const { id: pl } = await one("select emb_plano_criar('5000','MONTADO_HS',$1::jsonb,'emb1') id", [plano]);
    await assert.rejects(one("select emb_plano_criar('5000','MONTADO_HS',$1::jsonb,'emb1')", [plano]), /em aberto|unique|duplicate/i);
    assert.equal(n((await one("select count(*) c from emb_itens where plano_id=$1", [pl])).c), 4);
    // conferir: divergência exige observação
    await assert.rejects(one("select emb_conferir($1,1,1,9,'','emb1')", [pl]), /DIVERGENCIA/);
    await one("select emb_conferir($1,1,1,10,'','emb1')", [pl]);
    await assert.rejects(one("select emb_pallet_fechar($1,1,'emb1')", [pl]), /sem conferência/); // item 2 ainda sem conferir
    await one("select emb_conferir($1,1,2,4,'faltou 1 porta','emb1')", [pl]);
    await assert.rejects(one("select emb_pallet_fechar($1,1,'emb1')", [pl]), /DIVERGENCIA/); // conferido ≠ plano
    await one("select emb_conferir($1,1,2,5,'','emb1')", [pl]);
    const pid = (await one("select emb_pallet_fechar($1,1,'emb1') id", [pl])).id as string;
    assert.equal((await one("select codigo from pcp_pallets where id=$1", [pid])).codigo, "5000-P01");
    assert.equal((await one("select status from emb_planos where id=$1", [pl])).status, "EM_EMBALAGEM");
    await assert.rejects(one("select emb_conferir($1,1,1,10,'','emb1')", [pl]), /já está fechado/);
    // pallet inválido não fecha
    await one("select emb_conferir($1,3,1,40,'','emb1')", [pl]);
    await assert.rejects(one("select emb_pallet_fechar($1,3,'emb1')", [pl]), /PALLET_INVALIDO/);
    await assert.rejects(one("select emb_plano_cancelar($1,'emb1')", [pl]), /pallet fechado/);
    await one("select emb_conferir($1,2,1,20,'','emb1')", [pl]);
    await one("select emb_pallet_fechar($1,2,'emb1')", [pl]);
    // revisão aberta bloqueia embalagem
    await one("select wms_revisao_abrir('5000','mudou','c',current_date+2,$1::jsonb,'pcp')", [JSON.stringify([{ acao: "ACRESCENTA", descricao: "x", qtdAntes: 0, qtdDepois: 1 }])]);
    await assert.rejects(one("select emb_pallet_fechar($1,3,'emb1')", [pl]), /REVISAO_ABERTA/);
    await assert.rejects(one("select emb_plano_criar('5000','HS',$1::jsonb,'x')", [plano]), /REVISAO_ABERTA/);
    const rs = await one<{ pallets: string; fechados: string; invalidos: string }>("select pallets,fechados,invalidos from emb_v_resumo where id=$1", [pl]);
    assert.deepEqual([n(rs.pallets), n(rs.fechados), n(rs.invalidos)], [3, 2, 1]);

    // ---------- Fase 2: MRP por horizonte
    const { id: local } = await one("insert into est_locais(codigo) values('MRP') returning id");
    assert.ok(local);
    const sem = await all("select * from erp_mrp_liquido_periodo(current_date, current_date + 30)");
    assert.equal(sem.length, 0);
    assert.equal((await all("select * from erp_mrp_liquido_periodo(null, null)")).length, 0);
  } finally { await db.close(); }
});

test("Postgres: cotação comparativa, avaliação de fornecedor, CAPA com eficácia e funil", async () => {
  const { db, one, all, n } = await bancoCompleto();
  try {
    const f1 = (await one("insert into cmp_fornecedores(razao_social,documento,criado_por) values('Forn A','111','t') returning id")).id;
    const f2 = (await one("insert into cmp_fornecedores(razao_social,documento,criado_por) values('Forn B','222','t') returning id")).id;
    const pr = (await one("insert into est_produtos(codigo,descricao,unidade_base,criado_por) values('P1','Parafuso','UN','t') returning id")).id;
    const sol = (await one("insert into cmp_solicitacoes(criado_por) values('t') returning id")).id;
    await one("insert into cmp_solicitacao_itens(solicitacao_id,linha,produto_id,quantidade) values($1,1,$2,100)", [sol, pr]);
    await one("insert into cmp_cotacao_propostas(solicitacao_id,linha,fornecedor_id,preco_unitario,prazo_dias,criado_por) values($1,1,$2,2.00,10,'t')", [sol, f1]);
    await assert.rejects(one("select cmp_cotacao_escolher($1,1,$2,'','t')", [sol, f1]), /COTACAO_INSUFICIENTE/);
    await one("insert into cmp_cotacao_propostas(solicitacao_id,linha,fornecedor_id,preco_unitario,frete,prazo_dias,criado_por) values($1,1,$2,1.80,50,5,'t')", [sol, f2]);
    // A: 200 ; B: 180+50=230  → A é o menor total
    await assert.rejects(one("select cmp_cotacao_escolher($1,1,$2,'','t')", [sol, f2]), /JUSTIFICATIVA/);
    await one("select cmp_cotacao_escolher($1,1,$2,'prazo menor, urgente','t')", [sol, f2]);
    assert.equal((await one("select fornecedor_id from cmp_cotacao_propostas where solicitacao_id=$1 and escolhida", [sol])).fornecedor_id, f2);
    await one("select cmp_cotacao_escolher($1,1,$2,'','t')", [sol, f1]);
    assert.equal(n((await one("select count(*) c from cmp_cotacao_propostas where solicitacao_id=$1 and escolhida", [sol])).c), 1);
    const sc = await all("select * from cmp_v_fornecedor_score where fornecedor_id=$1", [f1]);
    assert.equal(sc[0].classe, "SEM_DADOS");
    await one("insert into cmp_fornecedor_avaliacoes(fornecedor_id,competencia,nota_atendimento,nota_documentacao,criado_por) values($1,'2026-10',9,9,'t')", [f1]);
    assert.ok(["A", "B"].includes(String((await one("select classe from cmp_v_fornecedor_score where fornecedor_id=$1", [f1])).classe)));
    // CAPA: eficácia
    const nc = (await one("insert into qld_nao_conformidades(descricao,causa_raiz,fornecedor_id,origem,criado_por) values('peça fora','falha de processo X',$1,'FORNECEDOR','t') returning id", [f1])).id;
    await one("insert into qld_acoes(nc_id,linha,tipo,descricao) values($1,1,'CORRETIVA','trocar ferramenta')", [nc]);
    await assert.rejects(one("select qld_eficacia_definir_prazo($1,current_date-1,'t')", [nc]), /inválido/);
    await one("select qld_eficacia_definir_prazo($1,current_date+30,'t')", [nc]);
    await assert.rejects(one("select qld_eficacia_verificar($1,true,'ok','t')", [nc]), /Conclua as ações/);
    await one("update qld_acoes set concluida_em=now() where nc_id=$1", [nc]);
    await assert.rejects(one("select qld_encerrar_nc($1,'t')", [nc]), /EFICACIA_PENDENTE/);
    await assert.rejects(one("select qld_eficacia_verificar($1,true,'x','t')", [nc]), /evidência/);
    await one("select qld_eficacia_verificar($1,false,'defeito voltou no lote 2','t')", [nc]);
    await assert.rejects(one("select qld_encerrar_nc($1,'t')", [nc]), /EFICACIA_REPROVADA/);
    assert.equal((await one("select situacao from qld_v_capa_eficacia where id=$1", [nc])).situacao, "INEFICAZ");
    await one("select qld_eficacia_definir_prazo($1,current_date+10,'t')", [nc]);
    await one("select qld_eficacia_verificar($1,true,'3 lotes sem defeito','t')", [nc]);
    await one("select qld_encerrar_nc($1,'t')", [nc]);
    assert.equal((await one("select status from qld_nao_conformidades where id=$1", [nc])).status, "ENCERRADA");
    // NC sem prazo de eficácia continua encerrando como antes
    const nc2 = (await one("insert into qld_nao_conformidades(descricao,causa_raiz,criado_por) values('x','causa válida',  't') returning id")).id;
    await one("insert into qld_acoes(nc_id,linha,tipo,descricao,concluida_em) values($1,1,'CORRETIVA','a',now())", [nc2]);
    await one("select qld_encerrar_nc($1,'t')", [nc2]);
    // funil
    const fu = await one("select * from vnd_v_funil");
    assert.equal(n(fu.aceitas), 0);
    assert.equal(n((await one("select count(*) c from vnd_v_pedido_revisoes")).c), 0);
  } finally { await db.close(); }
});

test("Postgres: fechamento de período, rateio, margem, sugestão de conciliação e prontidão fiscal", async () => {
  const { db, one, all, n } = await bancoCompleto();
  try {
    await one("select ctb_semear_plano('t')");
    const cc1 = (await one("insert into fin_centros_custo(codigo,nome) values('ADM','Administração') returning id")).id;
    const cc2 = (await one("insert into fin_centros_custo(codigo,nome) values('FAB','Fábrica') returning id")).id;
    const cc3 = (await one("insert into fin_centros_custo(codigo,nome) values('COM','Comercial') returning id")).id;
    const [c1, c2] = (await all("select id from ctb_contas where analitica and ativo order by codigo limit 2")).map((x) => x.id);
    await one("select ctb_lancar('2026-09-10','despesa adm',null,null,$1::jsonb,'t')", [JSON.stringify([{ conta_id: c1, debito: 1000, centro_custo_id: cc1 }, { conta_id: c2, credito: 1000 }])]);
    // rateio
    await assert.rejects(one("select fin_rateio_salvar($1,$2::jsonb,'t')", [cc1, JSON.stringify([{ destino: cc2, percentual: 60 }, { destino: cc3, percentual: 30 }])]), /RATEIO_INVALIDO/);
    await one("select fin_rateio_salvar($1,$2::jsonb,'t')", [cc1, JSON.stringify([{ destino: cc2, percentual: 70 }, { destino: cc3, percentual: 30 }])]);
    assert.equal(n(await one("select fin_rateio_apurar('2026-09','t') c").then((r) => r.c)), 2);
    const rat = await all("select destino_id,valor::float v from fin_rateio_apuracoes where competencia='2026-09'");
    assert.equal(rat.reduce((a, x) => a + Number(x.v), 0), 1000);
    // fechamento
    await assert.rejects(one("select fin_periodo_fechar('2026-13','','t')"), /inválida/);
    await one("select fin_periodo_fechar('2026-09','ok','t')");
    await assert.rejects(one("select fin_periodo_fechar('2026-09','','t')"), /PERIODO_FECHADO/);
    await assert.rejects(one("select ctb_lancar('2026-09-20','x',null,null,$1::jsonb,'t')", [JSON.stringify([{ conta_id: c1, debito: 5 }, { conta_id: c2, credito: 5 }])]), /PERIODO_FECHADO/);
    await assert.rejects(one("select fin_rateio_apurar('2026-09','t')"), /PERIODO_FECHADO/);
    await assert.rejects(one("select fin_periodo_reabrir('2026-09','curto','t')"), /motivo/);
    await one("select fin_periodo_reabrir('2026-09','correção de lançamento duplicado','t')");
    await one("select ctb_lancar('2026-09-20','x',null,null,$1::jsonb,'t')", [JSON.stringify([{ conta_id: c1, debito: 5 }, { conta_id: c2, credito: 5 }])]);
    assert.equal(n((await one("select count(*) c from fin_periodo_historico")).c), 2);
    // conciliação sugerida
    const cb = (await one("insert into fin_contas_bancarias(nome,criado_por) values('Banco','t') returning id")).id;
    const t = (await one("insert into fin_titulos(tipo,origem,ref,vencimento,valor,competencia,parceiro,criado_por) values('RECEBER','MANUAL','m1','2026-10-10',500,'2026-10','Cliente X','t') returning id")).id;
    await one("insert into fin_extratos(conta_id,data,descricao,valor,fitid,criado_por) values($1,'2026-10-12','PIX CLIENTE X',500,'f1','t')", [cb]);
    await one("insert into fin_extratos(conta_id,data,descricao,valor,fitid,criado_por) values($1,'2026-10-12','TARIFA',-30,'f2','t')", [cb]);
    const sug = await all("select * from fin_conciliar_sugestoes($1)", [cb]);
    assert.equal(sug.length, 1);
    assert.equal(sug[0].titulo_id, t);
    // margem (view roda sem pedidos)
    assert.equal((await all("select * from fin_v_margem_cliente")).length, 0);
    const pr = await one("select fis_prontidao() p");
    assert.ok(Array.isArray(pr.p) && pr.p.length === 6);
  } finally { await db.close(); }
});
