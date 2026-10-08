import {
  parse,
} from "csv-parse/sync";

import {
  compareProduto,
} from "@/lib/sort";

import {
  categoriaIndustrial,
  processoEmbalagemDoItem,
  processosOperacionaisDaFonte,
} from "@/lib/domain/industrial";

import {
  PROCESSOS,
  PROCESSOS_FONTE,
} from "@/lib/processos";

export {
  PROCESSOS,
  PROCESSOS_FONTE,
} from "@/lib/processos";

import type {
  ImportResult,
  Operacao,
  Produto,
  StatusOperacao,
} from "@/types/pcp";

const OPCIONAIS =
  new Set<string>([
    "RECOBRIDORA-2",
  ]);

const REQUIRED = [
  "Filtro",
  "Pedido",
  "Descrição",
  "Quantidade Pecas",
  "OF's",

  ...PROCESSOS_FONTE.filter(
    (
      x
    ) =>
      !OPCIONAIS.has(
        x
      )
  ),
];

const ALIAS:
  Record<
    string,
    string[]
  > = {
  "RECOBRIDORA-2": [
    "Recobridora 2",
    "RECOBRIDORA 2",
    "RECOBRIDORA2",
    "Recobridora-2",
  ],
};

function cell(
  r:
    Record<
      string,
      string
    >,

  proc:
    string
) {
  if (
    proc in r
  ) {
    return r[
      proc
    ];
  }

  for (
    const a of
    ALIAS[
      proc
    ] ||
    []
  ) {
    if (
      a in r
    ) {
      return r[
        a
      ];
    }
  }

  return "";
}

const clean = (
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

const up = (
  v: unknown
) =>
  clean(
    v
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toUpperCase();

function num(
  v: unknown
) {
  let s =
    clean(
      v
    );

  if (
    !s
  ) {
    return 0;
  }

  if (
    s.includes(
      ","
    ) &&
    s.includes(
      "."
    )
  ) {
    s =
      s
        .replace(
          /\./g,
          ""
        )
        .replace(
          ",",
          "."
        );
  } else if (
    s.includes(
      ","
    )
  ) {
    s =
      s.replace(
        ",",
        "."
      );
  }

  const n =
    Number(
      s
    );

  return Number.isFinite(
    n
  )
    ? n
    : 0;
}

function isRouteValue(
  v: unknown
) {
  const s =
    up(
      v
    );

  return (
    !!s &&
    !new Set(
      [
        "N/A",
        "NA",
        "N.A.",
        "-",
        "—",
        "N/D",
        "ND",
      ]
    ).has(
      s
    )
  );
}

function medida(
  ...valores: unknown[]
) {
  /*
   * A medida não aparece sempre na mesma coluna do Filtro.
   * Alguns itens trazem a dimensão em Descrição, outros em
   * Descrição Modelo ou Outras Características.
   *
   * Também aceitamos:
   * 2110x130x30
   * 2110 X 130 X 30
   * 2110×130×30
   * 2110*130*30
   * 2110x130
   */
  const textos =
    valores
      .map((v) => up(v))
      .filter(Boolean);

  const normalizarNumero = (v: string) => {
    const n =
      Number(
        v.replace(",", ".")
      );

    if (!Number.isFinite(n)) {
      return v;
    }

    return Number.isInteger(n)
      ? String(n)
      : String(n).replace(".", ",");
  };

  for (const texto of textos) {
    const d =
      texto
        .replace(/\bMM\b/g, " ")
        .replace(/\s*[X×*]\s*/g, "X");

    /*
     * Primeiro procura 3 dimensões.
     */
    const tripla =
      d.match(
        /(^|[^0-9])([0-9]{2,4}(?:[.,][0-9]+)?)X([0-9]{2,4}(?:[.,][0-9]+)?)X([0-9]{1,4}(?:[.,][0-9]+)?)(?=$|[^0-9])/
      );

    if (tripla) {
      return [
        normalizarNumero(tripla[2]),
        normalizarNumero(tripla[3]),
        normalizarNumero(tripla[4]),
      ].join("x");
    }

    /*
     * Depois aceita 2 dimensões.
     * Não inventamos espessura quando ela não existe no arquivo.
     */
    const dupla =
      d.match(
        /(^|[^0-9])([0-9]{2,4}(?:[.,][0-9]+)?)X([0-9]{2,4}(?:[.,][0-9]+)?)(?=$|[^0-9X])/
      );

    if (dupla) {
      return [
        normalizarNumero(dupla[2]),
        normalizarNumero(dupla[3]),
      ].join("x");
    }
  }

  return "";
}

function medidaLinha(
  r: Record<string, string>
) {
  return medida(
    r["Descrição"],
    r["Descrição Modelo"],
    r["Outras Características"],
    r["Produto"],
    r["Tipo"]
  );
}

function material(
  r: any
) {
  const tipo =
    up(
      r[
        "Tipo"
      ]
    );

  const d =
    up(
      r[
        "Descrição"
      ]
    );

  if (
    tipo.includes(
      "PINUS"
    )
  ) {
    return "PINUS";
  }

  if (
    tipo.includes(
      "ULTRA"
    )
  ) {
    return "MDF ULTRA";
  }

  if (
    tipo.includes(
      "STD"
    )
  ) {
    return "MDF STD";
  }

  if (
    tipo &&
    tipo !==
      "N/A"
  ) {
    return clean(
      r[
        "Tipo"
      ]
    );
  }

  if (
    d.includes(
      "ULTRA"
    )
  ) {
    return "MDF ULTRA";
  }

  if (
    d.includes(
      "PINUS"
    )
  ) {
    return "PINUS";
  }

  if (
    d.includes(
      "MDF"
    )
  ) {
    return "MDF";
  }

  if (
    d.includes(
      "HDF"
    )
  ) {
    return "HDF";
  }

  return "";
}

function fallbackAcab(
  r: any
) {
  const d =
    up(
      r[
        "Descrição"
      ]
    );

  if (
    d.includes(
      "PET"
    )
  ) {
    return "PET";
  }

  if (
    d.includes(
      "PVC"
    )
  ) {
    return "PVC";
  }

  if (
    d.includes(
      "ESMALTE"
    )
  ) {
    return "ESMALTE";
  }

  return "";
}

function status(
  pct: number,
  current:
    boolean
): StatusOperacao {
  if (
    pct >=
    100
  ) {
    return "CONCLUIDA";
  }

  if (
    !current
  ) {
    return "PENDENTE";
  }

  return pct >
    0
    ? "EM_ANDAMENTO"
    : "LIBERADA";
}

function sequence(
  produtos:
    Produto[]
) {
  for (
    const processo
    of PROCESSOS
  ) {
    const arr =
      produtos.flatMap(
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
      );

    arr.sort(
      (
        a,
        b
      ) =>
        compareProduto(
          a.p,
          b.p
        )
    );

    arr.forEach(
      (
        x,
        i
      ) =>
        (
          x.o.ordemFila =
            i +
            1
        )
    );
  }
}

/*
 * NÃO BLOQUEAR MAIS
 * FILTRO POR CONTAGENS
 * FIXAS ANTIGAS.
 */
function regression() {
  return {
    aplicavel:
      false,

    ok:
      true,

    erros:
      [] as string[],
  };
}

export async function parseFiltro(
  file: File
): Promise<ImportResult> {
  const text =
    new TextDecoder(
      "windows-1252"
    ).decode(
      new Uint8Array(
        await file.arrayBuffer()
      )
    );

  const rows =
    parse(
      text,
      {
        delimiter:
          ";",

        columns:
          true,

        skip_empty_lines:
          true,

        relax_column_count:
          true,

        bom:
          true,
      }
    ) as Record<
      string,
      string
    >[];

  if (
    !rows.length
  ) {
    throw new Error(
      "O CSV está vazio."
    );
  }

  const headers =
    Object.keys(
      rows[
        0
      ] ||
        {}
    );

  const missing =
    REQUIRED.filter(
      (
        x
      ) =>
        !headers.includes(
          x
        )
    );

  if (
    missing.length
  ) {
    throw new Error(
      `Colunas obrigatórias ausentes: ${missing.join(
        ", "
      )}`
    );
  }

  const valid =
    rows.filter(
      (
        r
      ) =>
        clean(
          r[
            "Filtro"
          ]
        ) &&
        clean(
          r[
            "Pedido"
          ]
        ) &&
        clean(
          r[
            "Descrição"
          ]
        )
    );

  if (
    !valid.length
  ) {
    throw new Error(
      "Nenhuma linha válida encontrada."
    );
  }

  let inconsistenciasRota =
    0;

  const produtos:
    Produto[] = [];

  for (
    const r
    of valid
  ) {
    const id =
      crypto.randomUUID();

    const quantidade =
      num(
        r[
          "Quantidade Pecas"
        ]
      );

    const base:
      Produto = {
      id,

      filtro:
        clean(
          r[
            "Filtro"
          ]
        ),

      pedido:
        clean(
          r[
            "Pedido"
          ]
        ),

      item:
        clean(
          r[
            "Item"
          ]
        ),

      produto:
        clean(
          r[
            "Produto"
          ]
        ),

      descricao:
        clean(
          r[
            "Descrição"
          ]
        ),

      tipo:
        clean(
          r[
            "Tipo"
          ]
        ),

      canal:
        clean(
          r[
            "Canal"
          ]
        ),

      rebaixo:
        clean(
          r[
            "Rebaixo"
          ]
        ),

      acabamento:
        clean(
          r[
            "Acabamento"
          ]
        ) ||
        fallbackAcab(
          r
        ),

      cor:
        clean(
          r[
            "Cor"
          ]
        ),

      quantidade,

      pedidoCliente:
        clean(
          r[
            "Pedido Cliente"
          ]
        ),

      statusEngenharia:
        clean(
          r[
            "Status Engenharia"
          ]
        ),

      of:
        clean(
          r[
            "OF's"
          ]
        ),

      percentualProduto:
        num(
          r[
            "% Concluído Produto"
          ]
        ),

      codigoModelo:
        clean(
          r[
            "Código Modelo"
          ]
        ),

      descricaoModelo:
        clean(
          r[
            "Descrição Modelo"
          ]
        ),

      outrasCaracteristicas:
        clean(
          r[
            "Outras Características"
          ]
        ),

      categoria:
        "",

      material:
        material(
          r
        ),

      medida:
        medidaLinha(
          r
        ),

      prioridade:
        "NORMAL",

      operacoes:
        [],
    };

    /*
     * CLASSIFICAÇÃO
     * CENTRALIZADA.
     */
    base.categoria =
      categoriaIndustrial(
        base
      );

    /*
     * PRIMEIRO:
     * LÊ A ROTA ORIGINAL.
     */
    const sourceRoute =
      PROCESSOS_FONTE
        .map(
          (
            processo,
            index
          ) => ({
            processo,
            index,

            raw:
              clean(
                cell(
                  r,
                  processo
                )
              ),

            percentual:
              Math.max(
                0,
                Math.min(
                  100,
                  num(
                    cell(
                      r,
                      processo
                    )
                  )
                )
              ),
          })
        )
        .filter(
          (
            x
          ) =>
            isRouteValue(
              x.raw
            )
        );

    /*
     * DEPOIS:
     * TRANSFORMA EM
     * SETORES REAIS.
     *
     * É AQUI QUE ALIZAR,
     * BAGUETE, KIT E SUPORTE
     * PARAM DE CAIR EM
     * USINAGENS ERRADAS.
     */
    const expanded =
      sourceRoute.flatMap(
        (
          x
        ) =>
          processosOperacionaisDaFonte(
            base,
            x.processo
          ).map(
            (
              processo
            ) => ({
              processo,

              sourceIndex:
                x.index,

              percentual:
                x.percentual,
            })
          )
      );

    /*
     * A embalagem é uma etapa estrutural do fluxo.
     *
     * Não dependemos exclusivamente da coluna EMBALAGEM do CSV,
     * porque alguns itens válidos chegam sem valor nessa coluna.
     * Assim:
     *
     * PORTA / BANDEIRA -> EMBALAGEM-PORTAS
     * BATENTE / ALIZAR / BAGUETE / KIT / SUPORTE -> EMBALAGEM-1
     *
     * Quando o CSV possui percentual de EMBALAGEM, preservamos
     * esse percentual. Caso contrário, a etapa entra como pendente.
     */
    const embalagemObrigatoria =
      processoEmbalagemDoItem(
        base,
        false
      );

    if (
      embalagemObrigatoria
    ) {
      const embalagemFonte =
        sourceRoute.find(
          (
            x
          ) =>
            x.processo ===
            "EMBALAGEM"
        );

      expanded.push({
        processo:
          embalagemObrigatoria,

        sourceIndex:
          PROCESSOS_FONTE.indexOf(
            "EMBALAGEM"
          ),

        percentual:
          embalagemFonte?.percentual ??
          0,
      });
    }

    /*
     * EVITA DUPLICAR UM
     * MESMO SETOR.
     *
     * Ex. item presente em
     * USINAGEM-1 e USINAGEM-2.
     */
    const merged =
      new Map<
        string,
        {
          processo:
            string;

          sourceIndex:
            number;

          percentual:
            number;
        }
      >();

    for (
      const x
      of expanded
    ) {
      const atual =
        merged.get(
          x.processo
        );

      if (
        !atual
      ) {
        merged.set(
          x.processo,
          {
            ...x,
          }
        );

        continue;
      }

      atual.percentual =
        Math.max(
          atual.percentual,
          x.percentual
        );

      atual.sourceIndex =
        Math.min(
          atual.sourceIndex,
          x.sourceIndex
        );
    }

    const route =
      [
        ...merged.values(),
      ].sort(
        (
          a,
          b
        ) => {
          const ai =
            (
              PROCESSOS as readonly string[]
            ).indexOf(
              a.processo
            );

          const bi =
            (
              PROCESSOS as readonly string[]
            ).indexOf(
              b.processo
            );

          return (
            ai -
              bi ||
            a.sourceIndex -
              b.sourceIndex
          );
        }
      );

    const currentIndex =
      route.findIndex(
        (
          x
        ) =>
          x.percentual <
          100
      );

    if (
      currentIndex >=
      0
    ) {
      for (
        let i =
          currentIndex +
          1;

        i <
        route.length;

        i++
      ) {
        if (
          route[
            i
          ].percentual >
            0 &&
          route[
            i
          ].percentual <
            100
        ) {
          inconsistenciasRota++;
        }
      }
    }

    const ops:
      Operacao[] =
      route.map(
        (
          x,
          i
        ) => ({
          id:
            crypto.randomUUID(),

          produtoId:
            id,

          processo:
            x.processo,

          sequencia:
            (
              PROCESSOS as readonly string[]
            ).indexOf(
              x.processo
            ) +
            1,

          percentual:
            x.percentual,

          status:
            status(
              x.percentual,
              i ===
                currentIndex
            ),

          ordemFila:
            0,

          quantidadePlanejada:
            quantidade,

          quantidadeProduzida:
            x.percentual >=
            100
              ? quantidade
              : 0,

          quantidadeRefugo:
            0,

          fixada:
            false,
        })
      );

    base.operacoes =
      ops;

    produtos.push(
      base
    );
  }

  sequence(
    produtos
  );

  const filtro =
    [
      ...new Set(
        produtos.map(
          (
            p
          ) =>
            p.filtro
        )
      ),
    ].join(
      ", "
    );

  const processos =
    Object.fromEntries(
      PROCESSOS.map(
        (
          p
        ) => [
          p,

          produtos.reduce(
            (
              s,
              x
            ) =>
              s +
              x.operacoes.filter(
                (
                  o
                ) =>
                  o.processo ===
                  p
              ).length,

            0
          ),
        ]
      )
    );

  const base = {
    filtro,

    pedidos:
      new Set(
        produtos.map(
          (
            p
          ) =>
            p.pedido
        )
      ).size,

    ofs:
      new Set(
        produtos
          .map(
            (
              p
            ) =>
              p.of
          )
          .filter(
            Boolean
          )
      ).size,

    linhas:
      produtos.length,

    pecas:
      produtos.reduce(
        (
          s,
          p
        ) =>
          s +
          p.quantidade,

        0
      ),

    operacoes:
      produtos.reduce(
        (
          s,
          p
        ) =>
          s +
          p.operacoes.length,

        0
      ),

    semRota:
      produtos.filter(
        (
          p
        ) =>
          !p.operacoes.length
      ).length,

    inconsistenciasRota,

    processos,

    produtos,
  };

  return {
    ...base,

    regressao:
      regression(),
  };
}
