import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: cargos, matriz, alçadas, aprovações e auditoria (migrations 29 e 30)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-19_sac_industrial.sql", "2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql", "2026-10-30_22_financeiro_contabil.sql", "2026-10-31_23_manutencao_documentos.sql", "2026-11-01_24_indicadores_integracoes.sql", "2026-11-02_25_pendencias_producao_estoque_financeiro.sql", "2026-11-03_26_sac_qualidade_oee.sql", "2026-11-04_27_wms_revisoes_sobras.sql", "2026-11-05_28_rh_ehs_projetos.sql", "2026-11-06_29_cargos_identidade.sql", "2026-11-07_30_seguranca_aprovacoes_auditoria.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_|_21_|_22_|_23_|_24_|_25_|_26_|_27_|_28_|_29_|_30_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const all = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows;
    const n = (v: unknown) => Number(v);

    // cargos novos aceitos nas tabelas de identidade
    await db.query("insert into pcp_usuarios(usuario,nome,senha_hash,perfil,ativo,criado_por) values('dir','Diretor','x','DIRETOR',true,'t')");
    await db.query("insert into pcp_usuarios(usuario,nome,senha_hash,perfil,ativo,criado_por) values('sup','Supervisor','x','SUPERVISOR',true,'t')");
    await assert.rejects(db.query("insert into pcp_usuarios(usuario,nome,senha_hash,perfil,ativo,criado_por) values('x','X','x','INVENTADO',true,'t')"), /check/i);

    // hierarquia e permissões
    assert.ok(n((await one("select erp_cargo_nivel('DIRETOR') n")).n) > n((await one("select erp_cargo_nivel('GERENTE') n")).n));
    assert.equal((await one("select erp_pode('GERENTE','COMPRAS','APROVAR',40000) b")).b, true);
    assert.equal((await one("select erp_pode('GERENTE','COMPRAS','APROVAR',60000) b")).b, false); // acima do limite do gerente
    assert.equal((await one("select erp_pode('DIRETOR','COMPRAS','APROVAR',9000000) b")).b, true); // diretor sem teto
    assert.equal((await one("select erp_pode('LIDER','COMPRAS','APROVAR',1) b")).b, false); // sem linha = negado

    // aprovação em dois níveis (compra acima de 20 mil: gerente e depois diretor)
    const { id: ap } = await one("select erp_aprovacao_solicitar('COMPRAS','PEDIDO_COMPRA','PC-1','Pedido 1',60000,'chapas','compras') id");
    assert.equal(n((await one("select count(*) c from erp_aprovacao_etapas where aprovacao_id=$1", [ap])).c), 2);
    await assert.rejects(one("select erp_aprovacao_solicitar('COMPRAS','PEDIDO_COMPRA','PC-1','x',60000,'','compras')"), /unique|duplicate/i);
    await assert.rejects(one("select erp_aprovacao_decidir($1,'APROVAR','','compras','GERENTE')", [ap]), /SEPARACAO_DE_FUNCOES/);
    await assert.rejects(one("select erp_aprovacao_decidir($1,'APROVAR','','enc','ENCARREGADO')", [ap]), /exige o cargo/);
    assert.equal((await one("select erp_aprovacao_decidir($1,'APROVAR','ok','gerente1','GERENTE') s", [ap])).s, "PENDENTE");
    await assert.rejects(one("select erp_aprovacao_decidir($1,'APROVAR','','gerente1','DIRETOR')", [ap]), /você já decidiu/); // quatro olhos
    await assert.rejects(one("select erp_aprovacao_decidir($1,'APROVAR','','gerente2','GERENTE')", [ap]), /exige o cargo/);
    assert.equal((await one("select erp_aprovacao_decidir($1,'APROVAR','ok','diretor1','DIRETOR') s", [ap])).s, "APROVADO");
    await assert.rejects(one("select erp_aprovacao_decidir($1,'APROVAR','','diretor2','DIRETOR')", [ap]), /já encerrada/);

    // rejeição exige parecer; sem alçada cadastrada bloqueia
    const { id: ap2 } = await one("select erp_aprovacao_solicitar('VENDAS','DESCONTO','D1','Desc',500,'','comercial') id");
    await assert.rejects(one("select erp_aprovacao_decidir($1,'REJEITAR','','gerente1','GERENTE')", [ap2]), /parecer/);
    assert.equal((await one("select erp_aprovacao_decidir($1,'REJEITAR','muito alto','gerente1','GERENTE') s", [ap2])).s, "REJEITADO");
    await assert.rejects(one("select erp_aprovacao_solicitar('RH','FERIAS','F1','x',10,'','a')"), /SEM_REGRA/);

    // delegação: encarregado com cargo de gerente delegado decide até o limite do cargo delegado
    const { id: ap3 } = await one("select erp_aprovacao_solicitar('ESTOQUE','AJUSTE_INVENTARIO','I1','Ajuste',1000,'','almox') id");
    await assert.rejects(one("select erp_aprovacao_decidir($1,'APROVAR','','enc','ENCARREGADO')", [ap3]), /exige o cargo/);
    await db.query("insert into erp_delegacoes(de_usuario,para_usuario,cargo_delegado,inicio,fim,criado_por) values('gerente1','enc','GERENTE',current_date-1,current_date+1,'gerente1')");
    assert.equal((await one("select erp_aprovacao_decidir($1,'APROVAR','delegado','enc','ENCARREGADO') s", [ap3])).s, "APROVADO");
    // cancelamento só pelo solicitante
    const { id: ap4 } = await one("select erp_aprovacao_solicitar('WMS','REVISAO_APLICAR','R1','Rev',0,'','pcp1') id");
    await assert.rejects(one("select erp_aprovacao_cancelar($1,'outro')", [ap4]), /solicitante/);
    await one("select erp_aprovacao_cancelar($1,'pcp1')", [ap4]);
    assert.equal(n((await one("select count(*) c from erp_v_aprovacoes_pendentes")).c), 0);

    // auditoria automática e imutável
    const { id: rev } = await one("select wms_revisao_abrir('900','teste','c',current_date+2,$1::jsonb,'auditor') id", [JSON.stringify([{ acao: "ACRESCENTA", descricao: "x", qtdAntes: 0, qtdDepois: 1 }])]);
    await one("select wms_revisao_avancar($1,'REJEITADA','','nao serve','chefe')", [rev]);
    const ev = await all<{ acao: string; ator: string }>("select acao,ator from erp_auditoria where entidade='pcp_pedido_revisoes' and entidade_id=$1 order by id", [rev]);
    assert.deepEqual(ev.map((e) => e.acao), ["INSERT", "UPDATE"]);
    assert.equal(ev[0].ator, "auditor");
    await assert.rejects(db.query("delete from erp_auditoria"), /auditável/);
    await assert.rejects(db.query("update erp_auditoria set ator='x'"), /auditável/);
    assert.equal((await one("select valor from erp_config where chave='empresa.nome'")).valor, "Famossul");
  } finally { await db.close(); }
});
