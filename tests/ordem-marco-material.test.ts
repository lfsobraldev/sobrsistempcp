import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLogistics } from "../lib/romaneio/logistics";
import { tipoPeca } from "../lib/domain/industrial";
import type { PackageRow, ProcessingResult } from "../lib/romaneio/types";

const base = { category: "MARCO", groupType: "MARCO", lengthMm: 2110, widthMm: 100, thicknessMm: 30, quantity: 2 } as const;
const linha = (role: string, product: string, hand: string, extra: Partial<PackageRow> = {}) => ({ ...base, role, product, hand, ...extra }) as unknown as PackageRow;

test("romaneio: batente sai Dobradiça D, Dobradiça E, Contratesta D, Contratesta E e por fim travessas", () => {
  const rows = [
    linha("MARCO_TRAVESSA", "Travessa de Marco", "SEM_MAO", { lengthMm: 800 }),
    linha("MARCO_CONTRATESTA_ESQUERDA", "Perna de Marco Contratesta Esquerda", "ESQUERDA"),
    linha("MARCO_DOBRADICA_ESQUERDA", "Perna de Marco Dobradiça Esquerda", "ESQUERDA"),
    linha("MARCO_CONTRATESTA_DIREITA", "Perna de Marco Contratesta Direita", "DIREITA"),
    linha("MARCO_DOBRADICA_DIREITA", "Perna de Marco Dobradiça Direita", "DIREITA"),
  ];
  const input = { orderNumber: "1", client: "C", destination: "D", hasMachining: true, mountType: "MONTADO_HS", packages: [{ number: 1, rows }], warnings: [] } as unknown as ProcessingResult;
  const out = applyLogistics(input, "MONTADO_HS");
  const ordem = out.packages.flatMap((p) => p.rows).map((r) => r.product);
  assert.deepEqual(ordem.map((p) => /Travessa/.test(p) ? "TRAV" : p.replace(/^.*(Dobradiça|Contratesta) (\w+)$/, "$1 $2")), ["Dobradiça Direita", "Dobradiça Esquerda", "Contratesta Direita", "Contratesta Esquerda", "TRAV"]);
});

test("peças de batente: PE BAT / PER BAT / P BAT são perna e TR BAT / TRA BAT são travessa", () => {
  const item = (descricao: string, medida: string) => ({ quantidade: 1, descricao, medida, produto: descricao }) as never;
  for (const d of ["PE BAT 2110X100X30", "PER BAT 2110X100X30", "P BAT 2110X100X30"]) assert.equal(tipoPeca(item(d, "2110x100x30")), "PERNA", d);
  for (const d of ["TR BAT 800X100X30", "TRA BAT 800X100X30"]) assert.equal(tipoPeca(item(d, "800x100x30")), "TRAVESSA", d);
});

import { enriquecerProdutoPeloRegistro } from "../lib/catalogo-consistem";
test("material do pedido (STD) não é trocado por ULTRA vindo do catálogo", () => {
  const p = { pedido: "1", produto: "TRAV", descricao: "TRAVESSA BATENTE", material: "MDF STD", tipo: "MDF STD", quantidade: 1 } as never;
  const ref = { conflito: false, vazio: false, narrativa: "Travessa de Marco 800x100x30 MDF ULTRA 2L Borr." } as never;
  const r = enriquecerProdutoPeloRegistro(p, ref) as { material: string };
  assert.equal(r.material, "MDF STD");
  const semMaterial = enriquecerProdutoPeloRegistro({ pedido: "1", produto: "TRAV", descricao: "TRAVESSA", material: "", tipo: "", quantidade: 1 } as never, ref) as { material: string };
  assert.equal(semMaterial.material, "MDF ULTRA");
});
