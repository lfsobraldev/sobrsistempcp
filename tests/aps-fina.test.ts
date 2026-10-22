import { test } from "node:test";
import assert from "node:assert/strict";
import { addDias, capacidadeDoMes, diaSemana, programar, proximosMeses, simularUrgente, sop, type CentroCap, type OfEntrada } from "../lib/aps-fina";

const C: CentroCap[] = [{ id: "A", nome: "Corte", minutosDia: 480, dias: [1, 2, 3, 4, 5] }, { id: "B", nome: "Montagem", minutosDia: 480, dias: [1, 2, 3, 4, 5] }];
const HOJE = "2026-10-26"; // segunda
const of = (id: string, n: number, prazo: string, mins: [number, number], extra: Partial<OfEntrada> = {}): OfEntrada => ({ id, numero: n, produto: "P" + n, prazo, operacoes: [{ sequencia: 1, processo: "CORTE", centroId: "A", minutos: mins[0] }, { sequencia: 2, processo: "MONT", centroId: "B", minutos: mins[1] }], ...extra });

test("calendário", () => {
  assert.equal(diaSemana("2026-10-26"), 1);
  assert.equal(diaSemana("2026-11-01"), 7);
  assert.equal(addDias("2026-10-31", 1), "2026-11-01");
});

test("capacidade finita: divide em dias úteis e pula fim de semana", () => {
  const r = programar([of("1", 1, "2026-11-30", [600, 240])], C, HOJE);
  const o = r.ofs[0];
  assert.deepEqual(o.operacoes[0].segmentos, [{ dia: "2026-10-26", minutos: 480 }, { dia: "2026-10-27", minutos: 120 }]);
  assert.equal(o.operacoes[1].inicio, "2026-10-28");
  assert.equal(o.fim, "2026-10-28");
  assert.equal(o.atrasada, false);
  // sexta -> segunda
  const s = programar([of("2", 2, "2026-11-30", [960, 10])], C, "2026-10-30");
  assert.deepEqual(s.ofs[0].operacoes[0].segmentos.map((x) => x.dia), ["2026-10-30", "2026-11-02"]);
});

test("duas OFs disputam o mesmo centro e a de prazo menor passa na frente", () => {
  const r = programar([of("a", 1, "2026-12-01", [480, 0]), of("b", 2, "2026-10-26", [480, 0])], C, HOJE);
  const a = r.ofs.find((x) => x.id === "a")!, b = r.ofs.find((x) => x.id === "b")!;
  assert.equal(b.inicio, "2026-10-26");
  assert.equal(a.inicio, "2026-10-27");
  assert.equal(r.ocupacao["A"]["2026-10-26"], 480);
});

test("mover (início fixo) recalcula e avisa atraso", () => {
  const base = programar([of("1", 1, "2026-10-28", [480, 480])], C, HOJE);
  assert.equal(base.ofs[0].atrasada, false);
  assert.equal(base.ofs[0].fim, "2026-10-27");
  const movida = programar([of("1", 1, "2026-10-28", [480, 480], { inicioFixo: "2026-10-28" })], C, HOJE);
  assert.equal(movida.ofs[0].fixa, true);
  assert.equal(movida.ofs[0].fim, "2026-10-29");
  assert.equal(movida.ofs[0].atrasoDias, 1);
  assert.deepEqual(movida.atrasadas, ["1"]);
});

test("sem centro/capacidade é sinalizado, não inventa data", () => {
  const r = programar([{ id: "x", numero: 9, produto: "X", prazo: "2026-11-01", operacoes: [{ sequencia: 1, processo: "P", centroId: null, minutos: 60 }] }], C, HOJE);
  assert.equal(r.ofs[0].semCapacidade, true);
  assert.equal(r.ofs[0].fim, null);
  assert.deepEqual(r.semCapacidade, ["x"]);
});

test("simulação de pedido urgente mostra impacto nas demais OFs", () => {
  const base = [of("1", 1, "2026-10-27", [480, 480])];
  const sim = simularUrgente(base, of("U", 99, "2026-10-26", [480, 0], { inicioFixo: "2026-10-26" }), C, HOJE);
  assert.equal(sim.atendePrazo, true);
  assert.deepEqual(sim.impactadas.map((x) => x.id), ["1"]);
  assert.equal(sim.impactadas[0].atrasoDepois > sim.impactadas[0].atrasoAntes, true);
});

test("S&OP: demanda × capacidade por mês", () => {
  assert.equal(capacidadeDoMes("2026-11", C), 2 * 480 * 21); // 21 dias úteis em nov/2026
  const m = sop({ "2026-11": 21 * 480 * 2 * 0.9, "2026-12": 99999999 }, C, proximosMeses("2026-11-15", 2));
  assert.deepEqual(m.map((x) => x.mes), ["2026-11", "2026-12"]);
  assert.equal(m[0].situacao, "ATENCAO");
  assert.equal(m[1].situacao, "ESTOURO");
  assert.equal(sop({}, C, ["2026-11"])[0].situacao, "OK");
});

import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: MRP líquido, geração de OF pela sugestão e carga por operação (migration 18)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    for (const f of ["2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql"]) {
      const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_/.test(f)) await db.exec(s);
    }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
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

    // OF mrp de FINAL x10 => precisa 20 SEMI (OF filha) => precisa 60 RAW
    const { id: ofFinal } = await one("select erp_mrp_gerar_of($1,$2,$3,10,'2026-11-30',$4,'t') id", [emp, fil, final, local]);
    const filha = await one<{ quantidade: string }>("select quantidade from erp_ordens_fabricacao where of_pai_id=$1", [ofFinal]);
    assert.equal(Number(filha.quantidade), 20);
    assert.equal((await one<{ origem: string }>("select origem from pcp_programacoes where origem='MRP'")).origem, "MRP");

    const mrp = (await db.query<{ codigo: string; acao: string; necessidade_liquida: string; em_producao: string }>("select * from erp_mrp_liquido()")).rows;
    const por = Object.fromEntries(mrp.map((m) => [m.codigo, m]));
    assert.equal(por["RAW"].acao, "COMPRAR");
    assert.equal(Number(por["RAW"].necessidade_liquida), 60);
    // SEMI já tem OF filha de 20 => coberto
    assert.equal(por["SEMI"].acao, "OK");
    assert.equal(Number(por["SEMI"].em_producao), 20);
    // saldo + compra aberta reduzem a necessidade de RAW
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,20)", [raw, local]);
    const { id: forn } = await one("insert into cmp_fornecedores(razao_social,criado_por) values('F','t') returning id");
    const { id: pc } = await one("insert into cmp_pedidos(fornecedor_id,status,total,criado_por) values($1,'APROVADO',10,'t') returning id", [forn]);
    await db.query("insert into cmp_pedido_itens(pedido_id,linha,produto_id,quantidade,preco_unitario) values($1,1,$2,15,1)", [pc, raw]);
    const raw2 = (await db.query<{ codigo: string; necessidade_liquida: string }>("select * from erp_mrp_liquido()")).rows.find((m) => m.codigo === "RAW")!;
    assert.equal(Number(raw2.necessidade_liquida), 25);

    // carga por operação: 10 peças × 2 min + 30 setup = 50 min na OF de FINAL
    const ops = (await db.query<{ produto: string; minutos: string; centro_id: string }>("select * from erp_v_ops_abertas where of_id=$1", [ofFinal])).rows;
    assert.deepEqual([ops.length, ops[0].produto, Number(ops[0].minutos), ops[0].centro_id], [1, "FINAL", 50, centro]);

    // agenda fixa
    await db.query("insert into erp_of_agenda(of_id,inicio_fixo,atualizado_por) values($1,'2026-11-10','t')", [ofFinal]);
    assert.equal(String((await one<{ inicio_fixo: unknown }>("select inicio_fixo::text from erp_of_agenda")).inicio_fixo), "2026-11-10");

    const down = (await readFile("database/migrations/2026-10-26_18_mrp_aps.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('erp_of_agenda') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});
