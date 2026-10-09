declare module "pdf-parse" {
  type PdfParseOptions = Record<string, unknown>;
  type PdfParseResult = { text: string; [key: string]: unknown };
  export default function pdf(data: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>;
}
