/** Programação fina de capacidade finita (forward scheduling) e S&OP. Datas "YYYY-MM-DD" no calendário civil. */

export type CentroCap = { id: string; nome: string; minutosDia: number; dias: number[] /* 1=seg … 7=dom */ };
export type OpEntrada = { sequencia: number; processo: string; centroId: string | null; minutos: number };
export type OfEntrada = { id: string; numero: number; produto: string; prazo: string; inicioFixo?: string | null; operacoes: OpEntrada[] };
export type Segmento = { dia: string; minutos: number };
export type OpAgendada = { sequencia: number; processo: string; centroId: string | null; minutos: number; inicio: string | null; fim: string | null; segmentos: Segmento[]; semCapacidade: boolean };
export type OfAgendada = { id: string; numero: number; produto: string; prazo: string; inicio: string | null; fim: string | null; atrasoDias: number; atrasada: boolean; semCapacidade: boolean; fixa: boolean; operacoes: OpAgendada[] };
export type Resultado = { ofs: OfAgendada[]; ocupacao: Record<string, Record<string, number>>; atrasadas: string[]; semCapacidade: string[] };

const HORIZONTE_DIAS = 400;
const toMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const addDias = (d: string, n: number) => new Date(toMs(d) + n * 86400000).toISOString().slice(0, 10);
export const diffDias = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / 86400000);
/** 1=segunda … 7=domingo */
export const diaSemana = (d: string) => { const w = new Date(toMs(d)).getUTCDay(); return w === 0 ? 7 : w; };

export function programar(ofs: OfEntrada[], centros: CentroCap[], hoje: string): Resultado {
  const cap = new Map(centros.map((c) => [c.id, c]));
  const uso: Record<string, Record<string, number>> = {};
  const usar = (c: string, dia: string) => uso[c]?.[dia] ?? 0;
  // fixas primeiro (respeitam a data escolhida), depois por prazo, depois por número: ordem estável e explicável
  const ordem = [...ofs].sort((a, b) => Number(!!b.inicioFixo) - Number(!!a.inicioFixo) || (a.inicioFixo ?? a.prazo).localeCompare(b.inicioFixo ?? b.prazo) || a.prazo.localeCompare(b.prazo) || a.numero - b.numero);
  const out: OfAgendada[] = [];
  for (const of of ordem) {
    let t = of.inicioFixo && of.inicioFixo > hoje ? of.inicioFixo : of.inicioFixo ?? hoje;
    if (t < hoje && !of.inicioFixo) t = hoje;
    const ops: OpAgendada[] = [];
    let semCap = false;
    for (const op of [...of.operacoes].sort((a, b) => a.sequencia - b.sequencia)) {
      const c = op.centroId ? cap.get(op.centroId) : undefined;
      const seg: Segmento[] = [];
      let resto = Math.max(0, op.minutos), dia = t, falhou = false;
      if (resto > 0) {
        if (!c || c.minutosDia <= 0 || !c.dias.length) falhou = true;
        else for (let i = 0; i < HORIZONTE_DIAS && resto > 0; i++, dia = addDias(dia, 1)) {
          if (!c.dias.includes(diaSemana(dia))) continue;
          const livre = c.minutosDia - usar(c.id, dia);
          if (livre <= 0) continue;
          const tomar = Math.min(livre, resto);
          seg.push({ dia, minutos: tomar });
          (uso[c.id] ??= {})[dia] = usar(c.id, dia) + tomar;
          resto -= tomar;
          if (resto > 0) continue;
        }
        if (resto > 0) falhou = true;
      }
      const inicio = seg[0]?.dia ?? null, fim = seg[seg.length - 1]?.dia ?? null;
      if (fim) t = addDias(fim, 1); // a próxima operação começa no dia seguinte ao término (conservador)
      if (falhou) semCap = true;
      ops.push({ sequencia: op.sequencia, processo: op.processo, centroId: op.centroId, minutos: op.minutos, inicio, fim, segmentos: seg, semCapacidade: falhou });
    }
    const inicio = ops.find((o) => o.inicio)?.inicio ?? null;
    const fim = [...ops].reverse().find((o) => o.fim)?.fim ?? null;
    const atraso = fim ? Math.max(0, diffDias(of.prazo, fim)) : 0;
    out.push({ id: of.id, numero: of.numero, produto: of.produto, prazo: of.prazo, inicio, fim, atrasoDias: atraso, atrasada: atraso > 0 || semCap, semCapacidade: semCap, fixa: !!of.inicioFixo, operacoes: ops });
  }
  out.sort((a, b) => a.numero - b.numero);
  return { ofs: out, ocupacao: uso, atrasadas: out.filter((o) => o.atrasoDias > 0).map((o) => o.id), semCapacidade: out.filter((o) => o.semCapacidade).map((o) => o.id) };
}

/** Compara a agenda antes e depois de incluir uma OF hipotética (pedido urgente). */
export function simularUrgente(ofs: OfEntrada[], urgente: OfEntrada, centros: CentroCap[], hoje: string) {
  const antes = programar(ofs, centros, hoje);
  const depois = programar([...ofs, { ...urgente, inicioFixo: urgente.inicioFixo ?? hoje }], centros, hoje);
  const idAntes = new Map(antes.ofs.map((o) => [o.id, o]));
  const novos = depois.ofs.find((o) => o.id === urgente.id)!;
  const impactadas = depois.ofs.filter((o) => o.id !== urgente.id).filter((o) => {
    const a = idAntes.get(o.id); return a && (o.fim !== a.fim) && o.atrasoDias > a.atrasoDias;
  }).map((o) => ({ id: o.id, numero: o.numero, produto: o.produto, atrasoAntes: idAntes.get(o.id)!.atrasoDias, atrasoDepois: o.atrasoDias }));
  return { urgente: novos, atendePrazo: !novos.atrasada, impactadas };
}

// --------------------------------------------------------------- S&OP
export type SopMes = { mes: string; demandaMin: number; capacidadeMin: number; ocupacaoPct: number; saldoMin: number; situacao: "OK" | "ATENCAO" | "ESTOURO" };
export function capacidadeDoMes(mes: string, centros: CentroCap[]): number {
  const [y, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let total = 0;
  for (let d = 1; d <= dias; d++) {
    const dia = `${mes}-${String(d).padStart(2, "0")}`, w = diaSemana(dia);
    for (const c of centros) if (c.dias.includes(w)) total += c.minutosDia;
  }
  return total;
}
export function sop(demandaPorMes: Record<string, number>, centros: CentroCap[], meses: string[]): SopMes[] {
  return meses.map((mes) => {
    const demanda = Math.round(demandaPorMes[mes] ?? 0), capacidade = capacidadeDoMes(mes, centros);
    const pct = capacidade > 0 ? Math.round((demanda / capacidade) * 1000) / 10 : demanda > 0 ? 999 : 0;
    return { mes, demandaMin: demanda, capacidadeMin: capacidade, ocupacaoPct: pct, saldoMin: capacidade - demanda, situacao: pct > 100 ? "ESTOURO" : pct > 85 ? "ATENCAO" : "OK" };
  });
}
export const proximosMeses = (hoje: string, n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + i, 1)); return d.toISOString().slice(0, 7); });
