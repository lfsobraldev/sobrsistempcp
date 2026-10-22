/** Leitura de extrato (OFX/CSV) e sugestão de conciliação. Puro, sem I/O. */
export type LinhaExtrato = { fitid: string; data: string; valor: number; descricao: string };

export function parseOfx(texto: string): LinhaExtrato[] {
  if (texto.length > 5_000_000) throw new Error("Arquivo OFX grande demais.");
  const blocos = [...texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi)];
  const tag = (b: string, t: string) => new RegExp(`<${t}>\\s*([^<\\r\\n]*)`, "i").exec(b)?.[1]?.trim() ?? "";
  const out: LinhaExtrato[] = [];
  for (const m of blocos) {
    const b = m[1];
    const dt = tag(b, "DTPOSTED").slice(0, 8), amt = Number(tag(b, "TRNAMT").replace(",", "."));
    if (!/^\d{8}$/.test(dt) || !Number.isFinite(amt) || amt === 0) continue;
    const fitid = tag(b, "FITID") || `${dt}:${amt}:${tag(b, "MEMO")}`;
    out.push({ fitid, data: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`, valor: Math.round(amt * 100) / 100, descricao: tag(b, "MEMO") || tag(b, "NAME") });
  }
  if (!out.length) throw new Error("Nenhum lançamento encontrado no OFX.");
  return out;
}

const brNum = (s: string) => { const t = s.trim().replace(/\s/g, ""); const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return n; };
/** CSV com cabeçalho: data;descricao;valor (separador ; ou ,). Datas dd/mm/aaaa ou aaaa-mm-dd. */
export function parseCsvExtrato(texto: string): LinhaExtrato[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) throw new Error("CSV sem linhas.");
  const sep = linhas[0].includes(";") ? ";" : ",";
  const cab = linhas[0].toLowerCase().split(sep).map((c) => c.trim().replace(/"/g, ""));
  const iD = cab.findIndex((c) => c.startsWith("data")), iH = cab.findIndex((c) => /desc|hist|memo/.test(c)), iV = cab.findIndex((c) => c.startsWith("valor"));
  if (iD < 0 || iV < 0) throw new Error("CSV precisa das colunas data e valor.");
  const out: LinhaExtrato[] = [];
  linhas.slice(1).forEach((l, n) => {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    const d = c[iD];
    const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? `${d.slice(6)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : d;
    const v = brNum(c[iV] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(v) || v === 0) throw new Error(`Linha ${n + 2} inválida.`);
    out.push({ fitid: `${iso}:${v}:${n}`, data: iso, valor: Math.round(v * 100) / 100, descricao: iH >= 0 ? c[iH] ?? "" : "" });
  });
  return out;
}

export type TituloAberto = { id: string; tipo: "RECEBER" | "PAGAR"; saldo: number; vencimento: string; parceiro: string };
export type Sugestao = { extratoId: string; tituloId: string | null; motivo: "VALOR_EXATO" | "VALOR_E_NOME" | "SEM_CANDIDATO" | "VARIOS_CANDIDATOS" };
const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
/** Casa por sinal e valor exato; desempata por nome do parceiro na descrição e por proximidade do vencimento. Nunca reutiliza um título. */
export function sugerirConciliacao(extratos: Array<LinhaExtrato & { id: string }>, titulos: TituloAberto[]): Sugestao[] {
  const usados = new Set<string>();
  return extratos.map((e) => {
    const tipo = e.valor > 0 ? "RECEBER" : "PAGAR";
    const cands = titulos.filter((t) => t.tipo === tipo && !usados.has(t.id) && Math.round(t.saldo * 100) === Math.round(Math.abs(e.valor) * 100));
    if (!cands.length) return { extratoId: e.id, tituloId: null, motivo: "SEM_CANDIDATO" as const };
    if (cands.length === 1) { usados.add(cands[0].id); return { extratoId: e.id, tituloId: cands[0].id, motivo: "VALOR_EXATO" as const }; }
    const nome = cands.filter((t) => t.parceiro && e.descricao.toLowerCase().includes(t.parceiro.toLowerCase().split(" ")[0]));
    const pool = nome.length ? nome : cands;
    const melhor = [...pool].sort((a, b) => dias(a.vencimento, e.data) - dias(b.vencimento, e.data));
    if (pool.length > 1 && dias(melhor[0].vencimento, e.data) === dias(melhor[1].vencimento, e.data)) return { extratoId: e.id, tituloId: null, motivo: "VARIOS_CANDIDATOS" as const };
    usados.add(melhor[0].id);
    return { extratoId: e.id, tituloId: melhor[0].id, motivo: nome.length ? "VALOR_E_NOME" as const : "VALOR_EXATO" as const };
  });
}
