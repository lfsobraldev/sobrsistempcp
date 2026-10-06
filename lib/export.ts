import * as XLSX from "xlsx";
import type { Andon, Produto } from "@/types/pcp";
import { LABELS } from "@/lib/metrics";
import { familiaDe } from "@/lib/sort";

export type Linha = Record<string, string | number>;

export function exportarExcel(abas: { nome: string; linhas: Linha[] }[], arquivo: string) {
  const wb = XLSX.utils.book_new();
  for (const a of abas) {
    const linhas = a.linhas.length ? a.linhas : [{ Aviso: "Sem dados" }];
    const ws = XLSX.utils.json_to_sheet(linhas);
    const cols = Object.keys(linhas[0]);
    ws["!cols"] = cols.map((c) => ({
      wch: Math.min(60, Math.max(c.length + 2, ...linhas.slice(0, 200).map((l) => String(l[c] ?? "").length + 2))),
    }));
    const ref = ws["!ref"];
    if (ref) ws["!autofilter"] = { ref };
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  }
  const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
  XLSX.writeFile(wb, `${arquivo}_${stamp}.xlsx`);
}

export const linhaOp = (p: Produto, o: Produto["operacoes"][number]): Linha => ({
  Processo: LABELS[o.processo] || o.processo,
  Seq: o.ordemFila,
  Família: familiaDe(p.categoria),
  Pedido: p.pedido,
  OF: p.of,
  Peça: p.descricao,
  Material: p.material,
  Medida: p.medida,
  Rebaixo: p.rebaixo,
  Acabamento: p.acabamento,
  Cor: p.cor,
  Prioridade: p.prioridade,
  Status: o.status.replaceAll("_", " "),
  Planejado: o.quantidadePlanejada,
  Produzido: o.quantidadeProduzida,
  Refugo: o.quantidadeRefugo,
  Saldo: Math.max(0, o.quantidadePlanejada - o.quantidadeProduzida),
});

/** Exportação completa: planilha profissional por setor (portas > batentes > alizares > baguetes > kit/suporte de trilho). */
export async function exportarCompleto(produtos: Produto[], _andon: Andon[] = []) {
  const { baixarPlanilhaProducao } = await import("@/lib/planilha");
  await baixarPlanilhaProducao(produtos, { arquivo: "Programacao_Producao" });
}

/** Planilha de um único setor (usada nas telas de Líderes e Apontamentos). */
export async function exportarSetor(produtos: Produto[], processo: string) {
  const { baixarPlanilhaProducao } = await import("@/lib/planilha");
  await baixarPlanilhaProducao(produtos, {
    setores: [processo],
    arquivo: `Programacao_${(LABELS[processo] || processo).replace(/\s+/g, "_")}`,
  });
}
