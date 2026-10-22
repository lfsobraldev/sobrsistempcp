/** Bloco K do SPED Fiscal (EFD ICMS/IPI) a partir das OFs. Saída para conferência do contador; o leiaute oficial vigente deve ser validado no PVA. */
export type InsumoK = { data: string; codItem: string; qtd: number };
export type OpK = { docOp: string; codItem: string; dtIni: string; dtFin: string | null; qtdEnc: number; insumos: InsumoK[] };
export type EstoqueK = { codItem: string; qtd: number };

const dt = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) throw new Error(`Data inválida: ${iso}`); return `${m[3]}${m[2]}${m[1]}`; };
const q = (n: number) => n.toFixed(3).replace(".", ",");
const limpo = (s: string) => s.replace(/[|\r\n]/g, " ").trim();

export function gerarBlocoK(p: { ini: string; fim: string; ops: OpK[]; estoque: EstoqueK[] }): string {
  if (p.fim < p.ini) throw new Error("Período inválido.");
  const L: string[] = [];
  const pre = p.ops.length + p.estoque.length > 0;
  L.push(`|K001|${pre ? 0 : 1}|`);
  if (pre) {
    L.push(`|K100|${dt(p.ini)}|${dt(p.fim)}|`);
    for (const e of p.estoque) {
      if (e.qtd < 0) throw new Error(`Estoque negativo em ${e.codItem}.`);
      L.push(`|K200|${dt(p.fim)}|${limpo(e.codItem)}|${q(e.qtd)}|0||`);
    }
    for (const o of p.ops) {
      if (!(o.qtdEnc > 0)) continue;
      L.push(`|K230|${dt(o.dtIni)}|${o.dtFin ? dt(o.dtFin) : ""}|${limpo(o.docOp)}|${limpo(o.codItem)}|${q(o.qtdEnc)}|`);
      for (const i of o.insumos) { if (i.qtd > 0) L.push(`|K235|${dt(i.data)}|${limpo(i.codItem)}|${q(i.qtd)}||`); }
    }
  }
  const total = L.length + 1;
  L.push(`|K990|${total}|`);
  return L.join("\r\n") + "\r\n";
}
