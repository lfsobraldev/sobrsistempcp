import type ExcelJS from "exceljs";
import type { Produto } from "@/types/pcp";
import {
  compareParaPlanilha,
  familiaProduto,
  produtoEntraPCP,
  type Familia,
} from "@/lib/sort";
import { medidaDoItem, tipoPeca } from "@/lib/domain/industrial";

/**
 * Planilha de programação por setor.
 * Organização: PORTAS > BATENTES > ALIZARES > BAGUETES > KIT DE CORRER / SUPORTE DE TRILHO > demais.
 * Dentro de cada seção: largura (ver LARGURA_ORDEM em lib/domain/industrial.ts).
 * Batentes e alizares: perna e travessa da mesma largura ficam em sequência.
 */

type Workbook = ExcelJS.Workbook;
type Worksheet = ExcelJS.Worksheet;


export const SETORES: [string, string][] = [
  ["PREPARACAO", "PREPARAÇÃO"],
  ["USINAGEM-1", "USINAGEM 1"],
  ["LIXAR", "LIXAR"],
  ["RECOBRIDORA", "RECOBRIDORA 1"],
  ["RECOBRIDORA-2", "RECOBRIDORA 2"],
  ["USINAGEM-2", "USINAGEM 2"],
  ["LUSTRACAO", "LUSTRAÇÃO"],
  ["TERCEIROS", "TERCEIROS"],
  ["EMBALAGEM", "EMBALAGEM"],
  ["EXPEDICAO", "EXPEDIÇÃO"],
];

const FAMILIA_INFO: Record<Familia, { secao: string; singular: string }> = {
  PORTAS: { secao: "PORTAS", singular: "PORTA" },
  BATENTES: { secao: "BATENTES", singular: "BATENTE" },
  ALIZARES: { secao: "ALIZARES", singular: "ALIZAR" },
  BAGUETE: { secao: "BAGUETES", singular: "BAGUETE" },
  "KIT CORRER": {
    secao: "KIT DE CORRER / SUPORTE DE TRILHO",
    singular: "KIT DE CORRER",
  },
  BANDEIRA: { secao: "BANDEIRAS", singular: "BANDEIRA" },
  OUTROS: { secao: "OUTROS ITENS", singular: "OUTROS" },
};

type Coluna = { h: string; w: number; align?: "left" | "center" | "right" };

const COLS: Coluna[] = [
  { h: "Seq.", w: 6, align: "center" }, // 1
  { h: "Pedido", w: 9, align: "center" }, // 2
  { h: "Item", w: 6, align: "center" }, // 3
  { h: "OF", w: 10, align: "center" }, // 4
  { h: "Produto", w: 12, align: "center" }, // 5
  { h: "Família", w: 14 }, // 6
  { h: "Peça", w: 10, align: "center" }, // 7
  { h: "Descrição", w: 56 }, // 8
  { h: "Tipo", w: 13 }, // 9
  { h: "Canal", w: 24 }, // 10
  { h: "Rebaixo", w: 13 }, // 11
  { h: "Acabamento", w: 26 }, // 12
  { h: "Cor", w: 20 }, // 13
  { h: "Qtd Programada", w: 12, align: "right" }, // 14
  { h: "Comprimento", w: 12, align: "right" }, // 15
  { h: "Largura", w: 9, align: "right" }, // 16
  { h: "Espessura", w: 10, align: "right" }, // 17
  { h: "m³", w: 8, align: "right" }, // 18
  { h: "Turno", w: 7, align: "center" }, // 19
  { h: "Máquina", w: 12 }, // 20
  { h: "Líder", w: 15 }, // 21
  { h: "Qtd Produzida", w: 12, align: "right" }, // 22
  { h: "Saldo", w: 9, align: "right" }, // 23
  { h: "% Concluído", w: 11, align: "right" }, // 24
  { h: "Status", w: 14, align: "center" }, // 25
  { h: "Observação", w: 26 }, // 26
  { h: "Prioridade", w: 11, align: "center" }, // 27
];

const C = {
  seq: 1,
  fam: 6,
  peca: 7,
  desc: 8,
  qtd: 14,
  larg: 16,
  turno: 19,
  maq: 20,
  lider: 21,
  prod: 22,
  saldo: 23,
  pct: 24,
  status: 25,
  obs: 26,
  prio: 27,
};
const ENTRADA = [C.turno, C.maq, C.lider, C.prod, C.obs];
const N_COLS = COLS.length;

const COR = {
  grafite: "FF2B3138",
  cabecalho: "FF3F4A54",
  banda: "FFE4E8EB",
  linha: "FFD5DAE0",
  grupo: "FF9AA5B0",
  entrada: "FFFAF7EA",
  texto: "FF1F2A30",
  suave: "FF5B6670",
};

const FONTE = "Arial";

function letra(n: number) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const limpar = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

const capitalizar = (v: string) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : "";

const fino = (argb: string) => ({ style: "thin" as const, color: { argb } });

function m3(c: number, l: number, e: number, q: number) {
  if (c > 0 && l > 0 && e >= 5 && q > 0) {
    return Math.round(((c * l * e * q) / 1e9) * 1000) / 1000;
  }
  return null;
}

type Item = { p: Produto; o: Produto["operacoes"][number] };

export type OpcoesPlanilha = {
  /** códigos de processo a exportar (padrão: todos que tiverem itens) */
  setores?: string[];
  /** data exibida no cabeçalho (dd/mm/aaaa) */
  data?: string;
};

function itensDoSetor(produtos: Produto[], processo: string): Item[] {
  return produtos
    .filter(produtoEntraPCP)
    .flatMap((p) =>
      p.operacoes.filter((o) => o.processo === processo).map((o) => ({ p, o }))
    )
    .sort(
      (a, b) =>
        compareParaPlanilha(a.p, b.p) || a.o.ordemFila - b.o.ordemFila
    );
}

type ResumoSetor = {
  aba: string;
  primeira: number;
  ultima: number;
  total: number;
  familias: Familia[];
  qtd: number;
  prod: number;
  concluidos: number;
  parciais: number;
  naoIniciados: number;
  porFamilia: Partial<Record<Familia, number>>;
  prioridade: Record<string, number>;
};

function montarAbaSetor(
  wb: Workbook,
  nomeAba: string,
  itens: Item[],
  data: string
): ResumoSetor {
  const ws = wb.addWorksheet(nomeAba, {
    properties: { defaultRowHeight: 20 },
    views: [{ state: "frozen", xSplit: 4, ySplit: 4, showGridLines: false }],
  });

  COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.w));

  // Título
  ws.mergeCells(1, 1, 1, N_COLS);
  const t = ws.getCell(1, 1);
  t.value = `PROGRAMAÇÃO DE PRODUÇÃO  |  ${nomeAba}`;
  t.font = { name: FONTE, size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grafite } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 32;

  // Identificação do setor (campos para preenchimento do líder)
  const rotulo = (col: number, txt: string) => {
    const c = ws.getCell(2, col);
    c.value = txt;
    c.font = { name: FONTE, size: 9, bold: true, color: { argb: COR.suave } };
    c.alignment = { vertical: "middle", horizontal: "right" };
  };
  const campo = (c1: number, c2: number, valor?: string) => {
    if (c2 > c1) ws.mergeCells(2, c1, 2, c2);
    for (let c = c1; c <= c2; c++) {
      ws.getCell(2, c).border = { bottom: fino(COR.grupo) };
    }
    const cell = ws.getCell(2, c1);
    cell.value = valor ?? null;
    cell.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.texto } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  };
  rotulo(1, "Data:");
  campo(2, 3, data);
  rotulo(4, "Setor:");
  campo(5, 6, nomeAba);
  rotulo(7, "Líder:");
  campo(8, 8);
  rotulo(9, "Máq./Linha:");
  campo(10, 11);
  rotulo(12, "Turno:");
  campo(13, 13);
  rotulo(14, "Ordem:");
  campo(15, 20, "Família  ›  largura menor → maior");
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 6;

  // Cabeçalho da tabela
  const head = ws.getRow(4);
  COLS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.h;
    cell.font = { name: FONTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR.cabecalho },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { left: fino("FF59646E"), right: fino("FF59646E") };
  });
  head.height = 32;

  let rowNum = 5;
  const primeira = rowNum;
  let seq = 1;
  const familias: Familia[] = [];

  let i = 0;
  while (i < itens.length) {
    const familia = familiaProduto(itens[i].p);
    let j = i;
    while (j < itens.length && familiaProduto(itens[j].p) === familia) j++;
    const grupo = itens.slice(i, j);
    familias.push(familia);

    // Faixa da seção
    const bandaRow = ws.getRow(rowNum);
    const bandaNum = rowNum;
    ws.mergeCells(bandaNum, 1, bandaNum, 13);
    const qtdSecao = grupo.reduce((s, x) => s + x.o.quantidadePlanejada, 0);
    const bTxt = bandaRow.getCell(1);
    bTxt.value = `${FAMILIA_INFO[familia].secao}   •   ${grupo.length} ${
      grupo.length === 1 ? "item" : "itens"
    }`;
    bTxt.font = { name: FONTE, size: 11, bold: true, color: { argb: COR.texto } };
    bTxt.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    for (let c = 1; c <= N_COLS; c++) {
      const cell = bandaRow.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.banda } };
      cell.border = {
        top: { style: "medium", color: { argb: COR.cabecalho } },
        bottom: fino(COR.grupo),
      };
    }
    bandaRow.height = 24;
    rowNum++;

    const ini = rowNum;
    let larguraAnterior = -1;
    let somaProd = 0;

    for (const { p, o } of grupo) {
      const r = ws.getRow(rowNum);
      const [comp, larg, esp] = medidaDoItem(p);
      const comTipo = familia === "BATENTES" || familia === "ALIZARES";
      const q = o.quantidadePlanejada;
      const prod = o.quantidadeProduzida;
      somaProd += prod;

      const saldo = Math.max(0, Math.round((q - prod) * 1000) / 1000);
      const pct = q > 0 ? prod / q : 0;
      const status = prod === 0 ? "Não iniciado" : prod >= q ? "Concluído" : "Parcial";
      const Q = letra(C.qtd);
      const P = letra(C.prod);

      const valores: (string | number | null | { formula: string; result: number | string })[] = [
        seq++,
        p.pedido,
        p.item,
        p.of,
        p.produto,
        FAMILIA_INFO[familia].singular,
        comTipo ? capitalizar(tipoPeca(p)) : "",
        limpar(p.descricao),
        limpar(p.tipo),
        limpar(p.canal),
        limpar(p.rebaixo),
        limpar(p.acabamento),
        limpar(p.cor),
        q,
        comp || null,
        larg || null,
        esp || null,
        m3(comp, larg, esp, q),
        null,
        null,
        null,
        prod,
        { formula: `MAX(0,ROUND(${Q}${rowNum}-${P}${rowNum},3))`, result: saldo },
        { formula: `IFERROR(${P}${rowNum}/${Q}${rowNum},0)`, result: pct },
        {
          formula: `IF(${P}${rowNum}=0,"Não iniciado",IF(${P}${rowNum}>=${Q}${rowNum},"Concluído","Parcial"))`,
          result: status,
        },
        null,
        capitalizar(limpar(p.prioridade) || "Normal"),
      ];

      valores.forEach((v, k) => {
        const cell = r.getCell(k + 1);
        if (v !== null) cell.value = v as ExcelJS.CellValue;
        cell.font = { name: FONTE, size: 10, color: { argb: COR.texto } };
        cell.alignment = {
          vertical: "middle",
          horizontal: COLS[k].align ?? "left",
          wrapText: false,
        };
        const novoGrupo = larg !== larguraAnterior && larguraAnterior !== -1;
        cell.border = {
          top: novoGrupo ? fino(COR.grupo) : fino(COR.linha),
          bottom: fino(COR.linha),
          left: fino(COR.linha),
          right: fino(COR.linha),
        };
        if (ENTRADA.includes(k + 1)) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COR.entrada },
          };
        }
      });

      r.getCell(C.qtd).numFmt = "General";
      r.getCell(C.prod).numFmt = "General";
      r.getCell(C.saldo).numFmt = "General";
      r.getCell(C.pct).numFmt = "0%";
      r.getCell(18).numFmt = "0.000";
      r.getCell(C.qtd).font = { name: FONTE, size: 10, bold: true, color: { argb: COR.texto } };
      r.getCell(C.saldo).font = { name: FONTE, size: 10, bold: true, color: { argb: COR.texto } };
      r.height = 21;

      larguraAnterior = larg;
      rowNum++;
    }

    const fim = rowNum - 1;
    const Q = letra(C.qtd);
    const P = letra(C.prod);
    const S = letra(C.saldo);
    const subtotal = (col: number, ref: string, result: number) => {
      const cell = bandaRow.getCell(col);
      cell.value = { formula: `SUBTOTAL(9,${ref}${ini}:${ref}${fim})`, result };
      cell.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.texto } };
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "General";
    };
    subtotal(C.qtd, Q, qtdSecao);
    subtotal(C.prod, P, somaProd);
    subtotal(C.saldo, S, Math.max(0, qtdSecao - somaProd));
    const pctCell = bandaRow.getCell(C.pct);
    pctCell.value = {
      formula: `IFERROR(${P}${bandaNum}/${Q}${bandaNum},0)`,
      result: qtdSecao > 0 ? somaProd / qtdSecao : 0,
    };
    pctCell.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.texto } };
    pctCell.alignment = { vertical: "middle", horizontal: "right" };
    pctCell.numFmt = "0%";

    i = j;
  }

  const ultima = rowNum - 1;

  // Total do setor
  const tot = ws.getRow(rowNum);
  const totalQtd = itens.reduce((s, x) => s + x.o.quantidadePlanejada, 0);
  const totalProd = itens.reduce((s, x) => s + x.o.quantidadeProduzida, 0);
  const Q = letra(C.qtd);
  const P = letra(C.prod);
  const S = letra(C.saldo);
  ws.mergeCells(rowNum, 1, rowNum, 13);
  tot.getCell(1).value = `TOTAL DO SETOR  —  ${itens.length} itens`;
  for (let c = 1; c <= N_COLS; c++) {
    const cell = tot.getCell(c);
    cell.font = { name: FONTE, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grafite } };
    cell.alignment = {
      vertical: "middle",
      horizontal: c === 1 ? "left" : "right",
      indent: c === 1 ? 1 : 0,
    };
  }
  tot.getCell(C.qtd).value = {
    formula: `SUBTOTAL(9,${Q}${primeira}:${Q}${ultima})`,
    result: totalQtd,
  };
  tot.getCell(C.prod).value = {
    formula: `SUBTOTAL(9,${P}${primeira}:${P}${ultima})`,
    result: totalProd,
  };
  tot.getCell(C.saldo).value = {
    formula: `SUBTOTAL(9,${S}${primeira}:${S}${ultima})`,
    result: Math.max(0, totalQtd - totalProd),
  };
  tot.getCell(C.pct).value = {
    formula: `IFERROR(${P}${rowNum}/${Q}${rowNum},0)`,
    result: totalQtd > 0 ? totalProd / totalQtd : 0,
  };
  tot.getCell(C.pct).numFmt = "0%";
  tot.height = 26;

  // Impressão
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 8 as unknown as ExcelJS.PaperSize, // A3
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 },
    printTitlesRow: "4:4",
  };
  ws.headerFooter = {
    oddFooter: "&L&8&A&C&8Página &P de &N&R&8Impresso em &D &T",
  };

  const stat = (x: Item) => {
    const q = x.o.quantidadePlanejada;
    const pr = x.o.quantidadeProduzida;
    return pr === 0 ? "n" : pr >= q ? "c" : "p";
  };
  const porFamilia: Partial<Record<Familia, number>> = {};
  const prioridade: Record<string, number> = {};
  for (const x of itens) {
    const f = familiaProduto(x.p);
    porFamilia[f] = (porFamilia[f] ?? 0) + x.o.quantidadePlanejada;
    const k = capitalizar(limpar(x.p.prioridade) || "Normal");
    prioridade[k] = (prioridade[k] ?? 0) + 1;
  }

  return {
    aba: nomeAba,
    primeira,
    ultima,
    total: rowNum,
    familias,
    qtd: totalQtd,
    prod: totalProd,
    concluidos: itens.filter((x) => stat(x) === "c").length,
    parciais: itens.filter((x) => stat(x) === "p").length,
    naoIniciados: itens.filter((x) => stat(x) === "n").length,
    porFamilia,
    prioridade,
  };
}

function montarControle(
  ws: Worksheet,
  resumos: ResumoSetor[],
  produtos: Produto[]
) {
  const larguras = [36, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15];
  larguras.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  ws.mergeCells(1, 1, 1, 12);
  const t = ws.getCell(1, 1);
  t.value = "CONTROLE GERENCIAL  |  ANDAMENTO DA PRODUÇÃO";
  t.font = { name: FONTE, size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grafite } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 32;

  const validos = produtos.filter(produtoEntraPCP);
  const pedidos = new Set(validos.map((p) => p.pedido)).size;
  const pecas = validos.reduce((s, p) => s + p.quantidade, 0);
  const vol = validos.reduce((s, p) => {
    const [c, l, e] = medidaDoItem(p);
    return s + (m3(c, l, e, p.quantidade) ?? 0);
  }, 0);

  const kpis: [string, number | string, string?][] = [
    ["Pedidos", pedidos],
    ["Linhas", validos.length],
    ["Peças", pecas],
    ["Volume m³ (est.)", Math.round(vol * 1000) / 1000, "#,##0.000"],
  ];
  kpis.forEach(([rot, val, fmt], k) => {
    const col = 1 + k * 2;
    const a = ws.getCell(3, col);
    const b = ws.getCell(3, col + 1);
    a.value = rot;
    a.font = { name: FONTE, size: 9, bold: true, color: { argb: COR.suave } };
    a.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    b.value = val;
    b.font = { name: FONTE, size: 14, bold: true, color: { argb: COR.texto } };
    b.alignment = { horizontal: "left", vertical: "middle" };
    if (fmt) b.numFmt = fmt;
    else b.numFmt = "#,##0";
    for (const cell of [a, b]) {
      cell.border = { bottom: fino(COR.grupo) };
    }
  });
  ws.getRow(3).height = 28;

  const cabecalho = (linha: number, titulos: string[], inicio = 1) => {
    titulos.forEach((h, k) => {
      const c = ws.getCell(linha, inicio + k);
      c.value = h;
      c.font = { name: FONTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.cabecalho } };
      c.alignment = { horizontal: k === 0 ? "left" : "center", vertical: "middle", indent: k === 0 ? 1 : 0 };
    });
    ws.getRow(linha).height = 26;
  };
  const celula = (linha: number, col: number, valor: ExcelJS.CellValue, fmt?: string, bold = false, esq = false) => {
    const c = ws.getCell(linha, col);
    c.value = valor;
    c.font = { name: FONTE, size: 10, bold, color: { argb: COR.texto } };
    c.alignment = { horizontal: esq ? "left" : "right", vertical: "middle", indent: esq ? 1 : 0 };
    c.border = { top: fino(COR.linha), bottom: fino(COR.linha), left: fino(COR.linha), right: fino(COR.linha) };
    if (fmt) c.numFmt = fmt;
    return c;
  };

  // Andamento por setor
  const L0 = 5;
  cabecalho(L0, ["Setor", "Programado", "Produzido", "Saldo", "%", "Andamento", "Concluídos", "Parciais", "Não iniciados"]);
  const Q = letra(C.qtd);
  const P = letra(C.prod);
  const S = letra(C.saldo);
  const ST = letra(C.status);

  resumos.forEach((r, k) => {
    const row = L0 + 1 + k;
    const ref = `'${r.aba}'!`;
    const intervalo = (col: string) => `${ref}$${col}$${r.primeira}:$${col}$${r.ultima}`;
    celula(row, 1, r.aba, undefined, true, true);
    celula(row, 2, { formula: `${ref}${Q}${r.total}`, result: r.qtd }, "General");
    celula(row, 3, { formula: `${ref}${P}${r.total}`, result: r.prod }, "General");
    celula(row, 4, { formula: `${ref}${S}${r.total}`, result: Math.max(0, r.qtd - r.prod) }, "General");
    celula(row, 5, { formula: `IFERROR(C${row}/B${row},0)`, result: r.qtd > 0 ? r.prod / r.qtd : 0 }, "0%");
    const barra = celula(row, 6, { formula: `REPT("█",ROUND(E${row}*10,0))`, result: "█".repeat(Math.round((r.qtd > 0 ? r.prod / r.qtd : 0) * 10)) }, undefined, false, true);
    barra.font = { name: FONTE, size: 9, color: { argb: COR.cabecalho } };
    celula(row, 7, { formula: `COUNTIF(${intervalo(ST)},"Concluído")`, result: r.concluidos }, "0");
    celula(row, 8, { formula: `COUNTIF(${intervalo(ST)},"Parcial")`, result: r.parciais }, "0");
    celula(row, 9, { formula: `COUNTIF(${intervalo(ST)},"Não iniciado")`, result: r.naoIniciados }, "0");
    ws.getRow(row).height = 22;
  });

  // Indicadores
  cabecalho(L0, ["Indicador", "Total"], 11);
  const PRIO = letra(C.prio);
  const TURNO = letra(C.turno);
  const soma = (col: string, valor: string) =>
    resumos
      .map((r) => `COUNTIF('${r.aba}'!$${col}$${r.primeira}:$${col}$${r.ultima},"${valor}")`)
      .join("+") || "0";
  const indicadores: [string, string, number][] = [
    ["Urgente", soma(PRIO, "Urgente"), resumos.reduce((a, r) => a + (r.prioridade["Urgente"] ?? 0), 0)],
    ["Alta", soma(PRIO, "Alta"), resumos.reduce((a, r) => a + (r.prioridade["Alta"] ?? 0), 0)],
    ["Concluído", soma(ST, "Concluído"), resumos.reduce((a, r) => a + r.concluidos, 0)],
    ["Parcial", soma(ST, "Parcial"), resumos.reduce((a, r) => a + r.parciais, 0)],
    ["Turno A", soma(TURNO, "A"), 0],
    ["Turno B", soma(TURNO, "B"), 0],
  ];
  indicadores.forEach(([nome, formula, result], k) => {
    celula(L0 + 1 + k, 11, nome, undefined, true, true);
    celula(L0 + 1 + k, 12, { formula, result }, "0");
  });

  // Programado por família e setor
  const L1 = L0 + resumos.length + 4;
  ws.mergeCells(L1 - 1, 1, L1 - 1, 9);
  const sub = ws.getCell(L1 - 1, 1);
  sub.value = "PROGRAMADO POR FAMÍLIA E SETOR (peças)";
  sub.font = { name: FONTE, size: 11, bold: true, color: { argb: COR.texto } };
  sub.alignment = { vertical: "middle", indent: 1 };
  sub.border = { bottom: { style: "medium", color: { argb: COR.cabecalho } } };

  const famOrdem = (Object.keys(FAMILIA_INFO) as Familia[]).filter((f) =>
    resumos.some((r) => r.familias.includes(f))
  );
  cabecalho(L1, ["Família", ...resumos.map((r) => r.aba), "Total"]);
  const F = letra(C.fam);
  famOrdem.forEach((f, k) => {
    const row = L1 + 1 + k;
    celula(row, 1, FAMILIA_INFO[f].secao, undefined, true, true);
    resumos.forEach((r, c) => {
      const ref = `'${r.aba}'!`;
      celula(
        row,
        2 + c,
        {
          formula: `SUMIF(${ref}$${F}$${r.primeira}:$${F}$${r.ultima},"${FAMILIA_INFO[f].singular}",${ref}$${Q}$${r.primeira}:$${Q}$${r.ultima})`,
          result: r.porFamilia[f] ?? 0,
        },
        "General"
      );
    });
    celula(row, 2 + resumos.length, { formula: `SUM(B${row}:${letra(1 + resumos.length)}${row})`, result: resumos.reduce((a, r) => a + (r.porFamilia[f] ?? 0), 0) }, "General", true);
  });
  for (let c = larguras.length + 1; c <= resumos.length + 2; c++) ws.getColumn(c).width = 15;

  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

function montarLeiaMe(wb: Workbook) {
  const ws = wb.addWorksheet("LEIA-ME", { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 110;
  ws.mergeCells(1, 1, 1, 2);
  const t = ws.getCell(1, 1);
  t.value = "PROGRAMAÇÃO DE PRODUÇÃO  |  COMO USAR";
  t.font = { name: FONTE, size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grafite } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30;

  const linhas = [
    "Cada aba traz somente os itens que passam pelo setor.",
    "Sequência das seções: Portas, Batentes, Alizares, Baguetes, Kit de Correr / Suporte de Trilho e demais itens.",
    "Dentro de cada seção os itens seguem a largura, da menor para a maior.",
    "Em Batentes e Alizares, perna e travessa da mesma largura ficam em sequência (mesmo material, acabamento, cor e rebaixo).",
    "Linhas com divisória mais escura marcam a troca de largura.",
    "O líder preenche as colunas com fundo claro: Turno, Máquina, Líder, Qtd Produzida e Observação.",
    "Saldo, % Concluído e Status são calculados por fórmula. Os subtotais ficam na faixa de cada seção.",
    "A aba CONTROLE GERENTE consolida o andamento de todos os setores.",
    "Os apontamentos oficiais das OFs continuam sendo feitos no Consistem.",
  ];
  linhas.forEach((txt, k) => {
    const r = 3 + k;
    const n = ws.getCell(r, 1);
    n.value = k + 1;
    n.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.suave } };
    n.alignment = { horizontal: "center", vertical: "middle" };
    const c = ws.getCell(r, 2);
    c.value = txt;
    c.font = { name: FONTE, size: 10, color: { argb: COR.texto } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = { bottom: fino(COR.linha) };
    n.border = { bottom: fino(COR.linha) };
    ws.getRow(r).height = 22;
  });
}

export function montarPlanilha(
  ExcelLib: { Workbook: new () => Workbook },
  produtos: Produto[],
  opcoes: OpcoesPlanilha = {}
): Workbook {
  const wb = new ExcelLib.Workbook();
  wb.creator = "Sobral PCP";
  wb.created = new Date();

  const data =
    opcoes.data ||
    new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  wb.calcProperties = { fullCalcOnLoad: true };

  // o controle é a primeira aba; é preenchido depois que os setores existem
  const controle = wb.addWorksheet("CONTROLE GERENTE", {
    views: [{ showGridLines: false }],
  });

  const resumos: ResumoSetor[] = [];

  for (const [codigo, nome] of SETORES) {
    if (opcoes.setores && !opcoes.setores.includes(codigo)) continue;
    const itens = itensDoSetor(produtos, codigo);
    if (!itens.length) continue;
    resumos.push(montarAbaSetor(wb, nome, itens, data));
  }

  montarControle(controle, resumos, produtos);
  montarLeiaMe(wb);

  return wb;
}

export async function baixarPlanilhaProducao(
  produtos: Produto[],
  opcoes: OpcoesPlanilha & { arquivo?: string } = {}
) {
  const mod = await import("exceljs");
  const ExcelLib = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = montarPlanilha(
    ExcelLib as unknown as { Workbook: new () => Workbook },
    produtos,
    opcoes
  );
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  const carimbo = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(
    d.getHours()
  )}${z(d.getMinutes())}`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${opcoes.arquivo || "Programacao_Producao"}_${carimbo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
