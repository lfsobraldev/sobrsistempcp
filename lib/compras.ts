/** Regras puras de compras: alçada, transições, cotação e leitura de XML de NF-e. */

export const STATUS_PC = ["RASCUNHO", "EM_APROVACAO", "APROVADO", "PARCIAL", "RECEBIDO", "CANCELADO"] as const;
const TRANS: Record<string, readonly string[]> = {
  RASCUNHO: ["EM_APROVACAO", "CANCELADO"],
  EM_APROVACAO: ["APROVADO", "RASCUNHO", "CANCELADO"],
  APROVADO: ["PARCIAL", "RECEBIDO", "CANCELADO"],
  PARCIAL: ["RECEBIDO", "CANCELADO"],
  RECEBIDO: [],
  CANCELADO: [],
};
export const podeTransicionarPC = (de: string, para: string) => TRANS[de]?.includes(para) ?? false;

export type Alcada = { valorAte: number | null; perfil: "PCP" | "GERENTE" };
/** Menor perfil exigido para o valor: a faixa com menor teto que comporta o total; sem teto = última faixa. */
export function perfilExigido(total: number, alcadas: Alcada[]): "PCP" | "GERENTE" {
  const faixas = [...alcadas].sort((a, b) => (a.valorAte ?? Infinity) - (b.valorAte ?? Infinity));
  for (const f of faixas) if (f.valorAte === null || total <= f.valorAte) return f.perfil;
  return "GERENTE";
}
export const podeAprovar = (perfilUsuario: string, exigido: string) => perfilUsuario === "GERENTE" || (perfilUsuario === "PCP" && exigido === "PCP");

export type ItemPC = { produtoId: string; quantidade: number; precoUnitario: number };
export function totalPC(itens: ItemPC[]): number {
  if (!itens.length) throw new Error("Informe ao menos um item.");
  let cents = 0;
  for (const [i, it] of itens.entries()) {
    if (!(it.quantidade > 0)) throw new Error(`Item ${i + 1}: quantidade inválida.`);
    if (!(it.precoUnitario >= 0)) throw new Error(`Item ${i + 1}: preço inválido.`);
    cents += Math.round(it.quantidade * it.precoUnitario * 100 + 1e-7);
  }
  return cents / 100;
}

export type Proposta = { linha: number; fornecedorId: string; precoUnitario: number; prazoDias: number };
/** Menor preço; desempate por menor prazo, depois por fornecedor (estável). */
export function melhorProposta(props: Proposta[]): Proposta | null {
  return [...props].sort((a, b) => a.precoUnitario - b.precoUnitario || a.prazoDias - b.prazoDias || a.fornecedorId.localeCompare(b.fornecedorId))[0] ?? null;
}
/** Agrupa as escolhas por fornecedor para gerar um PC por fornecedor. */
export function agruparPorFornecedor<T extends { fornecedorId: string }>(escolhas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of escolhas) m.set(e.fornecedorId, [...(m.get(e.fornecedorId) ?? []), e]);
  return m;
}

// ------------------------------------------------------------------ NF-e (XML)
export type NfeItem = { linha: number; codigo: string; descricao: string; quantidade: number; precoUnitario: number; total: number };
export type Nfe = { chave: string; numero: string; emitenteDocumento: string; emitenteNome: string; itens: NfeItem[]; totalNota: number };

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
const tag = (xml: string, t: string) => { const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`).exec(xml); return m ? decode(m[1]) : ""; };

export function lerNfeXml(xml: string): Nfe {
  if (typeof xml !== "string" || xml.length > 5_000_000) throw new Error("XML inválido ou grande demais.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com DOCTYPE/ENTITY não é aceito.");
  const inf = /<infNFe\b[^>]*\bId="NFe(\d{44})"/.exec(xml);
  if (!inf) throw new Error("XML não é uma NF-e válida (chave de acesso ausente).");
  const emit = /<emit>([\s\S]*?)<\/emit>/.exec(xml)?.[1] ?? "";
  const itens: NfeItem[] = [];
  for (const m of xml.matchAll(/<det\b[^>]*\bnItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g)) {
    const prod = /<prod>([\s\S]*?)<\/prod>/.exec(m[2])?.[1] ?? "";
    const q = Number(tag(prod, "qCom")), p = Number(tag(prod, "vUnCom")), t = Number(tag(prod, "vProd"));
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p)) throw new Error(`Item ${m[1]} da NF-e com quantidade/preço inválido.`);
    itens.push({ linha: Number(m[1]), codigo: tag(prod, "cProd"), descricao: tag(prod, "xProd"), quantidade: q, precoUnitario: p, total: Number.isFinite(t) ? t : Math.round(q * p * 100) / 100 });
  }
  if (!itens.length) throw new Error("NF-e sem itens.");
  const totalNota = Number(tag(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/.exec(xml)?.[1] ?? "", "vNF")) || itens.reduce((s, i) => s + i.total, 0);
  return { chave: inf[1], numero: tag(/<ide>([\s\S]*?)<\/ide>/.exec(xml)?.[1] ?? "", "nNF"), emitenteDocumento: tag(emit, "CNPJ") || tag(emit, "CPF"), emitenteNome: tag(emit, "xNome"), itens, totalNota };
}

const normCodigo = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
export type LinhaPedido = { linha: number; codigo: string; pendente: number; precoUnitario: number };
export type Conferencia = { linhaPedido: number | null; linhaNfe: number; quantidade: number; precoNf: number; situacao: "OK" | "PRECO_DIVERGE" | "SEM_ITEM_NO_PEDIDO" | "ACIMA_DO_PENDENTE" };
/** Casa os itens da NF-e com o pedido pelo código do produto; devolve o que a tela de conferência mostra. */
export function conferirNfe(nfe: Nfe, pedido: LinhaPedido[]): Conferencia[] {
  const restante = new Map(pedido.map((p) => [p.linha, p.pendente]));
  return nfe.itens.map((n) => {
    const alvo = pedido.find((p) => normCodigo(p.codigo) === normCodigo(n.codigo));
    if (!alvo) return { linhaPedido: null, linhaNfe: n.linha, quantidade: n.quantidade, precoNf: n.precoUnitario, situacao: "SEM_ITEM_NO_PEDIDO" };
    const rest = restante.get(alvo.linha) ?? 0;
    restante.set(alvo.linha, rest - n.quantidade);
    const situacao = n.quantidade > rest * 1.05 + 1e-9 ? "ACIMA_DO_PENDENTE" : Math.abs(n.precoUnitario - alvo.precoUnitario) > 0.00005 ? "PRECO_DIVERGE" : "OK";
    return { linhaPedido: alvo.linha, linhaNfe: n.linha, quantidade: n.quantidade, precoNf: n.precoUnitario, situacao };
  });
}
