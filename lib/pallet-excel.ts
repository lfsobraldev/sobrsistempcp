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

type NaoConformidade = {
  id: string;
  codigo?: string;
  categoria?: string;
  tipoDefeito?: string;
  gravidade?: string;
  quantidadeAfetada?: number;
  localDefeito?: string;
  descricao?: string;
  contencao?: string;
  acaoCorretiva?: string;
  responsavel?: string;
  prazo?: string | null;
  status?: string;
  correcaoExecutada?: string;
  corrigidoPor?: string;
  corrigidoEm?: string | null;
  reinspecaoResultado?: string;
  reinspecaoUsuario?: string;
  reinspecaoEm?: string | null;
  reinspecaoObservacao?: string;
  criadoPor?: string;
  criadoEm?: string;
};

type Medicao = {
  id: string;
  caracteristica?: string;
  nominal?: number | null;
  toleranciaMin?: number | null;
  toleranciaMax?: number | null;
  medido?: number;
  unidade?: string;
  resultado?: string;
  observacao?: string;
  usuario?: string;
  criadoEm?: string;
};

type Evento = {
  id: number;
  tipo?: string;
  descricao?: string;
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
  naoConformidades?: NaoConformidade[];
  medicoes?: Medicao[];
  eventos?: Evento[];
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

function checklistTexto(checklist?: Record<string, boolean>) {
  if (!checklist) return "";
  return Object.entries(checklist)
    .map(([k, ok]) => `${k}: ${ok ? "OK" : "NÃO"}`)
    .join(" | ");
}

function estiloCabecalho(row: any) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 28;
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

function autoLargura(ws: any, min = 11, max = 42) {
  ws.columns.forEach((col: any) => {
    let width = min;
    col.eachCell?.({ includeEmpty: true }, (cell: any) => {
      const len = String(cell.value ?? "").length + 2;
      width = Math.max(width, Math.min(max, len));
    });
    col.width = width;
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

  // ExcelJS não trabalha de forma confiável com WebP.
  // Converte para JPEG no navegador antes de inserir no XLSX.
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

function adicionarTitulo(ws: any, titulo: string, colunas: number) {
  ws.insertRow(1, [titulo]);
  ws.mergeCells(1, 1, 1, Math.max(1, colunas));
  const c = ws.getCell(1, 1);
  c.font = { bold: true, size: 16 };
  c.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 30;
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

  const total = pallets.length;
  const liberados = pallets.filter((p) => p.status === "LIBERADO").length;
  const bloqueados = pallets.filter((p) => p.status === "BLOQUEADO").length;
  const aguardando = pallets.filter((p) => p.status === "AGUARDANDO_INSPECAO").length;
  const emLiberacao = pallets.filter((p) => p.status === "EM_LIBERACAO").length;
  const fotosTotal = pallets.reduce((s, p) => s + (p.fotos?.length || 0), 0);
  const inspecoesTotal = pallets.reduce((s, p) => s + (p.inspecoes?.length || 0), 0);
  const ncTotal = pallets.reduce((s, p) => s + (p.naoConformidades?.length || 0), 0);

  const resumo = wb.addWorksheet("RESUMO");
  resumo.addRow(["Indicador", "Valor"]);
  resumo.addRows([
    ["Pallets no relatório", total],
    ["Liberados", liberados],
    ["Bloqueados", bloqueados],
    ["Em liberação", emLiberacao],
    ["Aguardando inspeção", aguardando],
    ["Inspeções registradas", inspecoesTotal],
    ["Não conformidades", ncTotal],
    ["Fotos / evidências", fotosTotal],
    ["Gerado em", new Date().toLocaleString("pt-BR")],
  ]);
  estiloCabecalho(resumo.getRow(1));
  autoLargura(resumo, 18, 40);
  bordas(resumo);

  const ws = wb.addWorksheet("PALLETS");
  ws.addRow([
    "Nº Pallet",
    "Código",
    "Pedido",
    "Cliente",
    "Filtro",
    "Tipo de produto",
    "Quantidade",
    "Jogos",
    "Turno",
    "Destino",
    "Montador",
    "Conferente",
    "Status",
    "Qualidade",
    "Usuário Qualidade",
    "Data Qualidade",
    "Obs. Qualidade",
    "MSAC",
    "Usuário MSAC",
    "Data MSAC",
    "Obs. MSAC",
    "Bloqueio",
    "Observação",
    "Fotos",
    "Criado em",
    "Atualizado em",
  ]);

  for (const p of pallets) {
    ws.addRow([
      p.pallet,
      p.codigo,
      p.pedido,
      p.cliente,
      p.filtro,
      p.tipo_produto,
      Number(p.quantidade || 0),
      Number(p.jogos || 0),
      p.turno,
      p.destino,
      p.montador,
      p.conferente,
      textoStatus(p.status),
      textoStatus(p.qualidade_status),
      p.qualidade_usuario,
      data(p.qualidade_em),
      p.qualidade_observacao,
      textoStatus(p.msac_status),
      p.msac_usuario,
      data(p.msac_em),
      p.msac_observacao,
      p.bloqueio_motivo,
      p.observacao,
      p.fotos?.length || p.fotos_count || 0,
      data(p.criado_em),
      data(p.atualizado_em),
    ]);
  }
  estiloCabecalho(ws.getRow(1));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "Z1" };
  autoLargura(ws, 11, 36);
  bordas(ws);

  const insp = wb.addWorksheet("INSPECOES");
  insp.addRow([
    "Nº Pallet",
    "Pedido",
    "Área",
    "Resultado",
    "Checklist",
    "Observação",
    "Usuário",
    "Data",
  ]);
  for (const p of pallets) {
    for (const i of p.inspecoes || []) {
      insp.addRow([
        p.pallet,
        p.pedido,
        i.area || "",
        textoStatus(i.resultado),
        checklistTexto(i.checklist),
        i.observacao || "",
        i.usuario || "",
        data(i.criadoEm),
      ]);
    }
  }
  estiloCabecalho(insp.getRow(1));
  insp.views = [{ state: "frozen", ySplit: 1 }];
  autoLargura(insp, 12, 48);
  bordas(insp);

  const nc = wb.addWorksheet("NAO CONFORMIDADES");
  nc.addRow([
    "Nº Pallet",
    "Pedido",
    "Código NC",
    "Categoria",
    "Defeito",
    "Gravidade",
    "Qtd afetada",
    "Local",
    "Descrição",
    "Contenção",
    "Ação corretiva",
    "Responsável",
    "Prazo",
    "Status",
    "Correção executada",
    "Corrigido por",
    "Corrigido em",
    "Reinspeção",
    "Usuário reinspeção",
    "Data reinspeção",
    "Obs. reinspeção",
    "Criado por",
    "Criado em",
  ]);
  for (const p of pallets) {
    for (const n of p.naoConformidades || []) {
      nc.addRow([
        p.pallet,
        p.pedido,
        n.codigo || "",
        n.categoria || "",
        n.tipoDefeito || "",
        n.gravidade || "",
        Number(n.quantidadeAfetada || 0),
        n.localDefeito || "",
        n.descricao || "",
        n.contencao || "",
        n.acaoCorretiva || "",
        n.responsavel || "",
        data(n.prazo),
        textoStatus(n.status),
        n.correcaoExecutada || "",
        n.corrigidoPor || "",
        data(n.corrigidoEm),
        textoStatus(n.reinspecaoResultado),
        n.reinspecaoUsuario || "",
        data(n.reinspecaoEm),
        n.reinspecaoObservacao || "",
        n.criadoPor || "",
        data(n.criadoEm),
      ]);
    }
  }
  estiloCabecalho(nc.getRow(1));
  nc.views = [{ state: "frozen", ySplit: 1 }];
  autoLargura(nc, 12, 48);
  bordas(nc);

  const med = wb.addWorksheet("MEDICOES");
  med.addRow([
    "Nº Pallet",
    "Pedido",
    "Característica",
    "Nominal",
    "Tol. mín.",
    "Tol. máx.",
    "Medido",
    "Unidade",
    "Resultado",
    "Observação",
    "Usuário",
    "Data",
  ]);
  for (const p of pallets) {
    for (const m of p.medicoes || []) {
      med.addRow([
        p.pallet,
        p.pedido,
        m.caracteristica || "",
        m.nominal ?? "",
        m.toleranciaMin ?? "",
        m.toleranciaMax ?? "",
        m.medido ?? "",
        m.unidade || "",
        textoStatus(m.resultado),
        m.observacao || "",
        m.usuario || "",
        data(m.criadoEm),
      ]);
    }
  }
  estiloCabecalho(med.getRow(1));
  med.views = [{ state: "frozen", ySplit: 1 }];
  autoLargura(med, 12, 42);
  bordas(med);

  const hist = wb.addWorksheet("RASTREABILIDADE");
  hist.addRow([
    "Nº Pallet",
    "Pedido",
    "Evento",
    "Descrição",
    "Usuário",
    "Data",
  ]);
  for (const p of pallets) {
    for (const e of p.eventos || []) {
      hist.addRow([
        p.pallet,
        p.pedido,
        textoStatus(e.tipo),
        e.descricao || "",
        e.usuario || "",
        data(e.criadoEm),
      ]);
    }
  }
  estiloCabecalho(hist.getRow(1));
  hist.views = [{ state: "frozen", ySplit: 1 }];
  autoLargura(hist, 12, 50);
  bordas(hist);

  /*
   * Evidências fotográficas incorporadas ao próprio Excel.
   * Cada foto mostra pallet, pedido, área, tipo, usuário, data e legenda.
   */
  const fotos = wb.addWorksheet("FOTOS");
  fotos.columns = [
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 26 },
    { width: 22 },
    { width: 24 },
    { width: 38 },
  ];

  fotos.addRow([
    "Nº Pallet",
    "Pedido",
    "Área",
    "Tipo",
    "Usuário",
    "Data",
    "NC",
    "Legenda / Evidência",
  ]);
  estiloCabecalho(fotos.getRow(1));

  let linha = 2;

  for (const p of pallets) {
    const evidencias = p.fotos || [];

    if (!evidencias.length) {
      fotos.addRow([
        p.pallet,
        p.pedido,
        "",
        "",
        "",
        "",
        "",
        "Sem foto registrada",
      ]);
      linha++;
      continue;
    }

    for (let idx = 0; idx < evidencias.length; idx++) {
      const f = evidencias[idx];

      fotos.addRow([
        p.pallet,
        p.pedido,
        f.area || "",
        f.tipo || "GERAL",
        f.usuario || "",
        data(f.criadoEm),
        f.ncId || "",
        f.legenda || "",
      ]);

      fotos.getRow(linha).height = 125;

      try {
        const imagem = await imagemCompativel(f.dataUrl);
        if (imagem) {
          const id = wb.addImage({
            base64: imagem.base64,
            extension: imagem.extension,
          });

          /*
           * Coloca a imagem abaixo da linha de metadados,
           * ocupando uma área ampla e legível.
           */
          fotos.addImage(id, {
            tl: { col: 8, row: linha - 1 },
            ext: { width: 240, height: 160 },
          });
          fotos.getColumn(9).width = 36;
        }
      } catch {
        // O relatório continua sendo gerado mesmo que uma foto isolada falhe.
      }

      linha++;
    }
  }

  fotos.getCell("I1").value = "Imagem";
  fotos.getCell("I1").font = { bold: true };
  fotos.getCell("I1").alignment = { horizontal: "center" };
  bordas(fotos);
  fotos.views = [{ state: "frozen", ySplit: 1 }];

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
