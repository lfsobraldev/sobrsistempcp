/**
 * Regras de Estoque (puras). O banco repete as invariantes por CHECK em est_saldos, então mesmo
 * lançamentos concorrentes não conseguem gerar saldo negativo nem reservar/bloquear mais que o físico.
 *
 * Saldos por produto+local: físico (o que está no local), reservado (comprometido com pedido/OF),
 * bloqueado (qualidade/avaria/inventário). Disponível = físico − reservado − bloqueado.
 * Todas as quantidades são guardadas na UNIDADE BASE do produto; unidades alternativas (caixa, pacote…)
 * convertem por fator (1 CX = fator × unidade base) e a quantidade informada fica no histórico.
 */
import type { Perfil } from "../types/pcp";
export type TipoMov = "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE" | "RESERVA" | "LIBERA_RESERVA" | "BLOQUEIO" | "DESBLOQUEIO";
export const TIPOS_MOV: TipoMov[] = ["ENTRADA", "SAIDA", "TRANSFERENCIA", "AJUSTE", "RESERVA", "LIBERA_RESERVA", "BLOQUEIO", "DESBLOQUEIO"];
export const ROTULO_MOV: Record<TipoMov, string> = {
  ENTRADA: "Entrada", SAIDA: "Saída", TRANSFERENCIA: "Transferência", AJUSTE: "Ajuste", RESERVA: "Reserva",
  LIBERA_RESERVA: "Liberação de reserva", BLOQUEIO: "Bloqueio", DESBLOQUEIO: "Desbloqueio",
};

export type Saldo = { fisico: number; reservado: number; bloqueado: number };
export type Deltas = { dF: number; dR: number; dB: number };

export const arredondar = (n: number, casas = 3) => { const f = 10 ** casas; return Math.round((n + Number.EPSILON) * f) / f; };
export const disponivel = (s: Saldo) => arredondar(s.fisico - s.reservado - s.bloqueado);

export function converterParaBase(qtd: number, fator: number, fracionavel: boolean): { ok: true; base: number } | { ok: false; erro: string } {
  if (!Number.isFinite(qtd) || qtd <= 0) return { ok: false, erro: "Informe uma quantidade maior que zero." };
  if (!Number.isFinite(fator) || fator <= 0) return { ok: false, erro: "Fator de conversão inválido." };
  const base = arredondar(qtd * fator);
  if (base <= 0) return { ok: false, erro: "A quantidade convertida é menor que a menor fração permitida (0,001)." };
  if (!fracionavel && !Number.isInteger(base)) return { ok: false, erro: `A conversão resulta em ${base} na unidade base, que não admite fração. Ajuste a quantidade.` };
  return { ok: true, base };
}

/** Efeito de cada movimento nos saldos (origem e/ou destino). */
export function deltasDoMovimento(tipo: TipoMov, q: number, o: { sinal?: 1 | -1; baixarReserva?: boolean } = {}): { origem: Deltas | null; destino: Deltas | null } {
  switch (tipo) {
    case "ENTRADA": return { origem: null, destino: { dF: q, dR: 0, dB: 0 } };
    case "SAIDA": return { origem: { dF: -q, dR: o.baixarReserva ? -q : 0, dB: 0 }, destino: null };
    case "TRANSFERENCIA": return { origem: { dF: -q, dR: 0, dB: 0 }, destino: { dF: q, dR: 0, dB: 0 } };
    case "AJUSTE": return o.sinal === -1 ? { origem: { dF: -q, dR: 0, dB: 0 }, destino: null } : { origem: null, destino: { dF: q, dR: 0, dB: 0 } };
    case "RESERVA": return { origem: { dF: 0, dR: q, dB: 0 }, destino: null };
    case "LIBERA_RESERVA": return { origem: { dF: 0, dR: -q, dB: 0 }, destino: null };
    case "BLOQUEIO": return { origem: { dF: 0, dR: 0, dB: q }, destino: null };
    case "DESBLOQUEIO": return { origem: { dF: 0, dR: 0, dB: -q }, destino: null };
  }
}

export function aplicar(s: Saldo, d: Deltas): { ok: true; saldo: Saldo } | { ok: false; codigo: string; erro: string } {
  const n = { fisico: arredondar(s.fisico + d.dF), reservado: arredondar(s.reservado + d.dR), bloqueado: arredondar(s.bloqueado + d.dB) };
  if (n.fisico < 0) return { ok: false, codigo: "SALDO_INSUFICIENTE", erro: "Saldo físico insuficiente." };
  if (n.reservado < 0) return { ok: false, codigo: "RESERVA_INSUFICIENTE", erro: "Quantidade maior que a reservada." };
  if (n.bloqueado < 0) return { ok: false, codigo: "BLOQUEIO_INSUFICIENTE", erro: "Quantidade maior que a bloqueada." };
  if (n.reservado + n.bloqueado > n.fisico + 1e-9) return { ok: false, codigo: "DISPONIVEL_INSUFICIENTE", erro: `Saldo disponível insuficiente (disponível: ${disponivel(s)}).` };
  return { ok: true, saldo: n };
}

export type EntradaMov = {
  tipo: TipoMov; quantidade: number; localOrigem?: string; localDestino?: string; sinal?: 1 | -1;
  documento?: string; pedido?: string; motivo?: string; baixarReserva?: boolean;
};
/** Campos obrigatórios por tipo de movimento. Retorna lista de erros (vazia = válido). */
export function validarCamposMovimento(m: EntradaMov): string[] {
  const e: string[] = [];
  if (!TIPOS_MOV.includes(m.tipo)) return ["Tipo de movimento inválido."];
  if (!Number.isFinite(m.quantidade) || m.quantidade <= 0) e.push("Informe uma quantidade maior que zero.");
  const { origem, destino } = deltasDoMovimento(m.tipo, 1, { sinal: m.sinal, baixarReserva: m.baixarReserva });
  if (origem && !m.localOrigem) e.push(m.tipo === "SAIDA" || m.tipo === "TRANSFERENCIA" ? "Informe o local de origem." : "Informe o local.");
  if (destino && !m.localDestino && m.tipo !== "AJUSTE") e.push("Informe o local de destino.");
  if (m.tipo === "AJUSTE" && !m.localOrigem && !m.localDestino) e.push("Informe o local.");
  if (m.tipo === "TRANSFERENCIA" && m.localOrigem && m.localOrigem === m.localDestino) e.push("Origem e destino devem ser diferentes.");
  if (["AJUSTE", "BLOQUEIO", "DESBLOQUEIO"].includes(m.tipo) && !(m.motivo || "").trim()) e.push("Informe o motivo.");
  if (["RESERVA", "LIBERA_RESERVA"].includes(m.tipo) && !(m.pedido || "").trim()) e.push("Informe o pedido da reserva.");
  if (m.tipo === "SAIDA" && m.baixarReserva && !(m.pedido || "").trim()) e.push("Para baixar reserva informe o pedido.");
  if (m.tipo === "SAIDA" && !(m.documento || "").trim() && !(m.pedido || "").trim() && !(m.motivo || "").trim()) e.push("Informe documento (NF/romaneio), pedido ou motivo da saída.");
  return e;
}

/** Quem pode o quê (aplicado nas APIs). */
export const PERFIS_VER: Perfil[] = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA", "COMERCIAL"];
export const PERFIS_MOV: Record<TipoMov, Perfil[]> = {
  ENTRADA: ["PCP", "GERENTE", "ENCARREGADO"],
  SAIDA: ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"],
  TRANSFERENCIA: ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"],
  AJUSTE: ["PCP", "GERENTE"],
  RESERVA: ["PCP", "GERENTE", "ENCARREGADO"],
  LIBERA_RESERVA: ["PCP", "GERENTE", "ENCARREGADO"],
  BLOQUEIO: ["PCP", "GERENTE"],
  DESBLOQUEIO: ["PCP", "GERENTE"],
};
export const PERFIS_CADASTRO: Perfil[] = ["PCP", "GERENTE"];
export const PERFIS_CONTAGEM: Perfil[] = ["PCP", "GERENTE", "ENCARREGADO"];
export const PERFIS_CONFERENCIA: Perfil[] = ["PCP", "GERENTE"];

// ---------------- Inventário ----------------
export type ItemInv = { saldoSistema: number; contado: number | null; conferido: boolean; status?: string };
export const divergenciaInventario = (saldoSistema: number, contado: number | null) => (contado === null ? null : arredondar(contado - saldoSistema));

export function avaliarFechamento(itens: ItemInv[]): { ok: boolean; naoContados: number; divergentesSemConferencia: number; ajustes: number } {
  let nao = 0, sem = 0, ajustes = 0;
  for (const i of itens) {
    if (i.contado === null) { nao++; continue; }
    const d = divergenciaInventario(i.saldoSistema, i.contado)!;
    if (d !== 0) { ajustes++; if (!i.conferido) sem++; }
  }
  return { ok: nao === 0 && sem === 0, naoContados: nao, divergentesSemConferencia: sem, ajustes };
}

/** Ajuste do inventário: sinal e quantidade para levar o físico até o contado. */
export function ajusteDoInventario(saldoSistema: number, contado: number): { sinal: 1 | -1; quantidade: number } | null {
  const d = divergenciaInventario(saldoSistema, contado)!;
  return d === 0 ? null : { sinal: d > 0 ? 1 : -1, quantidade: Math.abs(d) };
}

export const normalizarCodigo = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
