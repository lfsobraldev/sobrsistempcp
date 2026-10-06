import type {
  Produto,
} from "@/types/pcp";

import {
  compareParaPlanilha,
  compareProduction,
  ehFerragem,
  familiaIndustrial,
  medidaDoItem,
  parseMeasure,
  tipoPeca,
  LARGURA_ORDEM,
} from "@/lib/domain/industrial";

export { compareParaPlanilha, medidaDoItem, tipoPeca, LARGURA_ORDEM };

export const DIM_PRINCIPAL:
  | 0
  | 1 = 1;

export function dims(
  medida: string
): [number, number, number] {
  return parseMeasure(medida);
}

export const FAMILIAS = [
  "PORTAS",
  "BATENTES",
  "ALIZARES",
  "BAGUETE",
  "KIT CORRER",
  "BANDEIRA",
  "OUTROS",
] as const;

export type Familia =
  (typeof FAMILIAS)[number];

export function familiaDe(
  categoria: string
): Familia {
  const family =
    familiaIndustrial({
      categoria,
    });

  if (
    family ===
    "FERRAGENS"
  ) {
    return "OUTROS";
  }

  return family;
}

export function familiaProduto(
  produto: Produto
): Familia {
  const family =
    familiaIndustrial(
      produto
    );

  if (
    family ===
    "FERRAGENS"
  ) {
    return "OUTROS";
  }

  return family;
}

export function produtoEntraPCP(
  produto: Produto
) {
  return !ehFerragem(
    produto
  );
}

type Chave =
  Pick<
    Produto,
    | "categoria"
    | "descricao"
    | "produto"
    | "tipo"
    | "material"
    | "acabamento"
    | "cor"
    | "medida"
    | "rebaixo"
  > &
    Partial<
      Pick<
        Produto,
        | "prioridade"
        | "pedido"
        | "of"
      >
    >;

export function compareChave(
  a: Chave,
  b: Chave
) {
  return compareProduction(
    a,
    b
  );
}

export function compareProduto(
  a: Produto,
  b: Produto
) {
  return compareProduction(
    a,
    b
  );
}
