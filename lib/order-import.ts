import { getDocument } from "pdfjs-serverless";
import {
  cleanImportText,
  findImportKey,
  loadRobustTables,
  parseImportNumber,
} from "@/lib/import-reader";

import type {
  ImportResult,
  Operacao,
  Produto,
} from "@/types/pcp";

import {
  PROCESSOS,
} from "@/lib/processos";

import {
  categoriaIndustrial,
  ehFerragem,
  familiaIndustrial,
  processoEmbalagemDoItem,
  processosUsinagemDoItem,
  tipoPeca,
} from "@/lib/domain/industrial";

const clean = (
  v: unknown
) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();

const up = (
  v: unknown
) =>
  clean(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

function measure(
  t: string
) {
  const d = up(t)
    .replace(/\b(MM|MILIMETROS?|MILIMETRO)\b/g, " ")
    .replace(/\s*[X×*]\s*/g, "X");

  const triple = d.match(
    /(^|[^0-9])(\d{2,4}(?:[.,]\d+)?)X(\d{2,4}(?:[.,]\d+)?)X(\d{1,4}(?:[.,]\d+)?)(?=$|[^0-9])/
  );
  if (triple) {
    return [triple[2], triple[3], triple[4]]
      .map((v) => String(Number(v.replace(",", "."))))
      .join("x");
  }

  const separated = d.match(
    /(?:^|\b)(\d{3,4})\s*[\/;-]\s*(\d{2,4})\s*[\/;-]\s*(\d{1,3})(?:\b|$)/
  );
  if (separated) return `${separated[1]}x${separated[2]}x${separated[3]}`;

  const pair = d.match(
    /(^|[^0-9])(\d{2,4}(?:[.,]\d+)?)X(\d{2,4}(?:[.,]\d+)?)(?=$|[^0-9X])/
  );
  if (pair) {
    return [pair[2], pair[3]]
      .map((v) => String(Number(v.replace(",", "."))))
      .join("x");
  }

  return "";
}

function category(
  descricao: string
) {
  return categoriaIndustrial({
    descricao,
  });
}

function route(
  categoria: string,
  descricao: string
) {
  const item = {
    categoria,
    descricao,
  };

  const familia =
    familiaIndustrial(item);

  const processos:
    string[] = [];

  /*
   * PROCESSOS ANTERIORES À USINAGEM
   */
  if (
    familia === "BATENTES"
  ) {
    processos.push(
      "PREPARACAO",
      "RECOBRIDORA"
    );
  } else if (
    familia === "ALIZARES"
  ) {
    processos.push(
      "LIXAR",
      "RECOBRIDORA-2"
    );
  } else if (
    familia === "BAGUETE"
  ) {
    processos.push(
      "PREPARACAO",
      "RECOBRIDORA-2"
    );
  } else if (
    familia === "KIT CORRER"
  ) {
    processos.push(
      "RECOBRIDORA-2"
    );
  }

  /*
   * DISTRIBUIÇÃO DAS USINAGENS
   *
   * PORTA -> USINAGEM DE PORTAS
   * BATENTE TRAVESSA -> USINAGEM DE TRAVESSAS
   * BATENTE PERNA -> CONTRATESTA + DOBRADIÇAS
   * + TUPIA quando houver canal.
   *
   * ALIZAR / BAGUETE / KIT / SUPORTE / BANDEIRA
   * não entram nessas usinagens.
   */
  processos.push(
    ...processosUsinagemDoItem(
      item
    )
  );

  /*
   * EMBALAGEM FINAL
   */
  const embalagem =
    processoEmbalagemDoItem(
      item,
      false
    );

  if (embalagem) {
    processos.push(
      embalagem
    );
  }

  /*
   * Remove duplicidades e mantém
   * a ordem oficial do PCP.
   */
  return [
    ...new Set(
      processos
    ),
  ].sort(
    (
      a,
      b
    ) =>
      PROCESSOS.indexOf(a) -
      PROCESSOS.indexOf(b)
  );
}

type Raw = {
  item: string;
  codigo: string;
  descricao: string;
  quantidade: number;
};

async function parsePdf(
  file: File
) {
  const document =
    await getDocument({
      data:
        new Uint8Array(
          await file.arrayBuffer()
        ),

      useSystemFonts:
        true,
    }).promise;

  const raws:
    Raw[] = [];

  const texts:
    string[] = [];

  for (
    let n = 1;
    n <= document.numPages;
    n++
  ) {
    const page =
      await document.getPage(
        n
      );

    const content =
      await page.getTextContent();

    const items =
      (
        content.items as any[]
      )
        .map(
          (
            i
          ) => ({
            text:
              clean(
                i.str
              ),

            x:
              Number(
                i.transform?.[
                  4
                ] ||
                  0
              ),

            y:
              Number(
                i.transform?.[
                  5
                ] ||
                  0
              ),
          })
        )
        .filter(
          (
            i
          ) =>
            i.text
        );

    texts.push(
      items
        .map(
          (
            i
          ) =>
            i.text
        )
        .join(" ")
    );

    const rows:
      any[] = [];

    for (
      const i
      of items
    ) {
      let row =
        rows.find(
          (
            r
          ) =>
            Math.abs(
              r.y -
                i.y
            ) <=
            1.8
        );

      if (
        !row
      ) {
        row = {
          y:
            i.y,

          parts:
            [],
        };

        rows.push(
          row
        );
      }

      row.parts.push(
        i
      );
    }

    rows.sort(
      (
        a,
        b
      ) =>
        b.y -
        a.y
    );

    rows.forEach(
      (
        r
      ) =>
        r.parts.sort(
          (
            a: any,
            b: any
          ) =>
            a.x -
            b.x
        )
    );

    const header =
      rows.find(
        (
          r
        ) => {
          const t =
            up(
              r.parts
                .map(
                  (
                    p: any
                  ) =>
                    p.text
                )
                .join(" ")
            );

          return (
            t.includes(
              "ITEM"
            ) &&
            t.includes(
              "CODIGO"
            ) &&
            t.includes(
              "DESCRICAO"
            ) &&
            t.includes(
              "QUANTIDADE"
            )
          );
        }
      );

    if (
      !header
    ) {
      continue;
    }

    const find = (
      s: string,
      fb: number
    ) =>
      header.parts.find(
        (
          p: any
        ) =>
          up(
            p.text
          ) ===
          s
      )?.x ??
      fb;

    const descX =
      find(
        "DESCRICAO",
        125
      );

    const unitX =
      find(
        "UN",
        344
      );

    const qtyX =
      find(
        "QUANTIDADE",
        365
      );

    const anchors:
      any[] = [];

    for (
      const r
      of rows
    ) {
      const left =
        clean(
          r.parts
            .filter(
              (
                p: any
              ) =>
                p.x <
                descX -
                  4
            )
            .map(
              (
                p: any
              ) =>
                p.text
            )
            .join(" ")
        );

      const id =
        left.match(
          /^(\d+(?:\.\d+)?)\s+([A-Z0-9.-]{4,})\b/i
        );

      if (
        !id
      ) {
        continue;
      }

      const un =
        r.parts
          .filter(
            (
              p: any
            ) =>
              p.x >=
                unitX -
                  12 &&
              p.x <
                qtyX -
                  2
          )
          .map(
            (
              p: any
            ) =>
              up(
                p.text
              )
          )
          .find(
            (
              v: string
            ) =>
              /^(CJ|UN|PC|PCS|JG)$/.test(
                v
              )
          );

      const q =
        r.parts
          .filter(
            (
              p: any
            ) =>
              p.x >=
                qtyX -
                  7 &&
              p.x <
                qtyX +
                  72
          )
          .map(
            (
              p: any
            ) =>
              p.text
          )
          .find(
            (
              v: string
            ) =>
              parseImportNumber(v) !== null
          );

      if (
        un &&
        q
      ) {
        anchors.push({
          r,

          item:
            id[1],

          codigo:
            id[2],

          q:
            parseImportNumber(q) ?? 0,
        });
      }
    }

    for (
      let i = 0;
      i <
      anchors.length;
      i++
    ) {
      const a =
        anchors[i];

      const prev =
        anchors[
          i -
            1
        ]?.r.y;

      const next =
        anchors[
          i +
            1
        ]?.r.y;

      const maxY =
        prev !==
        undefined
          ? (
              prev +
              a.r.y
            ) /
            2
          : a.r.y +
            48;

      const minY =
        next !==
        undefined
          ? (
              a.r.y +
              next
            ) /
            2
          : a.r.y -
            48;

      const desc =
        clean(
          rows
            .filter(
              (
                r
              ) =>
                r.y <=
                  maxY &&
                r.y >
                  minY
            )
            .flatMap(
              (
                r
              ) =>
                r.parts
                  .filter(
                    (
                      p: any
                    ) =>
                      p.x >=
                        descX -
                          6 &&
                      p.x <
                        unitX -
                          4
                  )
                  .map(
                    (
                      p: any
                    ) =>
                      p.text
                  )
            )
            .join(" ")
        );

      if (
        desc
      ) {
        raws.push({
          item:
            a.item,

          codigo:
            a.codigo,

          descricao:
            desc,

          quantidade:
            a.q,
        });
      }
    }
  }

  const all =
    texts.join(
      "\n"
    );

  const pedido =
    clean(
      all.match(
        /Pedido:\s*(\d+)/i
      )?.[1] ||
        ""
    );

  const parents =
    new Set(
      raws
        .filter(
          (
            r
          ) =>
            raws.some(
              (
                x
              ) =>
                x.item.startsWith(
                  r.item +
                    "."
                )
            )
        )
        .map(
          (
            r
          ) =>
            r.item
        )
    );

  return {
    pedido,

    raws:
      raws.filter(
        (
          r
        ) =>
          !parents.has(
            r.item
          )
      ),
  };
}

type UsinagemRow = {
  of: string;
  pedido: string;
  item: string;
  codigo: string;
  descricao: string;
  quantidade: number | null;
  sheetName: string;
};

const USINAGEM_ALIASES: Record<string, string[]> = {
  OF: ["OF", "OF's", "OFs", "Ordem Fabricação", "Ordem de Fabricação", "Ordem Fabricacao", "Nº OF", "Numero OF"],
  Pedido: ["Pedido", "Nº Pedido", "Numero Pedido", "Pedido Venda", "Pedido de Venda", "Ped"],
  Item: ["Item", "Nº Item", "Numero Item", "Item Pedido", "Seq Item"],
  Codigo: ["Código", "Codigo", "Produto", "Código Produto", "Codigo Produto", "Cod Produto"],
  Descricao: ["Descrição", "Descricao", "Descrição Produto", "Descricao Produto", "Produto / Descrição"],
  Quantidade: ["Quantidade", "Qtd", "Qtde", "Quantidade Peças", "Quantidade Pecas", "Qtd Peças", "Qtd Pecas"],
};

async function readUsinagem(
  file: File
): Promise<UsinagemRow[]> {
  const tables = await loadRobustTables(file, USINAGEM_ALIASES, {
    forwardFillFields: ["Pedido"],
  });

  const rows: UsinagemRow[] = [];

  for (const table of tables) {
    for (const r of table.rows) {
      const get = (name: keyof typeof USINAGEM_ALIASES) => {
        const key = findImportKey(r, USINAGEM_ALIASES[name]);
        return key ? cleanImportText(r[key]) : "";
      };

      const of = get("OF");
      const descricao = get("Descricao");
      const codigo = get("Codigo");
      const item = get("Item");
      const pedido = get("Pedido");
      const quantidade = parseImportNumber(get("Quantidade"));

      if (!of && !descricao && !codigo) continue;

      rows.push({
        of,
        pedido,
        item,
        codigo,
        descricao,
        quantidade,
        sheetName: table.sheetName,
      });
    }
  }

  return rows;
}

function normalizedCode(value: unknown) {
  return clean(value).replace(/\.0+$/, "").replace(/\s+/g, "");
}

function descriptionTokens(value: unknown) {
  return new Set(
    up(value)
      .replace(/[^A-Z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length >= 3)
  );
}

function descriptionSimilarity(a: unknown, b: unknown) {
  const aa = descriptionTokens(a);
  const bb = descriptionTokens(b);
  if (!aa.size || !bb.size) return 0;
  const common = [...aa].filter((token) => bb.has(token)).length;
  return common / Math.max(aa.size, bb.size);
}

function matchUsinagem(raw: Raw, pedido: string, candidates: UsinagemRow[]) {
  let best: UsinagemRow | undefined;
  let bestScore = 0;

  for (const row of candidates) {
    let score = 0;

    if (row.pedido && pedido && normalizedCode(row.pedido) === normalizedCode(pedido)) score += 2;
    if (row.codigo && normalizedCode(row.codigo) === normalizedCode(raw.codigo)) score += 7;
    if (row.item && normalizedCode(row.item) === normalizedCode(raw.item)) score += 5;

    const aMeasure = measure(raw.descricao);
    const bMeasure = measure(row.descricao);
    if (aMeasure && bMeasure && aMeasure === bMeasure) score += 4;

    const similarity = descriptionSimilarity(raw.descricao, row.descricao);
    if (similarity >= 0.8) score += 4;
    else if (similarity >= 0.55) score += 2;

    if (
      row.quantidade != null &&
      raw.quantidade > 0 &&
      Math.abs(row.quantidade - raw.quantidade) < 0.0001
    ) {
      score += 1;
    }

    if (row.of) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return bestScore >= 5 ? best : undefined;
}

export async function parsePedidoUsinagem(
  pedidoFile: File,
  usinagemFile: File
): Promise<ImportResult> {
  const [
    {
      pedido,
      raws,
    },
    usinagem,
  ] =
    await Promise.all([
      parsePdf(
        pedidoFile
      ),

      readUsinagem(
        usinagemFile
      ),
    ]);

  const produtos:
    Produto[] =
    raws
      .filter((r) => !ehFerragem({ descricao: r.descricao }))
      .map(
      (
        r
      ) => {
        const id =
          crypto.randomUUID();

        const cat =
          category(
            r.descricao
          );

        const routeNames =
          route(
            cat,
            r.descricao
          );

        const medidaPedido =
          measure(
            r.descricao
          );

        const matched =
          matchUsinagem(
            r,
            pedido,
            usinagem
          );

        const ops:
          Operacao[] =
          routeNames.map(
            (
              processo,
              i
            ) => {
              const seq =
                (
                  PROCESSOS as readonly string[]
                ).indexOf(
                  processo
                );

              return {
                id:
                  crypto.randomUUID(),

                produtoId:
                  id,

                processo,

                sequencia:
                  seq >=
                  0
                    ? seq +
                      1
                    : i +
                      1,

                percentual:
                  0,

                status:
                  i ===
                  0
                    ? "LIBERADA"
                    : "PENDENTE",

                ordemFila:
                  i +
                  1,

                quantidadePlanejada:
                  r.quantidade,

                quantidadeProduzida:
                  0,

                quantidadeRefugo:
                  0,

                fixada:
                  false,
              };
            }
          );

        return {
          id,

          filtro:
            "PEDIDO",

          pedido,

          item:
            r.item,

          produto:
            r.codigo,

          descricao:
            r.descricao,

          tipo:
            "",

          canal:
            "",

          rebaixo:
            "",

          acabamento:
            "",

          cor:
            "",

          quantidade:
            r.quantidade,

          pedidoCliente:
            "",

          statusEngenharia:
            "",

          of:
            matched?.of ||
            "",

          percentualProduto:
            0,

          codigoModelo:
            "",

          descricaoModelo:
            "",

          outrasCaracteristicas:
            "",

          categoria:
            cat,

          material:
            "",

          medida:
            medidaPedido,

          prioridade:
            "NORMAL",

          operacoes:
            ops,
        };
      }
    );

  return {
    filtro:
      "PEDIDO",

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

    inconsistenciasRota:
      0,

    processos:
      Object.fromEntries(
        (
          PROCESSOS as readonly string[]
        ).map(
          (
            proc
          ) => [
            proc,

            produtos.reduce(
              (
                sum,
                p
              ) =>
                sum +
                p.operacoes.filter(
                  (
                    o
                  ) =>
                    o.processo ===
                    proc
                ).length,
              0
            ),
          ]
        )
      ),

    regressao: {
      aplicavel:
        false,

      ok:
        true,

      erros:
        [],
    },

    produtos,
  };
}
