import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: pendências de produção, estoque e financeiro (migration 25)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-19_sac_industrial.sql", "2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql", "2026-10-30_22_financeiro_contabil.sql", "2026-10-31_23_manutencao_documentos.sql", "2026-11-01_24_indicadores_integracoes.sql", "2026-11-02_25_pendencias_producao_estoque_financeiro.sql", "2026-11-03_26_sac_qualidade_oee.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_|_21_|_22_|_23_|_24_|_25_|_26_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const n = (v: unknown) => Number(v);
    const all = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows;
    assert.equal(n((await one<{ c: string }>("select count(*) c from est_ciclico_regras")).c), 3);

    const { id: emp } = await one("insert into pcp_empresas(codigo,razao_social) values('T','T') returning id");
    const { id: fil } = await one("insert into pcp_filiais(empresa_id,codigo,nome) values($1,'SUL','Sul') returning id", [emp]);
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: centro } = await one("insert into pcp_capacidades_maquina(processo,maquina,turno,empresa_id,filial_id) values('CORTE','M1','A',$1,$2) returning id", [emp, fil]);
    const prod = async (c: string, t: string) => (await one("insert into est_produtos(codigo,unidade_base,classificacao) values($1,'UN',$2) returning id", [c, t])).id as string;
    const A = await prod("A", "INSUMO"), S = await prod("S", "INSUMO"), X = await prod("X", "INSUMO"), F = await prod("F", "ACABADO");
    const { id: bom } = await one("select erp_criar_estrutura($1,$2,$3,'t') id", [F, JSON.stringify([{ componente_id: A, quantidade: 1, perda_percentual: 0 }]), crypto.randomUUID()]);
    await one("select erp_aprovar_estrutura($1,'t')", [bom]);
    const ops = [{ sequencia: 1, processo: 'CORTE', centro_id: centro, chave: 'INTERNA', setup: 0, ciclo: 6, parcial: true, entrada: true, componentes: [{ produto_id: A, consumo: 'AUTOMATICO' }] }];
    const { id: rot } = await one("select erp_ciclo_roteiro($1,$2,$3,$4,$5,'t') id", [emp, fil, F, JSON.stringify(ops), crypto.randomUUID()]);
    await one("select erp_ciclo_aprovar_roteiro($1,'t')", [rot]);
    await one("select erp_ciclo_versao($1,$2,$3,$4,'2026-01-01',null,0,null,'t')", [emp, fil, bom, rot]);
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,10),($3,$2,20),($4,$2,5)", [A, local, S, X]);
    const pg = crypto.randomUUID(), orig = crypto.randomUUID();
    await db.query("insert into pcp_programacoes(id,filtro,data_programacao,turno,status) values($1,'F','2026-10-01','A','ATIVA')", [pg]);
    await db.query("insert into pcp_produtos(id,programacao_id,produto,pedido,of,descricao,quantidade) values($1,$2,'F','P1','1','F',5)", [orig, pg]);
    await db.query("insert into pcp_operacoes(produto_id,processo,sequencia,quantidade_planejada) values($1,'CORTE',1,5)", [orig]);
    const { id: of } = await one("select erp_ciclo_gerar($1,$2,$3,5,'2026-10-31',$4,'BLOQUEAR',false,$5,$5,null,'t') id", [emp, fil, F, local, orig]);
    await one("select erp_ciclo_confirmar($1,'t')", [of]);
    const op = await one("select id from pcp_operacoes where of_id=$1", [of]);

    // substituto: só pares autorizados; fator 2 => 3 boas consomem 6 de S e liberam a reserva de A
    await db.query("insert into erp_substitutos(componente_id,substituto_id,fator,criado_por) values($1,$2,2,'t')", [A, S]);
    await assert.rejects(db.query("insert into erp_substitutos(componente_id,substituto_id,fator,criado_por) values($1,$1,1,'t')", [A]), /check/i);
    await assert.rejects(one("select erp_ciclo_apontar($1,$2,$3,'t')", [op.id, JSON.stringify({ boa: 1, refugo: 0, consumirRefugo: true, consumos: [{ produtoId: A, substitutoId: X }] }), crypto.randomUUID()]), /SUBSTITUTO_INVALIDO/);
    assert.equal(n((await one("select reservado from est_saldos where produto_id=$1", [A])).reservado), 5);
    await one("select erp_ciclo_apontar($1,$2,$3,'t')", [op.id, JSON.stringify({ boa: 3, refugo: 0, consumirRefugo: true, consumos: [{ produtoId: A, substitutoId: S }] }), crypto.randomUUID()]);
    assert.equal(n((await one("select fisico from est_saldos where produto_id=$1", [S])).fisico), 14);
    assert.equal(n((await one("select fisico from est_saldos where produto_id=$1", [A])).fisico), 10);
    assert.equal(n((await one("select reservado from est_saldos where produto_id=$1", [A])).reservado), 2);
    const sub = await one("select quantidade_original q,quantidade_substituto qs from erp_of_substituicoes where of_id=$1", [of]);
    assert.deepEqual([n(sub.q), n(sub.qs)], [3, 6]);
    assert.equal(n((await one("select fisico from est_saldos where produto_id=$1", [F])).fisico), 3);

    // endereçamento
    const { id: e1 } = await one("insert into est_enderecos(local_id,codigo,capacidade,criado_por) values($1,'A-01-1',10,'t') returning id", [local]);
    const { id: e2 } = await one("insert into est_enderecos(local_id,codigo,criado_por) values($1,'A-01-2','t') returning id", [local]);
    await one("select est_endereco_mover($1,null,$2,8,'t')", [S, e1]);
    await assert.rejects(one("select est_endereco_mover($1,null,$2,3,'t')", [S, e1]), /Capacidade/);
    await assert.rejects(one("select est_endereco_mover($1,null,$2,50,'t')", [S, e2]), /saldo físico/);
    await one("select est_endereco_mover($1,$2,$3,5,'t')", [S, e1, e2]);
    await assert.rejects(one("select est_endereco_mover($1,$2,$3,9,'t')", [S, e1, e2]), /SALDO_INSUFICIENTE/);
    assert.deepEqual((await all("select codigo,quantidade from est_endereco_saldos s join est_enderecos e on e.id=s.endereco_id order by 1")).map((r) => [r.codigo, n(r.quantidade)]), [["A-01-1", 3], ["A-01-2", 5]]);
    assert.equal(n((await one("select pendente from est_v_pendente_enderecar where produto_id=$1", [S])).pendente), 6);

    // inventário cíclico: abre, conta com divergência, ajusta pelo saldo atual
    assert.ok((await all("select * from est_ciclico_devidos(current_date)")).length >= 3);
    const abertas = n((await one("select est_ciclico_abrir(current_date,100,'t') c")).c);
    assert.ok(abertas >= 3);
    assert.equal(n((await one("select est_ciclico_abrir(current_date,100,'t') c")).c), 0);
    const cic = await one("select id from est_ciclico_contagens where produto_id=$1", [X]);
    assert.equal((await one("select est_ciclico_contar($1,5,'t') r", [cic.id])).r, "CONFERIDA");
    const cs = await one("select id from est_ciclico_contagens where produto_id=$1", [S]);
    assert.equal((await one("select est_ciclico_contar($1,12,'t') r", [cs.id])).r, "DIVERGENTE");
    await db.query("update est_saldos set fisico=fisico+1 where produto_id=$1", [S]); // movimento durante a contagem
    await assert.rejects(one("select est_ciclico_ajustar($1,'','t')", [cs.id]), /motivo/);
    await one("select est_ciclico_ajustar($1,'Avaria no depósito','t')", [cs.id]);
    assert.equal(n((await one("select fisico from est_saldos where produto_id=$1", [S])).fisico), 12);
    assert.equal((await one("select status from est_ciclico_contagens where id=$1", [cs.id])).status, "AJUSTADA");
    assert.equal((await all("select * from est_ciclico_devidos(current_date) where produto_id=$1", [S])).length, 0);

    // PEPS
    const camadas = await all("select * from est_peps_camadas($1)", [S]);
    assert.ok(Array.isArray(camadas));
    assert.ok((await all("select * from est_peps_resumo()")).length >= 1);

    // financeiro: juros, multa e desconto na baixa
    await one("select ctb_semear_plano('t')");
    const { id: banco } = await one("insert into fin_contas_bancarias(nome,saldo_inicial,saldo_inicial_data,criado_por) values('Itaú',0,'2026-01-01','t') returning id");
    const { id: cli } = await one("insert into crm_clientes(razao_social,criado_por,atualizado_por) values('ACME','t','t') returning id");
    const { id: tit } = await one("insert into fin_titulos(tipo,origem,ref,parceiro,vencimento,valor,competencia,criado_por) values('RECEBER','MANUAL','T1','ACME',current_date-10,1000,to_char(current_date,'YYYY-MM'),'t') returning id");
    const sug = await one("select * from fin_encargos_sugeridos($1,current_date,2,1)", [tit]);
    assert.deepEqual([n(sug.dias_atraso), n(sug.multa), n(sug.juros)], [10, 20, 3.33]);
    await one("select fin_baixar_completo($1,$2,current_date,980,3.33,20,20,null,'t')", [tit, banco]);
    const t1 = await one("select valor,valor_baixado,status from fin_titulos where id=$1", [tit]);
    assert.deepEqual([n(t1.valor), n(t1.valor_baixado), t1.status], [980, 980, "LIQUIDADO"]);
    assert.equal(n((await one("select count(*) c from fin_titulos where origem='ENCARGO' and status='LIQUIDADO'")).c), 2);
    assert.equal(n((await one("select sum(valor) v from fin_baixas where titulo_id in(select id from fin_titulos)")).v), 1003.33);
    const bal = await all("select c.codigo,sum(p.debito) d,sum(p.credito) c from ctb_partidas p join ctb_contas c on c.id=p.conta_id where c.codigo in('3.2.01','5.2.01') group by 1 order by 1");
    assert.deepEqual(bal.map((r) => [r.codigo, n(r.d), n(r.c)]), [["3.2.01", 0, 23.33], ["5.2.01", 20, 0]]);
    await assert.rejects(one("select fin_desconto($1,5,'x','t')", [tit]), /não aceita|motivo/);

    // portal do fornecedor: confirmação de entrega
    const { id: forn } = await one("insert into cmp_fornecedores(razao_social,criado_por) values('Forn','t') returning id");
    const { id: pc } = await one("insert into cmp_pedidos(fornecedor_id,status,criado_por) values($1,'APROVADO','t') returning id", [forn]);
    await one("select cmp_confirmar_entrega($1,current_date+7,'ok','FORNECEDOR')", [pc]);
    assert.equal((await one("select previsao::text p from cmp_pedidos where id=$1", [pc])).p, (await one("select (current_date+7)::text p")).p);
    await assert.rejects(one("select cmp_confirmar_entrega($1,current_date-1,'','FORNECEDOR')", [pc]), /intervalo/);

    // retrabalho
    const { id: ret } = await one("select cst_registrar_retrabalho($1,'CORTE',1,30,5,$2,'Medida fora','t') id", [of, centro]);
    assert.ok(ret);
    const an = await one<{ a: { retrabalho: { valor: number }; refugo_conversao: { valor: number } } }>("select cst_of_analise_ext($1) a", [of]);
    assert.ok(an.a.retrabalho.valor >= 5 && an.a.refugo_conversao.valor === 0);

    // OF do pedido com um clique
    const { id: rep } = await one("insert into crm_representantes(nome,criado_por,atualizado_por) values('Rep','t','t') returning id");
    const { id: pv } = await one("insert into crm_pedidos_venda(cliente_id,representante_id,status,pedido_pcp,total,data_entrega,criado_por,atualizado_por) values($1,$2,'APROVADO','0777',1000,current_date+20,'t','t') returning id", [cli, rep]);
    await db.query("insert into crm_pedido_venda_itens(pedido_id,linha,item_codigo,descricao,quantidade,preco_unitario,total) values($1,1,'F','F',10,100,1000)", [pv]);
    const g1 = await all<{ resultado: string; quantidade: string }>("select * from erp_gerar_ofs_pedido($1,$2,$3,$4,'t')", [pv, emp, fil, local]);
    assert.deepEqual(g1.map((r) => r.resultado), ["GERADA"]);
    assert.equal(n(g1[0].quantidade), 7);
    assert.equal((await one("select status from crm_pedidos_venda where id=$1", [pv])).status, "EM_PRODUCAO");
    const g2 = await all<{ resultado: string }>("select * from erp_gerar_ofs_pedido($1,$2,$3,$4,'t')", [pv, emp, fil, local]);
    assert.ok(g2.every((r) => r.resultado === "JA_GERADA"));
    assert.equal(n((await one("select count(*) c from crm_pedido_venda_of where pedido_id=$1", [pv])).c), 1);

    // migration 26: anexos e índice de reclamação do SAC
    const { id: sac } = await one("insert into pcp_sac_atendimentos(cliente,tipo,assunto,descricao,solicitante,criado_por,atualizado_por,status,concluido_em) values('ACME','RECLAMACAO','Porta empenada','x','t','t','t','CONCLUIDO',now()+interval '2 days') returning id");
    await db.query("insert into sac_anexos(atendimento_id,nome,mime,tamanho,conteudo,criado_por) values($1,'foto.png','image/png',4,'\\x89504e47','t')", [sac]);
    await assert.rejects(db.query("insert into sac_anexos(atendimento_id,nome,mime,tamanho,conteudo,criado_por) values($1,'x.exe','application/x-msdownload',4,'\\x89504e47','t')", [sac]), /check/i);
    await assert.rejects(db.query("insert into sac_anexos(atendimento_id,nome,mime,tamanho,conteudo,criado_por) values($1,'f.png','image/png',9,'\\x89504e47','t')", [sac]), /check/i);
    const ir = await one<{ r: { reclamacoes: number; resolucao: { concluidos: number } } }>("select sac_indice_reclamacao(current_date-1,current_date+1) r");
    assert.deepEqual([ir.r.reclamacoes, ir.r.resolucao.concluidos], [1, 1]);

    // qualidade: medições em lote, tudo ou nada
    const { id: plano } = await one("insert into qld_planos(produto_id,tipo,criado_por) values($1,'FINAL','t') returning id", [F]);
    await db.query("insert into qld_plano_caracteristicas(plano_id,linha,nome,nominal,tol_min,tol_max) values($1,1,'Largura',100,99,101)", [plano]);
    const { id: instr } = await one("insert into qld_instrumentos(codigo,calibracao_validade,criado_por) values('PQ',current_date+30,'t') returning id");
    const { id: li } = await one("select qld_abrir_lote($1,10,'MANUAL','T',null,$2,'t') id", [plano, local]);
    const amostra = n((await one("select amostra from qld_lotes_inspecao where id=$1", [li])).amostra);
    assert.ok(amostra >= 2);
    await assert.rejects(one("select qld_medir_lote($1,$2::jsonb,$3,'t')", [li, JSON.stringify([{ linha: 1, valor: 100 }, { linha: 9, valor: 1 }]), instr]), /Linha 2/);
    assert.equal(n((await one("select count(*) c from qld_medicoes where lote_inspecao_id=$1", [li])).c), 0);
    assert.equal(n((await one("select qld_medir_lote($1,$2::jsonb,$3,'t') c", [li, JSON.stringify([{ linha: 1, valor: 100 }, { linha: 1, valor: 100.5 }]), instr])).c), 2);

    // OEE: desempenho a partir das horas reais informadas
    const pop = await one("select id from pcp_operacoes where of_id=$1", [of]);
    await db.query("insert into cst_horas_of(of_id,operacao_id,minutos,informado_por) values($1,$2,36,'t')", [of, pop.id]);
    const pn = await one<{ p: { oee: { desempenho: number; coberturaDesempenho: number; oeeParcial: number | null } } }>("select ind_painel(current_date,current_date) p");
    assert.equal(pn.p.oee.desempenho, 0.5); // 3 boas x 6 min = 18 padrão / 36 reais
    assert.equal(pn.p.oee.coberturaDesempenho, 100);

    // down remove tudo
    const down = (await readFile("database/migrations/2026-11-02_25_pendencias_producao_estoque_financeiro.sql", "utf8")).split("-- migrate:down")[1];
    const down26 = (await readFile("database/migrations/2026-11-03_26_sac_qualidade_oee.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down26);
    assert.equal(n((await one("select count(*) c from pg_class where relname='sac_anexos'")).c), 0);
    assert.equal((await one<{ p: { oee: { desempenho?: number } } }>("select ind_painel(current_date,current_date) p")).p.oee.desempenho, undefined);
    await db.exec(down);
    assert.equal(n((await one("select count(*) c from pg_class where relname in('erp_substitutos','est_enderecos','fin_ajustes')")).c), 0);
  } finally { await db.close(); }
});

import { tipoPorAssinatura } from "../lib/sac-anexos";
import { gerarTokenPortal, unidadeDoTokenPortal, unidadeDoToken } from "../lib/integracoes";
import { apontamentoPayload } from "../lib/ciclo-industrial";

test("anexos do SAC: o tipo vem do conteúdo, não do nome ou do Content-Type", () => {
  assert.equal(tipoPorAssinatura(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), "image/png");
  assert.equal(tipoPorAssinatura(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(tipoPorAssinatura(Buffer.from("%PDF-1.7 xxxxx")), "application/pdf");
  assert.equal(tipoPorAssinatura(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(tipoPorAssinatura(Buffer.from("MZ\x90\x00executavel")), null);
});

test("portal do fornecedor: token próprio por unidade, não aceita o token de API", () => {
  const t = gerarTokenPortal("SUL");
  assert.match(t.token, /^sbp\.SUL\.[0-9a-f]{48}$/);
  assert.equal(unidadeDoTokenPortal(t.token), "SUL");
  assert.equal(unidadeDoToken(t.token), null);
  assert.equal(unidadeDoTokenPortal("sbl.SUL." + "a".repeat(48)), null);
  assert.notEqual(gerarTokenPortal("SUL").token, t.token);
});

test("apontamento aceita substituto por componente e rejeita campos desconhecidos", () => {
  const id = "11111111-1111-4111-8111-111111111111", id2 = "22222222-2222-4222-8222-222222222222";
  assert.ok(apontamentoPayload.safeParse({ boa: 3, refugo: 0, consumos: [{ produtoId: id, substitutoId: id2 }] }).success);
  assert.ok(!apontamentoPayload.safeParse({ boa: 3, refugo: 0, consumos: [{ produtoId: id, substitutoId: "x" }] }).success);
  assert.ok(!apontamentoPayload.safeParse({ boa: 3, refugo: 0, consumos: [{ produtoId: id, outro: 1 }] }).success);
});
