import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ESCOPOS = ["leitura", "indicadores", "alertas", "pedidos", "ordens", "estoque", "qualidade"] as const;
export const EVENTOS = ["alerta.criado", "pedido.status", "remessa.entregue", "ordem.concluida", "nc.aberta", "aprovacao.decidida", "periodo.fechado"] as const;
export const RECURSOS_V1: Record<string, string> = { indicadores: "indicadores", alertas: "alertas" };

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
/** Formato: sbl.<unidade>.<48 hex>. Só o hash é guardado; o valor completo aparece uma única vez. */
export function gerarToken(unidade: string) {
  const token = `sbl.${unidade}.${randomBytes(24).toString("hex")}`;
  return { token, hash: hashToken(token), prefixo: token.slice(-6) };
}
export const unidadeDoToken = (t: string) => (/^sbl\.([A-Z0-9_-]{2,20})\.[0-9a-f]{48}$/i.exec(t)?.[1] ?? null);

/** Link do portal do fornecedor: sbp.<unidade>.<48 hex>; só o hash fica no banco. */
export function gerarTokenPortal(unidade: string) {
  const token = `sbp.${unidade}.${randomBytes(24).toString("hex")}`;
  return { token, hash: hashToken(token) };
}
export const unidadeDoTokenPortal = (t: string) => (/^sbp\.([A-Z0-9_-]{2,20})\.[0-9a-f]{48}$/i.exec(t)?.[1] ?? null);

export const assinarWebhook = (corpo: string, segredo: string, ts: number) =>
  "sha256=" + createHmac("sha256", segredo).update(`${ts}.${corpo}`).digest("hex");
export function conferirAssinatura(corpo: string, segredo: string, ts: number, assinatura: string, agora = Date.now(), tolerancia = 300) {
  if (Math.abs(agora / 1000 - ts) > tolerancia) return false;
  const a = Buffer.from(assinarWebhook(corpo, segredo, ts)), b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Recuo exponencial: 1, 2, 4, 8... minutos, máximo 6 h; após 8 tentativas vira FALHA. */
export const proximaTentativaMin = (tentativas: number) => Math.min(360, 2 ** Math.max(0, tentativas));
export const MAX_TENTATIVAS = 8;

/** URL de webhook: https, sem credenciais e sem destino interno (SSRF). */
export function urlWebhookSegura(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  return !h.startsWith("[");
}

export function criarLimitador(max: number, janelaMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (chave: string, agora = Date.now()) => {
    const l = (hits.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    l.push(agora); hits.set(chave, l);
    if (hits.size > 5000) hits.clear();
    return l.length > max;
  };
}
