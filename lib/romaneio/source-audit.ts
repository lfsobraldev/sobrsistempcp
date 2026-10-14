import { familiaIndustrial, ehFerragem } from "@/lib/domain/industrial";

export type LinhaFonte = {
  pedido?: string; categoria?: string; descricao?: string; descricaoModelo?: string;
  outrasCaracteristicas?: string; produto?: string; material?: string; medida?: string;
  quantidade?: number;
};
export type DivergenciaFonte = {
  pedido: string; familia: string; quantidadePCP: number; quantidadeRomaneio: number;
  diferenca: number; mensagem: string;
};

/**
 * Compara todas as linhas NÃO ferragens do PCP com a fonte física completa
 * do romaneio. Quantidades são somadas por pedido/família e não por OF,
 * pois a fonte separada do romaneio não guarda a OF.
 * Não inventa peças faltantes nem altera o documento.
 */
export function auditarCoberturaRomaneio(
  produtos: readonly LinhaFonte[],
  fonte: readonly LinhaFonte[]
): DivergenciaFonte[] {
  const totalPorFamilia = (linhas: readonly LinhaFonte[], excluirFerragens: boolean) => {
    const totais = new Map<string, number>();
    for (const p of linhas) {
      if (excluirFerragens && ehFerragem(p)) continue;
      const pedido = String(p.pedido || "").trim();
      if (!pedido) continue;
      const familia = familiaIndustrial(p);
      const qtd = Number(p.quantidade || 0);
      if (!Number.isFinite(qtd) || qtd <= 0) continue;
      const key = JSON.stringify([pedido, familia]);
      totais.set(key, (totais.get(key) || 0) + qtd);
    }
    return totais;
  };
  const atual = totalPorFamilia(produtos, true);
  const completa = totalPorFamilia(fonte, true);
  const pendencias: DivergenciaFonte[] = [];
  for (const key of new Set([...atual.keys(), ...completa.keys()])) {
    const qtdPCP = atual.get(key) ?? 0;
    const [pedido, familia] = JSON.parse(key) as [string, string];
    const qtdRomaneio = completa.get(key) ?? 0;
    const diff = Math.round((qtdPCP - qtdRomaneio) * 1000) / 1000;
    if (Math.abs(diff) < 0.0001) continue;
    pendencias.push({
      pedido, familia, quantidadePCP: qtdPCP, quantidadeRomaneio: qtdRomaneio,
      diferenca: diff,
      mensagem: `Pedido ${pedido}, ${familia}: PCP ${qtdPCP} peça(s), fonte de romaneio ${qtdRomaneio}. Conferir Filtro Consistem.`
    });
  }
  return pendencias.sort((a, b) => a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true }) || a.familia.localeCompare(b.familia));
}
