import {
  parse,
} from "csv-parse/sync";

import {
  compareProduto,
} from "@/lib/sort";

import {
  findImportKey,
  loadRobustTable,
  parseImportNumber,
} from "@/lib/import-reader";

import {
  categoriaIndustrial,
  ehFerragem,
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

const PROCESS_ALIAS:
  Record<string, string[]> = {
  PREPARACAO: [
    "PREPARACAO",
    "PREPARAÇÃO",
    "PREPARACAO 1",
    "PREPARAÇÃO 1",
  ],

  "USINAGEM-1": [
    "USINAGEM-1",
    "USINAGEM 1",
    "USINAGEM1",
  ],

  LIXAR: [
    "LIXAR",
    "LIXA",
    "LIXADEIRA",
  ],

  RECOBRIDORA: [
    "RECOBRIDORA",
    "RECOBRIDORA 1",
    "RECOBRIDORA1",
    "RECOBRIDORA-1",
  ],

  "RECOBRIDORA-2": [
    "RECOBRIDORA-2",
    "RECOBRIDORA 2",
    "RECOBRIDORA2",
  ],

  "USINAGEM-2": [
    "USINAGEM-2",
    "USINAGEM 2",
    "USINAGEM2",
  ],

  LUSTRACAO: [
    "LUSTRACAO",
    "LUSTRAÇÃO",
  ],

  TERCEIROS: [
    "TERCEIROS",
    "TERCEIRO",
  ],

  EMBALAGEM: [
    "EMBALAGEM",
    "EMBALAGEM 1",
  ],

  EXPEDICAO: [
    "EXPEDICAO",
    "EXPEDIÇÃO",
  ],
};

const FIELD_ALIAS:
  Record<string, string[]> = {
  Filtro: [
    "Filtro",
  ],

  Pedido: [
    "Pedido",
  ],

  Item: [
    "Item",
    "Nº Item",
    "N Item",
    "Numero Item",
    "Número Item",
  ],

  Produto: [
    "Produto",
    "Código Produto",
    "Codigo Produto",
  ],

  "Descrição": [
    "Descrição",
    "Descricao",
    "Descrição Produto",
    "Descricao Produto",
  ],

  Tipo: [
    "Tipo",
    "Material",
  ],

  Canal: [
    "Canal",
    "Canal Borracha",
    "Canal de Borracha",
  ],

  Rebaixo: [
    "Rebaixo",
    "Rebaixo/Usinagem",
  ],

  Acabamento: [
    "Acabamento",
  ],

  Cor: [
    "Cor",
  ],

  "Quantidade Pecas": [
    "Quantidade Pecas",
    "Quantidade Peças",
    "Qtd Pecas",
    "Qtd Peças",
    "Quantidade",
  ],

  "Pedido Cliente": [
    "Pedido Cliente",
    "Pedido do Cliente",
  ],

  "Status Engenharia": [
    "Status Engenharia",
    "Status da Engenharia",
  ],

  "OF's": [
    "OF's",
    "OF",
    "OFs",
    "OF'S",
    "Ordem Fabricação",
    "Ordem Fabricacao",
  ],

  "% Concluído Produto": [
    "% Concluído Produto",
    "% Concluido Produto",
    "% Produto",
  ],

  "Código Modelo": [
    "Código Modelo",
    "Codigo Modelo",
  ],

  "Descrição Modelo": [
    "Descrição Modelo",
    "Descricao Modelo",
  ],

  "Outras Características": [
    "Outras Características",
    "Outras Caracteristicas",
    "Características",
    "Caracteristicas",
  ],
};

const clean = (
  v: unknown
) =>
  String(
    v ??
      ""
  )
    .replace(
      /\u0000/g,
      ""
    )
    .replace(
      /[\r\n\t]+/g,
      " "
    )
    .replace(
      / {2,}/g,
      " "
    )
    .trim();

const headerKey = (
  v: unknown
) =>
  clean(v)
    .replace(
      /^\uFEFF/,
      ""
    )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[’‘´`]/g,
      "'"
    )
    .replace(
      /\s*[-_/]+\s*/g,
      " "
    )
    .replace(
      /[^A-Z0-9%']+/gi,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .toUpperCase();

function findKey(
  r: Record<string, string>,
  aliases: string[]
) {
  return findImportKey(r, aliases);
}

function field(
  r: Record<string, string>,
  nome: string
) {
  const aliases =
    FIELD_ALIAS[nome] ||
    [nome];

  const key =
    findKey(
      r,
      aliases
    );

  return key
    ? r[key]
    : "";
}

function cell(
  r: Record<string, string>,
  proc: string
) {
  const aliases =
    PROCESS_ALIAS[proc] ||
    [proc];

  const key =
    findKey(
      r,
      aliases
    );

  return key
    ? r[key]
    : "";
}

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
  return parseImportNumber(v) ?? 0;
}

const ROUTE_EMPTY =
  new Set([
    "N/A",
    "NA",
    "N.A.",
    "-",
    "—",
    "N/D",
    "ND",
    "SEM",
    "NAO",
    "NÃO",
  ]);

function isRouteValue(
  v: unknown
) {
  const value =
    up(v);

  return (
    !!value &&
    !ROUTE_EMPTY.has(
      value
    )
  );
}

function medida(
  ...valores: unknown[]
) {
  /*
   * Leitura de medida sem depender de uma única coluna.
   *
   * Formatos aceitos, entre outros:
   * 2110x130x30
   * 2110 X 130 X 30
   * 2110×130×30
   * 2110*130*30
   * 2110 / 130 / 30
   * 2110-130-30 (quando aparece isolado como dimensão)
   * 2110x130
   */
  const textos =
    valores
      .map(
        (
          v
        ) =>
          clean(v)
      )
      .filter(
        Boolean
      );

  const numero = (
    v: string
  ) => {
    const n =
      Number(
        v.replace(
          ",",
          "."
        )
      );

    if (
      !Number.isFinite(
        n
      )
    ) {
      return v;
    }

    return Number.isInteger(
      n
    )
      ? String(n)
      : String(n);
  };

  const montar = (
    partes: string[]
  ) =>
    partes
      .map(
        numero
      )
      .join(
        "x"
      );

  for (
    const original
    of textos
  ) {
    const d =
      original
        .normalize(
          "NFD"
        )
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .toUpperCase()
        .replace(
          /\b(MM|MILIMETROS?|MILIMETRO)\b/g,
          " "
        )
        .replace(
          /\s*[X×*]\s*/g,
          "X"
        );

    const triplaX =
      d.match(
        /(^|[^0-9])([0-9]{2,4}(?:[.,][0-9]+)?)X([0-9]{2,4}(?:[.,][0-9]+)?)X([0-9]{1,4}(?:[.,][0-9]+)?)(?=$|[^0-9])/
      );

    if (
      triplaX
    ) {
      return montar([
        triplaX[2],
        triplaX[3],
        triplaX[4],
      ]);
    }

    const triplaSeparada =
      d.match(
        /(?:^|\b)([0-9]{3,4})\s*[\/;]\s*([0-9]{2,4})\s*[\/;]\s*([0-9]{1,3})(?:\b|$)/
      );

    if (
      triplaSeparada
    ) {
      return montar([
        triplaSeparada[1],
        triplaSeparada[2],
        triplaSeparada[3],
      ]);
    }

    const duplaX =
      d.match(
        /(^|[^0-9])([0-9]{2,4}(?:[.,][0-9]+)?)X([0-9]{2,4}(?:[.,][0-9]+)?)(?=$|[^0-9X])/
      );

    if (
      duplaX
    ) {
      return montar([
        duplaX[2],
        duplaX[3],
      ]);
    }
  }

  return "";
}

function medidaLinha(
  r: Record<string, string>
) {
  const prioritarios = [
    field(
      r,
      "Descrição"
    ),
    field(
      r,
      "Descrição Modelo"
    ),
    field(
      r,
      "Outras Características"
    ),
    field(
      r,
      "Produto"
    ),
    field(
      r,
      "Tipo"
    ),
  ];

  const encontrada =
    medida(
      ...prioritarios
    );

  if (
    encontrada
  ) {
    return encontrada;
  }

  /*
   * Último recurso: procura em TODAS as colunas da linha.
   * A expressão de medida exige separadores dimensionais,
   * então não confunde Pedido/OF com medida.
   */
  return medida(
    ...Object.values(
      r
    )
  );
}

function material(
  r: any
) {
  const tipo =
    up(
      field(r, "Tipo")
    );

  const d =
    up(
      field(r, "Descrição")
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
      field(r, "Tipo")
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
      field(r, "Descrição")
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
  const aliases = {
    ...FIELD_ALIAS,
    ...PROCESS_ALIAS,
  };

  const loaded = await loadRobustTable(file, aliases, {
    forwardFillFields: ["Filtro", "Pedido"],
  });

  const rows = loaded.rows;

  if (!rows.length) {
    throw new Error("O arquivo não possui linhas de dados.");
  }

  const primeiro = rows[0] || {};
  const essential = ["Pedido", "Descrição", "Quantidade Pecas"];

  const missing = essential.filter(
    (nome) => !findKey(primeiro, FIELD_ALIAS[nome] || [nome])
  );

  if (missing.length) {
    throw new Error(
      `Não foi possível identificar as colunas essenciais: ${missing.join(", ")}. Cabeçalho detectado na linha ${loaded.headerRow}.`
    );
  }

  const valid = rows.filter((r) => {
    const pedido = clean(field(r, "Pedido"));
    const descricao = clean(field(r, "Descrição"));
    const quantidade = num(field(r, "Quantidade Pecas"));
    const of = clean(field(r, "OF's"));

    return !!pedido && !!descricao && (quantidade > 0 || !!of);
  });

  if (!valid.length) {
    throw new Error("Nenhuma linha produtiva válida encontrada após a leitura.");
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
        field(r, "Quantidade Pecas")
      );

    const base:
      Produto = {
      id,

      filtro:
        clean(field(r, "Filtro")),

      pedido:
        clean(field(r, "Pedido")),

      item:
        clean(
          field(r, "Item")
        ),

      produto:
        clean(
          field(r, "Produto")
        ),

      descricao:
        clean(field(r, "Descrição")),

      tipo:
        clean(
          field(r, "Tipo")
        ),

      canal:
        clean(
          field(r, "Canal")
        ),

      rebaixo:
        clean(
          field(r, "Rebaixo")
        ),

      acabamento:
        clean(
          field(r, "Acabamento")
        ) ||
        fallbackAcab(
          r
        ),

      cor:
        clean(
          field(r, "Cor")
        ),

      quantidade,

      pedidoCliente:
        clean(
          field(r, "Pedido Cliente")
        ),

      statusEngenharia:
        clean(
          field(r, "Status Engenharia")
        ),

      of:
        clean(
          field(r, "OF's")
        ),

      percentualProduto:
        num(
          field(r, "% Concluído Produto")
        ),

      codigoModelo:
        clean(
          field(r, "Código Modelo")
        ),

      descricaoModelo:
        clean(
          field(r, "Descrição Modelo")
        ),

      outrasCaracteristicas:
        clean(
          field(r, "Outras Características")
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
     * Ferragens não fazem parte deste PCP.
     * Ignora a linha por completo: não entra em telas, indicadores,
     * riscos, filas, planilhas ou relatórios.
     */
    if (ehFerragem(base)) {
      continue;
    }

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
