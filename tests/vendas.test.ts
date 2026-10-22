import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  calcularComissaoPedido, calcularItens, calcularTotais, comissaoEstorno, comissaoProporcional, exigeAprovacaoPorDesconto,
  pedidoEditavel, podeTransicionarPedido, resolverRegra, statusAoEnviar, verificarCredito, type RegraComissao,
} from "../lib/vendas";

const item = (o: object = {}) => ({ descricao: "Pallet 1200x1000", quantidade: 10, precoUnitario: 100, ...o });

test("itens e totais em centavos", () => {
  const it = calcularItens([item({ descontoPercentual: 10 }), item({ quantidade: 3, precoUnitario: 33.33 })]);
  assert.equal(it[0].total, 900);
  assert.equal(it[1].total, 99.99);
  const t = calcularTotais(it, 5, 50);
  assert.equal(t.totalBruto, 999.99);
  assert.equal(t.total, 999.99);
  assert.equal(t.descontoMaximo, 10);
});
test("validações de item", () => {
  assert.throws(() => calcularItens([]), /ao menos um/);
  assert.throws(() => calcularItens([item({ quantidade: 0 })]), /quantidade/);
  assert.throws(() => calcularItens([item({ precoUnitario: -1 })]), /preço/);
  assert.throws(() => calcularItens([item({ descontoPercentual: 101 })]), /desconto/);
  assert.throws(() => calcularItens([item({ descricao: " " })]), /descrição/);
  assert.throws(() => calcularItens([item({ dataEntrega: "2026-02-30" })]), /data/);
});
test("aprovação por desconto e crédito", () => {
  assert.equal(exigeAprovacaoPorDesconto(5), false);
  assert.equal(exigeAprovacaoPorDesconto(5.01), true);
  assert.deepEqual(verificarCredito(0, 999999, 1000), { ok: true, excedente: 0, disponivel: null });
  assert.deepEqual(verificarCredito(10000, 4000, 5000), { ok: true, excedente: 0, disponivel: 6000 });
  assert.deepEqual(verificarCredito(10000, 4000, 7000), { ok: false, excedente: 1000, disponivel: 6000 });
  assert.equal(statusAoEnviar(false, false), "APROVADO");
  assert.equal(statusAoEnviar(true, false), "EM_APROVACAO");
  assert.equal(statusAoEnviar(false, true), "EM_APROVACAO");
});
test("máquina de estados", () => {
  assert.equal(podeTransicionarPedido("RASCUNHO", "APROVADO"), true);
  assert.equal(podeTransicionarPedido("FATURADO", "CANCELADO"), false);
  assert.equal(podeTransicionarPedido("CANCELADO", "RASCUNHO"), false);
  assert.equal(pedidoEditavel("APROVADO"), false);
  assert.equal(pedidoEditavel("RASCUNHO"), true);
});

const regra = (o: Partial<RegraComissao>): RegraComissao => ({ representanteId: "R1", percentual: 3, base: "FATURADO", vigenciaInicio: "2026-01-01", ativo: true, ...o });
test("precedência item > cliente > família > faixa > padrão", () => {
  const ctx = { representanteId: "R1", clienteId: "C1", itemCodigo: "P1", familia: "PALLET", valorItem: 1000, data: "2026-10-22" };
  const regras = [regra({ id: "faixa", percentual: 1, faixaMin: 500 }), regra({ id: "fam", percentual: 2, familia: "PALLET" }), regra({ id: "cli", percentual: 4, clienteId: "C1" }), regra({ id: "item", percentual: 6, itemCodigo: "P1" })];
  assert.equal(resolverRegra(regras, ctx, 0).regraId, "item");
  assert.equal(resolverRegra(regras.slice(0, 3), ctx, 0).regraId, "cli");
  assert.equal(resolverRegra(regras.slice(0, 2), ctx, 0).regraId, "fam");
  assert.equal(resolverRegra(regras.slice(0, 1), ctx, 0).regraId, "faixa");
  assert.deepEqual(resolverRegra([], ctx, 2.5), { percentual: 2.5, base: "FATURADO", regraId: null, origem: "PADRAO" });
  assert.equal(resolverRegra([regra({ id: "x", vigenciaFim: "2026-06-30" })], ctx, 1).origem, "PADRAO");
  assert.equal(resolverRegra([regra({ id: "x", faixaMin: 2000 })], ctx, 1).origem, "PADRAO");
  assert.equal(resolverRegra([regra({ id: "x", ativo: false })], ctx, 1).origem, "PADRAO");
});
test("comissão do pedido e bases misturadas", () => {
  const itens = calcularItens([item({ itemCodigo: "A" }), item({ itemCodigo: "B", precoUnitario: 200 })]);
  const c = calcularComissaoPedido(itens, [], { id: "R1", percentualPadrao: 5 }, "C1", "2026-10-22");
  assert.equal(c.valorBase, 3000);
  assert.equal(c.valor, 150);
  assert.throws(() => calcularComissaoPedido(itens, [regra({ itemCodigo: "A", base: "RECEBIDO" })], { id: "R1", percentualPadrao: 5 }, "C1", "2026-10-22"), /bases diferentes/);
});
test("liberação proporcional e estorno acumulado", () => {
  assert.equal(comissaoProporcional(100, 1000, 400, 0), 40);
  assert.equal(comissaoProporcional(100, 1000, 1000, 40), 60);
  assert.equal(comissaoProporcional(100, 1000, 400, 40), 0);
  assert.equal(comissaoProporcional(100, 1000, 2000, 0), 100);
  assert.equal(comissaoEstorno(100, 1000, 250, 0), 25);
  assert.equal(comissaoEstorno(100, 1000, 500, 25), 25);
  assert.equal(comissaoEstorno(100, 1000, 0, 0), 0);
  assert.throws(() => comissaoEstorno(100, 1000, 1001, 0), /maior que o valor faturado/);
});

test("Postgres: migration 14 é reaplicável, impõe constraints e ledger imutável; down limpa", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/migrations/2026-10-20_crm_comercial.sql", "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/, ""));
    const up = (await readFile("database/migrations/2026-10-23_14_vendas_comissoes.sql", "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/, "");
    await db.exec(up); await db.exec(up);
    const [cli] = (await db.query<{ id: string }>("insert into crm_clientes(razao_social,criado_por,atualizado_por) values('ACME','t','t') returning id")).rows;
    const [rep] = (await db.query<{ id: string }>("insert into crm_representantes(nome,criado_por,atualizado_por) values('Rep','t','t') returning id")).rows;
    const [ped] = (await db.query<{ id: string }>("insert into crm_pedidos_venda(cliente_id,representante_id,pedido_cliente,total,criado_por,atualizado_por) values($1,$2,'PC-1',1000,'t','t') returning id", [cli.id, rep.id])).rows;
    await assert.rejects(db.query("insert into crm_pedidos_venda(cliente_id,pedido_cliente,total,criado_por,atualizado_por) values($1,'pc-1',10,'t','t')", [cli.id]), /duplicate|unique/);
    await assert.rejects(db.query("update crm_pedidos_venda set faturado_valor=2000 where id=$1", [ped.id]), /check/);
    await assert.rejects(db.query("update crm_pedidos_venda set status='XYZ' where id=$1", [ped.id]), /check/);
    const [c] = (await db.query<{ id: string }>("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,competencia,criado_por) values($1,$2,'PROVISAO','FATURADO',1000,50,'2026-10','t') returning id", [ped.id, rep.id])).rows;
    await assert.rejects(db.query("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,competencia,criado_por) values($1,$2,'PROVISAO','FATURADO',1000,50,'2026-10','t')", [ped.id, rep.id]), /duplicate|unique/);
    await assert.rejects(db.query("update crm_comissoes set valor=1 where id=$1", [c.id]), /imutável/);
    await assert.rejects(db.query("delete from crm_comissoes where id=$1", [c.id]), /não pode ser apagado/);
    await db.query("update crm_comissoes set status='ESTORNADA' where id=$1", [c.id]);
    const down = (await readFile("database/migrations/2026-10-23_14_vendas_comissoes.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('crm_pedidos_venda') t")).rows[0] as { t: unknown }).t, null);
    await db.exec(up);
  } finally { await db.close(); }
});
