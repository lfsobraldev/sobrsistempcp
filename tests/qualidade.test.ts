import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { capacidade, cartaIndividuos, regrasAlerta } from "../lib/cep";
import { gerarCertificadoPdf } from "../lib/certificado-qualidade";

test("CEP: Cp/Cpk, carta I-MR e regras de alerta", () => {
  const v = [10.0, 10.1, 9.9, 10.05, 9.95, 10.02, 9.98, 10.0];
  const c = capacidade(v, 9.5, 10.5);
  assert.equal(c.n, 8);
  assert.ok(c.cp! > 1.5 && c.cpk! > 1.5 && c.cpk! <= c.cp!);
  assert.throws(() => capacidade([1], 0, 2), /ao menos 2/);
  assert.throws(() => capacidade([1, 2], 2, 1), /Limite superior/);
  const deslocado = capacidade(v.map((x) => x + 0.3), 9.5, 10.5);
  assert.ok(deslocado.cpk! < deslocado.cp!);
  const carta = cartaIndividuos(v);
  assert.ok(carta.lsc > carta.lc && carta.lic < carta.lc);
  assert.equal(regrasAlerta([0, 0, 4, 0], 0, 1).some((a) => a.regra === 1 && a.indice === 2), true);
  assert.equal(regrasAlerta([0, 2.5, 2.6, 0], 0, 1).some((a) => a.regra === 2), true);
  assert.equal(regrasAlerta([1, 1, 1, 1, 1, 1, 1, 1], 0, 1).some((a) => a.regra === 4), true);
  assert.deepEqual(regrasAlerta([0, 0.1, -0.1], 0, 1), []);
});

test("certificado PDF só para lote aprovado", async () => {
  const base = { numero: 7, produto: "P1", descricao: "Pallet", tipo: "FINAL", referencia: "OF-1", loteEstoque: "L1", quantidade: 10, amostra: 3, status: "APROVADO", decisaoPor: "qa", decisaoEm: "22/10/2026", motivo: "",
    caracteristicas: [{ nome: "Comprimento", unidade: "mm", tolMin: 1195, tolMax: 1205, medicoes: 3, minimo: 1198, maximo: 1202, conformes: 3 }] };
  const pdf = await gerarCertificadoPdf(base);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-");
  await assert.rejects(gerarCertificadoPdf({ ...base, status: "QUARENTENA" }), /aprovado/);
});

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: tolerância bloqueia lote, instrumento vencido não mede, decisão de uso, NC/CAPA e PPM (migration 17)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    for (const f of ["2026-10-21_06_engenharia_of.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql"]) {
      const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_/.test(f)) await db.exec(s);
    }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: prod } = await one("insert into est_produtos(codigo,unidade_base,classificacao) values('PAL','UN','ACABADO') returning id");
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,50)", [prod, local]);
    const { id: pj } = await one("insert into qld_instrumentos(codigo,tipo,calibracao_validade,criado_por) values('PAQ-1','paquimetro',current_date + 30,'t') returning id");
    const { id: venc } = await one("insert into qld_instrumentos(codigo,tipo,calibracao_validade,criado_por) values('PAQ-OLD','paquimetro',current_date - 1,'t') returning id");
    const { id: plano } = await one("insert into qld_planos(produto_id,tipo,amostragem,amostragem_valor,criado_por) values($1,'FINAL','PERCENTUAL',10,'t') returning id", [prod]);
    await db.query("insert into qld_plano_caracteristicas(plano_id,linha,nome,unidade,nominal,tol_min,tol_max,tipo_instrumento) values($1,1,'Comprimento','mm',1200,1195,1205,'paquimetro')", [plano]);

    // 50 peças, 10% => amostra 5
    const { id: lote } = await one("select qld_abrir_lote($1,50,'OF','OF-1',null,$2,'t') id", [plano, local]);
    assert.equal(Number((await one<{ amostra: number }>("select amostra from qld_lotes_inspecao where id=$1", [lote])).amostra), 5);
    await assert.rejects(one("select qld_medir($1,1,1200,$2,'t')", [lote, venc]), /calibração vencida/);
    for (const v of [1199, 1201, 1200, 1203]) assert.equal((await one<{ qld_medir: boolean }>("select qld_medir($1,1,$2,$3,'t')", [lote, v, pj])).qld_medir, true);
    // aprovar antes de completar amostra falha
    await assert.rejects(one("select qld_decidir($1,'APROVAR','','qa')", [lote]), /Faltam medições/);
    // medição fora da tolerância => quarentena + bloqueio de saldo
    assert.equal((await one<{ qld_medir: boolean }>("select qld_medir($1,1,1210,$2,'t')", [lote, pj])).qld_medir, false);
    const l = await one<{ status: string; qtd_bloqueada: string }>("select status,qtd_bloqueada from qld_lotes_inspecao where id=$1", [lote]);
    assert.deepEqual([l.status, Number(l.qtd_bloqueada)], ["QUARENTENA", 50]);
    assert.equal(Number((await one<{ bloqueado: string }>("select bloqueado from est_saldos where produto_id=$1", [prod])).bloqueado), 50);
    await assert.rejects(one("select qld_medir($1,1,1200,$2,'t')", [lote, pj]), /Amostra completa/);
    await assert.rejects(db.query("update qld_medicoes set valor=1200"), /imutável|não pode ser alterada/);
    await assert.rejects(one("select qld_decidir($1,'APROVAR','','qa')", [lote]), /fora da tolerância/);
    await assert.rejects(one("select qld_decidir($1,'REPROVAR','','qa')", [lote]), /motivo/);
    assert.equal((await one<{ qld_decidir: string }>("select qld_decidir($1,'REPROVAR','Peça fora de medida','qa')", [lote])).qld_decidir, "REPROVADO");
    assert.equal(Number((await one<{ bloqueado: string }>("select bloqueado from est_saldos where produto_id=$1", [prod])).bloqueado), 0);
    await assert.rejects(one("select qld_decidir($1,'APROVAR','','qa')", [lote]), /já decidido/);

    // lote bom aprova
    const { id: l2 } = await one("select qld_abrir_lote($1,10,'MANUAL','',null,$2,'t') id", [plano, local]);
    await one("select qld_medir($1,1,1200,$2,'t')", [l2, pj]);
    assert.equal((await one<{ qld_decidir: string }>("select qld_decidir($1,'APROVAR','','qa')", [l2])).qld_decidir, "APROVADO");

    // PPM: 50 reprovadas de 60 inspecionadas
    const ppm = await one<{ inspecionado: string; rejeitado: string; ppm: string }>("select * from qld_ppm(1)");
    assert.deepEqual([Number(ppm.inspecionado), Number(ppm.rejeitado), Number(ppm.ppm)], [60, 50, 833333]);

    // NC/CAPA
    const { id: nc } = await one("insert into qld_nao_conformidades(descricao,lote_inspecao_id,criado_por) values('Fora de medida',$1,'t') returning id", [lote]);
    await assert.rejects(one("select qld_encerrar_nc($1,'qa')", [nc]), /causa raiz/);
    await db.query("update qld_nao_conformidades set causa_raiz='Serra desregulada',porques='[\"a\",\"b\"]' where id=$1", [nc]);
    await assert.rejects(one("select qld_encerrar_nc($1,'qa')", [nc]), /ao menos uma ação/);
    await db.query("insert into qld_acoes(nc_id,linha,tipo,descricao) values($1,1,'CORRETIVA','Regular serra')", [nc]);
    await assert.rejects(one("select qld_encerrar_nc($1,'qa')", [nc]), /pendente/);
    await db.query("update qld_acoes set concluida_em=now() where nc_id=$1", [nc]);
    await one("select qld_encerrar_nc($1,'qa')", [nc]);
    assert.equal((await one<{ status: string }>("select status from qld_nao_conformidades where id=$1", [nc])).status, "ENCERRADA");
    await assert.rejects(db.query("update qld_nao_conformidades set porques='[1,2,3,4,5,6]' where id=$1", [nc]), /check/);

    const down = (await readFile("database/migrations/2026-10-25_17_qualidade_inspecao.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('qld_planos') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});
