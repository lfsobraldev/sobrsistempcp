import QRCode from "qrcode";
import { qrFicha } from "@/lib/qr-fabrica";

/** PNG do QR da ficha do pedido, para embutir nas planilhas. */
export async function qrFichaPng(pedido: string): Promise<Buffer> {
  return QRCode.toBuffer(qrFicha(pedido), { type: "png", margin: 1, width: 240, errorCorrectionLevel: "M" });
}
