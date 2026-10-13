import type { Operacao, Produto } from "@/types/pcp";
import { dims, familiaDe } from "@/lib/sort";
import { pct } from "@/lib/format";

export function modeloProduto(p: Produto, o?: Operacao, turno = "") {
  const [comprimento, largura, espessura] = dims(p.medida || "");
  const planejado = o?.quantidadePlanejada ?? p.quantidade ?? 0;
  const produzido = o?.quantidadeProduzida ?? 0;
  const saldo = Math.max(0, planejado - produzido);
  const volumeM3 = comprimento && largura && espessura
    ? (comprimento * largura * espessura * planejado) / 1_000_000_000
    : 0;

  return {
    seq: o?.ordemFila ?? 0,
    pedido: p.pedido || "-",
    item: p.item || "-",
    of: p.of || "-",
    produto: p.produto || "-",
    familia: familiaDe(p.categoria),
    descricao: p.descricao || "-",
    tipo: p.tipo || p.material || "-",
    canal: p.canal || "-",
    rebaixo: p.rebaixo || "-",
    acabamento: p.acabamento || "-",
    cor: p.cor || "-",
    planejado,
    comprimento,
    largura,
    espessura,
    volumeM3,
    turno: turno || "-",
    maquina: "-",
    lider: "-",
    produzido,
    saldo,
    concluido: pct(produzido, planejado),
    status: o?.status?.replaceAll("_", " ") || "-",
    observacao: "-",
    prioridade: p.prioridade || "NORMAL",
  };
}
