import type { Andon, Operacao, Produto } from "@/types/pcp";
import { familiaDe } from "@/lib/sort";

export type Critico = {
  p: Produto; o: Operacao; motivos: string[]; gravidade: number; saldo: number;
};
export const LIMITE_PARADA_H = 4;
export const LIMITE_REFUGO = 0.05;

export function calcularCriticos(produtos: Produto[], andon: Andon[] = []): Critico[] {
  const comAndon = new Set(andon.filter((a) => a.status === "ABERTO").map((a) => a.operacao_id));
  const out: Critico[] = [];
  for (const p of produtos) {
    const atual = p.operacoes.find((o) => o.status !== "CONCLUIDA");
    if (!atual) continue;
    const motivos: string[] = []; let g = 0;
    if (p.prioridade === "URGENTE") { motivos.push("Urgente"); g += 50; }
    else if (p.prioridade === "ALTA") { motivos.push("Prioridade alta"); g += 30; }
    if (atual.status === "DIVERGENCIA") { motivos.push("Divergência"); g += 40; }
    if (comAndon.has(atual.id)) { motivos.push("Andon aberto"); g += 40; }
    if (atual.status === "EM_ANDAMENTO" && atual.iniciadoEm) {
      const h = (Date.now() - new Date(atual.iniciadoEm).getTime()) / 36e5;
      if (h >= LIMITE_PARADA_H) { motivos.push(`Em andamento há ${Math.floor(h)}h`); g += 20; }
    }
    if (atual.quantidadePlanejada > 0 && atual.quantidadeRefugo / atual.quantidadePlanejada >= LIMITE_REFUGO) {
      motivos.push("Refugo alto"); g += 20;
    }
    const idx = p.operacoes.findIndex((o) => o.id === atual.id);
    if (p.operacoes.slice(idx + 1).some((o) => o.percentual > 0 && o.percentual < 100)) {
      motivos.push("Rota inconsistente"); g += 15;
    }
    if (familiaDe(p.categoria) === "OUTROS") { motivos.push("Família não identificada"); g += 5; }
    if (motivos.length)
      out.push({ p, o: atual, motivos, gravidade: g, saldo: Math.max(0, atual.quantidadePlanejada - atual.quantidadeProduzida) });
  }
  return out.sort((a, b) => b.gravidade - a.gravidade || b.saldo - a.saldo);
}
