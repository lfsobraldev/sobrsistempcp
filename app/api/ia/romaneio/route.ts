import { NextResponse } from "next/server";
import pdf from "pdf-parse";
import * as XLSX from "xlsx";
import { requireRoles } from "@/lib/auth";
import { agruparPorCarga, extrairRomaneio, validarRomaneio } from "@/lib/ia/romaneio";
import { historicoContexto } from "@/lib/ia/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

async function textoDoArquivo(f: File): Promise<string> {
  const name = f.name.toLowerCase();
  const buf = Buffer.from(await f.arrayBuffer());
  if (name.endsWith(".pdf")) return (await pdf(buf)).text;
  if (/\.(xlsx|xlsm|xls|csv|tsv)$/.test(name)) {
    const wb = XLSX.read(buf, { type: "buffer" });
    return wb.SheetNames.map((n) => `# Planilha: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`).join("\n\n");
  }
  if (/\.(txt|md)$/.test(name)) return buf.toString("utf8");
  throw new Error("Formato não suportado. Envie PDF, Excel, CSV ou TXT.");
}

export async function POST(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);
    const fd = await req.formData();
    const partes: string[] = [];
    const texto = String(fd.get("texto") || "").trim();
    if (texto) partes.push(texto);
    const arq = fd.get("arquivo");
    if (arq instanceof File && arq.size) {
      if (arq.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo acima de 8 MB." }, { status: 400 });
      partes.push(await textoDoArquivo(arq));
    }
    const origem = partes.join("\n\n").trim();
    if (!origem) return NextResponse.json({ error: "Envie um arquivo ou cole o texto do pedido." }, { status: 400 });

    const dados = await extrairRomaneio(origem, await historicoContexto());
    const alertas = validarRomaneio(dados);
    const resumo = agruparPorCarga(dados, Number(fd.get("maxVolumes")) || 0);
    return NextResponse.json({ romaneio: dados, alertas, resumo });
  } catch (e: any) {
    const msg = e?.message === "SEM_PERMISSAO" ? "Sem permissão." : e?.message === "IA_NAO_CONFIGURADA" ? "Vercel AI Gateway não configurado para este ambiente." : e?.message || "Falha ao processar.";
    const st = e?.message === "SEM_PERMISSAO" ? 403 : e?.message === "IA_NAO_CONFIGURADA" ? 503 : 500;
    return NextResponse.json({ error: msg }, { status: st });
  }
}
