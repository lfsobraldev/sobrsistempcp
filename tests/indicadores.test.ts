import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: indicadores, alertas proativos, tokens e webhooks (migration 24)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql", "2026-10-30_22_financeiro_contabil.sql", "2026-10-31_23_manutencao_documentos.sql", "2026-11-01_24_indicadores_integracoes.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_|_21_|_22_|_23_|_24_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const n = (v: unknown) => Number(v);

    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: prod } = await one("insert into est_produtos(codigo,unidade_base,classificacao,estoque_minimo) values('PAL','UN','ACABADO',50) returning id");
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,20)", [prod, local]);
    await db.query("insert into qld_instrumentos(codigo,calibracao_validade,criado_por) values('PAQ-1',current_date-3,'t'),('PAQ-2',current_date+10,'t'),('PAQ-3',current_date+90,'t')");
    const { id: cli } = await one("insert into crm_clientes(razao_social,criado_por,atualizado_por) values('ACME','t','t') returning id");
    const { id: pvCred } = await one("insert into crm_pedidos_venda(cliente_id,status,total,bloqueio_credito,credito_excedente,criado_por,atualizado_por) values($1,'EM_APROVACAO',500,true,200,'t','t') returning id", [cli]);
    // OF atrasada (FKs desligadas só para montar o cenário)
    await db.exec("set session_replication_role = replica");
    await db.query("insert into erp_ordens_fabricacao(origem_produto_id,produto_estoque_id,estrutura_id,quantidade,pedido,status,criado_por,prazo) values(gen_random_uuid(),$1,gen_random_uuid(),5,'0900','LIBERADA','t',current_date-10)", [prod]);
    await db.exec("set session_replication_role = origin");

    // webhook assinado para alertas e pedidos
    const { id: wh } = await one("insert into sys_webhooks(nome,url,segredo,eventos,criado_por) values('ERP externo','https://exemplo.com/h','seg',array['alerta.criado','pedido.status','remessa.entregue'],'t') returning id");
    await assert.rejects(db.query("insert into sys_webhooks(nome,url,segredo,eventos,criado_por) values('x','http://inseguro','s',array['alerta.criado'],'t')"), /check/i);
    await assert.rejects(db.query("insert into sys_webhooks(nome,url,segredo,eventos,criado_por) values('x','https://a.b','s',array['qualquer'],'t')"), /check/i);

    // alertas: OF, ruptura, 2 calibrações, crédito = 5; idempotente
    assert.equal(n((await one<{ g: string }>("select sys_gerar_alertas(current_date) g")).g), 5);
    assert.equal(n((await one<{ g: string }>("select sys_gerar_alertas(current_date) g")).g), 0);
    const tipos = (await db.query<{ tipo: string; c: string }>("select tipo,count(*) c from sys_alertas where resolvido_em is null group by 1 order by 1")).rows.map((r) => `${r.tipo}:${r.c}`);
    assert.deepEqual(tipos, ["CALIBRACAO:2", "CREDITO:1", "OF_ATRASADA:1", "RUPTURA:1"]);
    assert.equal((await one<{ severidade: string }>("select severidade from sys_alertas where tipo='OF_ATRASADA'")).severidade, "ALTA");
    assert.equal(n((await one<{ c: string }>("select count(*) c from sys_webhook_fila where evento='alerta.criado' and webhook_id=$1", [wh])).c), 5);

    // resolver a causa resolve o alerta
    await db.query("update est_saldos set fisico=80 where produto_id=$1", [prod]);
    await db.query("update crm_pedidos_venda set bloqueio_credito=false where id=$1", [pvCred]);
    await one("select sys_gerar_alertas(current_date)");
    assert.equal(n((await one<{ c: string }>("select count(*) c from sys_alertas where resolvido_em is null and tipo in ('RUPTURA','CREDITO')")).c), 0);

    // evento de pedido por mudança de status
    await db.query("update crm_pedidos_venda set status='APROVADO' where id=$1", [pvCred]);
    const ev = await one<{ payload: { de: string; para: string } }>("select payload from sys_webhook_fila where evento='pedido.status'");
    assert.deepEqual([ev.payload.de, ev.payload.para], ["EM_APROVACAO", "APROVADO"]);
    // webhook inativo não recebe
    await db.query("update sys_webhooks set ativo=false where id=$1", [wh]);
    assert.equal(n((await one<{ e: string }>("select sys_emitir_evento('alerta.criado','{}'::jsonb) e")).e), 0);

    // painel: carteira, OTIF e PPM
    const { id: pv } = await one("insert into crm_pedidos_venda(cliente_id,status,total,faturado_valor,data_entrega,criado_por,atualizado_por) values($1,'ATENDIDO',1000,0,current_date,'t','t') returning id", [cli]);
    await db.query("insert into crm_pedido_venda_itens(pedido_id,linha,item_codigo,descricao,quantidade,preco_unitario,total) values($1,1,'PAL','Pallet',10,100,1000)", [pv]);
    const { id: rem } = await one("insert into exp_remessas(pedido_venda_id,cliente_id,local_id,status,entregue_em,criado_por) values($1,$2,$3,'ENTREGUE',now(),'t') returning id", [pv, cli, local]);
    await db.query("insert into exp_remessa_itens(remessa_id,linha,pedido_linha,produto_id,quantidade) values($1,1,1,$2,10)", [rem, prod]);
    const { id: pv2 } = await one("insert into crm_pedidos_venda(cliente_id,status,total,data_entrega,criado_por,atualizado_por) values($1,'APROVADO',300,current_date-1,'t','t') returning id", [cli]);
    await db.query("insert into crm_pedido_venda_itens(pedido_id,linha,item_codigo,descricao,quantidade,preco_unitario,total) values($1,1,'PAL','Pallet',3,100,300)", [pv2]);
    const p = (await one<{ ind_painel: Record<string, any> }>("select ind_painel(current_date-30,current_date)")).ind_painel;
    assert.deepEqual([p.otif.pedidos, p.otif.otif, p.otif.percentual], [2, 1, 50]);
    assert.equal(p.carteira.pedidosAbertos, 2);
    assert.equal(p.carteira.atrasados, 1);
    assert.equal(p.carteira.saldoAtrasado, 300);
    assert.equal(p.leadTime.ofsConcluidas, 0);
    assert.equal(typeof p.oee.observacao, "string");
    await assert.rejects(one("select ind_painel(current_date,current_date-1)"), /Período inválido/);

    // down
    const down = (await readFile("database/migrations/2026-11-01_24_indicadores_integracoes.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal((await one<{ n: string }>("select count(*) n from pg_proc where proname='ind_painel'")).n, 0);
  } finally { await db.close(); }
});
