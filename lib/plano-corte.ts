// Plano de corte 2D (guilhotina por faixas / "shelf" com FFD). Unidades livres (mm).
export type Peca = { id: string; largura: number; altura: number; qtd: number; rotaciona?: boolean };
export type Chapa = { largura: number; altura: number; kerf?: number };
export type Posicao = { id: string; x: number; y: number; w: number; h: number; girada: boolean };
export type ChapaPlano = { numero: number; posicoes: Posicao[]; usada: number; aproveitamento: number; retalho: { x: number; y: number; w: number; h: number } | null };
export type ResultadoCorte = { chapas: ChapaPlano[]; naoCabem: string[]; aproveitamento: number; totalPecas: number };

export function planoDeCorte(pecas: Peca[], chapa: Chapa): ResultadoCorte {
  const k = Math.max(0, chapa.kerf ?? 0);
  const lista: { id: string; w: number; h: number; rot: boolean }[] = [];
  const naoCabem: string[] = [];
  for (const p of pecas) {
    if (!(p.largura > 0 && p.altura > 0 && p.qtd > 0)) continue;
    const cabe = (p.largura <= chapa.largura && p.altura <= chapa.altura) || (p.rotaciona !== false && p.altura <= chapa.largura && p.largura <= chapa.altura);
    if (!cabe) { naoCabem.push(p.id); continue; }
    for (let i = 0; i < p.qtd; i++) lista.push({ id: p.id, w: p.largura, h: p.altura, rot: p.rotaciona !== false });
  }
  // orienta cada peça com o maior lado na horizontal quando possível e ordena por altura desc.
  const orient = lista.map((p) => {
    let { w, h } = p; let girada = false;
    if (p.rot && h > w && h <= chapa.largura && w <= chapa.altura) { [w, h] = [h, w]; girada = true; }
    if (w > chapa.largura && p.rot) { [w, h] = [h, w]; girada = !girada; }
    return { id: p.id, w, h, girada };
  }).sort((a, b) => b.h - a.h || b.w - a.w);

  type Faixa = { y: number; h: number; x: number };
  const chapas: { faixas: Faixa[]; pos: Posicao[]; yFim: number }[] = [];
  for (const p of orient) {
    let ok = false;
    for (const c of chapas) {
      const f = c.faixas.find((f) => p.h <= f.h && f.x + p.w <= chapa.largura);
      if (f) { c.pos.push({ id: p.id, x: f.x, y: f.y, w: p.w, h: p.h, girada: p.girada }); f.x += p.w + k; ok = true; break; }
      if (c.yFim + p.h <= chapa.altura) { const f2 = { y: c.yFim, h: p.h, x: p.w + k }; c.faixas.push(f2); c.pos.push({ id: p.id, x: 0, y: c.yFim, w: p.w, h: p.h, girada: p.girada }); c.yFim += p.h + k; ok = true; break; }
    }
    if (!ok) { chapas.push({ faixas: [{ y: 0, h: p.h, x: p.w + k }], pos: [{ id: p.id, x: 0, y: 0, w: p.w, h: p.h, girada: p.girada }], yFim: p.h + k }); }
  }
  const areaChapa = chapa.largura * chapa.altura;
  const out: ChapaPlano[] = chapas.map((c, i) => {
    const usada = c.pos.reduce((a, p) => a + p.w * p.h, 0);
    const yMax = Math.min(chapa.altura, c.yFim);
    const sobra = chapa.altura - yMax;
    return { numero: i + 1, posicoes: c.pos, usada, aproveitamento: Math.round((usada / areaChapa) * 1000) / 10, retalho: sobra > 50 ? { x: 0, y: yMax, w: chapa.largura, h: sobra } : null };
  });
  const usadaTotal = out.reduce((a, c) => a + c.usada, 0);
  return { chapas: out, naoCabem, aproveitamento: out.length ? Math.round((usadaTotal / (out.length * areaChapa)) * 1000) / 10 : 0, totalPecas: orient.length };
}
