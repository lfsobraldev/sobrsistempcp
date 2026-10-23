import test from "node:test";
import assert from "node:assert/strict";
import { lerQr, qrEndereco, qrPeca, qrSobra, qrPallet } from "../lib/qr-fabrica";

test("QR da fábrica: ida e volta e entradas inválidas", () => {
  assert.deepEqual(lerQr(qrEndereco("EMB-T1")), { tipo: "ENDERECO", codigo: "EMB-T1" });
  assert.deepEqual(lerQr(qrPeca("26847", "1-0001")), { tipo: "PECA", pedido: "26847", peca: "1-0001" });
  assert.deepEqual(lerQr(qrSobra(12)), { tipo: "SOBRA", numero: "12" });
  assert.deepEqual(lerQr(qrPallet("PL-9")), { tipo: "PALLET", codigo: "PL-9" });
  assert.deepEqual(lerQr(" famossul|e|T3 "), { tipo: "ENDERECO", codigo: "T3" });
  for (const x of ["", "abc", "FAMOSSUL|P|so-pedido", "OUTRO|E|X", "FAMOSSUL|Z|1"]) assert.equal(lerQr(x), null);
});

test("QR da ficha do pedido é lido de volta", async () => {
  const { qrFicha, pedidoDaFicha } = await import("@/lib/qr-fabrica");
  assert.equal(qrFicha(27014), "FAMOSSUL|F|27014");
  assert.equal(pedidoDaFicha("FAMOSSUL|F|27014"), "27014");
  assert.deepEqual(lerQr("FAMOSSUL|F|27014"), { tipo: "FICHA", pedido: "27014" });
});
