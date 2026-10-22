/** CEP/SPC: capacidade (Cp/Cpk), carta de indivíduos (I-MR) e regras de alerta. */
export type Capacidade = { n: number; media: number; sigmaGeral: number; sigmaCurto: number; cp: number | null; cpk: number | null; pp: number | null; ppk: number | null };

const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const desvioAmostral = (v: number[]) => { const m = media(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
const arred = (x: number, c = 4) => Math.round(x * 10 ** c) / 10 ** c;

/** sigma de curto prazo por amplitude móvel (MRbar/1,128); sigma geral por desvio amostral. Exige n≥2. */
export function capacidade(valores: number[], lie: number, lse: number): Capacidade {
  if (!(lse > lie)) throw new Error("Limite superior deve ser maior que o inferior.");
  const v = valores.filter((x) => Number.isFinite(x));
  if (v.length < 2) throw new Error("São necessárias ao menos 2 medições.");
  const m = media(v);
  const mr = v.slice(1).map((x, i) => Math.abs(x - v[i]));
  const sc = media(mr) / 1.128, sg = desvioAmostral(v);
  const razao = (s: number) => (s > 0 ? { cp: (lse - lie) / (6 * s), cpk: Math.min(lse - m, m - lie) / (3 * s) } : { cp: null, cpk: null });
  const c = razao(sc), g = razao(sg);
  return { n: v.length, media: arred(m), sigmaGeral: arred(sg), sigmaCurto: arred(sc), cp: c.cp == null ? null : arred(c.cp), cpk: c.cpk == null ? null : arred(c.cpk), pp: g.cp == null ? null : arred(g.cp), ppk: g.cpk == null ? null : arred(g.cpk) };
}

export type CartaI = { lc: number; lsc: number; lic: number; mrBar: number };
export function cartaIndividuos(valores: number[]): CartaI {
  if (valores.length < 2) throw new Error("São necessárias ao menos 2 medições.");
  const m = media(valores), mr = media(valores.slice(1).map((x, i) => Math.abs(x - valores[i])));
  return { lc: arred(m), lsc: arred(m + 2.66 * mr), lic: arred(m - 2.66 * mr), mrBar: arred(mr) };
}

export type Alerta = { regra: 1 | 2 | 3 | 4; indice: number; descricao: string };
/** Regras de Western Electric: 1) ponto além de 3σ; 2) 2 de 3 além de 2σ (mesmo lado); 3) 4 de 5 além de 1σ; 4) 8 seguidos no mesmo lado. */
export function regrasAlerta(valores: number[], centro: number, sigma: number): Alerta[] {
  if (!(sigma > 0)) return [];
  const z = valores.map((x) => (x - centro) / sigma), out: Alerta[] = [];
  z.forEach((zi, i) => {
    if (Math.abs(zi) > 3) out.push({ regra: 1, indice: i, descricao: "Ponto além de 3σ" });
    if (i >= 2) { const w = z.slice(i - 2, i + 1); for (const s of [1, -1]) if (w.filter((x) => x * s > 2).length >= 2 && zi * s > 2) out.push({ regra: 2, indice: i, descricao: "2 de 3 pontos além de 2σ" }); }
    if (i >= 4) { const w = z.slice(i - 4, i + 1); for (const s of [1, -1]) if (w.filter((x) => x * s > 1).length >= 4 && zi * s > 1) out.push({ regra: 3, indice: i, descricao: "4 de 5 pontos além de 1σ" }); }
    if (i >= 7) { const w = z.slice(i - 7, i + 1); if (w.every((x) => x > 0) || w.every((x) => x < 0)) out.push({ regra: 4, indice: i, descricao: "8 pontos seguidos do mesmo lado" }); }
  });
  return out;
}
