import type { Produto } from "@/types/pcp";
import { compareProduto } from "@/lib/sort";
import { familiaIndustrial } from "@/lib/domain/industrial";

/** Resumo por processo, sem somar as etapas de uma peça como se fossem peças distintas. */
export function resumoPorSetor(produtos: Produto[]) {
  const setores = new Map<string, {
    setor: string; pedidos: Set<string>; ofs: Set<string>;
    linhas: number; pecas: number; materiaisAusentes: number; medidasAusentes: number;
    itens: Produto[];
  }>();
  for (const p of produtos) {
    for (const op of p.operacoes || []) {
      const setor = String(op.processo || "").trim();
      if (!setor) continue;
      const entry = setores.get(setor) || {
        setor, pedidos: new Set<string>(), ofs: new Set<string>(), linhas: 0,
        pecas: 0, materiaisAusentes: 0, medidasAusentes: 0, itens: [] as Produto[]
      };
      entry.pedidos.add(String(p.pedido || ""));
      if (p.of) entry.ofs.add(String(p.of));
      entry.linhas += 1;
      entry.pecas += Math.max(0, Number(op.quantidadePlanejada ?? p.quantidade) || 0);
      const familia = familiaIndustrial(p);
      // Ferragens não exigem as três dimensões para execução da operação.
      if (familia !== "FERRAGENS") {
        if (!String(p.material || "").trim()) entry.materiaisAusentes++;
        if (!String(p.medida || "").trim()) entry.medidasAusentes++;
      }
      entry.itens.push(p);
      setores.set(setor, entry);
    }
  }
  return [...setores.values()].map(x=>({
    setor:x.setor, pedidos:x.pedidos.size, ofs:x.ofs.size,
    linhas:x.linhas, pecas:x.pecas, materiaisAusentes:x.materiaisAusentes,
    medidasAusentes:x.medidasAusentes, itens:x.itens.sort(compareProduto)
  })).sort((a,b)=>a.setor.localeCompare(b.setor,"pt-BR"));
}
