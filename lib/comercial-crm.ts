export const ORIGENS_CONTATO = ["INDICACAO", "CAMPANHA", "SITE", "PROSPECCAO", "EVENTO", "REPRESENTANTE", "OUTRO"] as const;
export const STATUS_OPORTUNIDADE = ["NOVA", "QUALIFICADA", "PROPOSTA", "NEGOCIACAO", "GANHA", "PERDIDA", "CONVERTIDA"] as const;
export const STATUS_PROPOSTA = ["RASCUNHO", "ENVIADA", "NEGOCIACAO", "ACEITA", "RECUSADA", "EXPIRADA"] as const;

export type ItemProposta = { descricao: string; quantidade: number; valorUnitario: number; total: number };

const TRANSICOES_OPORTUNIDADE: Record<string, readonly string[]> = {
  NOVA: ["QUALIFICADA", "PERDIDA"],
  QUALIFICADA: ["PROPOSTA", "PERDIDA"],
  PROPOSTA: ["NEGOCIACAO", "GANHA", "PERDIDA"],
  NEGOCIACAO: ["GANHA", "PERDIDA"],
  GANHA: ["CONVERTIDA"],
  PERDIDA: ["NOVA"],
  CONVERTIDA: [],
};

const TRANSICOES_PROPOSTA: Record<string, readonly string[]> = {
  RASCUNHO: ["ENVIADA", "RECUSADA"],
  ENVIADA: ["NEGOCIACAO", "ACEITA", "RECUSADA", "EXPIRADA"],
  NEGOCIACAO: ["ACEITA", "RECUSADA", "EXPIRADA"],
  ACEITA: [],
  RECUSADA: [],
  EXPIRADA: [],
};

export function normalizarPedidoComercial(value: unknown): string | null {
  const pedido = String(value ?? "").trim();
  if (!/^\d{4,10}$/.test(pedido)) return null;
  return pedido.replace(/^0+(?=\d)/, "");
}

export function podeTransicionarOportunidade(atual: string, proximo: string) {
  return TRANSICOES_OPORTUNIDADE[atual]?.includes(proximo) ?? false;
}

export function podeTransicionarProposta(atual: string, proximo: string) {
  return TRANSICOES_PROPOSTA[atual]?.includes(proximo) ?? false;
}

export function validarItensProposta(value: unknown): ItemProposta[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error("Informe de 1 a 100 itens para a proposta.");
  }

  return value.map((raw, index) => {
    const descricao = String(raw?.descricao ?? "").trim().slice(0, 300);
    const quantidade = Number(raw?.quantidade);
    const valorUnitario = Number(raw?.valorUnitario);
    const total = Math.round(quantidade * valorUnitario * 100) / 100;
    if (!descricao || !Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 1_000_000 ||
        !Number.isFinite(valorUnitario) || valorUnitario < 0 || valorUnitario > 1_000_000_000 ||
        !Number.isFinite(total)) {
      throw new Error(`Item ${index + 1} da proposta inválido.`);
    }
    return { descricao, quantidade, valorUnitario, total };
  });
}

export function totalProposta(itens: ItemProposta[]) {
  return Math.round(itens.reduce((total, item) => total + item.total, 0) * 100) / 100;
}