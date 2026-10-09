"use client";

type Foto = {
  id: string;
  dataUrl?: string | null;
  url?: string;
  legenda?: string;
  area?: string;
  tipo?: string;
  ncId?: string | null;
  usuario?: string;
  criadoEm?: string;
};

type Inspecao = {
  id: string;
  area?: string;
  resultado?: string;
  checklist?: Record<string, boolean>;
  observacao?: string;
  usuario?: string;
  criadoEm?: string;
};

export type PalletRelatorio = {
  id: string;
  codigo: string;
  pedido: string;
  cliente: string;
  filtro: string;
  pallet: string;
  tipo_produto: string;
  quantidade: number;
  jogos: number;
  turno: string;
  destino: string;
  montador: string;
  conferente: string;
  observacao: string;
  status: string;
  qualidade_status: string;
  qualidade_usuario: string;
  qualidade_em: string | null;
  qualidade_observacao: string;
  msac_status: string;
  msac_usuario: string;
  msac_em: string | null;
  msac_observacao: string;
  bloqueio_motivo: string;
  criado_em: string;
  atualizado_em: string;
  fotos_count: number;
  fotos?: Foto[];
  inspecoes?: Inspecao[];
};

const DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const CHECK_LABELS: Record<string, string> = {
  alinhamento: "Alinhamento",
  amarracao: "Amarração",
  calcos: "Calços / proteção",
  avarias: "Sem avarias",
  quantidade: "Quantidade",
  identificacao: "Identificação",
};

function data(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : DATA.format(d);
}

function textoStatus(v?: string) {
  return String(v || "").replaceAll("_", " ").trim();
}

function checklistTexto(checklist?: Record<string, boolean>) {
  if (!checklist) return "";
  return Object.entries(checklist)
    .map(([key, ok]) => `${CHECK_LABELS[key] || key}: ${ok ? "OK" : "PENDENTE"}`)
    .join(" • ");
}

function bordaFina() {
  return {
    top: { style: "thin" as const, color: { argb: "FFB9C5BF" } },
    left: { style: "thin" as const, color: { argb: "FFB9C5BF" } },
    bottom: { style: "thin" as const, color: { argb: "FFB9C5BF" } },
    right: { style: "thin" as const, color: { argb: "FFB9C5BF" } },
  };
}

function aplicarCaixa(ws: any, ini: number, fim: number, colIni = 1, colFim = 8) {
  for (let row = ini; row <= fim; row++) {
    for (let col = colIni; col <= colFim; col++) {
      const cell = ws.getCell(row, col);
      cell.border = bordaFina();
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    }
  }
}

function label(ws: any, address: string, value: string) {
  const cell = ws.getCell(address);
  cell.value = value;
  cell.font = { bold: true, color: { argb: "FF47574F" }, size: 9 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF3F0" },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function valor(ws: any, address: string, value: string | number) {
  const cell = ws.getCell(address);
  cell.value = value;
  cell.font = { bold: true, color: { argb: "FF17251F" }, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
}

async function imagemCompativel(origem?: string | null) {
  if (!origem) return null;

  let dataUrl = origem;

  if (!String(dataUrl).startsWith("data:image/")) {
    const response = await fetch(String(dataUrl), { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Não foi possível carregar uma foto.");
    }

    const blob = await response.blob();
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Não foi possível converter uma foto."));
      reader.readAsDataURL(blob);
    });
  }

  const m = String(dataUrl || "").match(
    /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i
  );

  if (!m) return null;

  const tipo = m[1].toLowerCase();

  if (tipo === "jpeg" || tipo === "jpg") {
    return { base64: dataUrl, extension: "jpeg" as const };
  }

  if (tipo === "png") {
    return { base64: dataUrl, extension: "png" as const };
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Não foi possível converter uma foto."));
    i.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, img.naturalWidth || img.width);
  canvas.height = Math.max(1, img.naturalHeight || img.height);
  canvas.getContext("2d")?.drawImage(img, 0, 0);

  return {
    base64: canvas.toDataURL("image/jpeg", 0.86),
    extension: "jpeg" as const,
  };
}

function conclusao(p: PalletRelatorio) {
  const qualidade = String(p.qualidade_status || "").toUpperCase();
  const global = String(p.status || "").toUpperCase();
  const inspecoes = p.inspecoes || [];
  const ultima = [...inspecoes]
    .sort((a, b) => new Date(a.criadoEm || 0).getTime() - new Date(b.criadoEm || 0).getTime())
    .at(-1);

  if (global === "BLOQUEADO" || qualidade === "BLOQUEADO") {
    return {
      texto: "PALLET BLOQUEADO PELA QUALIDADE",
      detalhe: p.bloqueio_motivo || p.qualidade_observacao || "Existe pendência de qualidade registrada.",
      fill: "FFFDE8E8",
      cor: "FF9B1C1C",
    };
  }

  if (
    global === "LIBERADO" ||
    qualidade === "LIBERADO" ||
    String(ultima?.resultado || "").toUpperCase() === "CONFORME"
  ) {
    return {
      texto: "PALLET LIBERADO PELA QUALIDADE",
      detalhe: p.qualidade_observacao || ultima?.observacao || "Inspeção concluída e evidências registradas.",
      fill: "FFDFF3E6",
      cor: "FF176B3A",
    };
  }

  return {
    texto: "INSPEÇÃO DE QUALIDADE PENDENTE",
    detalhe: p.qualidade_observacao || ultima?.observacao || "Aguardando conclusão da inspeção.",
    fill: "FFFFF4D6",
    cor: "FF8A5A00",
  };
}

async function adicionarFotos(
  wb: any,
  ws: any,
  fotos: Foto[],
  rowInicial: number,
  pallet: PalletRelatorio
) {
  let row = rowInicial;

  ws.mergeCells(row, 1, row, 8);
  ws.getCell(row, 1).value = "EVIDÊNCIAS FOTOGRÁFICAS";
  ws.getCell(row, 1).font = { bold: true, color: { argb: "FF1F4E3D" }, size: 11 };
  ws.getCell(row, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDCE9E1" },
  };
  ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(row).height = 24;
  aplicarCaixa(ws, row, row);
  row++;

  if (!fotos.length) {
    ws.mergeCells(row, 1, row + 1, 8);
    ws.getCell(row, 1).value = "Nenhuma evidência fotográfica registrada.";
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "center" };
    ws.getCell(row, 1).font = { italic: true, color: { argb: "FF66756E" } };
    aplicarCaixa(ws, row, row + 1);
    return row + 3;
  }

  for (let i = 0; i < fotos.length; i += 2) {
    const esquerda = fotos[i];
    const direita = fotos[i + 1];

    const fotoRow = row;
    const captionRow = row + 1;

    ws.mergeCells(fotoRow, 1, fotoRow, 4);
    ws.mergeCells(fotoRow, 5, fotoRow, 8);
    ws.mergeCells(captionRow, 1, captionRow, 4);
    ws.mergeCells(captionRow, 5, captionRow, 8);

    ws.getRow(fotoRow).height = 150;
    ws.getRow(captionRow).height = 38;

    const pares = [
      { foto: esquerda, col: 1, colIndex: 0 },
      { foto: direita, col: 5, colIndex: 4 },
    ];

    for (const item of pares) {
      if (!item.foto) continue;

      try {
        const imagem = await imagemCompativel(
          item.foto.dataUrl || item.foto.url || null
        );
        if (imagem) {
          const id = wb.addImage({
            base64: imagem.base64,
            extension: imagem.extension,
          });

          ws.addImage(id, {
            tl: { col: item.colIndex + 0.12, row: fotoRow - 1 + 0.12 },
            ext: { width: 320, height: 185 },
          });
        }
      } catch {
        ws.getCell(fotoRow, item.col).value = "Imagem indisponível";
      }

      const caption = [
        item.foto.legenda || "Evidência da inspeção",
        item.foto.usuario ? `Responsável: ${item.foto.usuario}` : "",
        item.foto.criadoEm ? data(item.foto.criadoEm) : "",
      ].filter(Boolean).join(" • ");

      ws.getCell(captionRow, item.col).value = caption;
      ws.getCell(captionRow, item.col).font = {
        size: 9,
        color: { argb: "FF43534B" },
      };
      ws.getCell(captionRow, item.col).alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
    }

    aplicarCaixa(ws, fotoRow, captionRow);
    row += 3;
  }

  ws.mergeCells(row, 1, row, 8);
  ws.getCell(row, 1).value =
    `Pallet ${pallet.pallet || pallet.codigo} • Pedido ${pallet.pedido} • ${fotos.length} evidência(s) fotográfica(s)`;
  ws.getCell(row, 1).font = { size: 9, italic: true, color: { argb: "FF5B6962" } };
  ws.getCell(row, 1).alignment = { horizontal: "right", vertical: "middle" };

  return row + 2;
}

export async function baixarRelatorioPalletsExcel(
  pallets: PalletRelatorio[],
  nome = "Relatorio_Inspecao_Pallets"
) {
  const mod = await import("exceljs");
  const ExcelJS = (mod as any).default ?? mod;
  const wb = new ExcelJS.Workbook();

  wb.creator = "Sobral PCP";
  wb.created = new Date();

  // Um único relatório, uma única aba.
  const ws = wb.addWorksheet("INSPECAO QUALIDADE", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws.columns = [
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
  ];

  let row = 1;

  for (let pIndex = 0; pIndex < pallets.length; pIndex++) {
    const p = pallets[pIndex];
    const resultado = conclusao(p);
    const inspecoes = [...(p.inspecoes || [])].sort(
      (a, b) => new Date(a.criadoEm || 0).getTime() - new Date(b.criadoEm || 0).getTime()
    );

    if (pIndex > 0) {
      row += 2;
      ws.addPageBreak?.(row - 1);
    }

    ws.mergeCells(row, 1, row, 8);
    ws.getCell(row, 1).value = "RELATÓRIO DE INSPEÇÃO DE QUALIDADE";
    ws.getCell(row, 1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    ws.getCell(row, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E3D" },
    };
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(row).height = 30;
    aplicarCaixa(ws, row, row);
    row++;

    ws.mergeCells(row, 1, row, 8);
    ws.getCell(row, 1).value = "CONTROLE DE PALLET • FAMOSSUL";
    ws.getCell(row, 1).font = { bold: true, color: { argb: "FF28463A" }, size: 10 };
    ws.getCell(row, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE7EFEA" },
    };
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(row).height = 20;
    aplicarCaixa(ws, row, row);
    row++;

    const metaStart = row;

    label(ws, `A${row}`, "PALLET");
    ws.mergeCells(row, 2, row, 3);
    valor(ws, `B${row}`, p.pallet || p.codigo || "-");
    label(ws, `D${row}`, "PEDIDO");
    ws.mergeCells(row, 5, row, 6);
    valor(ws, `E${row}`, p.pedido || "-");
    label(ws, `G${row}`, "STATUS");
    valor(ws, `H${row}`, textoStatus(p.qualidade_status || p.status) || "-");
    ws.getCell(row, 8).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: resultado.fill },
    };
    ws.getCell(row, 8).font = { bold: true, color: { argb: resultado.cor }, size: 10 };
    row++;

    label(ws, `A${row}`, "CLIENTE");
    ws.mergeCells(row, 2, row, 3);
    valor(ws, `B${row}`, p.cliente || "-");
    label(ws, `D${row}`, "RESPONSÁVEL");
    ws.mergeCells(row, 5, row, 6);
    valor(ws, `E${row}`, p.qualidade_usuario || inspecoes.at(-1)?.usuario || "-");
    label(ws, `G${row}`, "DATA");
    valor(ws, `H${row}`, data(p.qualidade_em || inspecoes.at(-1)?.criadoEm) || "-");
    row++;

    label(ws, `A${row}`, "TIPO");
    ws.mergeCells(row, 2, row, 3);
    valor(ws, `B${row}`, p.tipo_produto || "-");
    label(ws, `D${row}`, "QUANTIDADE");
    ws.mergeCells(row, 5, row, 6);
    valor(ws, `E${row}`, Number(p.quantidade || 0));
    label(ws, `G${row}`, "TURNO");
    valor(ws, `H${row}`, p.turno || "-");
    row++;

    label(ws, `A${row}`, "FILTRO");
    ws.mergeCells(row, 2, row, 3);
    valor(ws, `B${row}`, p.filtro || "-");
    label(ws, `D${row}`, "DESTINO");
    ws.mergeCells(row, 5, row, 8);
    valor(ws, `E${row}`, p.destino || "-");

    aplicarCaixa(ws, metaStart, row);
    for (let r = metaStart; r <= row; r++) ws.getRow(r).height = 30;
    row += 2;

    ws.mergeCells(row, 1, row, 8);
    ws.getCell(row, 1).value = "INSPEÇÃO";
    ws.getCell(row, 1).font = { bold: true, color: { argb: "FF1F4E3D" }, size: 11 };
    ws.getCell(row, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDCE9E1" },
    };
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(row).height = 24;
    aplicarCaixa(ws, row, row);
    row++;

    ws.getRow(row).values = [
      "Data",
      "Área",
      "Resultado",
      "Itens verificados",
      "",
      "",
      "Responsável",
      "Observação",
    ];
    ws.mergeCells(row, 4, row, 6);

    for (let col = 1; col <= 8; col++) {
      const cell = ws.getCell(row, col);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF52675C" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }
    ws.getRow(row).height = 26;
    aplicarCaixa(ws, row, row);
    row++;

    if (!inspecoes.length) {
      ws.mergeCells(row, 1, row, 8);
      ws.getCell(row, 1).value = "Nenhuma inspeção registrada.";
      ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(row, 1).font = { italic: true, color: { argb: "FF67766F" } };
      ws.getRow(row).height = 28;
      aplicarCaixa(ws, row, row);
      row++;
    } else {
      for (const i of inspecoes) {
        ws.getCell(row, 1).value = data(i.criadoEm);
        ws.getCell(row, 2).value = i.area || "QUALIDADE";
        ws.getCell(row, 3).value = textoStatus(i.resultado);
        ws.mergeCells(row, 4, row, 6);
        ws.getCell(row, 4).value = checklistTexto(i.checklist) || "-";
        ws.getCell(row, 7).value = i.usuario || "-";
        ws.getCell(row, 8).value = i.observacao || "-";

        for (let col = 1; col <= 8; col++) {
          ws.getCell(row, col).alignment = {
            vertical: "middle",
            horizontal: col === 4 || col === 8 ? "left" : "center",
            wrapText: true,
          };
          ws.getCell(row, col).font = { size: 9 };
        }

        ws.getCell(row, 3).font = {
          bold: true,
          size: 9,
          color: {
            argb:
              String(i.resultado || "").toUpperCase() === "CONFORME"
                ? "FF176B3A"
                : "FF9B1C1C",
          },
        };

        ws.getRow(row).height = 44;
        aplicarCaixa(ws, row, row);
        row++;
      }
    }

    row++;

    ws.mergeCells(row, 1, row, 8);
    ws.getCell(row, 1).value = "CONCLUSÃO DA INSPEÇÃO";
    ws.getCell(row, 1).font = { bold: true, color: { argb: "FF1F4E3D" }, size: 11 };
    ws.getCell(row, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDCE9E1" },
    };
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "left" };
    aplicarCaixa(ws, row, row);
    row++;

    ws.mergeCells(row, 1, row, 8);
    ws.getCell(row, 1).value = resultado.texto;
    ws.getCell(row, 1).font = { bold: true, color: { argb: resultado.cor }, size: 12 };
    ws.getCell(row, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: resultado.fill },
    };
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(row).height = 30;
    aplicarCaixa(ws, row, row);
    row++;

    ws.mergeCells(row, 1, row, 8);
    ws.getCell(row, 1).value = resultado.detalhe;
    ws.getCell(row, 1).font = { size: 10, color: { argb: "FF304139" } };
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    ws.getRow(row).height = 36;
    aplicarCaixa(ws, row, row);
    row += 2;

    row = await adicionarFotos(wb, ws, p.fotos || [], row, p);
  }

  ws.pageSetup.orientation = "landscape";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageMargins = {
    left: 0.25,
    right: 0.25,
    top: 0.35,
    bottom: 0.35,
    header: 0.15,
    footer: 0.15,
  };
  ws.properties.defaultRowHeight = 20;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const agora = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${agora.getFullYear()}-${z(agora.getMonth() + 1)}-${z(agora.getDate())}_${z(
      agora.getHours()
    )}${z(agora.getMinutes())}`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
