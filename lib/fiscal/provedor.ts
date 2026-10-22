/** Adaptador de provedor fiscal. O sistema não tem motor tributário nem assina XML: o provedor (contratado) emite e devolve chave/protocolo. */
export type DocumentoFiscal = { id: string; tipo: "NFE" | "NFSE" | "CTE" | "MDFE"; payload: Record<string, any>; total: number };
export type RetornoProvedor =
  | { status: "AUTORIZADO"; chave: string; numero: string; protocolo: string }
  | { status: "REJEITADO"; erro: string };
export interface ProvedorFiscal {
  emitir(doc: DocumentoFiscal): Promise<RetornoProvedor>;
  cancelar(chave: string, justificativa: string): Promise<{ ok: boolean; protocolo?: string; erro?: string }>;
}

/** Dígito verificador da chave de acesso (módulo 11, pesos 2..9). */
export function dvChave(base43: string): number {
  if (!/^\d{43}$/.test(base43)) throw new Error("Base da chave deve ter 43 dígitos.");
  let peso = 2, soma = 0;
  for (let i = base43.length - 1; i >= 0; i--) { soma += Number(base43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
export const validarChaveNfe = (chave: string) => /^\d{44}$/.test(chave) && dvChave(chave.slice(0, 43)) === Number(chave[43]);
const UF_COD: Record<string, string> = { RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17", MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41", SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53" };
export function montarChave(p: { uf: string; data: Date; cnpj: string; serie: number; numero: number; codigo: number }): string {
  const cuf = UF_COD[p.uf.toUpperCase()];
  if (!cuf) throw new Error("UF inválida.");
  if (!/^\d{14}$/.test(p.cnpj)) throw new Error("CNPJ do emitente inválido.");
  const aamm = `${String(p.data.getUTCFullYear()).slice(2)}${String(p.data.getUTCMonth() + 1).padStart(2, "0")}`;
  const base = `${cuf}${aamm}${p.cnpj}55${String(p.serie).padStart(3, "0")}${String(p.numero).padStart(9, "0")}1${String(p.codigo).padStart(8, "0")}`;
  return base + dvChave(base);
}

/** Provedor de homologação: nunca fala com a SEFAZ; serve para ensaiar o fluxo sem emitir nada real. */
export class ProvedorSimulado implements ProvedorFiscal {
  constructor(private proximoNumero: () => number, private agora: () => Date = () => new Date()) {}
  async emitir(doc: DocumentoFiscal): Promise<RetornoProvedor> {
    const e = doc.payload.emitente ?? {};
    if (!doc.payload.itens?.length) return { status: "REJEITADO", erro: "Documento sem itens." };
    const numero = this.proximoNumero();
    const chave = montarChave({ uf: e.uf, data: this.agora(), cnpj: e.cnpj, serie: 1, numero, codigo: numero % 99999999 });
    return { status: "AUTORIZADO", chave, numero: String(numero), protocolo: `SIM${Date.now()}` };
  }
  async cancelar(chave: string, justificativa: string) {
    if (!validarChaveNfe(chave)) return { ok: false, erro: "Chave inválida." };
    if (justificativa.trim().length < 15) return { ok: false, erro: "Justificativa curta." };
    return { ok: true, protocolo: `SIMCAN${Date.now()}` };
  }
}

export function criarProvedor(adaptador: string, ambiente: string, proximoNumero: () => number): ProvedorFiscal {
  if (adaptador === "SIMULADO") {
    if (ambiente !== "HOMOLOGACAO") throw new Error("Provedor simulado só pode operar em homologação.");
    return new ProvedorSimulado(proximoNumero);
  }
  throw new Error(`Adaptador ${adaptador} não está configurado neste ambiente. Contrate um provedor de NF-e e implemente o adaptador.`);
}
