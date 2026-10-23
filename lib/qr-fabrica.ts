// Conteúdo dos QR codes da fábrica. Formato: FAMOSSUL|<tipo>|<dados...>
export const qrEndereco = (codigo: string) => `FAMOSSUL|E|${codigo}`;
export const qrPeca = (pedido: string, peca: string) => `FAMOSSUL|P|${pedido}|${peca}`;
export const qrSobra = (numero: string | number) => `FAMOSSUL|S|${numero}`;
export const qrPallet = (codigo: string) => `FAMOSSUL|L|${codigo}`;

export type LeituraQr =
  | { tipo: "ENDERECO"; codigo: string }
  | { tipo: "PECA"; pedido: string; peca: string }
  | { tipo: "SOBRA"; numero: string }
  | { tipo: "PALLET"; codigo: string }
  | { tipo: "FICHA"; pedido: string };

/** Interpreta o texto lido (câmera ou leitor USB). Retorna null se não for um QR da fábrica. */
export function lerQr(texto: string): LeituraQr | null {
  const t = String(texto ?? "").trim();
  const p = t.split("|");
  if (p[0]?.toUpperCase() !== "FAMOSSUL" || p.length < 3) return null;
  const k = p[1].toUpperCase();
  if (k === "E" && p[2]) return { tipo: "ENDERECO", codigo: p.slice(2).join("|").trim() };
  if (k === "P" && p.length >= 4 && p[2] && p[3]) return { tipo: "PECA", pedido: p[2].trim(), peca: p.slice(3).join("|").trim() };
  if (k === "S" && p[2]) return { tipo: "SOBRA", numero: p[2].trim() };
  if (k === "L" && p[2]) return { tipo: "PALLET", codigo: p.slice(2).join("|").trim() };
  if (k === "F" && p[2]) return { tipo: "FICHA", pedido: p.slice(2).join("|").trim() };
  return null;
}

/** QR da ficha do pedido (romaneio online e dados do pedido). Sem nota fiscal: o sistema não a controla. */
export const qrFicha = (pedido: string | number) => `FAMOSSUL|F|${String(pedido).trim()}`;
export const pedidoDaFicha = (texto: string) => { const p = String(texto ?? "").trim().split("|"); return p[0]?.toUpperCase() === "FAMOSSUL" && p[1]?.toUpperCase() === "F" && p[2] ? p.slice(2).join("|").trim() : null; };
