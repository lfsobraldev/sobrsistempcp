type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type LineBucket = {
  y: number;
  items: Array<{ x: number; width: number; text: string }>;
};

function median(values: number[]) {
  if (!values.length) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function renderLine(line: LineBucket) {
  const ordered = [...line.items].sort((a, b) => a.x - b.x);
  let out = "";
  let previousEnd: number | undefined;
  let averageChar = 5;

  for (const item of ordered) {
    const text = String(item.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (text.length && item.width > 0) {
      const candidate = item.width / Math.max(1, text.length);
      if (candidate > 1 && candidate < 20) averageChar = (averageChar * 3 + candidate) / 4;
    }

    if (previousEnd !== undefined) {
      const gap = item.x - previousEnd;
      if (gap > averageChar * 0.5) {
        const spaces = Math.max(1, Math.min(18, Math.round(gap / Math.max(2.5, averageChar))));
        out += " ".repeat(spaces);
      } else if (out && !out.endsWith(" ")) {
        out += " ";
      }
    }

    out += text;
    previousEnd = Math.max(previousEnd ?? item.x, item.x + Math.max(item.width || 0, text.length * averageChar));
  }

  return out.trimEnd();
}

/**
 * pdf-parse normalmente devolve texto suficiente para PDFs simples, mas os pedidos
 * da Famossul dependem da posição das colunas e dos espaços verticais entre itens.
 * Este renderer reconstrói linhas pelo eixo Y e mantém uma linha em branco quando
 * existe um salto vertical maior, permitindo que o parser trate cada item como bloco.
 */
export function createLayoutPageRenderer() {
  let pageNumber = 0;

  return async function renderPage(pageData: any): Promise<string> {
    pageNumber += 1;
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });

    const buckets: LineBucket[] = [];
    const tolerance = 2.2;
    const items = (textContent?.items || []) as PdfTextItem[];

    for (const raw of items) {
      const text = String(raw.str || "");
      const transform = Array.isArray(raw.transform) ? raw.transform : [];
      const x = Number(transform[4] || 0);
      const y = Number(transform[5] || 0);
      const width = Number(raw.width || 0);
      if (!text.trim()) continue;

      let line = buckets.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
      if (!line) {
        line = { y, items: [] };
        buckets.push(line);
      }
      line.items.push({ x, width, text });
    }

    const ordered = buckets.sort((a, b) => b.y - a.y);
    const yDiffs: number[] = [];
    for (let i = 1; i < ordered.length; i += 1) {
      const gap = ordered[i - 1].y - ordered[i].y;
      if (gap > 0.5 && gap < 60) yDiffs.push(gap);
    }
    const normalGap = Math.max(7, Math.min(18, median(yDiffs.filter((v) => v < 24))));

    const lines: string[] = [];
    let previousY: number | undefined;
    for (const line of ordered) {
      if (previousY !== undefined) {
        const gap = previousY - line.y;
        if (gap > normalGap * 1.55) lines.push("");
      }
      const rendered = renderLine(line);
      if (rendered) lines.push(rendered);
      previousY = line.y;
    }

    return `${pageNumber > 1 ? "\f\n" : ""}${lines.join("\n")}`;
  };
}
