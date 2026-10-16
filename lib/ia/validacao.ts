import type { Produto } from "@/types/pcp";

export type Achado = { gravidade: "ALTA" | "MEDIA" | "BAIXA"; tipo: string; detalhe: string; pedido?: string; of?: string; qtdLinhas: number };

const t = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Confiança 0-100 da leitura de uma linha: quanto dos atributos essenciais está comprovado. */
export function confiancaLinha(p: Partial<Produto>): { score: number; faltando: string[] } {
  const faltando: string[] = [];
  const pesos: [string, unknown, number][] = [
    ["pedido", p.pedido, 20], ["of", p.of, 15], ["descricao", p.descricao, 20],
    ["quantidade", n(p.quantidade) > 0 ? "x" : "", 15], ["material", p.material, 15],
    ["medida", p.medida, 15],
  ];
  let score = 0;
  for (const [nome, valor, peso] of pesos) (t(valor) ? (score += peso) : faltando.push(nome));
  return { score, faltando };
}

/** Audita relações pedido ↔ OF ↔ produto ↔ operação sem alterar dados. */
export function auditarRelacoes(produtos: Produto[]) {
  const achados: Achado[] = [];
  const porOf = new Map<string, Produto[]>();
  const porChave = new Map<string, Produto[]>();
  for (const p of produtos) {
    const of = t(p.of);
    if (of) porOf.set(of, [...(porOf.get(of) || []), p]);
    const k = [t(p.pedido), of, t(p.produto), t(p.item), t(p.descricao).toUpperCase()].join("|");
    porChave.set(k, [...(porChave.get(k) || []), p]);
  }
  for (const [of, itens] of porOf) {
    const pedidos = [...new Set(itens.map((i) => t(i.pedido)).filter(Boolean))];
    if (pedidos.length > 1)
      achados.push({ gravidade: "ALTA", tipo: "OF_EM_VARIOS_PEDIDOS", of, qtdLinhas: itens.length, detalhe: `OF ${of} aparece nos pedidos ${pedidos.slice(0, 5).join(", ")}.` });
  }
  for (const [, itens] of porChave) {
    if (itens.length > 1)
      achados.push({ gravidade: "MEDIA", tipo: "LINHA_REPETIDA", pedido: t(itens[0].pedido), of: t(itens[0].of), qtdLinhas: itens.length,
        detalhe: `${itens.length} linhas idênticas (pedido, OF, código, item, descrição); confirme se são lotes distintos ou duplicidade (${itens.reduce((s, i) => s + n(i.quantidade), 0)} peças no total).` });
  }
  const semRota = produtos.filter((p) => !p.operacoes?.length);
  if (semRota.length)
    achados.push({ gravidade: "ALTA", tipo: "SEM_ROTA", qtdLinhas: semRota.length, detalhe: `${semRota.length} linha(s) sem operação (ex.: pedido ${t(semRota[0].pedido)} OF ${t(semRota[0].of)}).` });
  const divergentes = produtos.filter((p) => (p.operacoes || []).some((o) => n(o.quantidadePlanejada) > 0 && Math.round(n(o.quantidadePlanejada)) !== Math.round(n(p.quantidade))));
  if (divergentes.length)
    achados.push({ gravidade: "MEDIA", tipo: "QTD_OPERACAO_DIVERGENTE", qtdLinhas: divergentes.length,
      detalhe: `${divergentes.length} linha(s) com quantidade planejada de operação diferente da quantidade do produto (ex.: pedido ${t(divergentes[0].pedido)} OF ${t(divergentes[0].of)}). Pode ser percentual de rota; confira.` });
  const superProduzido = produtos.flatMap((p) => (p.operacoes || []).filter((o) => n(o.quantidadeProduzida) > n(o.quantidadePlanejada) && n(o.quantidadePlanejada) > 0).map((o) => ({ p, o })));
  if (superProduzido.length)
    achados.push({ gravidade: "MEDIA", tipo: "PRODUZIDO_ACIMA_DO_PLANEJADO", qtdLinhas: superProduzido.length, detalhe: `${superProduzido.length} operação(ões) com produção apontada acima do planejado.` });
  const baixa = produtos.filter((p) => confiancaLinha(p).score < 70);
  if (baixa.length)
    achados.push({ gravidade: "BAIXA", tipo: "LEITURA_INCOMPLETA", qtdLinhas: baixa.length,
      detalhe: `${baixa.length} linha(s) com confiança de leitura < 70% (faltam ${[...new Set(baixa.flatMap((p) => confiancaLinha(p).faltando))].join(", ")}). Não presumir os valores ausentes.` });
  const ordem = { ALTA: 0, MEDIA: 1, BAIXA: 2 } as const;
  achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || b.qtdLinhas - a.qtdLinhas);
  return {
    linhas: produtos.length,
    pedidos: new Set(produtos.map((p) => t(p.pedido)).filter(Boolean)).size,
    ofs: porOf.size,
    confiancaMedia: produtos.length ? Math.round(produtos.reduce((s, p) => s + confiancaLinha(p).score, 0) / produtos.length) : 0,
    achados: achados.slice(0, 25),
    totalAchados: achados.length,
  };
}
