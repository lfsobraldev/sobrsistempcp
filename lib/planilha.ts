import type ExcelJS from "exceljs";
import type { Produto } from "@/types/pcp";

import {
  compareParaPlanilha,
  familiaProduto,
  produtoEntraPCP,
  type Familia,
} from "@/lib/sort";

import {
  medidaDoItem,
  tipoPeca,
} from "@/lib/domain/industrial";

/**
 * PLANILHA DE PROGRAMAÇÃO POR SETOR
 *
 * ORDEM:
 * PORTAS
 * BATENTES
 * ALIZARES
 * BAGUETES
 * KIT DE CORRER / SUPORTE DE TRILHO
 * DEMAIS
 *
 * Dentro de cada família:
 * largura MAIOR → MENOR.
 */

type Workbook =
  ExcelJS.Workbook;

type Worksheet =
  ExcelJS.Worksheet;

export const SETORES:
  [string, string][] = [
  [
    "PREPARACAO",
    "PREPARAÇÃO",
  ],

  [
    "USINAGEM-PORTAS",
    "USINAGEM DE PORTAS",
  ],

  [
    "USINAGEM-TRAVESSAS",
    "USINAGEM DE TRAVESSAS",
  ],

  [
    "LIXAR",
    "LIXAR",
  ],

  [
    "RECOBRIDORA",
    "RECOBRIDORA 1",
  ],

  [
    "RECOBRIDORA-2",
    "RECOBRIDORA 2",
  ],

  [
    "USINAGEM-CONTRATESTA",
    "USINAGEM CONTRATESTA",
  ],

  [
    "USINAGEM-DOBRADICAS",
    "USINAGEM DOBRADIÇAS",
  ],

  [
    "USINAGEM-TUPIA",
    "TUPIA - CANAL BORRACHA",
  ],

  [
    "LUSTRACAO",
    "LUSTRAÇÃO",
  ],

  [
    "TERCEIROS",
    "TERCEIROS",
  ],

  [
    "EMBALAGEM-PORTAS",
    "EMBALAGEM DE PORTAS",
  ],

  [
    "EMBALAGEM-1",
    "EMBALAGEM 1",
  ],

  [
    "EXPEDICAO",
    "EXPEDIÇÃO",
  ],
];
const FAMILIA_INFO:
  Record<
    Familia,
    {
      secao: string;
      singular: string;
    }
  > = {
  PORTAS: {
    secao: "PORTAS",
    singular: "PORTA",
  },

  BATENTES: {
    secao: "BATENTES",
    singular: "BATENTE",
  },

  ALIZARES: {
    secao: "ALIZARES",
    singular: "ALIZAR",
  },

  BAGUETE: {
    secao: "BAGUETES",
    singular: "BAGUETE",
  },

  "KIT CORRER": {
    secao:
      "KIT DE CORRER / SUPORTE DE TRILHO",
    singular:
      "KIT DE CORRER",
  },

  BANDEIRA: {
    secao: "BANDEIRAS",
    singular: "BANDEIRA",
  },

  OUTROS: {
    secao: "OUTROS ITENS",
    singular: "OUTROS",
  },
};

type Coluna = {
  h: string;
  w: number;
  align?:
    | "left"
    | "center"
    | "right";
};

/**
 * COLUNAS REMOVIDAS:
 *
 * Seq.
 * Item
 * Produto
 * Família
 * Máquina
 * Líder
 * % Concluído
 * Status
 * Prioridade
 *
 * NOVA COLUNA:
 *
 * mL = SALDO × COMPRIMENTO
 */
const COLS:
  Coluna[] = [
  {
    h: "Pedido",
    w: 12,
    align: "center",
  },
  {
    h: "OF",
    w: 14,
    align: "center",
  },
  {
    h: "Peça",
    w: 15,
    align: "center",
  },
  {
    h: "Descrição",
    w: 52,
  },
  {
    h: "Tipo",
    w: 16,
  },
  {
    h: "Canal",
    w: 22,
  },
  {
    h: "Rebaixo",
    w: 16,
  },
  {
    h: "Acabamento",
    w: 24,
  },
  {
    h: "Cor",
    w: 20,
  },
  {
    h: "Qtd Programada",
    w: 15,
    align: "right",
  },
  {
    h: "Comprimento",
    w: 15,
    align: "right",
  },
  {
    h: "Largura",
    w: 12,
    align: "right",
  },
  {
    h: "Espessura",
    w: 12,
    align: "right",
  },
  {
    h: "m³",
    w: 13,
    align: "right",
  },
  {
    h: "mL",
    w: 13,
    align: "right",
  },
  {
    h: "Turno",
    w: 10,
    align: "center",
  },
  {
    h: "Qtd Produzida",
    w: 15,
    align: "right",
  },
  {
    h: "Saldo",
    w: 13,
    align: "right",
  },
  {
    h: "Observação",
    w: 30,
  },
];

const C = {
  pedido: 1,
  of: 2,
  peca: 3,
  desc: 4,
  tipo: 5,
  canal: 6,
  rebaixo: 7,
  acabamento: 8,
  cor: 9,

  qtd: 10,

  comp: 11,
  larg: 12,
  esp: 13,

  m3: 14,
  ml: 15,

  turno: 16,
  prod: 17,
  saldo: 18,
  obs: 19,
};

const ENTRADA = [
  C.turno,
  C.prod,
  C.obs,
];

const N_COLS =
  COLS.length;

const COR = {
  grafite:
    "FF2B3138",

  cabecalho:
    "FF3F4A54",

  banda:
    "FFE4E8EB",

  linha:
    "FFD5DAE0",

  grupo:
    "FF9AA5B0",

  entrada:
    "FFFAF7EA",

  texto:
    "FF1F2A30",

  suave:
    "FF5B6670",

  conversao:
    "FFEAF2E5",
};

const FONTE =
  "Arial";

function letra(
  n: number
) {
  let s = "";

  while (
    n > 0
  ) {
    const m =
      (
        n -
        1
      ) %
      26;

    s =
      String.fromCharCode(
        65 +
          m
      ) +
      s;

    n =
      Math.floor(
        (
          n -
          1
        ) /
          26
      );
  }

  return s;
}

const limpar = (
  v: unknown
) =>
  String(
    v ??
      ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

const capitalizar = (
  v: string
) =>
  v
    ? v
        .charAt(
          0
        )
        .toUpperCase() +
      v
        .slice(
          1
        )
        .toLowerCase()
    : "";

const fino = (
  argb: string
) => ({
  style:
    "thin" as const,

  color: {
    argb,
  },
});

/**
 * VOLUME m³
 *
 * comprimento,
 * largura,
 * espessura em mm.
 */
function m3(
  c: number,
  l: number,
  e: number,
  q: number
) {
  if (
    c >
      0 &&
    l >
      0 &&
    e >=
      5 &&
    q >
      0
  ) {
    return (
      Math.round(
        (
          (
            c *
            l *
            e *
            q
          ) /
          1e9
        ) *
          1000
      ) /
      1000
    );
  }

  return null;
}

/**
 * METRO LINEAR
 *
 * REGRA:
 *
 * SALDO × COMPRIMENTO
 *
 * comprimento está em mm,
 * então divide por 1000.
 */
function metroLinear(
  comprimento: number,
  saldo: number
) {
  if (
    comprimento <=
      0 ||
    saldo <=
      0
  ) {
    return 0;
  }

  return (
    Math.round(
      (
        saldo *
        (
          comprimento /
          1000
        )
      ) *
        1000
    ) /
    1000
  );
}

type Item = {
  p: Produto;
  o:
    Produto[
      "operacoes"
    ][number];
};

export type OpcoesPlanilha = {
  setores?: string[];

  data?: string;
};

function itensDoSetor(
  produtos:
    Produto[],
  processo: string
): Item[] {
  return produtos
    .filter(
      produtoEntraPCP
    )
    .flatMap(
      (
        p
      ) =>
        p.operacoes
          .filter(
            (
              o
            ) =>
              o.processo ===
              processo
          )
          .map(
            (
              o
            ) => ({
              p,
              o,
            })
          )
    )
    .sort(
      (
        a,
        b
      ) =>
        compareParaPlanilha(
          a.p,
          b.p
        ) ||
        a.o
          .ordemFila -
          b.o
            .ordemFila
    );
}

type ResumoSetor = {
  aba: string;

  primeira:
    number;

  ultima:
    number;

  total:
    number;

  familias:
    Familia[];

  qtd:
    number;

  prod:
    number;

  saldo:
    number;

  m3:
    number;

  ml:
    number;

  concluidos:
    number;

  parciais:
    number;

  naoIniciados:
    number;

  porFamilia:
    Partial<
      Record<
        Familia,
        number
      >
    >;
};

function montarAbaSetor(
  wb: Workbook,
  nomeAba:
    string,
  itens:
    Item[],
  data:
    string
): ResumoSetor {
  const nomeAbaExcel =
    nomeAba
      .replace(/[\\/*?:\[\]]/g, "-")
      .slice(0, 31);

  const ws =
    wb.addWorksheet(
      nomeAbaExcel,
      {
        properties: {
          defaultRowHeight:
            26,
        },

        views: [
          {
            state:
              "frozen",

            xSplit:
              2,

            ySplit:
              4,

            showGridLines:
              false,
          },
        ],
      }
    );

  COLS.forEach(
    (
      c,
      i
    ) =>
      (
        ws.getColumn(
          i +
            1
        ).width =
          c.w
      )
  );

  /**
   * TÍTULO
   */
  ws.mergeCells(
    1,
    1,
    1,
    N_COLS
  );

  const t =
    ws.getCell(
      1,
      1
    );

  t.value =
    `PROGRAMAÇÃO DE PRODUÇÃO  |  ${nomeAba}`;

  t.font = {
    name:
      FONTE,

    size:
      20,

    bold:
      true,

    color: {
      argb:
        "FFFFFFFF",
    },
  };

  t.fill = {
    type:
      "pattern",

    pattern:
      "solid",

    fgColor: {
      argb:
        COR.grafite,
    },
  };

  t.alignment = {
    vertical:
      "middle",

    indent:
      1,
  };

  ws.getRow(
    1
  ).height =
    42;

  /**
   * IDENTIFICAÇÃO
   */
  const rotulo = (
    col: number,
    txt: string
  ) => {
    const c =
      ws.getCell(
        2,
        col
      );

    c.value =
      txt;

    c.font = {
      name:
        FONTE,

      size:
        12,

      bold:
        true,

      color: {
        argb:
          COR.suave,
      },
    };

    c.alignment = {
      vertical:
        "middle",

      horizontal:
        "right",
    };
  };

  const campo = (
    c1: number,
    c2: number,
    valor?: string
  ) => {
    if (
      c2 >
      c1
    ) {
      ws.mergeCells(
        2,
        c1,
        2,
        c2
      );
    }

    for (
      let c =
        c1;
      c <=
      c2;
      c++
    ) {
      ws.getCell(
        2,
        c
      ).border = {
        bottom:
          fino(
            COR.grupo
          ),
      };
    }

    const cell =
      ws.getCell(
        2,
        c1
      );

    cell.value =
      valor ??
      null;

    cell.font = {
      name:
        FONTE,

      size:
        13,

      bold:
        true,

      color: {
        argb:
          COR.texto,
      },
    };

    cell.alignment = {
      vertical:
        "middle",

      horizontal:
        "left",

      indent:
        1,
    };
  };

  rotulo(
    1,
    "Data:"
  );

  campo(
    2,
    3,
    data
  );

  rotulo(
    4,
    "Setor:"
  );

  campo(
    5,
    7,
    nomeAba
  );

  rotulo(
    8,
    "Turno:"
  );

  campo(
    9,
    10
  );

  rotulo(
    11,
    "Ordem:"
  );

  campo(
    12,
    19,
    "Família  ›  largura MAIOR → MENOR"
  );

  ws.getRow(
    2
  ).height =
    30;

  ws.getRow(
    3
  ).height =
    8;

  /**
   * CABEÇALHO
   */
  const head =
    ws.getRow(
      4
    );

  COLS.forEach(
    (
      c,
      i
    ) => {
      const cell =
        head.getCell(
          i +
            1
        );

      cell.value =
        c.h;

      cell.font = {
        name:
          FONTE,

        size:
          14,

        bold:
          true,

        color: {
          argb:
            "FFFFFFFF",
        },
      };

      cell.fill = {
        type:
          "pattern",

        pattern:
          "solid",

        fgColor: {
          argb:
            COR.cabecalho,
        },
      };

      cell.alignment = {
        vertical:
          "middle",

        horizontal:
          "center",

        wrapText:
          true,
      };

      cell.border = {
        left:
          fino(
            "FF59646E"
          ),

        right:
          fino(
            "FF59646E"
          ),
      };
    }
  );

  head.height =
    44;

  let rowNum =
    5;

  const primeira =
    rowNum;

  const familias:
    Familia[] = [];

  let i =
    0;

  while (
    i <
    itens.length
  ) {
    const familia =
      familiaProduto(
        itens[
          i
        ].p
      );

    let j =
      i;

    while (
      j <
        itens.length &&
      familiaProduto(
        itens[
          j
        ].p
      ) ===
        familia
    ) {
      j++;
    }

    const grupo =
      itens.slice(
        i,
        j
      );

    familias.push(
      familia
    );

    /**
     * BANDA DA FAMÍLIA
     */
    const bandaRow =
      ws.getRow(
        rowNum
      );

    const bandaNum =
      rowNum;

    ws.mergeCells(
      bandaNum,
      1,
      bandaNum,
      9
    );

    const qtdSecao =
      grupo.reduce(
        (
          s,
          x
        ) =>
          s +
          x.o
            .quantidadePlanejada,
        0
      );

    const prodSecao =
      grupo.reduce(
        (
          s,
          x
        ) =>
          s +
          x.o
            .quantidadeProduzida,
        0
      );

    const saldoSecao =
      Math.max(
        0,
        qtdSecao -
          prodSecao
      );

    const bTxt =
      bandaRow.getCell(
        1
      );

    bTxt.value =
      `${FAMILIA_INFO[
        familia
      ].secao}   •   ${grupo.length} ${
        grupo.length ===
        1
          ? "item"
          : "itens"
      }`;

    bTxt.font = {
      name:
        FONTE,

      size:
        15,

      bold:
        true,

      color: {
        argb:
          COR.texto,
      },
    };

    bTxt.alignment = {
      vertical:
        "middle",

      horizontal:
        "left",

      indent:
        1,
    };

    for (
      let c =
        1;
      c <=
      N_COLS;
      c++
    ) {
      const cell =
        bandaRow.getCell(
          c
        );

      cell.fill = {
        type:
          "pattern",

        pattern:
          "solid",

        fgColor: {
          argb:
            COR.banda,
        },
      };

      cell.border = {
        top: {
          style:
            "medium",

          color: {
            argb:
              COR.cabecalho,
          },
        },

        bottom:
          fino(
            COR.grupo
          ),
      };
    }

    bandaRow.height =
      32;

    rowNum++;

    const ini =
      rowNum;

    let larguraAnterior =
      -1;

    let somaM3 =
      0;

    let somaML =
      0;

    for (
      const {
        p,
        o,
      } of grupo
    ) {
      const r =
        ws.getRow(
          rowNum
        );

      const [
        comp,
        larg,
        esp,
      ] =
        medidaDoItem(
          p
        );

      const comTipo =
        familia ===
          "BATENTES" ||
        familia ===
          "ALIZARES";

      const q =
        o.quantidadePlanejada;

      const prod =
        o.quantidadeProduzida;

      const saldo =
        Math.max(
          0,
          Math.round(
            (
              q -
              prod
            ) *
              1000
          ) /
            1000
        );

      const volume =
        m3(
          comp,
          larg,
          esp,
          q
        );

      const ml =
        metroLinear(
          comp,
          saldo
        );

      somaM3 +=
        volume ??
        0;

      somaML +=
        ml;

      const Q =
        letra(
          C.qtd
        );

      const COMP =
        letra(
          C.comp
        );

      const PROD =
        letra(
          C.prod
        );

      const SALDO =
        letra(
          C.saldo
        );

      const valores:
        (
          | string
          | number
          | null
          | {
              formula:
                string;

              result:
                number
                | string;
            }
        )[] = [
        p.pedido,

        p.of,

        comTipo
          ? capitalizar(
              tipoPeca(
                p
              )
            )
          : "",

        limpar(
          p.descricao
        ),

        limpar(
          p.tipo
        ),

        limpar(
          p.canal
        ),

        limpar(
          p.rebaixo
        ),

        limpar(
          p.acabamento
        ),

        limpar(
          p.cor
        ),

        q,

        comp ||
          null,

        larg ||
          null,

        esp ||
          null,

        volume,

        {
          formula:
            `IFERROR(ROUND(${SALDO}${rowNum}*(${COMP}${rowNum}/1000),3),0)`,

          result:
            ml,
        },

        null,

        prod,

        {
          formula:
            `MAX(0,ROUND(${Q}${rowNum}-${PROD}${rowNum},3))`,

          result:
            saldo,
        },

        null,
      ];

      valores.forEach(
        (
          v,
          k
        ) => {
          const cell =
            r.getCell(
              k +
                1
            );

          if (
            v !==
            null
          ) {
            cell.value =
              v as ExcelJS.CellValue;
          }

          cell.font = {
            name:
              FONTE,

            size:
              14,

            color: {
              argb:
                COR.texto,
            },
          };

          cell.alignment = {
            vertical:
              "middle",

            horizontal:
              COLS[
                k
              ].align ??
              "left",

            wrapText:
              false,
          };

          const novoGrupo =
            larg !==
              larguraAnterior &&
            larguraAnterior !==
              -1;

          cell.border = {
            top:
              novoGrupo
                ? fino(
                    COR.grupo
                  )
                : fino(
                    COR.linha
                  ),

            bottom:
              fino(
                COR.linha
              ),

            left:
              fino(
                COR.linha
              ),

            right:
              fino(
                COR.linha
              ),
          };

          if (
            ENTRADA.includes(
              k +
                1
            )
          ) {
            cell.fill = {
              type:
                "pattern",

              pattern:
                "solid",

              fgColor: {
                argb:
                  COR.entrada,
              },
            };
          }

          if (
            k +
              1 ===
            C.ml
          ) {
            cell.fill = {
              type:
                "pattern",

              pattern:
                "solid",

              fgColor: {
                argb:
                  COR.conversao,
              },
            };
          }
        }
      );

      r.getCell(
        C.qtd
      ).numFmt =
        "#,##0.###";

      r.getCell(
        C.prod
      ).numFmt =
        "#,##0.###";

      r.getCell(
        C.saldo
      ).numFmt =
        "#,##0.###";

      r.getCell(
        C.m3
      ).numFmt =
        "#,##0.000";

      r.getCell(
        C.ml
      ).numFmt =
        "#,##0.000";

      r.getCell(
        C.qtd
      ).font = {
        name:
          FONTE,

        size:
          14,

        bold:
          true,

        color: {
          argb:
            COR.texto,
        },
      };

      r.getCell(
        C.saldo
      ).font = {
        name:
          FONTE,

        size:
          14,

        bold:
          true,

        color: {
          argb:
            COR.texto,
        },
      };

      r.getCell(
        C.ml
      ).font = {
        name:
          FONTE,

        size:
          14,

        bold:
          true,

        color: {
          argb:
            COR.texto,
        },
      };

      r.height =
        31;

      larguraAnterior =
        larg;

      rowNum++;
    }

    const fim =
      rowNum -
      1;

    const Q =
      letra(
        C.qtd
      );

    const PROD =
      letra(
        C.prod
      );

    const SALDO =
      letra(
        C.saldo
      );

    const M3 =
      letra(
        C.m3
      );

    const ML =
      letra(
        C.ml
      );

    const subtotal = (
      col:
        number,
      ref:
        string,
      result:
        number,
      fmt =
        "#,##0.###"
    ) => {
      const cell =
        bandaRow.getCell(
          col
        );

      cell.value = {
        formula:
          `SUBTOTAL(9,${ref}${ini}:${ref}${fim})`,

        result,
      };

      cell.font = {
        name:
          FONTE,

        size:
          14,

        bold:
          true,

        color: {
          argb:
            COR.texto,
        },
      };

      cell.alignment = {
        vertical:
          "middle",

        horizontal:
          "right",
      };

      cell.numFmt =
        fmt;
    };

    subtotal(
      C.qtd,
      Q,
      qtdSecao
    );

    subtotal(
      C.prod,
      PROD,
      prodSecao
    );

    subtotal(
      C.saldo,
      SALDO,
      saldoSecao
    );

    subtotal(
      C.m3,
      M3,
      somaM3,
      "#,##0.000"
    );

    subtotal(
      C.ml,
      ML,
      somaML,
      "#,##0.000"
    );

    i =
      j;
  }

  const ultima =
    rowNum -
    1;

  /**
   * TOTAL DO SETOR
   */
  const tot =
    ws.getRow(
      rowNum
    );

  const totalQtd =
    itens.reduce(
      (
        s,
        x
      ) =>
        s +
        x.o
          .quantidadePlanejada,
      0
    );

  const totalProd =
    itens.reduce(
      (
        s,
        x
      ) =>
        s +
        x.o
          .quantidadeProduzida,
      0
    );

  const totalSaldo =
    Math.max(
      0,
      totalQtd -
        totalProd
    );

  let totalM3 =
    0;

  let totalML =
    0;

  for (
    const {
      p,
      o,
    } of itens
  ) {
    const [
      comp,
      larg,
      esp,
    ] =
      medidaDoItem(
        p
      );

    const saldo =
      Math.max(
        0,
        o.quantidadePlanejada -
          o.quantidadeProduzida
      );

    totalM3 +=
      m3(
        comp,
        larg,
        esp,
        o.quantidadePlanejada
      ) ??
      0;

    totalML +=
      metroLinear(
        comp,
        saldo
      );
  }

  const Q =
    letra(
      C.qtd
    );

  const PROD =
    letra(
      C.prod
    );

  const SALDO =
    letra(
      C.saldo
    );

  const M3 =
    letra(
      C.m3
    );

  const ML =
    letra(
      C.ml
    );

  ws.mergeCells(
    rowNum,
    1,
    rowNum,
    9
  );

  tot.getCell(
    1
  ).value =
    `TOTAL DO SETOR  —  ${itens.length} itens`;

  for (
    let c =
      1;
    c <=
    N_COLS;
    c++
  ) {
    const cell =
      tot.getCell(
        c
      );

    cell.font = {
      name:
        FONTE,

      size:
        15,

      bold:
        true,

      color: {
        argb:
          "FFFFFFFF",
      },
    };

    cell.fill = {
      type:
        "pattern",

      pattern:
        "solid",

      fgColor: {
        argb:
          COR.grafite,
      },
    };

    cell.alignment = {
      vertical:
        "middle",

      horizontal:
        c ===
        1
          ? "left"
          : "right",

      indent:
        c ===
        1
          ? 1
          : 0,
    };
  }

  tot.getCell(
    C.qtd
  ).value = {
    formula:
      `SUBTOTAL(9,${Q}${primeira}:${Q}${ultima})`,

    result:
      totalQtd,
  };

  tot.getCell(
    C.prod
  ).value = {
    formula:
      `SUBTOTAL(9,${PROD}${primeira}:${PROD}${ultima})`,

    result:
      totalProd,
  };

  tot.getCell(
    C.saldo
  ).value = {
    formula:
      `SUBTOTAL(9,${SALDO}${primeira}:${SALDO}${ultima})`,

    result:
      totalSaldo,
  };

  tot.getCell(
    C.m3
  ).value = {
    formula:
      `SUBTOTAL(9,${M3}${primeira}:${M3}${ultima})`,

    result:
      totalM3,
  };

  tot.getCell(
    C.ml
  ).value = {
    formula:
      `SUBTOTAL(9,${ML}${primeira}:${ML}${ultima})`,

    result:
      totalML,
  };

  tot.getCell(
    C.m3
  ).numFmt =
    "#,##0.000";

  tot.getCell(
    C.ml
  ).numFmt =
    "#,##0.000";

  tot.height =
    34;

  /**
   * IMPRESSÃO
   *
   * A3 paisagem.
   *
   * Fonte maior para
   * impressão física.
   */
  ws.pageSetup = {
    orientation:
      "landscape",

    paperSize:
      8 as unknown as ExcelJS.PaperSize,

    fitToPage:
      true,

    fitToWidth:
      2,

    fitToHeight:
      0,

    margins: {
      left:
        0.2,

      right:
        0.2,

      top:
        0.3,

      bottom:
        0.4,

      header:
        0.15,

      footer:
        0.2,
    },

    printTitlesRow:
      "4:4",
  };

  ws.headerFooter = {
    oddFooter:
      "&L&11&A&C&11Página &P de &N&R&11Impresso em &D &T",
  };

  /**
   * RESUMO
   */
  const stat = (
    x: Item
  ) => {
    const q =
      x.o
        .quantidadePlanejada;

    const pr =
      x.o
        .quantidadeProduzida;

    return pr ===
      0
      ? "n"
      : pr >=
        q
      ? "c"
      : "p";
  };

  const porFamilia:
    Partial<
      Record<
        Familia,
        number
      >
    > = {};

  for (
    const x of itens
  ) {
    const f =
      familiaProduto(
        x.p
      );

    porFamilia[
      f
    ] =
      (
        porFamilia[
          f
        ] ??
        0
      ) +
      x.o
        .quantidadePlanejada;
  }

  return {
    aba:
      nomeAba,

    primeira,

    ultima,

    total:
      rowNum,

    familias,

    qtd:
      totalQtd,

    prod:
      totalProd,

    saldo:
      totalSaldo,

    m3:
      totalM3,

    ml:
      totalML,

    concluidos:
      itens.filter(
        (
          x
        ) =>
          stat(
            x
          ) ===
          "c"
      ).length,

    parciais:
      itens.filter(
        (
          x
        ) =>
          stat(
            x
          ) ===
          "p"
      ).length,

    naoIniciados:
      itens.filter(
        (
          x
        ) =>
          stat(
            x
          ) ===
          "n"
      ).length,

    porFamilia,
  };
}

function montarPrioridades(
  ws: Worksheet,
  produtos: Produto[]
) {
  const rank: Record<string, number> = {
    URGENTE: 0,
    ALTA: 1,
    NORMAL: 2,
  };

  const pedidos =
    new Map<
      string,
      {
        pedido: string;
        prioridade: string;
        ofs: Set<string>;
        processos: Set<string>;
        saldo: number;
      }
    >();

  for (const p of produtos) {
    const nivel =
      String(
        p.prioridade ||
        "NORMAL"
      ).toUpperCase();

    if (
      nivel !== "URGENTE" &&
      nivel !== "ALTA"
    ) {
      continue;
    }

    const atual =
      p.operacoes.find(
        (
          o
        ) =>
          o.status !==
          "CONCLUIDA"
      );

    if (!atual) {
      continue;
    }

    const saldo =
      Math.max(
        0,
        atual.quantidadePlanejada -
          atual.quantidadeProduzida
      );

    const existente =
      pedidos.get(
        p.pedido
      );

    if (existente) {
      existente.saldo +=
        saldo;

      if (p.of) {
        existente.ofs.add(
          p.of
        );
      }

      existente.processos.add(
        atual.processo
      );

      if (
        (
          rank[nivel] ??
          9
        ) <
        (
          rank[
            existente.prioridade
          ] ??
          9
        )
      ) {
        existente.prioridade =
          nivel;
      }
    } else {
      pedidos.set(
        p.pedido,
        {
          pedido:
            p.pedido,

          prioridade:
            nivel,

          ofs:
            new Set(
              p.of
                ? [
                    p.of,
                  ]
                : []
            ),

          processos:
            new Set([
              atual.processo,
            ]),

          saldo,
        }
      );
    }
  }

  ws.columns = [
    {
      header:
        "PRIORIDADE",
      width:
        15,
    },
    {
      header:
        "PEDIDO",
      width:
        16,
    },
    {
      header:
        "OFs",
      width:
        32,
    },
    {
      header:
        "PROCESSO ATUAL",
      width:
        34,
    },
    {
      header:
        "SALDO",
      width:
        14,
    },
    {
      header:
        "ORIENTAÇÃO",
      width:
        42,
    },
  ];

  const linhas =
    [
      ...pedidos.values(),
    ].sort(
      (
        a,
        b
      ) =>
        (
          rank[
            a.prioridade
          ] ??
          9
        ) -
          (
            rank[
              b.prioridade
            ] ??
            9
          ) ||
        a.pedido.localeCompare(
          b.pedido,
          "pt-BR",
          {
            numeric:
              true,
          }
        )
    );

  if (
    !linhas.length
  ) {
    ws.addRow([
      "NORMAL",
      "-",
      "-",
      "-",
      0,
      "Nenhuma prioridade especial definida para este turno.",
    ]);
  } else {
    for (
      const x
      of linhas
    ) {
      ws.addRow([
        x.prioridade,
        x.pedido,
        [
          ...x.ofs,
        ].join(
          ", "
        ),
        [
          ...x.processos,
        ].join(
          " / "
        ),
        x.saldo,
        x.prioridade ===
        "URGENTE"
          ? "EXECUTAR PRIMEIRO SEM QUEBRAR A ROTA DO SETOR"
          : "PRIORIZAR APÓS OS URGENTES, RESPEITANDO A SEQUÊNCIA DO SETOR",
      ]);
    }
  }

  const head =
    ws.getRow(
      1
    );

  head.font = {
    name:
      FONTE,

    size:
      13,

    bold:
      true,

    color: {
      argb:
        "FFFFFFFF",
    },
  };

  head.fill = {
    type:
      "pattern",

    pattern:
      "solid",

    fgColor: {
      argb:
        COR.cabecalho,
    },
  };

  head.alignment = {
    vertical:
      "middle",

    horizontal:
      "center",

    wrapText:
      true,
  };

  head.height =
    32;

  for (
    let r =
      2;
    r <=
    ws.rowCount;
    r++
  ) {
    const row =
      ws.getRow(
        r
      );

    row.height =
      28;

    row.eachCell(
      (
        cell
      ) => {
        cell.font = {
          name:
            FONTE,

          size:
            12,

          bold:
            Number(
              (cell as unknown as { col?: number }).col || 0
            ) <= 2,
        };

        cell.alignment = {
          vertical:
            "middle",

          wrapText:
            true,
        };

        cell.border = {
          top:
            fino(
              COR.linha
            ),

          bottom:
            fino(
              COR.linha
            ),

          left:
            fino(
              COR.linha
            ),

          right:
            fino(
              COR.linha
            ),
        };
      }
    );
  }

  ws.views = [
    {
      state:
        "frozen",

      ySplit:
        1,

      showGridLines:
        false,
    },
  ];

  ws.pageSetup = {
    orientation:
      "landscape",

    fitToPage:
      true,

    fitToWidth:
      1,

    fitToHeight:
      0,
  };
}

function montarControle(
  ws: Worksheet,
  resumos:
    ResumoSetor[],
  produtos:
    Produto[]
) {
  const larguras = [
    32,
    16,
    16,
    16,
    14,
    14,
    14,
    14,
    14,
    14,
    14,
    14,
  ];

  larguras.forEach(
    (
      w,
      i
    ) =>
      (
        ws.getColumn(
          i +
            1
        ).width =
          w
      )
  );

  ws.mergeCells(
    1,
    1,
    1,
    12
  );

  const t =
    ws.getCell(
      1,
      1
    );

  t.value =
    "CONTROLE GERENCIAL  |  ANDAMENTO DA PRODUÇÃO";

  t.font = {
    name:
      FONTE,

    size:
      18,

    bold:
      true,

    color: {
      argb:
        "FFFFFFFF",
    },
  };

  t.fill = {
    type:
      "pattern",

    pattern:
      "solid",

    fgColor: {
      argb:
        COR.grafite,
    },
  };

  t.alignment = {
    vertical:
      "middle",

    indent:
      1,
  };

  ws.getRow(
    1
  ).height =
    38;

  const validos =
    produtos.filter(
      produtoEntraPCP
    );

  const pedidos =
    new Set(
      validos.map(
        (
          p
        ) =>
          p.pedido
      )
    ).size;

  const pecas =
    validos.reduce(
      (
        s,
        p
      ) =>
        s +
        p.quantidade,
      0
    );

  const vol =
    validos.reduce(
      (
        s,
        p
      ) => {
        const [
          c,
          l,
          e,
        ] =
          medidaDoItem(
            p
          );

        return (
          s +
          (
            m3(
              c,
              l,
              e,
              p.quantidade
            ) ??
            0
          )
        );
      },
      0
    );

  const kpis:
    [
      string,
      number |
        string,
      string?
    ][] = [
    [
      "Pedidos",
      pedidos,
    ],
    [
      "Linhas",
      validos.length,
    ],
    [
      "Peças",
      pecas,
    ],
    [
      "Volume m³",
      Math.round(
        vol *
          1000
      ) /
        1000,
      "#,##0.000",
    ],
  ];

  kpis.forEach(
    (
      [
        rot,
        val,
        fmt,
      ],
      k
    ) => {
      const col =
        1 +
        k *
          2;

      const a =
        ws.getCell(
          3,
          col
        );

      const b =
        ws.getCell(
          3,
          col +
            1
        );

      a.value =
        rot;

      a.font = {
        name:
          FONTE,

        size:
          11,

        bold:
          true,

        color: {
          argb:
            COR.suave,
        },
      };

      b.value =
        val;

      b.font = {
        name:
          FONTE,

        size:
          16,

        bold:
          true,

        color: {
          argb:
            COR.texto,
        },
      };

      if (
        fmt
      ) {
        b.numFmt =
          fmt;
      } else {
        b.numFmt =
          "#,##0";
      }

      for (
        const cell of [
          a,
          b,
        ]
      ) {
        cell.border = {
          bottom:
            fino(
              COR.grupo
            ),
        };
      }
    }
  );

  ws.getRow(
    3
  ).height =
    32;

  const cabecalho = (
    linha:
      number,
    titulos:
      string[],
    inicio =
      1
  ) => {
    titulos.forEach(
      (
        h,
        k
      ) => {
        const c =
          ws.getCell(
            linha,
            inicio +
              k
          );

        c.value =
          h;

        c.font = {
          name:
            FONTE,

          size:
            12,

          bold:
            true,

          color: {
            argb:
              "FFFFFFFF",
          },
        };

        c.fill = {
          type:
            "pattern",

          pattern:
            "solid",

          fgColor: {
            argb:
              COR.cabecalho,
          },
        };

        c.alignment = {
          horizontal:
            k ===
            0
              ? "left"
              : "center",

          vertical:
            "middle",

          indent:
            k ===
            0
              ? 1
              : 0,
        };
      }
    );

    ws.getRow(
      linha
    ).height =
      30;
  };

  const celula = (
    linha:
      number,
    col:
      number,
    valor:
      ExcelJS.CellValue,
    fmt?:
      string,
    bold =
      false,
    esq =
      false
  ) => {
    const c =
      ws.getCell(
        linha,
        col
      );

    c.value =
      valor;

    c.font = {
      name:
        FONTE,

      size:
        12,

      bold,

      color: {
        argb:
          COR.texto,
      },
    };

    c.alignment = {
      horizontal:
        esq
          ? "left"
          : "right",

      vertical:
        "middle",

      indent:
        esq
          ? 1
          : 0,
    };

    c.border = {
      top:
        fino(
          COR.linha
        ),

      bottom:
        fino(
          COR.linha
        ),

      left:
        fino(
          COR.linha
        ),

      right:
        fino(
          COR.linha
        ),
    };

    if (
      fmt
    ) {
      c.numFmt =
        fmt;
    }

    return c;
  };

  /**
   * ANDAMENTO POR SETOR
   */
  const L0 =
    5;

  cabecalho(
    L0,
    [
      "Setor",
      "Programado",
      "Produzido",
      "Saldo",
      "%",
      "m³",
      "mL",
      "Concluídos",
      "Parciais",
      "Não iniciados",
    ]
  );

  resumos.forEach(
    (
      r,
      k
    ) => {
      const row =
        L0 +
        1 +
        k;

      celula(
        row,
        1,
        r.aba,
        undefined,
        true,
        true
      );

      celula(
        row,
        2,
        r.qtd,
        "#,##0.###"
      );

      celula(
        row,
        3,
        r.prod,
        "#,##0.###"
      );

      celula(
        row,
        4,
        r.saldo,
        "#,##0.###"
      );

      celula(
        row,
        5,
        r.qtd >
          0
          ? r.prod /
            r.qtd
          : 0,
        "0%"
      );

      celula(
        row,
        6,
        r.m3,
        "#,##0.000"
      );

      celula(
        row,
        7,
        r.ml,
        "#,##0.000"
      );

      celula(
        row,
        8,
        r.concluidos,
        "0"
      );

      celula(
        row,
        9,
        r.parciais,
        "0"
      );

      celula(
        row,
        10,
        r.naoIniciados,
        "0"
      );

      ws.getRow(
        row
      ).height =
        26;
    }
  );

  /**
   * PROGRAMADO POR FAMÍLIA
   */
  const L1 =
    L0 +
    resumos.length +
    4;

  ws.mergeCells(
    L1 -
      1,
    1,
    L1 -
      1,
    Math.max(
      3,
      resumos.length +
        2
    )
  );

  const sub =
    ws.getCell(
      L1 -
        1,
      1
    );

  sub.value =
    "PROGRAMADO POR FAMÍLIA E SETOR";

  sub.font = {
    name:
      FONTE,

    size:
      13,

    bold:
      true,

    color: {
      argb:
        COR.texto,
    },
  };

  sub.border = {
    bottom: {
      style:
        "medium",

      color: {
        argb:
          COR.cabecalho,
      },
    },
  };

  const famOrdem =
    (
      Object.keys(
        FAMILIA_INFO
      ) as Familia[]
    ).filter(
      (
        f
      ) =>
        resumos.some(
          (
            r
          ) =>
            r.familias.includes(
              f
            )
        )
    );

  cabecalho(
    L1,
    [
      "Família",
      ...resumos.map(
        (
          r
        ) =>
          r.aba
      ),
      "Total",
    ]
  );

  famOrdem.forEach(
    (
      f,
      k
    ) => {
      const row =
        L1 +
        1 +
        k;

      celula(
        row,
        1,
        FAMILIA_INFO[
          f
        ].secao,
        undefined,
        true,
        true
      );

      resumos.forEach(
        (
          r,
          c
        ) => {
          celula(
            row,
            2 +
              c,
            r.porFamilia[
              f
            ] ??
              0,
            "#,##0.###"
          );
        }
      );

      const total =
        resumos.reduce(
          (
            a,
            r
          ) =>
            a +
            (
              r.porFamilia[
                f
              ] ??
              0
            ),
          0
        );

      celula(
        row,
        2 +
          resumos.length,
        total,
        "#,##0.###",
        true
      );
    }
  );

  for (
    let c =
      larguras.length +
      1;
    c <=
    resumos.length +
      2;
    c++
  ) {
    ws.getColumn(
      c
    ).width =
      15;
  }

  ws.pageSetup = {
    orientation:
      "landscape",

    paperSize:
      9,

    fitToPage:
      true,

    fitToWidth:
      1,

    fitToHeight:
      0,
  };
}

function montarLeiaMe(
  wb: Workbook
) {
  const ws =
    wb.addWorksheet(
      "LEIA-ME",
      {
        views: [
          {
            showGridLines:
              false,
          },
        ],
      }
    );

  ws.getColumn(
    1
  ).width =
    5;

  ws.getColumn(
    2
  ).width =
    110;

  ws.mergeCells(
    1,
    1,
    1,
    2
  );

  const t =
    ws.getCell(
      1,
      1
    );

  t.value =
    "PROGRAMAÇÃO DE PRODUÇÃO  |  COMO USAR";

  t.font = {
    name:
      FONTE,

    size:
      16,

    bold:
      true,

    color: {
      argb:
        "FFFFFFFF",
    },
  };

  t.fill = {
    type:
      "pattern",

    pattern:
      "solid",

    fgColor: {
      argb:
        COR.grafite,
    },
  };

  t.alignment = {
    vertical:
      "middle",

    indent:
      1,
  };

  ws.getRow(
    1
  ).height =
    34;

  const linhas = [
    "Cada aba traz somente os itens que passam pelo setor.",

    "Sequência: Portas, Batentes, Alizares, Baguetes, Kit de Correr / Suporte de Trilho e demais itens.",

    "Dentro de cada família os itens seguem SEMPRE a largura, da MAIOR para a MENOR.",

    "Em Batentes e Alizares, perna e travessa da mesma largura ficam em sequência.",

    "A coluna mL é calculada automaticamente por: SALDO × COMPRIMENTO em metros.",

    "Saldo é calculado automaticamente por: Qtd Programada - Qtd Produzida.",

    "As colunas para preenchimento operacional possuem fundo claro.",

    "Os apontamentos oficiais das OFs continuam sendo feitos no Consistem.",
  ];

  linhas.forEach(
    (
      txt,
      k
    ) => {
      const r =
        3 +
        k;

      const n =
        ws.getCell(
          r,
          1
        );

      n.value =
        k +
        1;

      n.font = {
        name:
          FONTE,

        size:
          12,

        bold:
          true,

        color: {
          argb:
            COR.suave,
        },
      };

      n.alignment = {
        horizontal:
          "center",

        vertical:
          "middle",
      };

      const c =
        ws.getCell(
          r,
          2
        );

      c.value =
        txt;

      c.font = {
        name:
          FONTE,

        size:
          12,

        color: {
          argb:
            COR.texto,
        },
      };

      c.alignment = {
        vertical:
          "middle",

        wrapText:
          true,
      };

      c.border = {
        bottom:
          fino(
            COR.linha
          ),
      };

      n.border = {
        bottom:
          fino(
            COR.linha
          ),
      };

      ws.getRow(
        r
      ).height =
        26;
    }
  );
}

export function montarPlanilha(
  ExcelLib: {
    Workbook:
      new () =>
        Workbook;
  },

  produtos:
    Produto[],

  opcoes:
    OpcoesPlanilha = {}
): Workbook {
  const wb =
    new ExcelLib.Workbook();

  wb.creator =
    "Sobral PCP";

  wb.created =
    new Date();

  const data =
    opcoes.data ||
    new Date().toLocaleDateString(
      "pt-BR",
      {
        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",
      }
    );

  wb.calcProperties = {
    fullCalcOnLoad:
      true,
  };

  const prioridades =
    wb.addWorksheet(
      "PRIORIDADES",
      {
        views: [
          {
            showGridLines:
              false,
          },
        ],
      }
    );

  montarPrioridades(
    prioridades,
    produtos
  );

  const controle =
    wb.addWorksheet(
      "CONTROLE GERENTE",
      {
        views: [
          {
            showGridLines:
              false,
          },
        ],
      }
    );

  const resumos:
    ResumoSetor[] = [];

  for (
    const [
      codigo,
      nome,
    ] of SETORES
  ) {
    if (
      opcoes.setores &&
      !opcoes.setores.includes(
        codigo
      )
    ) {
      continue;
    }

    const itens =
      itensDoSetor(
        produtos,
        codigo
      );

    if (
      !itens.length
    ) {
      continue;
    }

    resumos.push(
      montarAbaSetor(
        wb,
        nome,
        itens,
        data
      )
    );
  }

  montarControle(
    controle,
    resumos,
    produtos
  );

  montarLeiaMe(
    wb
  );

  return wb;
}

export async function baixarPlanilhaProducao(
  produtos:
    Produto[],

  opcoes:
    OpcoesPlanilha & {
      arquivo?: string;
    } = {}
) {
  const mod =
    await import(
      "exceljs"
    );

  const ExcelLib =
    (
      mod as unknown as {
        default?:
          typeof mod;
      }
    ).default ??
    mod;

  const wb =
    montarPlanilha(
      ExcelLib as unknown as {
        Workbook:
          new () =>
            Workbook;
      },

      produtos,

      opcoes
    );

  const buffer =
    await wb.xlsx.writeBuffer();

  const blob =
    new Blob(
      [
        buffer,
      ],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );

  const d =
    new Date();

  const z = (
    n: number
  ) =>
    String(
      n
    ).padStart(
      2,
      "0"
    );

  const carimbo =
    `${d.getFullYear()}-${z(
      d.getMonth() +
        1
    )}-${z(
      d.getDate()
    )}_${z(
      d.getHours()
    )}${z(
      d.getMinutes()
    )}`;

  const a =
    document.createElement(
      "a"
    );

  a.href =
    URL.createObjectURL(
      blob
    );

  a.download =
    `${
      opcoes.arquivo ||
      "Programacao_Producao"
    }_${carimbo}.xlsx`;

  document.body.appendChild(
    a
  );

  a.click();

  a.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        a.href
      ),
    2000
  );
}
