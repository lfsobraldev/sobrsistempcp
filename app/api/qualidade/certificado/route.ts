import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { gerarCertificadoPdf } from "@/lib/certificado-qualidade";

export const runtime = "nodejs";
type Row = Record<string, any>;

async function unidadeGET(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE", "COMERCIAL", "LOGISTICA"]);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
    const db = sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> };
    const [l] = await db.query(`select l.*,p.codigo,p.descricao,el.codigo lote_codigo from qld_lotes_inspecao l join est_produtos p on p.id=l.produto_id left join est_lotes el on el.id=l.lote_estoque_id where l.id=$1`, [id]);
    if (!l) return NextResponse.json({ error: "Lote de inspeção não encontrado." }, { status: 404 });
    const car = await db.query(`select c.*,(select count(*)::int from qld_medicoes m where m.lote_inspecao_id=$1 and m.linha=c.linha) n,(select min(valor) from qld_medicoes m where m.lote_inspecao_id=$1 and m.linha=c.linha) mn,(select max(valor) from qld_medicoes m where m.lote_inspecao_id=$1 and m.linha=c.linha) mx,(select count(*)::int from qld_medicoes m where m.lote_inspecao_id=$1 and m.linha=c.linha and m.conforme) ok from qld_plano_caracteristicas c where c.plano_id=$2 order by c.linha`, [id, l.plano_id]);
    const pdf = await gerarCertificadoPdf({
      numero: l.numero, produto: l.codigo, descricao: l.descricao, tipo: l.tipo, referencia: l.referencia, loteEstoque: l.lote_codigo ?? "", quantidade: Number(l.quantidade), amostra: l.amostra,
      status: l.status, decisaoPor: l.decisao_por ?? "", decisaoEm: l.decisao_em ? new Date(l.decisao_em).toLocaleString("pt-BR") : "", motivo: l.decisao_motivo,
      caracteristicas: car.map((c) => ({ nome: c.nome, unidade: c.unidade, tolMin: Number(c.tol_min), tolMax: Number(c.tol_max), medicoes: c.n, minimo: c.mn == null ? null : Number(c.mn), maximo: c.mx == null ? null : Number(c.mx), conformes: c.ok })),
    });
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="certificado-${l.numero}.pdf"`, "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: m === "SEM_PERMISSAO" ? "Sem permissão." : m || "Falha ao gerar certificado." }, { status: m === "SEM_PERMISSAO" ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
