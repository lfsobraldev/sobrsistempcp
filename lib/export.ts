import * as XLSX from "xlsx";
import type { Andon, Produto } from "@/types/pcp";
import { LABELS } from "@/lib/metrics";
import { familiaDe, FAMILIAS } from "@/lib/sort";
import { calcularCriticos } from "@/lib/criticos";

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

export function exportarCompleto(produtos: Produto[], andon: Andon[]) {
  const ops = produtos.flatMap((p) => p.operacoes.map((o) => ({ p, o })));
  const procs = [...new Set(ops.map((x) => x.o.processo))];
  const soma = (l: Linha[], k: string) => l.reduce((s, x) => s + Number(x[k] || 0), 0);
  const resumo: Linha[] = procs.map((pr) => {
    const l = ops.filter((x) => x.o.processo === pr).map((x) => linhaOp(x.p, x.o));
    return { Processo: LABELS[pr] || pr, Operações: l.length, Planejado: soma(l, "Planejado"), Produzido: soma(l, "Produzido"), Refugo: soma(l, "Refugo"), Saldo: soma(l, "Saldo") };
  });
  const fam = (f: string) => ops.filter((x) => familiaDe(x.p.categoria) === f).map((x) => linhaOp(x.p, x.o));
  const crit = calcularCriticos(produtos, andon).map((c) => ({ Motivos: c.motivos.join(" | "), Gravidade: c.gravidade, ...linhaOp(c.p, c.o) }));
  exportarExcel(
    [
      { nome: "Resumo", linhas: resumo },
      { nome: "Programação", linhas: produtos.map((p) => ({ Família: familiaDe(p.categoria), Pedido: p.pedido, OF: p.of, Peça: p.descricao, Material: p.material, Medida: p.medida, Rebaixo: p.rebaixo, Acabamento: p.acabamento, Cor: p.cor, Quantidade: p.quantidade, Prioridade: p.prioridade })) },
      ...procs.map((pr) => ({ nome: LABELS[pr] || pr, linhas: ops.filter((x) => x.o.processo === pr).sort((a, b) => a.o.ordemFila - b.o.ordemFila).map((x) => linhaOp(x.p, x.o)) })),
      { nome: "Críticos", linhas: crit },
      ...FAMILIAS.filter((f) => f !== "OUTROS" && f !== "PORTAS").map((f) => ({ nome: f, linhas: fam(f) })),
      { nome: "Andon", linhas: andon.map((a) => ({ Processo: LABELS[a.processo] || a.processo, Motivo: a.motivo, Observação: a.observacao, Status: a.status, Usuário: a.usuario_abertura, Aberto: a.criado_em, Pedido: a.pedido || "", OF: a.of || "" })) },
    ],
    "PCP_Completo"
  );
}
