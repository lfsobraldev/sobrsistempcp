/** Regras puras de pedido de venda e comissão. Sem banco, sem I/O. Valores em centavos internamente. */

export const STATUS_PEDIDO = ["RASCUNHO", "EM_APROVACAO", "APROVADO", "EM_PRODUCAO", "PARCIAL", "ATENDIDO", "FATURADO", "CANCELADO"] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

const TRANSICOES: Record<StatusPedido, readonly StatusPedido[]> = {
  RASCUNHO: ["EM_APROVACAO", "APROVADO", "CANCELADO"],
  EM_APROVACAO: ["APROVADO", "RASCUNHO", "CANCELADO"],
  APROVADO: ["EM_PRODUCAO", "PARCIAL", "ATENDIDO", "FATURADO", "CANCELADO"],
  EM_PRODUCAO: ["PARCIAL", "ATENDIDO", "CANCELADO"],
  PARCIAL: ["ATENDIDO", "FATURADO", "CANCELADO"],
  ATENDIDO: ["FATURADO"],
  FATURADO: [],
  CANCELADO: [],
};
export const podeTransicionarPedido = (de: string, para: string) => TRANSICOES[de as StatusPedido]?.includes(para as StatusPedido) ?? false;
export const pedidoEditavel = (status: string) => status === "RASCUNHO" || status === "EM_APROVACAO";

export const toCents = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100);
export const fromCents = (c: number) => c / 100;
/** Percentual sobre centavos, metade para cima. */
export const percentualDeCentavos = (cents: number, pct: number) => Math.round((cents * pct) / 100 + (cents >= 0 ? 1e-9 : -1e-9));

export type ItemEntrada = {
  itemCodigo?: string; familia?: string; descricao: string; unidade?: string;
  quantidade: number; precoUnitario: number; descontoPercentual?: number; dataEntrega?: string | null;
};
export type ItemCalculado = { linha: number; itemCodigo: string; familia: string; descricao: string; unidade: string; quantidade: number; precoUnitario: number; descontoPercentual: number; dataEntrega: string | null; total: number };

const num = (v: unknown, campo: string) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${campo} inválido.`);
  return n;
};
const dataValida = (v: unknown, campo: string) => {
  if (v == null || v === "") return null;
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`${campo} inválida.`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error(`${campo} inválida.`);
  return s;
};

export function calcularItens(entrada: unknown): ItemCalculado[] {
  if (!Array.isArray(entrada) || entrada.length === 0) throw new Error("Informe ao menos um item.");
  if (entrada.length > 500) throw new Error("Pedido com itens demais (máximo 500).");
  return entrada.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const descricao = String(r.descricao ?? "").trim().slice(0, 300);
    if (!descricao) throw new Error(`Item ${i + 1}: informe a descrição.`);
    const quantidade = num(r.quantidade, `Item ${i + 1}: quantidade`);
    const precoUnitario = num(r.precoUnitario, `Item ${i + 1}: preço`);
    const desconto = r.descontoPercentual == null || r.descontoPercentual === "" ? 0 : num(r.descontoPercentual, `Item ${i + 1}: desconto`);
    if (quantidade <= 0) throw new Error(`Item ${i + 1}: quantidade deve ser maior que zero.`);
    if (precoUnitario < 0) throw new Error(`Item ${i + 1}: preço não pode ser negativo.`);
    if (desconto < 0 || desconto > 100) throw new Error(`Item ${i + 1}: desconto deve estar entre 0 e 100.`);
    const bruto = Math.round(quantidade * precoUnitario * 100 + 1e-7);
    const total = fromCents(bruto - percentualDeCentavos(bruto, desconto));
    return {
      linha: i + 1, itemCodigo: String(r.itemCodigo ?? "").trim().slice(0, 80), familia: String(r.familia ?? "").trim().slice(0, 80),
      descricao, unidade: String(r.unidade ?? "UN").trim().toUpperCase().slice(0, 12) || "UN",
      quantidade, precoUnitario, descontoPercentual: desconto, dataEntrega: dataValida(r.dataEntrega, `Item ${i + 1}: data de entrega`), total,
    };
  });
}

export type TotaisPedido = { totalBruto: number; total: number; descontoMaximo: number };
export function calcularTotais(itens: ItemCalculado[], descontoGlobal = 0, frete = 0): TotaisPedido {
  if (descontoGlobal < 0 || descontoGlobal > 100) throw new Error("Desconto do pedido deve estar entre 0 e 100.");
  if (frete < 0) throw new Error("Frete não pode ser negativo.");
  const itensCents = itens.reduce((s, i) => s + toCents(i.total), 0);
  const comDesconto = itensCents - percentualDeCentavos(itensCents, descontoGlobal);
  return {
    totalBruto: fromCents(itensCents),
    total: fromCents(comDesconto + toCents(frete)),
    descontoMaximo: Math.max(descontoGlobal, ...itens.map((i) => i.descontoPercentual)),
  };
}

export const exigeAprovacaoPorDesconto = (descontoMaximo: number, limiteSemAprovacao = 5) => descontoMaximo > limiteSemAprovacao;

export type ResultadoCredito = { ok: boolean; excedente: number; disponivel: number | null };
/** limite 0 = crédito não configurado, não bloqueia. */
export function verificarCredito(limite: number, emAberto: number, totalPedido: number): ResultadoCredito {
  if (!(limite > 0)) return { ok: true, excedente: 0, disponivel: null };
  const disponivel = fromCents(toCents(limite) - toCents(emAberto));
  const excedente = Math.max(0, fromCents(toCents(totalPedido) - toCents(disponivel)));
  return { ok: excedente === 0, excedente, disponivel };
}

export function statusAoEnviar(requerAprovacao: boolean, bloqueioCredito: boolean): StatusPedido {
  return requerAprovacao || bloqueioCredito ? "EM_APROVACAO" : "APROVADO";
}

// ---------------------------------------------------------------- Comissão

export type RegraComissao = {
  id?: string; representanteId: string; clienteId?: string | null; itemCodigo?: string; familia?: string;
  faixaMin?: number | null; faixaMax?: number | null; percentual: number; base: "FATURADO" | "RECEBIDO";
  vigenciaInicio: string; vigenciaFim?: string | null; ativo?: boolean;
};
export type ContextoComissao = { representanteId: string; clienteId?: string | null; itemCodigo?: string; familia?: string; valorItem: number; data: string };

function pontuacao(r: RegraComissao, c: ContextoComissao): number {
  if (r.ativo === false || r.representanteId !== c.representanteId) return -1;
  if (r.vigenciaInicio > c.data || (r.vigenciaFim && r.vigenciaFim < c.data)) return -1;
  let p = 0;
  if (r.itemCodigo) { if (r.itemCodigo !== c.itemCodigo) return -1; p += 8; }
  if (r.clienteId) { if (r.clienteId !== c.clienteId) return -1; p += 4; }
  if (r.familia) { if (r.familia !== c.familia) return -1; p += 2; }
  if (r.faixaMin != null || r.faixaMax != null) {
    if (r.faixaMin != null && c.valorItem < r.faixaMin) return -1;
    if (r.faixaMax != null && c.valorItem > r.faixaMax) return -1;
    p += 1;
  }
  return p;
}

/** Regra mais específica vence (item > cliente > família > faixa); empate: vigência mais recente. Sem regra: percentual do cadastro do representante. */
export function resolverRegra(regras: RegraComissao[], ctx: ContextoComissao, padraoPercentual: number, padraoBase: "FATURADO" | "RECEBIDO" = "FATURADO") {
  let melhor: { regra: RegraComissao; p: number } | null = null;
  for (const regra of regras) {
    const p = pontuacao(regra, ctx);
    if (p < 0) continue;
    if (!melhor || p > melhor.p || (p === melhor.p && regra.vigenciaInicio > melhor.regra.vigenciaInicio)) melhor = { regra, p };
  }
  return melhor
    ? { percentual: melhor.regra.percentual, base: melhor.regra.base, regraId: melhor.regra.id ?? null, origem: "REGRA" as const }
    : { percentual: padraoPercentual, base: padraoBase, regraId: null, origem: "PADRAO" as const };
}

export type LinhaComissao = { linha: number; percentual: number; base: "FATURADO" | "RECEBIDO"; valorBase: number; valor: number; origem: "REGRA" | "PADRAO" };
export function calcularComissaoPedido(
  itens: ItemCalculado[], regras: RegraComissao[], rep: { id: string; percentualPadrao: number }, clienteId: string | null, data: string, descontoGlobal = 0,
) {
  const linhas: LinhaComissao[] = itens.map((it) => {
    const valorItem = fromCents(toCents(it.total) - percentualDeCentavos(toCents(it.total), descontoGlobal));
    const r = resolverRegra(regras, { representanteId: rep.id, clienteId, itemCodigo: it.itemCodigo, familia: it.familia, valorItem, data }, rep.percentualPadrao);
    const valor = fromCents(percentualDeCentavos(toCents(valorItem), r.percentual));
    return { linha: it.linha, percentual: r.percentual, base: r.base, valorBase: valorItem, valor, origem: r.origem };
  });
  const bases = new Set(linhas.map((l) => l.base));
  if (bases.size > 1) throw new Error("Regras de comissão com bases diferentes (faturado e recebido) no mesmo pedido. Ajuste as regras.");
  const valorBase = fromCents(linhas.reduce((s, l) => s + toCents(l.valorBase), 0));
  const valor = fromCents(linhas.reduce((s, l) => s + toCents(l.valor), 0));
  return { linhas, base: (linhas[0]?.base ?? "FATURADO") as "FATURADO" | "RECEBIDO", valorBase, valor };
}

/** Parcela de comissão a liberar: proporcional ao acumulado do evento sobre o total do pedido, menos o já liberado. */
export function comissaoProporcional(comissaoTotal: number, totalPedido: number, acumuladoEvento: number, jaLiberado = 0): number {
  if (!(totalPedido > 0)) return 0;
  if (acumuladoEvento < 0) throw new Error("Valor do evento não pode ser negativo.");
  const alvo = Math.min(1, acumuladoEvento / totalPedido);
  const devido = Math.round(toCents(comissaoTotal) * alvo);
  return fromCents(Math.max(0, devido - toCents(jaLiberado)));
}

/** Estorno em devolução: devolvidoAcumulado inclui a devolução atual; jaEstornado é a soma dos estornos anteriores. Retorna só o que falta estornar. */
export function comissaoEstorno(comissaoLiberada: number, valorFaturado: number, devolvidoAcumulado: number, jaEstornado = 0): number {
  if (!(valorFaturado > 0) || devolvidoAcumulado <= 0) return 0;
  if (devolvidoAcumulado > valorFaturado) throw new Error("Devolução maior que o valor faturado.");
  const devido = Math.round(toCents(comissaoLiberada) * (devolvidoAcumulado / valorFaturado));
  return fromCents(Math.max(0, devido - toCents(jaEstornado)));
}

export const competenciaDe = (d: Date | string) => (typeof d === "string" ? d.slice(0, 7) : d.toISOString().slice(0, 7));
