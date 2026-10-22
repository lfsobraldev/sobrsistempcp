import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: manutenção, documentos controlados e qualificação (migration 23)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql", "2026-10-30_22_financeiro_contabil.sql", "2026-10-31_23_manutencao_documentos.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_|_21_|_22_|_23_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const all = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows;
    const n = (v: unknown) => Number(v);
    const { id: emp } = await one("insert into pcp_empresas(codigo,razao_social) values('T','T') returning id");
    const { id: fil } = await one("insert into pcp_filiais(empresa_id,codigo,nome) values($1,'SUL','Sul') returning id", [emp]);
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: centro } = await one("insert into pcp_capacidades_maquina(processo,maquina,turno,empresa_id,filial_id) values('CORTE','M1','A',$1,$2) returning id", [emp, fil]);
    const prod = async (c: string, t: string) => (await one("insert into est_produtos(codigo,unidade_base,classificacao) values($1,'UN',$2) returning id", [c, t])).id;
    const raw = await prod("RAW", "INSUMO"), final = await prod("FINAL", "ACABADO"), peca = await prod("ROLAMENTO", "INSUMO");
    const { id: bom } = await one("select erp_criar_estrutura($1,$2,$3,'t') id", [final, JSON.stringify([{ componente_id: raw, quantidade: 1, perda_percentual: 0 }]), crypto.randomUUID()]); await one("select erp_aprovar_estrutura($1,'t')", [bom]);
    const ops = [{ sequencia: 1, processo: "CORTE", centro_id: centro, chave: "INTERNA", setup: 10, ciclo: 1, parcial: true, entrada: true, instrucao: "x", revisaoInstrucao: "A", componentes: [{ produto_id: raw, consumo: "AUTOMATICO" }] }];
    const { id: route } = await one("select erp_ciclo_roteiro($1,$2,$3,$4,$5,'t') id", [emp, fil, final, JSON.stringify(ops), crypto.randomUUID()]); await one("select erp_ciclo_aprovar_roteiro($1,'t')", [route]);
    await one("select erp_ciclo_versao($1,$2,$3,$4,'2026-01-01',null,0,null,'t')", [emp, fil, bom, route]);
    const { id: of } = await one("select erp_mrp_gerar_of($1,$2,$3,10,'2026-12-30',$4,'t') id", [emp, fil, final, local]);
    const { id: op } = await one("select id from pcp_operacoes where of_id=$1", [of]);

    // ativo ligado ao centro; andon de máquina parada abre OM corretiva + parada; motivo comum não abre
    const { id: ativo } = await one("insert into mnt_ativos(codigo,nome,processo,centro_id,criado_por) values('M1','Serra 1','CORTE',$1,'t') returning id", [centro]);
    await db.query("insert into pcp_andon(operacao_id,processo,motivo,usuario_abertura,criado_em) values($1,'CORTE','Setup','joao',now()-interval '5 hours')", [op]);
    assert.equal(n((await one<{ n: string }>("select count(*) n from mnt_ordens")).n), 0);
    const { id: andon } = await one("insert into pcp_andon(operacao_id,processo,motivo,observacao,prioridade,usuario_abertura,criado_em) values($1,'CORTE','Máquina parada','serra travou','CRITICA','joao',now()-interval '4 hours') returning id", [op]);
    const om = await one<{ id: string; tipo: string; origem: string; prioridade: string; numero: string }>("select * from mnt_ordens");
    assert.deepEqual([om.tipo, om.origem, om.prioridade], ["CORRETIVA", "ANDON", "CRITICA"]);
    assert.equal(n((await one<{ n: string }>("select count(*) n from mnt_paradas where fim is null")).n), 1);
    // segundo andon na mesma máquina reaproveita a OM aberta
    await db.query("insert into pcp_andon(operacao_id,processo,motivo,usuario_abertura) values($1,'CORTE','Manutenção','maria')", [op]);
    assert.equal(n((await one<{ n: string }>("select count(*) n from mnt_ordens")).n), 1);
    assert.equal(n((await one<{ n: string }>("select count(*) n from mnt_paradas")).n), 2);
    // resolver o andon fecha a parada
    await db.query("update pcp_andon set status='RESOLVIDO',resolvido_em=now()-interval '1 hour' where id=$1", [andon]);
    assert.equal(n((await one<{ n: string }>("select count(*) n from mnt_paradas where andon_id=$1 and fim is not null", [andon])).n), 1);

    // execução: peça consumida do estoque, conclusão exige causa e solução
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,5)", [peca, local]);
    await db.query("insert into est_movimentos(tipo,produto_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,usuario,custo_total) values('ENTRADA',$1,$2,5,5,'UN','t',100)", [peca, local]);
    await one("select mnt_iniciar($1,'tec')", [om.id]);
    await assert.rejects(one("select mnt_iniciar($1,'tec')", [om.id]), /Somente ordem aberta/);
    await one("select mnt_consumir_peca($1,$2,$3,2,'tec')", [om.id, peca, local]);
    assert.equal(n((await one<{ f: string }>("select fisico f from est_saldos where produto_id=$1", [peca])).f), 3);
    assert.equal(n((await one<{ c: string }>("select custo_total c from est_movimentos where motivo='MANUTENCAO'")).c), 40);
    await assert.rejects(one("select mnt_consumir_peca($1,$2,$3,9,'tec')", [om.id, peca, local]), /SALDO_INSUFICIENTE/);
    await assert.rejects(one("select mnt_concluir($1,'','','tec')", [om.id]), /causa e solução/);
    await one("select mnt_concluir($1,'Rolamento gasto','Trocado rolamento do eixo','tec')", [om.id]);
    assert.equal(n((await one<{ n: string }>("select count(*) n from mnt_paradas where fim is null")).n), 0);
    await assert.rejects(one("select mnt_consumir_peca($1,$2,$3,1,'tec')", [om.id, peca, local]), /não aceita peças/);

    // indicadores: 1 falha, parada de 3h (4h atrás até 1h atrás) + 2ª parada até a conclusão
    const ind = await one<{ falhas: string; downtime_h: string; mttr_h: string; mtbf_h: string }>("select * from mnt_indicadores(now()-interval '10 hours',now()+interval '1 minute') where ativo='M1'");
    assert.equal(n(ind.falhas), 1);
    assert.ok(n(ind.downtime_h) >= 3 && n(ind.downtime_h) < 4.1);
    assert.ok(n(ind.mttr_h) >= 0);
    assert.ok(n(ind.mtbf_h) > 6.5 && n(ind.mtbf_h) < 7.5);

    // preventiva por periodicidade; não duplica; concluir reinicia o prazo
    const { id: plano } = await one("insert into mnt_planos(ativo_id,descricao,periodicidade_dias,ultima_execucao,criado_por) values($1,'Lubrificar',30,current_date-40,'t') returning id", [ativo]);
    assert.equal(n((await one<{ g: string }>("select mnt_gerar_preventivas(current_date,'sys') g")).g), 1);
    assert.equal(n((await one<{ g: string }>("select mnt_gerar_preventivas(current_date,'sys') g")).g), 0);
    const pv = await one<{ id: string }>("select id from mnt_ordens where tipo='PREVENTIVA'");
    await one("select mnt_concluir($1,'','','tec')", [pv.id]);
    assert.equal((await one<{ ok: boolean }>("select ultima_execucao=current_date ok from mnt_planos where id=$1", [plano])).ok, true);
    assert.equal(n((await one<{ g: string }>("select mnt_gerar_preventivas(current_date,'sys') g")).g), 0);

    // documentos: ciclo de revisão, segregação, imutabilidade e vínculo à operação certa
    const { id: doc } = await one("insert into doc_documentos(codigo,titulo,tipo,criado_por) values('IT-001','Instrução de corte','INSTRUCAO','ana') returning id");
    const v1 = (await one<{ d: string }>("select doc_nova_versao($1,'Passo 1: fixar a chapa',null,'Emissão inicial','ana') d", [doc])).d;
    await assert.rejects(one("select doc_nova_versao($1,'x',null,'x','ana')", [doc]), /em elaboração/);
    await one("select doc_enviar($1,'ana')", [v1]);
    await assert.rejects(db.query("update doc_versoes set conteudo='alterado' where id=$1", [v1]), /em aprovação/);
    await assert.rejects(one("select doc_aprovar($1,'ana',false)", [v1]), /não pode aprová-la/);
    await one("select doc_aprovar($1,'chefe',false)", [v1]);
    await assert.rejects(db.query("update doc_versoes set conteudo='alterado' where id=$1", [v1]), /imutável/);
    await assert.rejects(db.query("delete from doc_versoes where id=$1", [v1]), /não pode ser apagada/);
    await db.query("insert into doc_vinculos(documento_id,processo) values($1,'CORTE')", [doc]);
    assert.equal((await all("select * from doc_da_operacao($1)", [op])).length, 1);
    const { id: doc2 } = await one("insert into doc_documentos(codigo,titulo,tipo,criado_por) values('IT-002','Instrução de dobra','INSTRUCAO','ana') returning id");
    const w1 = (await one<{ d: string }>("select doc_nova_versao($1,'Dobra',null,'x','ana') d", [doc2])).d;
    await one("select doc_enviar($1,'ana')", [w1]); await one("select doc_aprovar($1,'ana',true)", [w1]); // gerente pode
    await db.query("insert into doc_vinculos(documento_id,processo) values($1,'DOBRA')", [doc2]);
    assert.deepEqual((await all<{ codigo: string }>("select codigo from doc_da_operacao($1)", [op])).map((x) => x.codigo), ["IT-001"]);
    // nova revisão: v2 aprovada torna v1 obsoleta; operação passa a mostrar só a v2
    const v2 = (await one<{ d: string }>("select doc_nova_versao($1,'Passo 1: fixar a chapa com grampo',null,'Segurança','ana') d", [doc])).d;
    assert.equal((await all("select * from doc_da_operacao($1)", [op]))[0].versao, 1); // até aprovar, continua a v1
    await one("select doc_enviar($1,'ana')", [v2]); await one("select doc_aprovar($1,'chefe',false)", [v2]);
    const mostrada = await all<{ versao: number; conteudo: string }>("select versao,conteudo from doc_da_operacao($1)", [op]);
    assert.deepEqual([mostrada.length, mostrada[0].versao], [1, 2]);
    assert.equal((await one<{ status: string }>("select status from doc_versoes where id=$1", [v1])).status, "OBSOLETA");
    // vínculo por produto
    await db.query("insert into doc_vinculos(documento_id,produto_codigo) values($1,'ZZZ')", [doc2]);
    assert.equal((await all("select * from doc_da_operacao($1)", [op])).length, 1);

    // qualificação: só vale quando ligada e exigida para o setor
    await db.query("insert into pcp_apontamentos(operacao_id,processo,tipo,quantidade,usuario) values($1,'CORTE','PRODUCAO',1,'joao')", [op]);
    await db.query("update qlf_config set ativa=true");
    await db.query("insert into pcp_apontamentos(operacao_id,processo,tipo,quantidade,usuario) values($1,'CORTE','PRODUCAO',1,'joao')", [op]); // setor ainda sem requisito
    await db.query("insert into qlf_requisitos(processo,criado_por) values('CORTE','t')");
    await assert.rejects(db.query("insert into pcp_apontamentos(operacao_id,processo,tipo,quantidade,usuario) values($1,'CORTE','PRODUCAO',1,'joao')", [op]), /QUALIFICACAO: sem qualificação/);
    await db.query("insert into qlf_qualificacoes(usuario,processo,nivel,validade,concedido_por) values('joao','CORTE','APRENDIZ',null,'chefe')");
    await assert.rejects(db.query("insert into pcp_apontamentos(operacao_id,processo,tipo,quantidade,usuario) values($1,'CORTE','PRODUCAO',1,'joao')", [op]), /aprendiz/);
    await db.query("update qlf_qualificacoes set revogado_em=now() where usuario='joao'");
    await db.query("insert into qlf_qualificacoes(usuario,processo,nivel,validade,concedido_por) values('joao','CORTE','OPERADOR',current_date-1,'chefe')");
    await assert.rejects(db.query("insert into pcp_apontamentos(operacao_id,processo,tipo,quantidade,usuario) values($1,'CORTE','PRODUCAO',1,'joao')", [op]), /vencida/);
    await db.query("update qlf_qualificacoes set revogado_em=now() where usuario='joao' and revogado_em is null");
    await db.query("insert into qlf_qualificacoes(usuario,processo,nivel,validade,concedido_por) values('joao','CORTE','OPERADOR',current_date+90,'chefe')");
    await db.query("insert into pcp_apontamentos(operacao_id,processo,tipo,quantidade,usuario) values($1,'CORTE','PRODUCAO',1,'joao')", [op]);
    await assert.rejects(db.query("insert into pcp_apontamentos(operacao_id,processo,tipo,quantidade,usuario) values($1,'CORTE','PRODUCAO',1,'maria')", [op]), /QUALIFICACAO/);

    const down = (await readFile("database/migrations/2026-10-31_23_manutencao_documentos.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('mnt_ordens') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});
