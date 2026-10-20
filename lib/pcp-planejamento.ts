/**
 * Planejamento PCP: planejado x realizado x restante, capacidade, gargalos e estimativa de conclusão.
 * Estimativas são CONDICIONAIS: usam apenas a capacidade cadastrada (peças/hora, minutos/turno, eficiência),
 * não consideram fila de outros pedidos, manutenção, feriados nem falta de material.
 */
import { diasEntre, soData } from "./carteira";

export const HORIZONTE_DIAS_PADRAO = 5;

export type OpPlan = {
  id: string; produtoId: string; pedido: string; of: string; processo: string; sequencia: number;
  status: string; planejada: number; produzida: number; refugo: number;
};
export type Capacidade = { processo: string; maquina: string; turno: string; pecasHora: number | null; minutos: number | null; eficiencia: number | null };

export type NivelCarga = "SEM_CARGA" | "SEM_CAPACIDADE" | "OK" | "ATENCAO" | "SOBRECARGA";
export type LinhaProcesso = {
  processo: string; operacoes: number; planejada: number; produzida: number; restante: number; refugo: number;
  pctRealizado: number; concluidas: number; emAndamento: number; liberadas: number; pendentes: number; bloqueadas: number; divergencias: number;
  capacidadeDia: number | null; maquinasComCapacidade: number; diasNecessarios: number | null; nivel: NivelCarga;
};

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
export const restanteOp = (o: OpPlan) => (o.status === "CONCLUIDA" ? 0 : Math.max(0, n(o.planejada) - n(o.produzida)));

/** Peças/dia = Σ por máquina/turno (peças/hora × eficiência% × minutos/60). Sem dados válidos → null. */
export function capacidadeDiaria(caps: Capacidade[]): { pecasDia: number | null; maquinas: number } {
  let soma = 0, validas = 0;
  for (const c of caps) {
    const ph = n(c.pecasHora), min = n(c.minutos), ef = c.eficiencia == null ? 100 : n(c.eficiencia);
    if (ph > 0 && min > 0 && ef > 0) { soma += (ph * ef / 100) * (min / 60); validas++; }
  }
  return validas ? { pecasDia: soma, maquinas: validas } : { pecasDia: null, maquinas: 0 };
}

export function resumoPorProcesso(ops: OpPlan[], caps: Capacidade[], divergenciasPorProcesso: Record<string, number> = {}, horizonte = HORIZONTE_DIAS_PADRAO): LinhaProcesso[] {
  const mapa = new Map<string, OpPlan[]>();
  for (const o of ops) { if (!mapa.has(o.processo)) mapa.set(o.processo, []); mapa.get(o.processo)!.push(o); }
  const linhas: LinhaProcesso[] = [];
  for (const [processo, lista] of mapa) {
    const plan = lista.reduce((s, o) => s + n(o.planejada), 0);
    const prod = lista.reduce((s, o) => s + Math.min(n(o.produzida), n(o.planejada)), 0);
    const rest = lista.reduce((s, o) => s + restanteOp(o), 0);
    const cap = capacidadeDiaria(caps.filter((c) => c.processo.toUpperCase() === processo.toUpperCase()));
    const dias = cap.pecasDia && rest > 0 ? rest / cap.pecasDia : cap.pecasDia ? 0 : null;
    let nivel: NivelCarga = "OK";
    if (rest <= 0) nivel = "SEM_CARGA";
    else if (dias === null) nivel = "SEM_CAPACIDADE";
    else if (dias > horizonte) nivel = "SOBRECARGA";
    else if (dias > horizonte * 0.7) nivel = "ATENCAO";
    const cont = (st: string) => lista.filter((o) => o.status === st).length;
    linhas.push({
      processo, operacoes: lista.length, planejada: plan, produzida: prod, restante: rest,
      refugo: lista.reduce((s, o) => s + n(o.refugo), 0), pctRealizado: plan > 0 ? (prod / plan) * 100 : 0,
      concluidas: cont("CONCLUIDA"), emAndamento: cont("EM_ANDAMENTO"), liberadas: cont("LIBERADA"), pendentes: cont("PENDENTE"),
      bloqueadas: cont("BLOQUEADA") + cont("DIVERGENCIA"), divergencias: divergenciasPorProcesso[processo] || 0,
      capacidadeDia: cap.pecasDia, maquinasComCapacidade: cap.maquinas, diasNecessarios: dias, nivel,
    });
  }
  const peso: Record<NivelCarga, number> = { SOBRECARGA: 0, SEM_CAPACIDADE: 1, ATENCAO: 2, OK: 3, SEM_CARGA: 4 };
  return linhas.sort((a, b) => peso[a.nivel] - peso[b.nivel] || (b.diasNecessarios ?? -1) - (a.diasNecessarios ?? -1) || b.restante - a.restante);
}

/** Gargalo = processo com sobrecarga; o de maior dias necessários é o principal. */
export function identificarGargalos(linhas: LinhaProcesso[]) {
  const s = linhas.filter((l) => l.nivel === "SOBRECARGA").sort((a, b) => (b.diasNecessarios ?? 0) - (a.diasNecessarios ?? 0));
  return { principal: s[0] ?? null, sobrecarregados: s, semCapacidade: linhas.filter((l) => l.nivel === "SEM_CAPACIDADE") };
}

export function addDiasUteis(inicio: string, dias: number): string {
  const d = new Date(inicio.slice(0, 10) + "T12:00:00Z");
  let falta = Math.ceil(dias);
  while (falta > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) falta--; }
  return d.toISOString().slice(0, 10);
}

export type RiscoPedido = "SEM_OPERACOES" | "CONCLUIDO" | "SEM_ESTIMATIVA" | "PRAZO_VENCIDO" | "ATRASO_PROVAVEL" | "NO_PRAZO" | "SEM_PRAZO";
export type EstimativaPedido = {
  pedido: string; operacoesAbertas: number; restante: number; pctRealizado: number; diasEstimados: number | null;
  conclusaoEstimada: string | null; prazo: string | null; risco: RiscoPedido; semCapacidade: string[];
};

/**
 * Por OF as operações abertas são sequenciais (soma dos dias de cada operação); o pedido conclui quando a última OF conclui.
 * Dias da operação = restante ÷ capacidade diária do processo (sem fila de outros pedidos).
 */
export function estimarPedidos(ops: OpPlan[], caps: Capacidade[], prazos: Record<string, string | null>, hoje: string): EstimativaPedido[] {
  const capProc = new Map<string, number | null>();
  const capDe = (p: string) => { if (!capProc.has(p)) capProc.set(p, capacidadeDiaria(caps.filter((c) => c.processo.toUpperCase() === p.toUpperCase())).pecasDia); return capProc.get(p)!; };
  const porPedido = new Map<string, OpPlan[]>();
  for (const o of ops) { if (!porPedido.has(o.pedido)) porPedido.set(o.pedido, []); porPedido.get(o.pedido)!.push(o); }
  const out: EstimativaPedido[] = [];
  for (const [pedido, lista] of porPedido) {
    const plan = lista.reduce((s, o) => s + n(o.planejada), 0);
    const prod = lista.reduce((s, o) => s + Math.min(n(o.produzida), n(o.planejada)), 0);
    const abertas = lista.filter((o) => restanteOp(o) > 0 || o.status !== "CONCLUIDA");
    const prazo = soData(prazos[pedido]);
    const base = { pedido, operacoesAbertas: abertas.length, restante: lista.reduce((s, o) => s + restanteOp(o), 0), pctRealizado: plan > 0 ? (prod / plan) * 100 : 0, prazo };
    if (!abertas.length) { out.push({ ...base, diasEstimados: 0, conclusaoEstimada: null, risco: "CONCLUIDO", semCapacidade: [] }); continue; }
    const semCap = new Set<string>();
    const porOf = new Map<string, number>();
    for (const o of abertas) {
      const c = capDe(o.processo);
      if (!c) { semCap.add(o.processo); continue; }
      porOf.set(o.of || o.produtoId, (porOf.get(o.of || o.produtoId) || 0) + restanteOp(o) / c);
    }
    if (semCap.size) { out.push({ ...base, diasEstimados: null, conclusaoEstimada: null, risco: prazo && diasEntre(hoje, prazo) < 0 ? "PRAZO_VENCIDO" : "SEM_ESTIMATIVA", semCapacidade: [...semCap].sort() }); continue; }
    const dias = Math.max(0, ...porOf.values());
    const conclusao = addDiasUteis(hoje, dias);
    let risco: RiscoPedido = "NO_PRAZO";
    if (!prazo) risco = "SEM_PRAZO";
    else if (diasEntre(hoje, prazo) < 0) risco = "PRAZO_VENCIDO";
    else if (conclusao > prazo) risco = "ATRASO_PROVAVEL";
    out.push({ ...base, diasEstimados: dias, conclusaoEstimada: conclusao, risco, semCapacidade: [] });
  }
  const peso: Record<RiscoPedido, number> = { PRAZO_VENCIDO: 0, ATRASO_PROVAVEL: 1, SEM_ESTIMATIVA: 2, SEM_PRAZO: 3, NO_PRAZO: 4, SEM_OPERACOES: 5, CONCLUIDO: 6 };
  return out.sort((a, b) => peso[a.risco] - peso[b.risco] || (a.prazo || "9999").localeCompare(b.prazo || "9999"));
}

export const atingimentoMeta = (produzido: number, meta: number | null) => (meta && meta > 0 ? (produzido / meta) * 100 : null);
