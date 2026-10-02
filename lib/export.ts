import * as XLSX from "xlsx";
import type { Andon, Produto } from "@/types/pcp";
import { LABELS } from "@/lib/metrics";
import { familiaDe, FAMILIAS } from "@/lib/sort";
import { calcularCriticos } from "@/lib/criticos";
import { modeloProduto } from "@/lib/presentation";

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
    ws["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  }
  const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
  XLSX.writeFile(wb, `${arquivo}_${stamp}.xlsx`);
}

export const linhaOp = (p: Produto, o: Produto["operacoes"][number], turno = ""): Linha => {
  const x = modeloProduto(p, o, turno);
  return {
    "Seq.": x.seq,
    Pedido: x.pedido,
    Item: x.item,
    OF: x.of,
    Produto: x.produto,
    Família: x.familia,
    Descrição: x.descricao,
    Tipo: x.tipo,
    Canal: x.canal,
    Rebaixo: x.rebaixo,
    Acabamento: x.acabamento,
    Cor: x.cor,
    "Qtd Programada": x.planejado,
    Comprimento: x.comprimento,
    Largura: x.largura,
    Espessura: x.espessura,
    "m³": Number(x.volumeM3.toFixed(3)),
    Turno: x.turno,
    Máquina: x.maquina,
    Líder: x.lider,
    "Qtd Produzida": x.produzido,
    Saldo: x.saldo,
    "% Concluído": Number(x.concluido.toFixed(2)) / 100,
    Status: x.status,
    Observação: x.observacao,
    Prioridade: x.prioridade,
  };
};

export function exportarCompleto(produtos: Produto[], andon: Andon[], turno = "") {
  const ops = produtos.flatMap((p) => p.operacoes.map((o) => ({ p, o })));
  const procs = [...new Set(ops.map((x) => x.o.processo))];
  const soma = (l: Linha[], k: string) => l.reduce((s, x) => s + Number(x[k] || 0), 0);
  const resumo: Linha[] = procs.map((pr) => {
    const l = ops.filter((x) => x.o.processo === pr).map((x) => linhaOp(x.p, x.o, turno));
    return { Processo: LABELS[pr] || pr, Operações: l.length, Programado: soma(l, "Qtd Programada"), Produzido: soma(l, "Qtd Produzida"), Saldo: soma(l, "Saldo") };
  });
  const fam = (f: string) => ops.filter((x) => familiaDe(x.p.categoria) === f).map((x) => linhaOp(x.p, x.o, turno));
  const crit = calcularCriticos(produtos, andon).map((c) => ({ Motivos: c.motivos.join(" | "), Gravidade: c.gravidade, ...linhaOp(c.p, c.o, turno) }));
  exportarExcel(
    [
      { nome: "Resumo", linhas: resumo },
      { nome: "Programação", linhas: produtos.map((p) => {
        const x = modeloProduto(p, undefined, turno);
        return { Pedido: x.pedido, Item: x.item, OF: x.of, Produto: x.produto, Família: x.familia, Descrição: x.descricao, Tipo: x.tipo, Canal: x.canal, Rebaixo: x.rebaixo, Acabamento: x.acabamento, Cor: x.cor, "Qtd Programada": p.quantidade, Comprimento: x.comprimento, Largura: x.largura, Espessura: x.espessura, "m³": Number(x.volumeM3.toFixed(3)), Turno: x.turno, Prioridade: x.prioridade };
      }) },
      ...procs.map((pr) => ({ nome: LABELS[pr] || pr, linhas: ops.filter((x) => x.o.processo === pr).sort((a, b) => a.o.ordemFila - b.o.ordemFila).map((x) => linhaOp(x.p, x.o, turno)) })),
      { nome: "Críticos", linhas: crit },
      ...FAMILIAS.filter((f) => f !== "OUTROS" && f !== "PORTAS").map((f) => ({ nome: f, linhas: fam(f) })),
      { nome: "Andon", linhas: andon.map((a) => ({ Processo: LABELS[a.processo] || a.processo, Motivo: a.motivo, Observação: a.observacao, Status: a.status, Usuário: a.usuario_abertura, Aberto: a.criado_em, Pedido: a.pedido || "", OF: a.of || "" })) },
    ],
    "PCP_Completo"
  );
}
