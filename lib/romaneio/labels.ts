import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  LabelStyle,
  PackageData,
  PackageRow,
  ProcessingResult,
} from "./types";

import { rowVolume } from "./logistics";
import { compactItemIds } from "./domain";

const fmtM3 = (value?: number) =>
  Number(value || 0);

const clean = (value?: string) =>
  (value || "")
    .replace(/\s+/g, " ")
    .trim();

function argb(
  value?: string,
  fallback = "FF000000",
) {
  const hex = (value || "")
    .replace("#", "")
    .trim()
    .toUpperCase();

  return /^[0-9A-F]{6}$/.test(hex)
    ? `FF${hex}`
    : fallback;
}

function rowsFor(
  pkg: PackageData,
  data: ProcessingResult,
) {
  const base =
    pkg.label?.rows?.length
      ? pkg.label.rows
      : pkg.rows;

  const extras: PackageRow[] = (
    data.config?.additionalItems || []
  )
    .filter(
      (item) =>
        item.enabled &&
        item.mode === "LINHA" &&
        item.target === "ETIQUETA",
    )
    .map((item) => ({
      id: `LABEL-ADD-${item.id}`,

      games:
        item.games || undefined,

      quantity:
        item.quantity || 1,

      lengthMm:
        item.lengthMm || undefined,

      widthMm:
        item.widthMm || undefined,

      thicknessMm:
        item.thicknessMm ||
        undefined,

      product:
        item.product ||
        item.label ||
        item.text,

      observation:
        item.observation ||
        item.text,

      category: "OUTRO",

      role: "OUTRO",

      manual: true,
    }));

  return [...base, ...extras];
}

function observation(
  row: PackageRow,
) {
  const source =
    row.sourceItems?.length
      ? `${
          row.sourceItems.length === 1
            ? "Item"
            : "Itens"
        } ${compactItemIds(
          row.sourceItems,
        )}`
      : clean(row.itemText);

  const custom =
    clean(row.observation);

  if (
    source &&
    custom &&
    source.toUpperCase() !==
      custom.toUpperCase()
  ) {
    return `${source} | ${custom}`;
  }

  return source || custom;
}

function mergeStyle(
  global?: LabelStyle,
  local?: LabelStyle,
): LabelStyle {
  return {
    ...(global || {}),
    ...(local || {}),
  };
}

function applyBorder(
  cell: ExcelJS.Cell,
  style:
    | "thin"
    | "medium" = "thin",
) {
  cell.border = {
    top: {
      style,
      color: {
        argb: "FF000000",
      },
    },

    left: {
      style,
      color: {
        argb: "FF000000",
      },
    },

    bottom: {
      style,
      color: {
        argb: "FF000000",
      },
    },

    right: {
      style,
      color: {
        argb: "FF000000",
      },
    },
  };
}

function applyGrid(
  ws: ExcelJS.Worksheet,
  range: string,
) {
  const [
    startAddress,
    endAddress,
  ] = range.split(":");

  if (
    !startAddress ||
    !endAddress
  ) {
    return;
  }

  const parseAddress = (
    address: string,
  ) => {
    const match =
      /^([A-Z]+)(\d+)$/i.exec(
        address.trim(),
      );

    if (!match) {
      throw new Error(
        `Intervalo Excel inválido: ${address}`,
      );
    }

    const letters =
      match[1].toUpperCase();

    const row =
      Number(match[2]);

    let col = 0;

    for (
      let i = 0;
      i < letters.length;
      i++
    ) {
      col =
        col * 26 +
        (letters.charCodeAt(i) -
          64);
    }

    return {
      row,
      col,
    };
  };

  const start =
    parseAddress(startAddress);

  const end =
    parseAddress(endAddress);

  for (
    let row = start.row;
    row <= end.row;
    row++
  ) {
    for (
      let col = start.col;
      col <= end.col;
      col++
    ) {
      applyBorder(
        ws.getCell(row, col),
      );
    }
  }
}

function prepareColumns(
  ws: ExcelJS.Worksheet,
  style: LabelStyle,
) {
  const productWidth =
    Math.min(
      55,
      Math.max(
        24,
        style.productColumnWidth ||
          38,
      ),
    );

  const observationWidth =
    Math.min(
      45,
      Math.max(
        16,
        style.observationColumnWidth ||
          24,
      ),
    );

  const widths = [
    10,
    8,
    10,
    11,
    9,
    9,
    10,
    productWidth,
    observationWidth,
  ];

  widths.forEach(
    (width, index) => {
      ws.getColumn(
        index + 1,
      ).width = width;
    },
  );
}

function setMerged(
  ws: ExcelJS.Worksheet,
  range: string,
  value: string,
  options?: {
    bold?: boolean;
    size?: number;
    align?:
      | "left"
      | "center"
      | "right";
    fill?: string;
    color?: string;
    font?: string;
  },
) {
  ws.mergeCells(range);

  const firstCell =
    range.split(":")[0];

  if (!firstCell) {
    return;
  }

  const cell =
    ws.getCell(firstCell);

  cell.value = value;

  cell.font = {
    name:
      options?.font ||
      "Arial",

    size:
      options?.size ||
      10,

    bold:
      options?.bold,

    color: {
      argb: argb(
        options?.color,
      ),
    },
  };

  if (options?.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",

      fgColor: {
        argb: argb(
          options.fill,
          "FFFFFFFF",
        ),
      },
    };
  }

  cell.alignment = {
    horizontal:
      options?.align ||
      "left",

    vertical: "middle",

    wrapText: true,
  };
}

function writeLabelSheet(
  workbook: ExcelJS.Workbook,
  data: ProcessingResult,
  pkg: PackageData,
  index: number,
  assets?: {
    logoId?: number;
    flagId?: number;
  },
) {
  const ws =
    workbook.addWorksheet(
      `Etiqueta ${String(
        index + 1,
      ).padStart(2, "0")}`,
      {
        pageSetup: {
          orientation:
            "landscape",

          fitToPage: true,

          fitToWidth: 1,

          fitToHeight: 1,

          margins: {
            left: 0.15,
            right: 0.15,
            top: 0.15,
            bottom: 0.15,
            header: 0,
            footer: 0,
          },
        },
      },
    );

  const style =
    mergeStyle(
      data.labelStyle,
      pkg.label?.style,
    );

  const fontName =
    style.fontName ||
    "Arial";

  const baseSize =
    Math.min(
      14,
      Math.max(
        7,
        style.baseFontSize ||
          9,
      ),
    );

  const titleSize =
    Math.min(
      20,
      Math.max(
        10,
        style.titleFontSize ||
          15,
      ),
    );

  const headerFill =
    style.headerFillColor ||
    "#E6E6E6";

  const headerText =
    style.headerTextColor ||
    "#000000";

  const textColor =
    style.textColor ||
    "#000000";

  const productColor =
    style.productTextColor ||
    textColor;

  const obsColor =
    style.observationTextColor ||
    textColor;

  const rowHeight =
    Math.min(
      80,
      Math.max(
        18,
        style.rowHeight ||
          24,
      ),
    );

  prepareColumns(
    ws,
    style,
  );

  setMerged(
    ws,
    "A1:C2",
    "",
    {
      bold: true,
      size: titleSize,
      align: "center",
      font: fontName,
    },
  );

  if (
    assets?.logoId !==
    undefined
  ) {
    ws.addImage(
      assets.logoId,
      {
        tl: {
          col: 0.08,
          row: 0.08,
        },

        ext: {
          width: 230,
          height: 57,
        },
      },
    );
  } else {
    setMerged(
      ws,
      "A1:C2",
      "FAMOSSUL",
      {
        bold: true,
        size: titleSize,
        align: "center",
        font: fontName,
      },
    );
  }

  setMerged(
    ws,
    "D1:I2",
    "Rua A - Quadra 04 - Lote 29 a 34, 34 - Distrito Industrial, Estância/SE\n(79)3522-1228 · www.famossul.com.br\nPRODUZIDO NO BRASIL",
    {
      size:
        Math.max(
          6,
          baseSize - 1,
        ),

      align: "center",

      font: fontName,
    },
  );

  if (
    assets?.flagId !==
    undefined
  ) {
    ws.addImage(
      assets.flagId,
      {
        tl: {
          col: 8.1,
          row: 0.85,
        },

        ext: {
          width: 45,
          height: 31,
        },
      },
    );
  }

  ws.getRow(1).height =
    24;

  ws.getRow(2).height =
    24;

  const order =
    clean(
      pkg.label?.orderNumber ??
        data.orderNumber,
    );

  const client =
    clean(
      pkg.label?.client ??
        data.client,
    );

  const destination =
    clean(
      pkg.label
        ?.destination ??
        data.destination,
    );

  const packageNumber =
    clean(
      pkg.label
        ?.packageNumber ??
        String(pkg.number),
    );

  const enabledPackages =
    data.packages.filter(
      (item) =>
        item.label?.enabled !==
        false,
    );

  const totalPackages =
    clean(
      pkg.label
        ?.totalPackages ??
        String(
          enabledPackages.length,
        ),
    );

  setMerged(
    ws,
    "A3:C3",
    `Pedido: ${order}`,
    {
      bold: true,
      size:
        baseSize + 1,
      font: fontName,
    },
  );

  setMerged(
    ws,
    "D3:I3",
    `Cliente: ${
      client || "-"
    }`,
    {
      bold: true,
      size: baseSize,
      font: fontName,
    },
  );

  setMerged(
    ws,
    "A4:F4",
    `Destino: ${
      destination || "-"
    }`,
    {
      bold: true,
      size:
        baseSize + 1,
      font: fontName,
    },
  );

  setMerged(
    ws,
    "G4:I4",
    `Pallet ${packageNumber} DE ${totalPackages}`,
    {
      bold: true,
      size:
        baseSize + 3,
      align: "center",
      font: fontName,
    },
  );

  [3, 4].forEach(
    (row) => {
      ws.getRow(
        row,
      ).height = 23;
    },
  );

  const headers = [
    "Pacote nº",
    "Jgs.",
    "Qtde Pçs",
    "Comp.",
    "Larg.",
    "Esp.",
    "m³",
    "Produto",
    "OBS.",
  ];

  headers.forEach(
    (header, col) => {
      const cell =
        ws.getCell(
          5,
          col + 1,
        );

      cell.value =
        header;

      cell.font = {
        name: fontName,

        size: baseSize,

        bold: true,

        color: {
          argb: argb(
            headerText,
          ),
        },
      };

      cell.fill = {
        type: "pattern",

        pattern:
          "solid",

        fgColor: {
          argb: argb(
            headerFill,
            "FFE6E6E6",
          ),
        },
      };

      cell.alignment = {
        horizontal:
          "center",

        vertical:
          "middle",

        wrapText: true,
      };

      applyBorder(
        cell,
        "medium",
      );
    },
  );

  ws.getRow(5).height =
    22;

  const rows =
    rowsFor(
      pkg,
      data,
    );

  const startRow = 6;

  const additionalText =
    clean(
      [
        pkg.label?.extraText,

        data.orderOptions
          ?.etiquetaExtraText,

        data.config
          ?.labelNote,

        ...(
          data.config
            ?.additionalItems ||
          []
        )
          .filter(
            (item) =>
              item.enabled &&
              item.mode !==
                "LINHA" &&
              (
                item.target ===
                  "ETIQUETA" ||
                item.target ===
                  "AMBOS"
              ),
          )
          .map(
            (item) =>
              item.text ||
              item.label,
          ),
      ]
        .filter(Boolean)
        .join(" | "),
    );

  rows.forEach(
    (
      row,
      rowIndex,
    ) => {
      const excelRow =
        startRow +
        rowIndex;

      const values: Array<
        string | number
      > = [
        rowIndex === 0
          ? packageNumber
          : "",

        row.games || "",

        row.quantity || "",

        row.lengthMm || "",

        row.widthMm || "",

        row.thicknessMm ||
          "",

        fmtM3(
          rowVolume(row),
        ),

        row.product || "",

        observation(row),
      ];

      values.forEach(
        (
          value,
          col,
        ) => {
          const cell =
            ws.getCell(
              excelRow,
              col + 1,
            );

          cell.value =
            value;

          const isProduct =
            col === 7;

          const isObs =
            col === 8;

          const scale =
            isProduct
              ? style.productScale ||
                1
              : isObs
                ? style.observationScale ||
                  1
                : style.numericScale ||
                  1;

          cell.font = {
            name:
              fontName,

            size:
              Math.min(
                14,

                Math.max(
                  6,

                  baseSize *
                    scale *
                    (
                      pkg.label
                        ?.fontScale ||
                      1
                    ),
                ),
              ),

            bold:
              isProduct
                ? Boolean(
                    style.boldProduct,
                  )
                : false,

            color: {
              argb:
                argb(
                  isProduct
                    ? productColor
                    : isObs
                      ? obsColor
                      : textColor,
                ),
            },
          };

          cell.alignment = {
            horizontal:
              isProduct
                ? (
                    style.productAlign ||
                    "left"
                  )
                : isObs
                  ? (
                      style.observationAlign ||
                      "left"
                    )
                  : "center",

            vertical:
              "middle",

            wrapText:
              true,
          };

          if (
            col === 6
          ) {
            cell.numFmt =
              "0.000";
          }

          applyBorder(
            cell,
          );
        },
      );

      const textLength =
        Math.max(
          (
            row.product ||
            ""
          ).length,

          observation(
            row,
          ).length,
        );

      ws.getRow(
        excelRow,
      ).height =
        textLength > 120
          ? Math.max(
              rowHeight,
              45,
            )
          : textLength > 65
            ? Math.max(
                rowHeight,
                34,
              )
            : rowHeight;
    },
  );

  const lastDataRow =
    Math.max(
      startRow,
      startRow +
        rows.length -
        1,
    );

  const footerRow =
    lastDataRow + 1;

  ws.mergeCells(
    `A${footerRow}:F${footerRow}`,
  );

  ws.getCell(
    `A${footerRow}`,
  ).value =
    additionalText;

  ws.getCell(
    `A${footerRow}`,
  ).font = {
    name: fontName,

    size:
      Math.max(
        7,
        baseSize - 1,
      ),

    color: {
      argb:
        argb(
          textColor,
        ),
    },
  };

  ws.getCell(
    `A${footerRow}`,
  ).alignment = {
    vertical:
      "middle",

    wrapText:
      true,
  };

  ws.mergeCells(
    `G${footerRow}:H${footerRow}`,
  );

  const totalM3 =
    rows.reduce(
      (sum, row) =>
        sum +
        rowVolume(row),
      0,
    );

  ws.getCell(
    `G${footerRow}`,
  ).value =
    `Total m³ ${totalM3
      .toFixed(3)
      .replace(".", ",")}`;

  ws.getCell(
    `G${footerRow}`,
  ).font = {
    name: fontName,

    size: baseSize,

    bold: true,
  };

  ws.getCell(
    `G${footerRow}`,
  ).alignment = {
    horizontal:
      "center",

    vertical:
      "middle",
  };

  const tons =
    Math.ceil(
      (
        (
          totalM3 *
          420
        ) /
        1000
      ) *
        10,
    ) / 10;

  ws.getCell(
    `I${footerRow}`,
  ).value =
    `${tons
      .toFixed(1)
      .replace(
        ".",
        ",",
      )} - toneladas`;

  ws.getCell(
    `I${footerRow}`,
  ).font = {
    name: fontName,

    size:
      Math.max(
        7,
        baseSize - 1,
      ),

    bold: true,
  };

  ws.getCell(
    `I${footerRow}`,
  ).alignment = {
    horizontal:
      "center",

    vertical:
      "middle",

    wrapText:
      true,
  };

  ws.getRow(
    footerRow,
  ).height =
    additionalText
      ? 30
      : 22;

  applyGrid(
    ws,
    `A${footerRow}:I${footerRow}`,
  );

  applyGrid(
    ws,
    "A1:I4",
  );

  ws.views = [
    {
      state: "frozen",
      ySplit: 5,
    },
  ];

  ws.pageSetup.printArea =
    `A1:I${footerRow}`;

  ws.pageSetup.horizontalCentered =
    true;

  ws.pageSetup.verticalCentered =
    true;

  ws.properties.defaultRowHeight =
    rowHeight;
}

function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  data: ProcessingResult,
  enabled: PackageData[],
) {
  const ws =
    workbook.addWorksheet(
      "RESUMO",
      {
        views: [
          {
            state:
              "frozen",
            ySplit: 6,
          },
        ],
      },
    );

  ws.properties.defaultRowHeight =
    20;

  ws.getColumn(1).width =
    14;

  ws.getColumn(2).width =
    24;

  ws.getColumn(3).width =
    18;

  ws.getColumn(4).width =
    16;

  ws.getColumn(5).width =
    18;

  ws.getColumn(6).width =
    56;

  ws.mergeCells(
    "A1:F1",
  );

  ws.getCell(
    "A1",
  ).value =
    "FAMOSSUL — ETIQUETAS DE EXPEDIÇÃO";

  ws.getCell(
    "A1",
  ).font = {
    name: "Arial",

    size: 15,

    bold: true,

    color: {
      argb:
        "FFFFFFFF",
    },
  };

  ws.getCell(
    "A1",
  ).fill = {
    type: "pattern",

    pattern: "solid",

    fgColor: {
      argb:
        "FF14532D",
    },
  };

  ws.getCell(
    "A1",
  ).alignment = {
    horizontal:
      "left",

    vertical:
      "middle",
  };

  ws.getRow(1).height =
    28;

  const meta: Array<
    [
      string,
      string | number,
    ]
  > = [
    [
      "Pedido",
      data.orderNumber ||
        "",
    ],

    [
      "Cliente",
      data.client || "",
    ],

    [
      "Destino",
      data.destination ||
        "",
    ],

    [
      "Entrega",
      data.delivery || "",
    ],

    [
      "Filtro",
      data.orderOptions
        ?.filtro || "",
    ],

    [
      "Etiquetas",
      enabled.length,
    ],
  ];

  meta.forEach(
    (
      [
        label,
        value,
      ],
      index,
    ) => {
      const row =
        index + 2;

      ws.getCell(
        row,
        1,
      ).value =
        label;

      ws.getCell(
        row,
        1,
      ).font = {
        bold: true,

        color: {
          argb:
            "FF475569",
        },
      };

      ws.getCell(
        row,
        2,
      ).value =
        value;

      if (index < 3) {
        ws.mergeCells(
          row,
          2,
          row,
          6,
        );
      }
    },
  );

  const headerRow = 9;

  [
    "Pallet",
    "Tipo",
    "Jogos",
    "Linhas",
    "m³",
    "Planilha",
  ].forEach(
    (
      value,
      index,
    ) => {
      const cell =
        ws.getCell(
          headerRow,
          index + 1,
        );

      cell.value =
        value;

      cell.font = {
        bold: true,

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
            "FF1F6B4A",
        },
      };

      cell.alignment = {
        horizontal:
          "center",

        vertical:
          "middle",
      };

      applyBorder(
        cell,
      );
    },
  );

  enabled.forEach(
    (
      pkg,
      index,
    ) => {
      const row =
        headerRow +
        1 +
        index;

      const rows =
        rowsFor(
          pkg,
          data,
        );

      const volume =
        rows.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            rowVolume(
              item,
            ),
          0,
        );

      const sheetName =
        `Etiqueta ${String(
          index + 1,
        ).padStart(
          2,
          "0",
        )}`;

      const values: Array<
        string | number
      > = [
        pkg.number,

        pkg.packageType ||
          "",

        pkg.games ||
          rows.find(
            (item) =>
              item.games,
          )?.games ||
          "",

        rows.length,

        volume,

        sheetName,
      ];

      values.forEach(
        (
          value,
          col,
        ) => {
          const cell =
            ws.getCell(
              row,
              col + 1,
            );

          if (col === 5) {
            cell.value = {
              text:
                sheetName,

              hyperlink:
                `#'${sheetName}'!A1`,
            };
          } else {
            cell.value =
              value;
          }

          if (
            col === 4
          ) {
            cell.numFmt =
              "0.000";
          }

          cell.alignment = {
            vertical:
              "middle",

            horizontal:
              col === 5
                ? "left"
                : "center",

            wrapText:
              true,
          };

          applyBorder(
            cell,
          );
        },
      );
    },
  );

  ws.pageSetup.orientation =
    "landscape";

  ws.pageSetup.fitToPage =
    true;

  ws.pageSetup.fitToWidth =
    1;

  ws.pageSetup.fitToHeight =
    0;

  ws.pageSetup.printArea =
    `A1:F${Math.max(
      10,
      headerRow +
        enabled.length,
    )}`;
}

export async function createLabelsWorkbook(
  data: ProcessingResult,
) {
  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "Famossul | Etiquetas";

  workbook.created =
    new Date();

  let logoId:
    | number
    | undefined;

  let flagId:
    | number
    | undefined;

  try {
    const logo =
      Buffer.from(await (await fetch("https://romaneiosget.vercel.app/templates/famossul-logo.png", { cache: "no-store" })).arrayBuffer());

    const flag =
      Buffer.from(await (await fetch("https://romaneiosget.vercel.app/templates/brazil-flag.png", { cache: "no-store" })).arrayBuffer());

    logoId =
      workbook.addImage({
        buffer:
          logo as unknown as ExcelJS.Buffer,

        extension:
          "png",
      });

    flagId =
      workbook.addImage({
        buffer:
          flag as unknown as ExcelJS.Buffer,

        extension:
          "png",
      });
  } catch {
    /*
      Se as imagens não
      existirem, a etiqueta
      continua sendo gerada
      com o texto.
    */
  }

  const enabled =
    data.packages.filter(
      (pkg) =>
        pkg.label
          ?.enabled !==
        false,
    );

  if (!enabled.length) {
    throw new Error(
      "Nenhuma etiqueta está habilitada para geração.",
    );
  }

  writeSummarySheet(
    workbook,
    data,
    enabled,
  );

  enabled.forEach(
    (
      pkg,
      index,
    ) =>
      writeLabelSheet(
        workbook,
        data,
        pkg,
        index,
        {
          logoId,
          flagId,
        },
      ),
  );

  const buffer =
    await workbook.xlsx.writeBuffer();

  return Buffer.from(
    buffer,
  );
}
