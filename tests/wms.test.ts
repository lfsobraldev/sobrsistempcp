import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: WMS, pallets, revisões, sobras, RH, EHS e projetos (migrations 27 e 28)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-19_sac_industrial.sql", "2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql", "2026-10-30_22_financeiro_contabil.sql", "2026-10-31_23_manutencao_documentos.sql", "2026-11-01_24_indicadores_integracoes.sql", "2026-11-02_25_pendencias_producao_estoque_financeiro.sql", "2026-11-03_26_sac_qualidade_oee.sql", "2026-11-04_27_wms_revisoes_sobras.sql", "2026-11-05_28_rh_ehs_projetos.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_|_21_|_22_|_23_|_24_|_25_|_26_|_27_|_28_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const all = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows;
    const n = (v: unknown) => Number(v);
    const setor = async (t: string) => (await one("select id from wms_setores where tipo=$1 limit 1", [t])).id as string;

    // setores e endereços
    assert.equal(n((await one("select count(*) c from wms_setores")).c), 8);
    const { id: dep } = await one("insert into est_locais(codigo) values('GERAL') returning id");
    const mk = async (cod: string, tipo: string, pos = "PALLET", cap: number | null = null) =>
      (await one("insert into est_enderecos(local_id,codigo,criado_por,setor_id,tipo_posicao,capacidade_pallets,rua) values($1,$2,'t',$3,$4,$5,'A') returning id", [dep, cod, await setor(tipo), pos, cap])).id as string;
    const eProd = await mk("P-01", "PRODUCAO"), eEmb = await mk("E-01", "EMBALAGEM"), eQuar = await mk("Q-01", "QUARENTENA"), eSob = await mk("S-01", "SOBRAS", "PRATELEIRA");
    const pallet = async (cod: string, pedido: string, st = "LIBERADO") =>
      (await one("insert into pcp_pallets(codigo,pedido,pallet,status) values($1,$2,$1,$3) returning id", [cod, pedido, st])).id as string;
    const p1 = await pallet("PAL-1", "1000"), p2 = await pallet("PAL-2", "1000"), pb = await pallet("PAL-B", "2000", "BLOQUEADO");

    // localização de pallet: capacidade 1 por padrão em posição PALLET
    await one("select wms_pallet_alocar($1,$2,'t','')", [p1, eProd]);
    await assert.rejects(one("select wms_pallet_alocar($1,$2,'t','')", [p2, eProd]), /Endereço cheio/);
    await assert.rejects(one("select wms_pallet_alocar($1,$2,'t','')", [p1, eProd]), /já está neste endereço/);
    await assert.rejects(one("select wms_pallet_alocar($1,$2,'t','')", [pb, eProd]), /PALLET_BLOQUEADO/);
    await one("select wms_pallet_alocar($1,$2,'t','')", [pb, eQuar]);
    assert.equal(n((await one("select count(*) c from wms_pallet_movs")).c), 2);
    assert.equal((await one("select wms_sugerir_endereco('EMBALAGEM') id")).id, eEmb);
    assert.equal((await one("select wms_sugerir_endereco('PRODUCAO') id")).id, null); // único endereço de produção está cheio
    await db.query("update est_enderecos set bloqueado=true,motivo_bloqueio='piso' where id=$1", [eEmb]);
    await assert.rejects(one("select wms_pallet_alocar($1,$2,'t','')", [p2, eEmb]), /Endereço bloqueado/);
    await db.query("update est_enderecos set bloqueado=false where id=$1", [eEmb]);

    // revisão: soma e subtrai, com destino obrigatório
    const itens = JSON.stringify([
      { acao: "SUBTRAI", descricao: "Porta 80x210", medida: "80x210", material: "MDF STD", acabamento: "BRANCO", mao: "D", qtdAntes: 10, qtdDepois: 6 },
      { acao: "ACRESCENTA", descricao: "Batente 15cm", medida: "15", material: "MDF STD", acabamento: "BRANCO", qtdAntes: 0, qtdDepois: 4 },
    ]);
    await assert.rejects(one("select wms_revisao_abrir('1000','m','c','2026-12-01','[]'::jsonb,'t')"), /ao menos uma linha/);
    await assert.rejects(one("select wms_revisao_abrir('1000','m','c','2026-12-01',$1::jsonb,'t')", [JSON.stringify([{ acao: "SUBTRAI", descricao: "x", qtdAntes: 1, qtdDepois: 3 }])]), /subtrair exige/);
    const { id: rev } = await one("select wms_revisao_abrir('1000','Cliente reduziu','Comercial',current_date-3,$1::jsonb,'t') id", [itens]);
    await assert.rejects(one("select wms_revisao_abrir('1000','de novo','c','2026-12-01',$1::jsonb,'t')", [itens]), /REVISAO_ABERTA|revisão aberta/);
    assert.equal((await one("select wms_pedido_em_revisao('1000') b")).b, true);
    // pedido em revisão não embala, não expede e não separa
    await assert.rejects(one("select wms_pallet_alocar($1,$2,'t','')", [p1, eEmb]), /REVISAO_ABERTA/);
    await assert.rejects(one("select wms_picking_criar('1000',null,'t')"), /REVISAO_ABERTA/);
    const par = await one<{ vencida: boolean; destinos_pendentes: string }>("select vencida,destinos_pendentes from wms_v_revisoes_paradas where id=$1", [rev]);
    assert.equal(par.vencida, true);
    assert.equal(n(par.destinos_pendentes), 1);
    // não aplica sem análise nem com destino pendente
    await assert.rejects(one("select wms_revisao_aplicar($1,'t')", [rev]), /em análise/);
    await one("select wms_revisao_avancar($1,'EM_ANALISE','PCP','','t')", [rev]);
    await assert.rejects(one("select wms_revisao_aplicar($1,'t')", [rev]), /DESTINO_PENDENTE/);
    await assert.rejects(one("select wms_revisao_destino($1,2,'SOBRA',$2,'t')", [rev, eSob]), /não subtrai/);
    await assert.rejects(one("select wms_revisao_destino($1,1,'SOBRA',$2,'t')", [rev, eProd]), /zona de SOBRAS/);
    await one("select wms_revisao_destino($1,1,'SOBRA',$2,'t')", [rev, eSob]);
    await db.query("insert into wms_etiquetas(tipo,referencia,pedido,revisao,impressa_por) values('PECA','X','1000',0,'t')");
    const ap = await one<{ r: { sobras: number; revisao: number } }>("select wms_revisao_aplicar($1,'t') r", [rev]);
    assert.deepEqual([ap.r.sobras, ap.r.revisao], [1, 1]);
    const sobra = await one<{ quantidade: string; status: string; origem_revisao: number }>("select quantidade,status,origem_revisao from wms_sobras");
    assert.deepEqual([n(sobra.quantidade), sobra.status, sobra.origem_revisao], [4, "DISPONIVEL", 1]); // 10 - 6 = 4 viram sobra
    assert.equal((await one("select valida from wms_etiquetas where referencia='X'")).valida, false); // etiqueta da revisão antiga invalidada
    assert.equal((await one("select wms_pedido_em_revisao('1000') b")).b, false);
    await one("select wms_pallet_alocar($1,$2,'t','')", [p1, eEmb]); // agora pode embalar

    // sobra: reservar para outro pedido e baixar
    const sid = (await one("select id from wms_sobras")).id as string;
    await one("select wms_sobra_reservar($1,'3000','t')", [sid]);
    await assert.rejects(one("select wms_sobra_reservar($1,'4000','t')", [sid]), /indisponível/);
    await one("select wms_sobra_baixar($1,'CONSUMIDA','t')", [sid]);
    await assert.rejects(one("select wms_sobra_baixar($1,'CONSUMIDA','t')", [sid]), /não está em aberto/);

    // revisão rejeitada exige parecer; refugo gera registro
    const { id: rev2 } = await one("select wms_revisao_abrir('1000','Outra','c',current_date+5,$1::jsonb,'t') id", [JSON.stringify([{ acao: "SUBTRAI", descricao: "Porta 70", qtdAntes: 2, qtdDepois: 0 }])]);
    await assert.rejects(one("select wms_revisao_avancar($1,'REJEITADA','','','t')", [rev2]), /parecer/);
    await one("select wms_revisao_avancar($1,'AGUARDANDO_FABRICA','','','t')", [rev2]);
    await one("select wms_revisao_destino($1,1,'REFUGO',null,'t')", [rev2]);
    await one("select wms_revisao_aplicar($1,'t')", [rev2]);
    assert.equal(n((await one("select count(*) c from wms_sobras where status='REFUGO'")).c), 1);

    // picking: lista na ordem das posições e conferência por leitura
    await one("select wms_pallet_alocar($1,$2,'t','')", [p2, eProd]);
    const { id: lista } = await one("select wms_picking_criar('1000',null,'t') id");
    const ord = await all<{ codigo: string }>("select p.codigo from wms_picking_itens i join pcp_pallets p on p.id=i.pallet_id where lista_id=$1 order by ordem", [lista]);
    assert.equal(ord.length, 2);
    await assert.rejects(one("select wms_picking_conferir($1,'PAL-B','t')", [lista]), /FORA_DA_LISTA/);
    assert.equal((await one<{ r: { concluida: boolean } }>("select wms_picking_conferir($1,'pal-1','t') r", [lista])).r.concluida, false);
    assert.equal((await one<{ r: { concluida: boolean } }>("select wms_picking_conferir($1,'PAL-2','t') r", [lista])).r.concluida, true);
    await assert.rejects(one("select wms_picking_criar('1000',null,'t')"), /Nenhum pallet/);

    // recebimento
    const { id: pr } = await one("insert into est_produtos(codigo,unidade_base,classificacao) values('INS','UN','INSUMO') returning id");
    const { id: rec } = await one("insert into wms_recebimentos(documento,fornecedor,criado_por) values('NF1','F','t') returning id");
    await db.query("insert into wms_recebimento_itens(recebimento_id,linha,produto_id,qtd_esperada) values($1,1,$2,10)", [rec, pr]);
    await assert.rejects(one("select wms_recebimento_fechar($1,'t')", [rec]), /sem contagem/);
    await db.query("update wms_recebimento_itens set qtd_conferida=8 where recebimento_id=$1", [rec]);
    assert.equal((await one("select wms_recebimento_fechar($1,'t') s", [rec])).s, "DIVERGENTE");

    const ind = await one<{ i: Record<string, number> }>("select wms_indicadores() i");
    assert.equal(ind.i.revisoesAbertas, 0);
    assert.equal(ind.i.recebimentosDivergentes, 1);

    // RH: folha simplificada com falta e hora extra
    const { id: cargo } = await one("insert into rh_cargos(codigo,nome,nivel,criado_por) values('OP','Operador',1,'t') returning id");
    const { id: col } = await one("insert into rh_colaboradores(matricula,nome,cargo_id,admissao,salario_base,criado_por) values('1','Ana',$1,'2025-01-01',3000,'t') returning id", [cargo]);
    await db.query("insert into rh_ausencias(colaborador_id,tipo,inicio,fim,criado_por) values($1,'FALTA','2026-10-05','2026-10-06','t')", [col]);
    await db.query("insert into rh_ponto(colaborador_id,data,horas,criado_por) values($1,'2026-10-07',10,'t')", [col]);
    assert.equal(n((await one("select rh_folha_gerar('2026-10','t') n")).n), 1);
    const fo = await one<{ desconto_faltas: string; horas_extras: string; liquido: string }>("select desconto_faltas,horas_extras,liquido from rh_folha where competencia='2026-10'");
    assert.equal(n(fo.desconto_faltas), 200); // 3000/30 x 2 dias
    assert.equal(n(fo.horas_extras), 40.91); // 2h x (3000/220) x 1,5
    assert.equal(n(fo.liquido), 2840.91);
    await one("select rh_folha_fechar('2026-10','t')");
    await assert.rejects(one("select rh_folha_gerar('2026-10','t')"), /já fechada/);

    // EHS: treinamento vence e aparece nos vencimentos
    const { id: tr } = await one("insert into ehs_treinamentos(nome,validade_meses) values('NR-12',12) returning id");
    await one("select ehs_registrar_treinamento($1,$2,current_date-400,'t')", [col, tr]);
    const venc = await all<{ tipo: string; dias: string }>("select tipo,dias from ehs_v_vencimentos");
    assert.equal(venc.length, 1);
    assert.ok(n(venc[0].dias) < 0);
    await db.query("insert into ehs_ocorrencias(tipo,data,descricao,criado_por) values('ACIDENTE',current_date-10,'corte','t')");
    const eh = await one<{ i: Record<string, number> }>("select ehs_indicadores() i");
    assert.equal(eh.i.diasSemAcidente, 10);
    assert.equal(eh.i.vencidos, 1);

    // Projetos
    const { id: proj } = await one("insert into ps_projetos(codigo,nome,inicio,fim_previsto,orcamento,status,criado_por) values('P1','Expansão','2026-01-01','2026-02-01',1000,'EM_ANDAMENTO','t') returning id");
    await db.query("insert into ps_tarefas(projeto_id,wbs,nome,inicio,fim,percentual,criado_por) values($1,'1','a','2026-01-01','2026-01-10',100,'t'),($1,'2','b','2026-01-11','2026-01-20',40,'t')", [proj]);
    await db.query("insert into ps_custos(projeto_id,data,descricao,valor,criado_por) values($1,'2026-01-05','Material',250,'t')", [proj]);
    const rs = await one<{ pct_orcamento: string; pct_fisico: string; tarefas_atrasadas: string; atrasado: boolean }>("select * from ps_resumo()");
    assert.deepEqual([n(rs.pct_orcamento), n(rs.pct_fisico), n(rs.tarefas_atrasadas), rs.atrasado], [25, 70, 1, true]);
  } finally { await db.close(); }
});
