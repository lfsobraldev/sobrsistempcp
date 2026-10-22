/** PIX "copia e cola" (BR Code estático, EMV) e adaptador de boleto. Boleto real exige provedor bancário contratado. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const f = (id: string, v: string) => { if (v.length > 99) throw new Error(`Campo ${id} longo demais.`); return id + String(v.length).padStart(2, "0") + v; };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-]/g, "").toUpperCase();

export function pixCopiaECola(p: { chave: string; nome: string; cidade: string; valor?: number; txid?: string }): string {
  if (!p.chave.trim()) throw new Error("Informe a chave PIX da conta.");
  const nome = semAcento(p.nome).slice(0, 25).trim(), cidade = semAcento(p.cidade).slice(0, 15).trim();
  if (!nome || !cidade) throw new Error("Informe nome e cidade do recebedor.");
  const txid = (p.txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  if (p.valor != null && !(p.valor > 0)) throw new Error("Valor inválido.");
  const conta = f("00", "br.gov.bcb.pix") + f("01", p.chave.trim());
  const base = f("00", "01") + f("01", p.valor != null ? "12" : "11") + f("26", conta) + f("52", "0000") + f("53", "986") + (p.valor != null ? f("54", p.valor.toFixed(2)) : "") + f("58", "BR") + f("59", nome) + f("60", cidade) + f("62", f("05", txid)) + "6304";
  return base + crc16(base);
}

export type Boleto = { nossoNumero: string; linhaDigitavel: string | null; simulado: boolean };
export interface ProvedorCobranca { gerarBoleto(t: { numero: number; valor: number; vencimento: string; pagador: string }): Promise<Boleto> }
export function criarProvedorCobranca(adaptador: string, ambiente: string): ProvedorCobranca {
  if (adaptador === "SIMULADO") {
    if (ambiente !== "HOMOLOGACAO") throw new Error("Cobrança simulada só em homologação.");
    return { gerarBoleto: async (t) => ({ nossoNumero: String(t.numero).padStart(10, "0"), linhaDigitavel: null, simulado: true }) };
  }
  throw new Error(`Adaptador de cobrança ${adaptador} não configurado. Contrate o banco/provedor e implemente o adaptador.`);
}
