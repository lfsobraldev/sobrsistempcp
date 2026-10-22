import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: custos industriais - padrão da BOM, padrão × real da OF com variações, valorização e margem (migration 20)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const num = (v: unknown) => Number(v);
    const { id: emp } = await one("insert into pcp_empresas(codigo,razao_social) values('T','T') returning id");
    const { id: fil } = await one("insert into pcp_filiais(empresa_id,codigo,nome) values($1,'SUL','Sul') returning id", [emp]);
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: centro } = await one("insert into pcp_capacidades_maquina(processo,maquina,turno,empresa_id,filial_id) values('CORTE','M1','A',$1,$2) returning id", [emp, fil]);
    const prod = async (c: string, t: string) => (await one("insert into est_produtos(codigo,unidade_base,classificacao) values($1,'UN',$2) returning id", [c, t])).id;
    const raw = await prod("RAW", "INSUMO"), semi = await prod("SEMI", "SEMIACABADO"), final = await prod("FINAL", "ACABADO");
    const version = async (p: unknown, c: unknown, mult: number) => {
      const { id: bom } = await one("select erp_criar_estrutura($1,$2,$3,'t') id", [p, JSON.stringify([{ componente_id: c, quantidade: mult, perda_percentual: 0 }]), crypto.randomUUID()]); await one("select erp_aprovar_estrutura($1,'t')", [bom]);
      const ops = [{ sequencia: 1, processo: "CORTE", centro_id: centro, chave: "INTERNA", setup: 30, ciclo: 2, parcial: true, entrada: true, instrucao: "x", revisaoInstrucao: "A", componentes: [{ produto_id: c, consumo: "AUTOMATICO" }] }];
      const { id: route } = await one("select erp_ciclo_roteiro($1,$2,$3,$4,$5,'t') id", [emp, fil, p, JSON.stringify(ops), crypto.randomUUID()]); await one("select erp_ciclo_aprovar_roteiro($1,'t')", [route]);
      await one("select erp_ciclo_versao($1,$2,$3,$4,'2026-01-01',null,0,null,'t')", [emp, fil, bom, route]);
    };
    await version(semi, raw, 3); await version(final, semi, 2);
    await db.query("insert into cst_precos_padrao(produto_id,vigencia_inicio,custo_unitario,criado_por) values($1,'2026-01-01',1,'t')", [raw]);
    await db.query("insert into cst_taxas(centro_id,custo_hora_mo,custo_hora_maq,gg_percentual,vigencia_inicio,criado_por) values($1,60,30,10,'2026-01-01','t')", [centro]);

    // padrão unitário: SEMI no lote 20 = 3 material + 3,5 min × R$ 1,65/min; FINAL lote 10 usa 2 SEMI (lote 20)
    const semiCalc = await one<{ c: { total: number; pendencias: unknown[] } }>("select cst_calc($1,'2026-11-01',0,20) c", [semi]);
    assert.equal(num(semiCalc.c.total), 8.775);
    assert.deepEqual(semiCalc.c.pendencias, []);
    const fin = await one<{ c: { material: number; total: number } }>("select cst_calc($1,'2026-11-01',0,10) c", [final]);
    assert.equal(num(fin.c.material), 17.55);
    assert.equal(num(fin.c.total), 25.8);
    // sem preço padrão: pendência explícita (não inventa custo)
    await db.query("delete from cst_precos_padrao");
    assert.deepEqual((await one<{ c: { pendencias: string[] } }>("select cst_calc($1,'2026-11-01',0,20) c", [semi])).c.pendencias, ["RAW"]);
    await db.query("insert into cst_precos_padrao(produto_id,vigencia_inicio,custo_unitario,criado_por) values($1,'2026-01-01',1,'t')", [raw]);
    // vigência: novo preço passa a valer só a partir da data
    await db.query("insert into cst_precos_padrao(produto_id,vigencia_inicio,custo_unitario,criado_por) values($1,'2026-12-01',2,'t')", [raw]);
    assert.equal(num((await one<{ t: number }>("select (cst_calc($1,'2026-11-01',0,20)->>'total')::numeric t", [semi])).t), 8.775);
    assert.equal(num((await one<{ t: number }>("select (cst_calc($1,'2026-12-05',0,20)->>'total')::numeric t", [semi])).t), 11.775);
    // padrão calculado é imutável
    const { id: pid } = await one("select cst_calcular_padrao($1,'2026-11-01',20,'t') id", [semi]);
    await assert.rejects(db.query("update cst_padrao set total=1 where id=$1", [pid]), /imutável/);

    // OF de SEMI ×20: 18 boas + 2 refugo; consumiu 60 RAW a 1,10; operação levou 80 min (padrão 66)
    const { id: ofFinal } = await one("select erp_mrp_gerar_of($1,$2,$3,10,'2026-11-30',$4,'t') id", [emp, fil, final, local]);
    const { id: of } = await one("select id from erp_ordens_fabricacao where of_pai_id=$1", [ofFinal]);
    await db.query("update erp_ordens_fabricacao set criado_em='2026-11-01' where id=$1", [of]);
    const { id: op } = await one("select id from pcp_operacoes where of_id=$1", [of]);
    await db.query("insert into pcp_apontamentos(operacao_id,tipo,quantidade,usuario,ciclo_payload,estoque_status) values($1,'CICLO',18,'t','{\"boa\":18,\"refugo\":2,\"consumirRefugo\":true}','PROCESSADO')", [op]);
    await db.query("insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,usuario,custo_total,of_id) values('SAIDA',$1,$2,60,60,'UN','t',66,$3)", [raw, local, of]);
    await db.query("insert into est_movimentos(tipo,produto_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,usuario,custo_total,of_id) values('ENTRADA',$1,$2,18,18,'UN','t',198,$3)", [semi, local, of]);
    await db.query("insert into cst_precos_padrao(produto_id,vigencia_inicio,custo_unitario,criado_por) values($1,'2025-01-01',1,'t') on conflict do nothing", [raw]);
    // sem horas informadas: tempo é estimado = padrão (sinalizado)
    const est = await one<{ a: { estimado: boolean; totais: { variacao: number } } }>("select cst_of_analise($1) a", [of]);
    assert.equal(est.a.estimado, true);
    await db.query("insert into cst_horas_of(of_id,operacao_id,minutos,informado_por) values($1,$2,80,'t')", [of, op]);
    const a = (await one<{ a: any }>("select cst_of_registrar($1,'t') a", [of])).a;
    assert.equal(a.estimado, false);
    assert.equal(a.boas, 18);
    assert.equal(a.refugo, 2);
    assert.deepEqual([a.totais.padrao, a.totais.real, a.totais.variacao], [162.9, 198, 35.1]);
    assert.deepEqual(a.totais.causas, { PRECO: 6, REFUGO: 6, PERDA_OUTROS: 0, EFICIENCIA: 23.1 });
    const soma = Object.values(a.totais.causas as Record<string, number>).reduce((s, v) => s + v, 0);
    assert.equal(Math.round(soma * 100) / 100, a.totais.variacao);
    assert.equal(num((await one<{ n: string }>("select count(*) n from cst_of_resultados")).n), 1);

    // valorização: físico 18 de SEMI com custo real 198 => 11/un; RAW consumiu tudo (físico 0 não valoriza)
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,18)", [semi, local]);
    const val = await one<{ valor: string; custo_medio: string; sem_custo: boolean }>("select valor,custo_medio,sem_custo from cst_v_valorizacao where codigo='SEMI'");
    assert.deepEqual([num(val.valor), num(val.custo_medio), val.sem_custo], [198, 11, false]);

    // margem do pedido: receita 900, custo 360, comissão 45
    const { id: cli } = await one("insert into crm_clientes(razao_social,criado_por,atualizado_por) values('ACME','t','t') returning id");
    const { id: rep } = await one("insert into crm_representantes(nome,criado_por,atualizado_por) values('Rep','t','t') returning id");
    const { id: pv } = await one("insert into crm_pedidos_venda(cliente_id,representante_id,status,total,faturado_valor,devolvido_valor,criado_por,atualizado_por) values($1,$2,'ATENDIDO',1000,1000,100,'t','t') returning id", [cli, rep]);
    const { id: rem } = await one("insert into exp_remessas(pedido_venda_id,cliente_id,local_id,status,criado_por) values($1,$2,$3,'ENTREGUE','t') returning id", [pv, cli, local]);
    const m1 = (await one("insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,usuario,custo_total) values('SAIDA',$1,$2,10,10,'UN','t',400) returning id", [final, local])).id;
    const m2 = (await one("insert into est_movimentos(tipo,produto_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,usuario,custo_total) values('ENTRADA',$1,$2,1,1,'UN','t',40) returning id", [final, local])).id;
    await db.query("insert into exp_remessa_itens(remessa_id,linha,pedido_linha,produto_id,quantidade,movimento_id) values($1,1,1,$2,10,$3)", [rem, final, m1]);
    await db.query("insert into exp_devolucoes(remessa_id,pedido_venda_id,produto_id,quantidade,destino,valor,valor_aplicado,motivo,local_id,movimento_id,criado_por) values($1,$2,$3,1,'ESTOQUE',100,100,'defeito',$4,$5,'t')", [rem, pv, final, local, m2]);
    const { id: prov } = await one("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,competencia,criado_por) values($1,$2,'PROVISAO','FATURADO',1000,50,'2026-10','t') returning id", [pv, rep]);
    await db.query("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,criado_por) values($1,$2,'LIBERACAO','FATURADO',1000,50,'A_PAGAR','2026-10',$3,'t')", [pv, rep, prov]);
    await db.query("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,criado_por) values($1,$2,'ESTORNO','FATURADO',100,-5,'A_PAGAR','2026-10',$3,'t')", [pv, rep, prov]);
    const mg = await one<{ receita: string; custo: string; comissao: string }>("select receita,custo,comissao from cst_v_margem_pedidos where pedido_id=$1", [pv]);
    assert.deepEqual([num(mg.receita), num(mg.custo), num(mg.comissao)], [900, 360, 45]);

    const down = (await readFile("database/migrations/2026-10-28_20_custos_industriais.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('cst_padrao') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});
