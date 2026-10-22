import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { session } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);

/** Instruções aprovadas da operação (setor/produto) para a tela do operador; qualquer usuário autenticado lê. */
async function unidadeGET(req: Request) {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const id = new URL(req.url).searchParams.get("operacaoId") ?? "";
    if (!isUuid(id)) return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    const docs = await q(`select d.*,(select true from doc_leituras l where l.versao_id=d.versao_id and l.usuario=$2) lido from doc_da_operacao($1::uuid) d`, [id, s.usuario]);
    const [op] = await q(`select roteiro_snapshot->>'instrucao' instrucao,roteiro_snapshot->>'revisaoInstrucao' revisao from pcp_operacoes where id=$1`, [id]);
    return NextResponse.json({ documentos: docs, instrucaoRoteiro: op?.instrucao ? { texto: op.instrucao, revisao: op.revisao ?? "" } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: /does not exist/.test(m) ? "Módulo aguardando migração" : "Falha ao consultar instruções." }, { status: /does not exist/.test(m) ? 503 : 500 });
  }
}
/** Ciente do operador na versão vigente. */
async function unidadePOST(req: Request) {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const b = await req.json();
    const versaoId = String(b.versaoId ?? "");
    if (!isUuid(versaoId)) return NextResponse.json({ error: "Versão inválida." }, { status: 400 });
    await q(`insert into doc_leituras(versao_id,usuario) select id,$2 from doc_versoes where id=$1 and status='APROVADA' on conflict do nothing`, [versaoId, s.usuario]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Falha ao registrar ciência." }, { status: 500 }); }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
