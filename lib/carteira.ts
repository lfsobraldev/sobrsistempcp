/**
 * Regras da Carteira de Pedidos (puras, sem acesso a banco).
 * Usadas pela API /api/carteira, pela tela /carteira e pela Gestão de Pedidos e Entregas.
 *
 * Definições (documentadas na tela):
 * - Solicitada  = soma de pcp_produtos.quantidade do pedido na programação.
 * - Concluída   = soma da quantidade das linhas com percentual_produto >= 100.
 * - Entregue    = soma das remessas ENTREGUE (pcp_controle_entregas_carregamentos).
 *                 Sem remessas, mas com situação ENTREGUE + data de entrega, considera-se o pedido todo
 *                 entregue (origem "STATUS").
 * - Expedida    = remessas EM_TRANSITO + ENTREGUE. Programada = remessas PROGRAMADO. CANCELADO é ignorado.
 * - Prazo de referência = previsão informada ao cliente, senão prazo PCP, senão previsão logística.
 */

export const RISCO_DIAS = 7;

export type Hoje = string; // YYYY-MM-DD

export type Carga = { quantidade: number; status: string };

export type PedidoCarteira = {
  pedido: string;
  cliente: string;
  representante: string;
  uf: string;
  cidade: string;
  pecas: number | null; // null = pedido sem itens na programação
  linhas: number;
  ofs: number;
  pecasConcluidas: number;
  avancoPct: number;
  foraDaProgramacao: boolean;
  statusEntrega: string; // PLANEJADO..ENTREGUE
  previsaoInformada: string | null;
  prazoPcp: string | null;
  previsaoEntrega: string | null;
  dataEntrega: string | null;
  dataSaida: string | null;
  transportadora: string;
  notaFiscal: string;
  atualizadoPor: string;
  atualizadoEm: string | null;
  cargas: Carga[];
  sacAbertos: number;
};

export type Saldos = {
  solicitada: number | null;
  concluida: number;
  entregue: number;
  expedida: number;
  programada: number;
  pendenteProducao: number | null;
  pendenteEntrega: number | null;
  excessoEntrega: number;
  origemEntregue: "REMESSAS" | "STATUS" | "NENHUMA";
};

export type Situacao = "CONCLUIDO" | "ATRASADO" | "EM_RISCO" | "NO_PRAZO" | "SEM_PRAZO";

export const SITUACAO_LABEL: Record<Situacao, string> = {
  CONCLUIDO: "Concluído",
  ATRASADO: "Atrasado",
  EM_RISCO: "Em risco",
  NO_PRAZO: "No prazo",
  SEM_PRAZO: "Sem prazo",
};

const dataValida = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
export const soData = (v: unknown): string | null => (dataValida(v) ? v.slice(0, 10) : null);

export function hojeISO(d = new Date()): Hoje {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(de.slice(0, 10) + "T12:00:00Z");
  const b = Date.parse(ate.slice(0, 10) + "T12:00:00Z");
  return Math.round((b - a) / 86400000);
}

export function formatarData(v: string | null | undefined): string {
  const d = soData(v);
  return d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "—";
}

/** Pedido numérico sem zeros à esquerda e sem espaços; demais valores só em caixa alta. */
export function normalizarPedido(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, "");
  return s.toUpperCase();
}

/** Cliente sem acento, caixa, pontuação e espaços repetidos. Não remove "LTDA/S.A." (evita unir empresas distintas). */
export function normalizarCliente(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function prazoReferencia(p: Pick<PedidoCarteira, "previsaoInformada" | "prazoPcp" | "previsaoEntrega">): { data: string | null; origem: "CLIENTE" | "PCP" | "LOGISTICA" | "NENHUMA" } {
  const a = soData(p.previsaoInformada);
  if (a) return { data: a, origem: "CLIENTE" };
  const b = soData(p.prazoPcp);
  if (b) return { data: b, origem: "PCP" };
  const c = soData(p.previsaoEntrega);
  if (c) return { data: c, origem: "LOGISTICA" };
  return { data: null, origem: "NENHUMA" };
}

export function calcularSaldos(p: PedidoCarteira): Saldos {
  const validas = p.cargas.filter((c) => c.status !== "CANCELADO" && Number.isFinite(c.quantidade) && c.quantidade > 0);
  const soma = (st: string[]) => validas.filter((c) => st.includes(c.status)).reduce((s, c) => s + c.quantidade, 0);
  const programada = soma(["PROGRAMADO"]);
  const expedida = soma(["EM_TRANSITO", "ENTREGUE"]);
  let entregue = soma(["ENTREGUE"]);
  let origemEntregue: Saldos["origemEntregue"] = entregue > 0 ? "REMESSAS" : "NENHUMA";
  const solicitada = p.pecas;
  if (entregue === 0 && p.statusEntrega === "ENTREGUE" && soData(p.dataEntrega) && solicitada !== null) {
    entregue = solicitada;
    origemEntregue = "STATUS";
  }
  return {
    solicitada,
    concluida: p.pecasConcluidas,
    entregue,
    expedida,
    programada,
    pendenteProducao: solicitada === null ? null : Math.max(0, solicitada - p.pecasConcluidas),
    pendenteEntrega: solicitada === null ? null : Math.max(0, solicitada - entregue),
    excessoEntrega: solicitada === null ? 0 : Math.max(0, entregue - solicitada),
    origemEntregue,
  };
}

/** Situação de prazo. `entregaCompleta` pode ser informada quando não há remessas (ex.: tela de Gestão). */
export function situacaoPrazo(args: { prazo: string | null; statusEntrega: string; entregaCompleta: boolean; producaoConcluida: boolean }, hoje: Hoje): Situacao {
  if (args.entregaCompleta || args.statusEntrega === "ENTREGUE") return "CONCLUIDO";
  if (!args.prazo) return "SEM_PRAZO";
  const d = diasEntre(hoje, args.prazo);
  if (d < 0) return "ATRASADO";
  if (d <= RISCO_DIAS && !args.producaoConcluida) return "EM_RISCO";
  return "NO_PRAZO";
}

export function situacaoCarteira(p: PedidoCarteira, hoje: Hoje): Situacao {
  const s = calcularSaldos(p);
  const prazo = prazoReferencia(p).data;
  let risco = false;
  if (prazo && p.previsaoEntrega && soData(p.previsaoEntrega)! > prazo && s.pendenteEntrega !== 0) risco = true; // previsão logística passa do prazo prometido
  const base = situacaoPrazo(
    {
      prazo,
      statusEntrega: p.statusEntrega,
      entregaCompleta: s.solicitada !== null && s.solicitada > 0 && (s.pendenteEntrega ?? 1) === 0,
      producaoConcluida: s.solicitada !== null && (s.pendenteProducao ?? 1) === 0,
    },
    hoje,
  );
  return base === "NO_PRAZO" && risco ? "EM_RISCO" : base;
}

export type Alerta = { codigo: string; gravidade: "ALTA" | "MEDIA" | "BAIXA"; texto: string };

export function alertasPedido(p: PedidoCarteira, hoje: Hoje): Alerta[] {
  const s = calcularSaldos(p);
  const out: Alerta[] = [];
  const prazo = prazoReferencia(p);
  if (!p.cliente.trim()) out.push({ codigo: "CLIENTE_VAZIO", gravidade: "MEDIA", texto: "Pedido sem cliente informado." });
  if (!prazo.data && p.statusEntrega !== "ENTREGUE") out.push({ codigo: "SEM_PRAZO", gravidade: "MEDIA", texto: "Pedido sem prazo prometido, prazo PCP ou previsão de entrega." });
  if (p.foraDaProgramacao) out.push({ codigo: "FORA_DA_PROGRAMACAO", gravidade: "BAIXA", texto: "Pedido cadastrado na Gestão de Entregas, mas sem itens na programação selecionada: quantidades e produção não disponíveis." });
  if (p.statusEntrega === "ENTREGUE" && !soData(p.dataEntrega) && s.origemEntregue !== "REMESSAS") out.push({ codigo: "ENTREGUE_SEM_DATA", gravidade: "ALTA", texto: "Situação ENTREGUE sem data efetiva de entrega." });
  if (p.statusEntrega === "ENTREGUE" && s.origemEntregue === "REMESSAS" && (s.pendenteEntrega ?? 0) > 0) out.push({ codigo: "ENTREGUE_COM_SALDO", gravidade: "ALTA", texto: `Situação ENTREGUE, mas as remessas entregues somam ${s.entregue} de ${s.solicitada} peça(s).` });
  if (s.excessoEntrega > 0) out.push({ codigo: "ENTREGA_ACIMA_DO_PEDIDO", gravidade: "ALTA", texto: `Remessas entregues excedem o pedido em ${s.excessoEntrega} peça(s).` });
  if (s.expedida > 0 && s.solicitada !== null && s.expedida > s.solicitada) out.push({ codigo: "EXPEDIDO_ACIMA_DO_PEDIDO", gravidade: "ALTA", texto: `Remessas expedidas (${s.expedida}) excedem o pedido (${s.solicitada}).` });
  if (s.solicitada && s.pendenteProducao === 0 && s.programada + s.expedida === 0 && p.statusEntrega !== "ENTREGUE") out.push({ codigo: "PRODUZIDO_SEM_REMESSA", gravidade: "MEDIA", texto: "Produção concluída sem remessa programada." });
  if (p.previsaoEntrega && prazo.data && prazo.origem !== "LOGISTICA" && soData(p.previsaoEntrega)! > prazo.data && p.statusEntrega !== "ENTREGUE") out.push({ codigo: "PREVISAO_APOS_PRAZO", gravidade: "ALTA", texto: `Previsão logística (${formatarData(p.previsaoEntrega)}) posterior ao prazo (${formatarData(prazo.data)}).` });
  const sit = situacaoCarteira(p, hoje);
  if (sit === "ATRASADO" && prazo.data) out.push({ codigo: "ATRASADO", gravidade: "ALTA", texto: `Prazo vencido há ${diasEntre(prazo.data, hoje)} dia(s).` });
  if (sit === "EM_RISCO") out.push({ codigo: "EM_RISCO", gravidade: "MEDIA", texto: "Prazo próximo com produção pendente ou previsão logística fora do prazo." });
  if (p.sacAbertos > 0) out.push({ codigo: "SAC_ABERTO", gravidade: "MEDIA", texto: `${p.sacAbertos} atendimento(s) SAC em aberto para este pedido.` });
  return out;
}

export type Duplicidade = { tipo: "PEDIDO" | "CLIENTE"; chave: string; valores: string[] };

/** Detecta possíveis duplicidades SEM alterar nenhum registro. */
export function detectarDuplicidades(lista: Pick<PedidoCarteira, "pedido" | "cliente">[]): Duplicidade[] {
  const out: Duplicidade[] = [];
  const peds = new Map<string, Set<string>>();
  for (const p of lista) {
    const k = normalizarPedido(p.pedido);
    if (!peds.has(k)) peds.set(k, new Set());
    peds.get(k)!.add(p.pedido);
  }
  for (const [k, v] of peds) if (v.size > 1) out.push({ tipo: "PEDIDO", chave: k, valores: [...v].sort() });
  const clis = new Map<string, Set<string>>();
  for (const p of lista) {
    const raw = p.cliente.trim();
    if (!raw) continue;
    const k = normalizarCliente(raw);
    if (!clis.has(k)) clis.set(k, new Set());
    clis.get(k)!.add(raw);
  }
  for (const [k, v] of clis) if (v.size > 1) out.push({ tipo: "CLIENTE", chave: k, valores: [...v].sort() });
  return out;
}

export type Filtros = {
  q?: string;
  cliente?: string;
  situacao?: Situacao | "";
  statusEntrega?: string;
  prazoDe?: string;
  prazoAte?: string;
  somenteComSaldo?: boolean;
  somenteComSac?: boolean;
  somenteComAlerta?: boolean;
};

const txt = (v: unknown) => normalizarCliente(v);

export function filtrarCarteira(lista: PedidoCarteira[], f: Filtros, hoje: Hoje): PedidoCarteira[] {
  const q = txt(f.q);
  const cli = txt(f.cliente);
  return lista.filter((p) => {
    if (q && !txt([p.pedido, p.cliente, p.notaFiscal, p.transportadora, p.representante].join(" ")).includes(q)) return false;
    if (cli && !txt(p.cliente).includes(cli)) return false;
    if (f.statusEntrega && p.statusEntrega !== f.statusEntrega) return false;
    if (f.situacao && situacaoCarteira(p, hoje) !== f.situacao) return false;
    const prazo = prazoReferencia(p).data;
    if (f.prazoDe && (!prazo || prazo < f.prazoDe)) return false;
    if (f.prazoAte && (!prazo || prazo > f.prazoAte)) return false;
    if (f.somenteComSaldo) {
      const s = calcularSaldos(p);
      if (!((s.pendenteEntrega ?? 0) > 0)) return false;
    }
    if (f.somenteComSac && p.sacAbertos <= 0) return false;
    if (f.somenteComAlerta && alertasPedido(p, hoje).filter((a) => a.gravidade !== "BAIXA").length === 0) return false;
    return true;
  });
}

export type Ordem = { campo: "pedido" | "cliente" | "prazo" | "saldo" | "avanco" | "situacao"; dir: "asc" | "desc" };
const PESO_SIT: Record<Situacao, number> = { ATRASADO: 0, EM_RISCO: 1, NO_PRAZO: 2, SEM_PRAZO: 3, CONCLUIDO: 4 };

export function ordenarCarteira(lista: PedidoCarteira[], o: Ordem, hoje: Hoje): PedidoCarteira[] {
  const m = o.dir === "asc" ? 1 : -1;
  const nulo = (v: number | string | null) => v === null || v === "";
  const cmp = (a: number | string | null, b: number | string | null) => {
    if (nulo(a) && nulo(b)) return 0;
    if (nulo(a)) return 1; // vazios sempre ao final
    if (nulo(b)) return -1;
    return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR", { numeric: true })) * m;
  };
  const chave = (p: PedidoCarteira): number | string | null => {
    switch (o.campo) {
      case "pedido": return normalizarPedido(p.pedido);
      case "cliente": return p.cliente.trim() || null;
      case "prazo": return prazoReferencia(p).data;
      case "saldo": return calcularSaldos(p).pendenteEntrega;
      case "avanco": return p.pecas === null ? null : p.avancoPct;
      case "situacao": return PESO_SIT[situacaoCarteira(p, hoje)];
    }
  };
  return [...lista].sort((a, b) => cmp(chave(a), chave(b)) || cmp(normalizarPedido(a.pedido), normalizarPedido(b.pedido)));
}

export type Indicadores = {
  totalPedidos: number;
  emAberto: number;
  concluidos: number;
  atrasados: number;
  emRisco: number;
  semPrazo: number;
  pecasSolicitadas: number;
  pecasEntregues: number;
  pecasPendentesEntrega: number;
  pecasPendentesProducao: number;
  entregasProx7: { pedidos: number; pecasPendentes: number };
  entregasProx30: { pedidos: number; pecasPendentes: number };
  comAlertaAlto: number;
  comSacAberto: number;
  pedidosSemQuantidade: number;
};

export function calcularIndicadores(lista: PedidoCarteira[], hoje: Hoje): Indicadores {
  const ind: Indicadores = {
    totalPedidos: lista.length, emAberto: 0, concluidos: 0, atrasados: 0, emRisco: 0, semPrazo: 0,
    pecasSolicitadas: 0, pecasEntregues: 0, pecasPendentesEntrega: 0, pecasPendentesProducao: 0,
    entregasProx7: { pedidos: 0, pecasPendentes: 0 }, entregasProx30: { pedidos: 0, pecasPendentes: 0 },
    comAlertaAlto: 0, comSacAberto: 0, pedidosSemQuantidade: 0,
  };
  for (const p of lista) {
    const s = calcularSaldos(p);
    const sit = situacaoCarteira(p, hoje);
    if (sit === "CONCLUIDO") ind.concluidos++; else ind.emAberto++;
    if (sit === "ATRASADO") ind.atrasados++;
    if (sit === "EM_RISCO") ind.emRisco++;
    if (sit === "SEM_PRAZO") ind.semPrazo++;
    if (s.solicitada === null) ind.pedidosSemQuantidade++;
    else {
      ind.pecasSolicitadas += s.solicitada;
      ind.pecasEntregues += Math.min(s.entregue, s.solicitada);
      ind.pecasPendentesEntrega += s.pendenteEntrega ?? 0;
      ind.pecasPendentesProducao += s.pendenteProducao ?? 0;
    }
    if (sit !== "CONCLUIDO") {
      const prazo = prazoReferencia(p).data;
      if (prazo) {
        const d = diasEntre(hoje, prazo);
        if (d >= 0 && d <= 7) { ind.entregasProx7.pedidos++; ind.entregasProx7.pecasPendentes += s.pendenteEntrega ?? 0; }
        if (d >= 0 && d <= 30) { ind.entregasProx30.pedidos++; ind.entregasProx30.pecasPendentes += s.pendenteEntrega ?? 0; }
      }
    }
    if (alertasPedido(p, hoje).some((a) => a.gravidade === "ALTA")) ind.comAlertaAlto++;
    if (p.sacAbertos > 0) ind.comSacAberto++;
  }
  return ind;
}

const ROTULOS_CAMPOS: Record<string, string> = {
  cliente: "Cliente", representante: "Representante", tipo_pedido: "Tipo de pedido", colecao: "Coleção",
  status_ferragens: "Ferragens", uf: "UF", cidade: "Cidade", tipo_frete: "Frete", origem_unidade: "Origem",
  destino_unidade: "Destino", pedido_sul: "Pedido Sul", local_montagem: "Local de montagem", status_montagem: "Situação da montagem",
  data_montagem: "Data da montagem", previsao_saida: "Previsão de saída", previsao_informada: "Previsão ao cliente",
  volume_m3: "Volume (m³)", peso_kg: "Peso (kg)", transportadora: "Transportadora", nota_fiscal: "Nota fiscal",
  data_saida: "Data de saída", previsao_entrega: "Previsão de entrega", data_entrega: "Data de entrega",
  status: "Situação", observacao: "Observações",
};
const IGNORADOS = new Set(["pedido", "atualizado_por", "atualizado_em", "criado_em"]);
const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export type Alteracao = { campo: string; rotulo: string; de: string; para: string };

/** Diferença legível entre dois estados gravados no histórico (campos vazios e null são equivalentes). */
export function diffEvento(anterior: unknown, atual: unknown): Alteracao[] {
  const a = (anterior && typeof anterior === "object" ? anterior : {}) as Record<string, unknown>;
  const b = (atual && typeof atual === "object" ? atual : {}) as Record<string, unknown>;
  const out: Alteracao[] = [];
  for (const k of Object.keys(ROTULOS_CAMPOS)) {
    if (IGNORADOS.has(k)) continue;
    const de = k.startsWith("data_") || k.startsWith("previsao_") ? norm(soData(a[k]) ?? a[k]) : norm(a[k]);
    const para = k.startsWith("data_") || k.startsWith("previsao_") ? norm(soData(b[k]) ?? b[k]) : norm(b[k]);
    if (k in b && de !== para) out.push({ campo: k, rotulo: ROTULOS_CAMPOS[k], de, para });
  }
  return out;
}

export function linhasExportacao(lista: PedidoCarteira[], hoje: Hoje) {
  return lista.map((p) => {
    const s = calcularSaldos(p);
    const prazo = prazoReferencia(p);
    return {
      Pedido: p.pedido,
      Cliente: p.cliente,
      Representante: p.representante,
      "UF/Cidade": [p.cidade, p.uf].filter(Boolean).join(" / "),
      "Situação da carteira": SITUACAO_LABEL[situacaoCarteira(p, hoje)],
      "Situação da entrega": p.statusEntrega,
      "Prazo de referência": prazo.data ?? "",
      "Origem do prazo": prazo.origem === "NENHUMA" ? "" : prazo.origem,
      "Peças solicitadas": s.solicitada ?? "",
      "Peças concluídas na produção": s.solicitada === null ? "" : s.concluida,
      "Peças expedidas": s.expedida,
      "Peças entregues": s.entregue,
      "Pendente de produção": s.pendenteProducao ?? "",
      "Pendente de entrega": s.pendenteEntrega ?? "",
      "Avanço produção (%)": p.pecas === null ? "" : Number(p.avancoPct.toFixed(1)),
      "SAC em aberto": p.sacAbertos,
      "Alertas": alertasPedido(p, hoje).map((a) => a.texto).join(" | "),
      "Atualizado por": p.atualizadoPor,
    };
  });
}
