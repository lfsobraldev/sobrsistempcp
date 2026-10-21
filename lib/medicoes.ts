export const STATUS_MEDICAO = [
  "AGUARDANDO_CONFERENCIA",
  "COM_PENDENCIAS",
  "AGUARDANDO_APROVACAO",
  "APROVADA_PARA_PRODUCAO",
] as const;

export type DimensaoMedida = { nome: string; valor: number; unidade: string };
export type ItemMedicao = {
  item: string;
  tipoProduto: string;
  descricao: string;
  quantidade: number;
  dimensoes: DimensaoMedida[];
  ferragens: string;
  restricoesInstalacao: string;
  observacoes: string;
};

const UNIDADES_MEDIDA = new Set(["mm", "cm", "m", "pol", "un", "grau"]);

export function validarItensMedicao(value: unknown): ItemMedicao[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error("Informe de 1 a 100 itens para a medição.");
  }

  return value.map((raw, index) => {
    const item = String(raw?.item ?? "").trim().slice(0, 80);
    const tipoProduto = String(raw?.tipoProduto ?? "").trim().slice(0, 120);
    const descricao = String(raw?.descricao ?? "").trim().slice(0, 400);
    const quantidade = Number(raw?.quantidade);
    if (!descricao || !Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 1_000_000) {
      throw new Error(`Item ${index + 1}: descrição e quantidade positiva são obrigatórias.`);
    }
    if (!Array.isArray(raw?.dimensoes) || raw.dimensoes.length < 1 || raw.dimensoes.length > 40) {
      throw new Error(`Item ${index + 1}: informe ao menos uma dimensão com unidade explícita.`);
    }
    const dimensoes = raw.dimensoes.map((dimension: any, dimensionIndex: number) => {
      const nome = String(dimension?.nome ?? "").trim().slice(0, 100);
      const unidade = String(dimension?.unidade ?? "").trim().slice(0, 24);
      const valor = Number(dimension?.valor);
      if (!nome || !unidade || !Number.isFinite(valor) || valor <= 0 || valor > 1_000_000) {
        throw new Error(`Item ${index + 1}, dimensão ${dimensionIndex + 1}: nome, valor positivo e unidade são obrigatórios.`);
      }
      if (!UNIDADES_MEDIDA.has(unidade)) {
        throw new Error(`Item ${index + 1}, dimensão ${dimensionIndex + 1}: unidade não suportada.`);
      }
      return { nome, valor, unidade };
    });

    return {
      item,
      tipoProduto,
      descricao,
      quantidade,
      dimensoes,
      ferragens: String(raw?.ferragens ?? "").trim().slice(0, 2000),
      restricoesInstalacao: String(raw?.restricoesInstalacao ?? "").trim().slice(0, 3000),
      observacoes: String(raw?.observacoes ?? "").trim().slice(0, 3000),
    };
  });
}

export function podeAvancarMedicao(status: string, acao: string) {
  if (acao === "REGISTRAR_PENDENCIAS") return status === "AGUARDANDO_CONFERENCIA" || status === "AGUARDANDO_APROVACAO";
  if (acao === "SOLICITAR_APROVACAO") return status === "AGUARDANDO_CONFERENCIA";
  if (acao === "APROVAR") return status === "AGUARDANDO_APROVACAO";
  return false;
}