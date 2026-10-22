import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type DadosCertificado = {
  numero: number | string; produto: string; descricao: string; tipo: string; referencia: string; loteEstoque: string; quantidade: number; amostra: number;
  status: string; decisaoPor: string; decisaoEm: string; motivo: string;
  caracteristicas: Array<{ nome: string; unidade: string; tolMin: number; tolMax: number; medicoes: number; minimo: number | null; maximo: number | null; conformes: number }>;
};
const txt = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

export async function gerarCertificadoPdf(d: DadosCertificado): Promise<Uint8Array> {
  if (d.status !== "APROVADO") throw new Error("Certificado só é emitido para lote aprovado.");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const line = (t: string, o: { b?: boolean; s?: number; x?: number } = {}) => { page.drawText(txt(t), { x: o.x ?? 40, y, size: o.s ?? 10, font: o.b ? bold : font, color: rgb(0.1, 0.1, 0.1) }); y -= (o.s ?? 10) + 6; };
  line("CERTIFICADO DE QUALIDADE", { b: true, s: 18 }); y -= 6;
  line(`Lote de inspecao no ${d.numero}  -  ${d.tipo}`, { b: true, s: 11 });
  line(`Produto: ${d.produto} - ${d.descricao}`);
  line(`Referencia: ${d.referencia || "-"}   Lote de estoque: ${d.loteEstoque || "-"}`);
  line(`Quantidade: ${d.quantidade}   Amostra: ${d.amostra}`);
  line(`Decisao: ${d.status}${d.motivo ? ` (${d.motivo})` : ""} por ${d.decisaoPor} em ${d.decisaoEm}`);
  y -= 8; line("Caracteristica            Tolerancia                 Medicoes   Min      Max      Conformes", { b: true });
  for (const c of d.caracteristicas) {
    const f = (n: number | null) => (n == null ? "-" : String(n));
    line(`${c.nome.slice(0, 22).padEnd(24)} ${(`${c.tolMin} a ${c.tolMax} ${c.unidade}`).padEnd(26)} ${String(c.medicoes).padEnd(10)} ${f(c.minimo).padEnd(8)} ${f(c.maximo).padEnd(8)} ${c.conformes}/${c.medicoes}`);
    if (y < 60) break;
  }
  return pdf.save();
}
