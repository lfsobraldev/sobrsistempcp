"use client";

type Foto = {
  id: string;
  dataUrl: string;
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

function data(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : DATA.format(d);
}

function textoStatus(v?: string) {
  return String(v || "").replaceAll("_", " ");
}

const CHECK_LABELS: Record<string, string> = {
  alinhamento: "Alinhamento",
  amarracao: "Amarração",
  calcos: "Calços / proteção",
  avarias: "Sem avarias",
  quantidade: "Quantidade",
  identificacao: "Identificação",
};

function checklistTexto(checklist?: Record<string, boolean>) {
  if (!checklist) return "";
  return Object.entries(checklist)
    .map(([key, ok]) => `${CHECK_LABELS[key] || key}: ${ok ? "OK" : "PENDENTE"}`)
    .join(" | ");
}

function estiloCabecalho(row: any) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 26;
}

function bordas(ws: any) {
  ws.eachRow((row: any, rowNumber: number) => {
    row.eachCell((cell: any) => {
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        ...(rowNumber === 1 ? { horizontal: "center" } : {}),
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });
}

async function imagemCompativel(dataUrl: string) {
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

export async function baixarRelatorioPalletsExcel(
  pallets: PalletRelatorio[],
  nome = "Relatorio_Inspecao_Pallets"
) {
  const mod = await import("exceljs");
  const ExcelJS = (mod as any).default ?? mod;
  const wb = new ExcelJS.Workbook();

  wb.creator = "Sobral PCP";
  wb.created = new Date();

  /*
   * RELATÓRIO ENXUTO:
   * somente o que importa para a inspeção do pallet.
   *
   * 1) INSPEÇÕES
   * 2) FOTOS
   */
  const insp = wb.addWorksheet("INSPECOES");
  insp.columns = [
    { width: 14 },
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 54 },
    { width: 42 },
    { width: 22 },
    { width: 20 },
  ];

  insp.addRow([
    "Pallet",
    "Pedido",
    "Cliente",
    "Área",
    "Resultado",
    "Itens verificados",
    "Observação",
    "Responsável",
    "Data",
  ]);
  estiloCabecalho(insp.getRow(1));

  for (const p of pallets) {
    const inspecoes = p.inspecoes || [];

    if (!inspecoes.length) {
      insp.addRow([
        p.pallet,
        p.pedido,
        p.cliente || "",
        "",
        "SEM INSPEÇÃO",
        "",
        "",
        "",
        "",
      ]);
      continue;
    }

    for (const i of inspecoes) {
      insp.addRow([
        p.pallet,
        p.pedido,
        p.cliente || "",
        i.area || "QUALIDADE",
        textoStatus(i.resultado),
        checklistTexto(i.checklist),
        i.observacao || "",
        i.usuario || "",
        data(i.criadoEm),
      ]);
    }
  }

  insp.views = [{ state: "frozen", ySplit: 1 }];
  bordas(insp);

  const fotos = wb.addWorksheet("FOTOS");
  fotos.columns = [
    { width: 14 },
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 22 },
    { width: 20 },
    { width: 38 },
    { width: 42 },
  ];

  fotos.addRow([
    "Pallet",
    "Pedido",
    "Cliente",
    "Área",
    "Responsável",
    "Data",
    "Observação",
    "Imagem",
  ]);
  estiloCabecalho(fotos.getRow(1));

  let linha = 2;

  for (const p of pallets) {
    const evidencias = p.fotos || [];

    if (!evidencias.length) {
      fotos.addRow([
        p.pallet,
        p.pedido,
        p.cliente || "",
        "",
        "",
        "",
        "Sem foto registrada",
        "",
      ]);
      linha++;
      continue;
    }

    for (const f of evidencias) {
      fotos.addRow([
        p.pallet,
        p.pedido,
        p.cliente || "",
        f.area || "QUALIDADE",
        f.usuario || "",
        data(f.criadoEm),
        f.legenda || "",
        "",
      ]);

      fotos.getRow(linha).height = 120;

      try {
        const imagem = await imagemCompativel(f.dataUrl);
        if (imagem) {
          const id = wb.addImage({
            base64: imagem.base64,
            extension: imagem.extension,
          });

          fotos.addImage(id, {
            tl: { col: 7, row: linha - 1 },
            ext: { width: 250, height: 150 },
          });
        }
      } catch {
        fotos.getCell(linha, 8).value = "Imagem indisponível";
      }

      linha++;
    }
  }

  fotos.views = [{ state: "frozen", ySplit: 1 }];
  bordas(fotos);

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
