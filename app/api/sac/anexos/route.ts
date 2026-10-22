import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles, session } from "@/lib/auth";
import { sql } from "@/lib/db";
import { tipoPorAssinatura } from "@/lib/sac-anexos";

export const runtime = "nodejs";
const VIEW = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL", "SAC", "LOGISTICA"] as const;
const EDIT = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL", "SAC"] as const;
const MAX = 3 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const H = { "Cache-Control": "no-store" };

async function unidadeGET(req: Request) {
  try {
    const user = await session();
    if (!user || !(VIEW as readonly string[]).includes(user.perfil)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const u = new URL(req.url);
    const arq = u.searchParams.get("arquivo") || "";
    if (arq) {
      if (!isUuid(arq)) return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
      const [a] = await q("select nome,mime,conteudo from sac_anexos where id=$1", [arq]);
      if (!a) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
      const buf = Buffer.isBuffer(a.conteudo) ? a.conteudo : Buffer.from(String(a.conteudo).replace(/^\\x/, ""), "hex");
      return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": a.mime, "Content-Disposition": `inline; filename="${String(a.nome).replace(/[^\w.\-]+/g, "_")}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store" } });
    }
    const id = u.searchParams.get("id") || "";
    if (!isUuid(id)) return NextResponse.json({ error: "Atendimento inválido." }, { status: 400 });
    const anexos = await q("select id,nome,mime,tamanho,criado_por,criado_em from sac_anexos where atendimento_id=$1 order by criado_em", [id]);
    return NextResponse.json({ anexos }, { headers: H });
  } catch (e) { return NextResponse.json({ error: e instanceof Error && /does not exist/.test(e.message) ? "Módulo aguardando migração" : "Falha ao consultar anexos." }, { status: 500 }); }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...EDIT]);
    const f = await req.formData();
    const id = String(f.get("atendimentoId") || "");
    const file = f.get("arquivo");
    if (!isUuid(id)) throw new Error("Atendimento inválido.");
    if (!(file instanceof File) || !file.size) throw new Error("Selecione o arquivo.");
    if (file.size > MAX) throw new Error("Arquivo acima de 3 MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = tipoPorAssinatura(buf);
    if (!mime || !MIMES.has(mime)) throw new Error("Envie foto (JPG, PNG, WebP) ou PDF.");
    const [a] = await q("select 1 ok from pcp_sac_atendimentos where id=$1", [id]);
    if (!a) throw new Error("Atendimento não encontrado.");
    const nome = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 160) || "anexo";
    const [r] = await q("insert into sac_anexos(atendimento_id,nome,mime,tamanho,conteudo,criado_por) values($1,$2,$3,$4,$5::bytea,$6) returning id", [id, nome, mime, buf.length, "\\x" + buf.toString("hex"), user.usuario]);
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) { const m = e instanceof Error ? e.message : ""; return NextResponse.json({ error: m === "SEM_PERMISSAO" ? "Sem permissão." : m || "Falha ao anexar." }, { status: m === "SEM_PERMISSAO" ? 403 : 400 }); }
}
async function unidadeDELETE(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE"]);
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!isUuid(id)) throw new Error("Anexo inválido.");
    await q("delete from sac_anexos where id=$1", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) { const m = e instanceof Error ? e.message : ""; return NextResponse.json({ error: m === "SEM_PERMISSAO" ? "Sem permissão." : m || "Falha." }, { status: m === "SEM_PERMISSAO" ? 403 : 400 }); }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
export const DELETE = unidadeHandler(unidadeDELETE);
