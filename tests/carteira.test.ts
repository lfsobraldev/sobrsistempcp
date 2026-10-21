import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularSaldos, calcularIndicadores, situacaoCarteira, alertasPedido, detectarDuplicidades, diffEvento, criarChavePedidoSeguro,
  filtrarCarteira, ordenarCarteira, normalizarPedido, normalizarCliente, prazoReferencia, diasEntre, linhasExportacao,
  type PedidoCarteira,
} from "../lib/carteira";

const HOJE = "2026-10-20";
const base = (o: Partial<PedidoCarteira> = {}): PedidoCarteira => ({
  pedido: "100001", cliente: "Móveis Alfa Ltda", representante: "", uf: "", cidade: "", pecas: 100, linhas: 5, ofs: 5,
  pecasConcluidas: 40, avancoPct: 40, foraDaProgramacao: false, statusEntrega: "EM_PRODUCAO",
  previsaoInformada: null, prazoPcp: null, previsaoEntrega: null, dataEntrega: null, dataSaida: null,
  transportadora: "", notaFiscal: "", atualizadoPor: "", atualizadoEm: null, cargas: [], sacAbertos: 0, ...o,
});

test("saldos: entregue vem só das remessas ENTREGUE; cancelada é ignorada", () => {
  const s = calcularSaldos(base({ cargas: [{ quantidade: 30, status: "ENTREGUE" }, { quantidade: 20, status: "EM_TRANSITO" }, { quantidade: 10, status: "PROGRAMADO" }, { quantidade: 99, status: "CANCELADO" }] }));
  assert.equal(s.entregue, 30); assert.equal(s.expedida, 50); assert.equal(s.programada, 10);
  assert.equal(s.pendenteEntrega, 70); assert.equal(s.pendenteProducao, 60);
});

test("saldos: sem remessas, situação ENTREGUE com data considera pedido todo entregue", () => {
  const s = calcularSaldos(base({ statusEntrega: "ENTREGUE", dataEntrega: "2026-10-01" }));
  assert.equal(s.entregue, 100); assert.equal(s.pendenteEntrega, 0); assert.equal(s.origemEntregue, "STATUS");
});

test("saldos: pedido sem itens na programação não inventa quantidade", () => {
  const s = calcularSaldos(base({ pecas: null, foraDaProgramacao: true }));
  assert.equal(s.solicitada, null); assert.equal(s.pendenteEntrega, null); assert.equal(s.pendenteProducao, null);
});

test("saldos: entrega acima do pedido gera excesso e alerta alto", () => {
  const p = base({ cargas: [{ quantidade: 120, status: "ENTREGUE" }] });
  assert.equal(calcularSaldos(p).excessoEntrega, 20);
  assert.ok(alertasPedido(p, HOJE).some((a) => a.codigo === "ENTREGA_ACIMA_DO_PEDIDO" && a.gravidade === "ALTA"));
});

test("prazo de referência: cliente > PCP > logística", () => {
  assert.deepEqual(prazoReferencia({ previsaoInformada: "2026-11-01", prazoPcp: "2026-10-30", previsaoEntrega: "2026-10-25" }), { data: "2026-11-01", origem: "CLIENTE" });
  assert.deepEqual(prazoReferencia({ previsaoInformada: null, prazoPcp: "2026-10-30", previsaoEntrega: "2026-10-25" }), { data: "2026-10-30", origem: "PCP" });
  assert.deepEqual(prazoReferencia({ previsaoInformada: null, prazoPcp: null, previsaoEntrega: "2026-10-25" }), { data: "2026-10-25", origem: "LOGISTICA" });
  assert.equal(prazoReferencia({ previsaoInformada: null, prazoPcp: null, previsaoEntrega: null }).origem, "NENHUMA");
});

test("situação: atrasado, em risco, no prazo, sem prazo e concluído", () => {
  assert.equal(situacaoCarteira(base({ previsaoInformada: "2026-10-19" }), HOJE), "ATRASADO");
  assert.equal(situacaoCarteira(base({ previsaoInformada: "2026-10-20" }), HOJE), "EM_RISCO");
  assert.equal(situacaoCarteira(base({ previsaoInformada: "2026-10-27" }), HOJE), "EM_RISCO");
  assert.equal(situacaoCarteira(base({ previsaoInformada: "2026-10-28" }), HOJE), "NO_PRAZO");
  assert.equal(situacaoCarteira(base({ previsaoInformada: "2026-10-25", pecasConcluidas: 100, avancoPct: 100 }), HOJE), "NO_PRAZO");
  assert.equal(situacaoCarteira(base(), HOJE), "SEM_PRAZO");
  assert.equal(situacaoCarteira(base({ previsaoInformada: "2026-01-01", cargas: [{ quantidade: 100, status: "ENTREGUE" }] }), HOJE), "CONCLUIDO");
});

test("situação: previsão logística posterior ao prazo prometido coloca o pedido em risco", () => {
  const p = base({ previsaoInformada: "2026-12-01", previsaoEntrega: "2026-12-10", pecasConcluidas: 100, avancoPct: 100 });
  assert.equal(situacaoCarteira(p, HOJE), "EM_RISCO");
  assert.ok(alertasPedido(p, HOJE).some((a) => a.codigo === "PREVISAO_APOS_PRAZO"));
});

test("alertas: cliente vazio, sem prazo, entregue sem data, SAC aberto, fora da programação", () => {
  const c = alertasPedido(base({ cliente: "  ", statusEntrega: "ENTREGUE", sacAbertos: 2, pecas: null, foraDaProgramacao: true }), HOJE).map((a) => a.codigo);
  for (const k of ["CLIENTE_VAZIO", "FORA_DA_PROGRAMACAO", "SAC_ABERTO"]) assert.ok(c.includes(k), k);
  assert.ok(alertasPedido(base({ statusEntrega: "ENTREGUE" }), HOJE).some((a) => a.codigo === "ENTREGUE_SEM_DATA"));
  assert.ok(alertasPedido(base({ pecasConcluidas: 100 }), HOJE).some((a) => a.codigo === "PRODUZIDO_SEM_REMESSA"));
});

test("indicadores somam apenas dados existentes", () => {
  const lista = [
    base({ pedido: "1", previsaoInformada: "2026-10-10" }),
    base({ pedido: "2", previsaoInformada: "2026-10-22", cargas: [{ quantidade: 10, status: "ENTREGUE" }] }),
    base({ pedido: "3", statusEntrega: "ENTREGUE", dataEntrega: "2026-10-01" }),
    base({ pedido: "4", pecas: null, foraDaProgramacao: true }),
    base({ pedido: "5", sacAbertos: 1 }),
  ];
  const i = calcularIndicadores(lista, HOJE);
  assert.equal(i.totalPedidos, 5); assert.equal(i.atrasados, 1); assert.equal(i.concluidos, 1); assert.equal(i.pedidosSemQuantidade, 1);
  assert.equal(i.pecasSolicitadas, 400); assert.equal(i.pecasEntregues, 110); assert.equal(i.pecasPendentesEntrega, 290);
  assert.equal(i.entregasProx7.pedidos, 1); assert.equal(i.entregasProx7.pecasPendentes, 90); assert.equal(i.comSacAberto, 1);
});

test("duplicidades: pedido com zeros à esquerda e cliente com grafias diferentes", () => {
  const d = detectarDuplicidades([{ pedido: "0123456", cliente: "ÓTIMA Móveis" }, { pedido: "123456", cliente: "otima moveis" }, { pedido: "999999", cliente: "Outra" }]);
  assert.equal(d.filter((x) => x.tipo === "PEDIDO").length, 1);
  assert.equal(d.filter((x) => x.tipo === "CLIENTE").length, 1);
  assert.equal(normalizarPedido(" 000123 "), "123"); assert.equal(normalizarPedido("0"), "0");
  assert.equal(normalizarCliente("Móveis  S.A."), "moveis s a");
});

test("chaves da carteira preservam pedidos ambíguos com zeros à esquerda", () => {
  const chave = criarChavePedidoSeguro(["000123", "123"]);
  assert.notEqual(chave("000123"), chave("123"));

  const pedidoUnico = criarChavePedidoSeguro(["000124"]);
  assert.equal(pedidoUnico("000124"), pedidoUnico("124"));
});

test("filtros: texto sem acento, cliente, período, situação, saldo, SAC", () => {
  const l = [
    base({ pedido: "1", cliente: "Móveis Alfa", previsaoInformada: "2026-10-10" }),
    base({ pedido: "2", cliente: "Beta Comércio", previsaoInformada: "2026-11-20", sacAbertos: 1, transportadora: "TransX" }),
    base({ pedido: "3", cliente: "Gama", statusEntrega: "ENTREGUE", dataEntrega: "2026-10-01" }),
  ];
  const ids = (f: Parameters<typeof filtrarCarteira>[1]) => filtrarCarteira(l, f, HOJE).map((p) => p.pedido);
  assert.deepEqual(ids({ q: "moveis" }), ["1"]);
  assert.deepEqual(ids({ q: "transx" }), ["2"]);
  assert.deepEqual(ids({ cliente: "beta" }), ["2"]);
  assert.deepEqual(ids({ situacao: "ATRASADO" }), ["1"]);
  assert.deepEqual(ids({ prazoDe: "2026-11-01", prazoAte: "2026-11-30" }), ["2"]);
  assert.deepEqual(ids({ somenteComSaldo: true }), ["1", "2"]);
  assert.deepEqual(ids({ somenteComSac: true }), ["2"]);
  assert.deepEqual(ids({ statusEntrega: "ENTREGUE" }), ["3"]);
});

test("ordenação: numérica por pedido, vazios sempre ao final, situação prioriza atrasados", () => {
  const l = [base({ pedido: "10" }), base({ pedido: "9" }), base({ pedido: "100", previsaoInformada: "2026-10-01" })];
  assert.deepEqual(ordenarCarteira(l, { campo: "pedido", dir: "asc" }, HOJE).map((p) => p.pedido), ["9", "10", "100"]);
  assert.deepEqual(ordenarCarteira(l, { campo: "pedido", dir: "desc" }, HOJE).map((p) => p.pedido), ["100", "10", "9"]);
  assert.equal(ordenarCarteira(l, { campo: "prazo", dir: "desc" }, HOJE)[0].pedido, "100");
  assert.equal(ordenarCarteira(l, { campo: "situacao", dir: "asc" }, HOJE)[0].pedido, "100");
});

test("diffEvento mostra só o que mudou e trata vazio = null", () => {
  const d = diffEvento({ cliente: "A", uf: "", data_entrega: null, pedido: "1" }, { cliente: "B", uf: null, data_entrega: "2026-10-20", pedido: "1", atualizado_por: "x" });
  assert.deepEqual(d.map((x) => [x.campo, x.de, x.para]), [["cliente", "A", "B"], ["data_entrega", "", "2026-10-20"]]);
  assert.deepEqual(diffEvento({}, { pedido: "1", cliente: "A" }).map((x) => x.campo), ["cliente"]);
});

test("datas e exportação", () => {
  assert.equal(diasEntre("2026-10-20", "2026-10-27"), 7);
  const linhas = linhasExportacao([base({ previsaoInformada: "2026-10-10" })], HOJE);
  assert.equal(linhas[0]["Situação da carteira"], "Atrasado"); assert.equal(linhas[0]["Pendente de entrega"], 100);
});
