import { clean, norm, toNumber } from "./domain";

export type OrderPdfItem = {
  item: string;
  code: string;
  description: string;
  unit?: string;
  quantity: number;
  volume?: number;
};

export type OrderHeader = {
  orderNumber: string;
  client: string;
  destination: string;
  delivery?: string;
};

const UNITS = ["CJ", "PC", "UN", "JG", "PÇ", "PÇS", "PCS", "PEÇA", "PEÇAS", "PAR", "MT", "M", "M2", "M²", "M3", "M³"];
const UNIT_PATTERN = UNITS.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const NUMBER_PATTERN = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,4})?`;
const ANCHOR = /^\s*(\d{1,4}(?:\.\d+)?)\s+(\d{4,12})\b(.*)$/i;
const HEADER_OR_FOOTER = /FAMOSSUL MADEIRAS NORDESTE|CNPJ:|INSCR\.?ESTADUAL|P[aá]gina:|Pedido:|Cliente:|Endere[çc]o:|Bairro:|Cidade:|Data Emiss[aã]o:|Data Previs[aã]o:|Observa[çc][aã]o:|Item\s+C[oó]digo|Peso Unit|Peso Total|Total Peso L[ií]quido|Total Volume|L[ií]quido/i;

function parseLocaleNumber(value?: string) {
  if (!value) return undefined;
  return toNumber(value);
}

function findMetrics(text: string) {
  // Formato padrão: UN + quantidade + peso unitário + peso total + volume.
  // Alguns relatórios simples/exportados perdem uma ou mais colunas de peso.
  // Tentamos do formato mais específico para o mais conservador, sempre no fim do registro
  // para não confundir composição física (ex.: "4 PCS 2250X100X15") com a quantidade vendida.
  const patterns = [
    new RegExp(String.raw`\b(${UNIT_PATTERN})\b\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})(?=\s|$)`, "gi"),
    new RegExp(String.raw`\b(${UNIT_PATTERN})\b\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})(?=\s|$)`, "gi"),
    new RegExp(String.raw`\b(${UNIT_PATTERN})\b\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})(?=\s|$)`, "gi"),
    new RegExp(String.raw`\b(${UNIT_PATTERN})\b\s+(${NUMBER_PATTERN})(?=\s|$)`, "gi"),
  ];

  for (const rx of patterns) {
    const matches = [...text.matchAll(rx)];
    // Prefira o último bloco de métricas do registro.
    for (const match of matches.reverse()) {
      if (match.index === undefined) continue;
      const quantity = parseLocaleNumber(match[2]);
      if (!(quantity !== undefined && quantity > 0)) continue;
      const tail = clean(text.slice(match.index + match[0].length));
      // Se ainda houver texto descritivo importante depois do bloco, provavelmente não é o rodapé do item.
      if (tail && /[A-Za-zÀ-ÿ]/.test(tail) && tail.length > 24) continue;
      const numeric = match.slice(3).map((value) => parseLocaleNumber(value)).filter((value): value is number => value !== undefined);
      const volume = numeric.length ? numeric.at(-1) : undefined;
      return {
        index: match.index,
        end: match.index + match[0].length,
        unit: clean(match[1]),
        quantity: Math.round(quantity),
        volume,
        raw: match[0],
      };
    }
  }
  return undefined;
}

function sanitizeDescription(value: string, item: string, code: string) {
  let text = clean(value);
  text = text.replace(new RegExp(String.raw`(?:^|\s)${item.replace(".", "\\.")}\s+${code}\b`, "i"), " ");
  text = text.replace(/\b(?:CJ|PC|UN|JG|PÇ|PÇS|PCS|PEÇA|PEÇAS|PAR|MT|M²?|M³?)\b\s+(?:[\d.,]+\s*){1,5}$/i, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function meaningfulLine(line: string) {
  const value = clean(line);
  if (!value) return false;
  if (HEADER_OR_FOOTER.test(value)) return false;
  if (/^[-–—_]+$/.test(value)) return false;
  return true;
}

function collectRecord(lines: string[], anchorIndex: number, previousAnchor: number, nextAnchor: number) {
  let start = anchorIndex;
  let backwards = 0;
  for (let index = anchorIndex - 1; index > previousAnchor && index >= 0 && backwards < 8; index -= 1) {
    const value = lines[index];
    if (!clean(value)) break;
    if (ANCHOR.test(value)) break;
    if (HEADER_OR_FOOTER.test(value)) break;
    start = index;
    backwards += 1;
  }

  let end = anchorIndex;
  let forwards = 0;
  for (let index = anchorIndex + 1; index < nextAnchor && index < lines.length && forwards < 12; index += 1) {
    const value = lines[index];
    if (!clean(value)) break;
    if (ANCHOR.test(value)) break;
    if (/Total Peso L[ií]quido/i.test(value)) break;
    end = index;
    forwards += 1;
  }

  // Alguns PDFs perdem as linhas em branco. Nesse caso usa a janela entre âncoras,
  // mas limita a quantidade de linhas para não misturar registros vizinhos.
  if (start === anchorIndex && anchorIndex > previousAnchor + 1) {
    for (let index = anchorIndex - 1; index > previousAnchor && index >= Math.max(0, anchorIndex - 4); index -= 1) {
      if (ANCHOR.test(lines[index]) || HEADER_OR_FOOTER.test(lines[index])) break;
      if (meaningfulLine(lines[index])) start = index;
    }
  }
  if (end === anchorIndex && nextAnchor > anchorIndex + 1) {
    for (let index = anchorIndex + 1; index < nextAnchor && index <= anchorIndex + 6; index += 1) {
      if (ANCHOR.test(lines[index]) || HEADER_OR_FOOTER.test(lines[index])) break;
      if (meaningfulLine(lines[index])) end = index;
    }
  }

  return lines.slice(start, end + 1);
}

function extractFromRecord(recordLines: string[], anchorLine: string) {
  const anchor = anchorLine.match(ANCHOR);
  if (!anchor) return undefined;
  const item = anchor[1];
  const code = anchor[2];

  const useful = recordLines.filter((line) => meaningfulLine(line));
  let flat = clean(useful.join(" "));
  const metrics = findMetrics(flat);
  if (!metrics) return undefined;

  const beforeMetrics = flat.slice(0, metrics.index);
  const afterMetrics = flat.slice(metrics.end);
  const description = sanitizeDescription(clean(`${beforeMetrics} ${afterMetrics}`), item, code);
  if (!description || !/[A-Za-zÀ-ÿ]/.test(description)) return undefined;

  return {
    item,
    code,
    description,
    unit: metrics.unit,
    quantity: metrics.quantity,
    volume: metrics.volume,
  } satisfies OrderPdfItem;
}


function parseFixedLayoutLines(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const output: OrderPdfItem[] = [];
  const rowRx = new RegExp(
    String.raw`^\s*(\d{1,4}(?:\.\d+)?)\s+(\d{4,12})\s+(.*?)\s+(${UNIT_PATTERN})\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})\s+(${NUMBER_PATTERN})\s*$`,
    "i",
  );
  const anchorIndexes = lines.map((line, index) => ANCHOR.test(line) ? index : -1).filter((index) => index >= 0);
  const previousAnchor = (index: number) => [...anchorIndexes].reverse().find((value) => value < index) ?? -1;
  const nextAnchor = (index: number) => anchorIndexes.find((value) => value > index) ?? lines.length;

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(rowRx);
    if (!match) continue;
    const item = match[1];
    const code = match[2];
    const unit = clean(match[4]);
    const quantity = parseLocaleNumber(match[5]);
    if (!(quantity !== undefined && quantity > 0)) continue;

    const before: string[] = [];
    const after: string[] = [];
    const prev = previousAnchor(index);
    const next = nextAnchor(index);
    for (let cursor = index - 1; cursor > prev && cursor >= Math.max(prev + 1, index - 5); cursor--) {
      const value = clean(lines[cursor]);
      if (!value || HEADER_OR_FOOTER.test(value)) break;
      before.unshift(value);
    }
    for (let cursor = index + 1; cursor < next && cursor <= index + 5; cursor++) {
      const value = clean(lines[cursor]);
      if (!value || HEADER_OR_FOOTER.test(value)) break;
      after.push(value);
    }
    const description = sanitizeDescription(clean(`${before.join(" ")} ${match[3]} ${after.join(" ")}`), item, code);
    if (!description || !/[A-Za-zÀ-ÿ]/.test(description)) continue;
    output.push({ item, code, description, unit, quantity: Math.round(quantity), volume: parseLocaleNumber(match[8]) });
  }
  return output;
}
function parsePage(page: string) {
  const normalized = page.replace(/\r/g, "");
  const blocks = normalized
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const output: OrderPdfItem[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const anchorLine = lines.find((line) => ANCHOR.test(line));
    if (!anchorLine) continue;
    const anchor = anchorLine.match(ANCHOR);
    if (!anchor) continue;
    const item = anchor[1];
    const code = anchor[2];

    const useful = lines.filter((line) => meaningfulLine(line));
    const flat = clean(useful.join(" "));
    const metrics = findMetrics(flat);
    if (!metrics) continue;
    const anchorMatch = flat.match(new RegExp(String.raw`(?:^|\s)${item.replace(".", "\\.")}\s+${code}\b`, "i"));
    if (!anchorMatch || anchorMatch.index === undefined) continue;
    const anchorStart = anchorMatch.index;
    const anchorEnd = anchorStart + anchorMatch[0].length;

    const description = sanitizeDescription(
      clean(`${flat.slice(0, anchorStart)} ${flat.slice(anchorEnd, metrics.index)} ${flat.slice(metrics.end)}`),
      item,
      code,
    );
    if (!description || !/[A-Za-zÀ-ÿ]/.test(description)) continue;
    output.push({ item, code, description, unit: metrics.unit, quantity: metrics.quantity, volume: metrics.volume });
  }
  return output;
}

function parseGlobalFallback(text: string, existing: Set<string>) {
  const lines = text.replace(/\r/g, "").split("\n");
  const output: OrderPdfItem[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const anchor = lines[index].match(ANCHOR);
    if (!anchor) continue;
    const key = `${anchor[1]}|${anchor[2]}`;
    if (existing.has(key)) continue;

    const segment: string[] = [];
    for (let cursor = Math.max(0, index - 5); cursor <= Math.min(lines.length - 1, index + 8); cursor += 1) {
      if (cursor !== index && ANCHOR.test(lines[cursor])) continue;
      if (HEADER_OR_FOOTER.test(lines[cursor])) continue;
      segment.push(lines[cursor]);
    }
    const parsed = extractFromRecord(segment, lines[index]);
    if (parsed) output.push(parsed);
  }
  return output;
}

export function parseOrderItems(pdfText: string): OrderPdfItem[] {
  const found = new Map<string, OrderPdfItem>();
  const put = (item: OrderPdfItem) => {
    if (!item.item || !item.code || !item.description || !(item.quantity > 0)) return;
    const key = `${item.item}|${item.code}`;
    const previous = found.get(key);
    if (!previous || item.description.length > previous.description.length) found.set(key, { ...item, description: clean(item.description) });
  };

  const pages = pdfText.replace(/\r/g, "").split(/\f+/).filter((page) => page.trim());
  for (const page of pages.length ? pages : [pdfText]) {
    parseFixedLayoutLines(page).forEach(put);
    parsePage(page).forEach(put);
  }
  parseGlobalFallback(pdfText, new Set(found.keys())).forEach(put);

  return [...found.values()].sort((a, b) => {
    const left = a.item.split(".").map(Number);
    const right = b.item.split(".").map(Number);
    return (left[0] - right[0]) || ((left[1] || 0) - (right[1] || 0));
  });
}

export function physicalOrderItems(items: OrderPdfItem[]) {
  const parentIds = new Set(items.filter((item) => item.item.includes(".")).map((item) => item.item.split(".")[0]));
  return items.filter((item) => item.item.includes(".") || !parentIds.has(item.item));
}

export function parseOrderHeader(pdfText: string): OrderHeader {
  const flat = clean(pdfText);
  const orderNumber = flat.match(/Pedido:\s*(\d+)/i)?.[1] || "NÃO IDENTIFICADO";
  const rawClient = clean(flat.match(/Cliente:\s*(.+?)(?=CNPJ:|Endere[çc]o:|Bairro:|Cidade:|Data Emiss[aã]o:)/i)?.[1] || "Cliente não identificado");
  const client = rawClient.replace(/^\d+\s*[-–—]\s*/, "");
  const destination = clean(flat.match(/Cidade:\s*(.+?)(?=Data Emiss[aã]o:|Data Previs[aã]o:|Observa[çc][aã]o:)/i)?.[1] || "");
  const delivery = flat.match(/(\d+\s*[º°ª]?\s*ENTREGA)/i)?.[1]?.replace(/\s+/g, " ");
  return { orderNumber, client, destination, delivery };
}

export function parserDebugSummary(pdfText: string) {
  const all = parseOrderItems(pdfText);
  const physical = physicalOrderItems(all);
  return {
    all: all.length,
    physical: physical.length,
    items: physical.map((item) => ({ item: item.item, code: item.code, quantity: item.quantity, description: item.description })),
    header: parseOrderHeader(pdfText),
    textHasItemHeader: norm(pdfText).includes("ITEM CODIGO"),
  };
}
