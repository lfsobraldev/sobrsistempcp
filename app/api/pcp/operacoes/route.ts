import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirApontamentos } from "@/lib/pcp-schema";

export const runtime = "nodejs";
const LIMITE = 500;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function unidadeGET(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER", "APONTADOR"]);
    const url = new URL(req.url);
    const db = sql();
    await garantirApontamentos(db);
    const restrito = ["LIDER", "APONTADOR"].includes(s.perfil) && s.processos?.length > 0;

    const hist = url.searchParams.get("historico");
    if (hist) {
      if (!/^[0-9a-f-]{36}$/i.test(hist)) return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
      const [op] = await db`select processo from pcp_operacoes where id=${hist}`;
      if (!op) return NextResponse.json({ error: "Operação não encontrada." }, { status: 404 });
      if (restrito && !s.processos.includes(op.processo)) return NextResponse.json({ error: "Sem permissão para este setor." }, { status: 403 });
      const [lancamentos, eventos] = await Promise.all([
        db`select tipo,quantidade,usuario,data_producao::text data_producao,criado_em from pcp_apontamentos where operacao_id=${hist} order by criado_em desc limit 100`,
        db`select tipo,descricao,usuario,criado_em from pcp_eventos where operacao_id=${hist} order by criado_em desc limit 50`,
      ]);
      return NextResponse.json({ lancamentos: lancamentos.map((l: any) => ({ ...l, quantidade: num(l.quantidade) })), eventos }, { headers: { "Cache-Control": "no-store" } });
    }

    const progId = url.searchParams.get("programacaoId")?.trim() || "";
    const [prog] = progId
      ? await db`select id,filtro from pcp_programacoes where id=${progId} limit 1`
      : await db`select id,filtro from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
    if (!prog) return NextResponse.json({ programacaoId: "", filtro: "", operacoes: [], total: 0, truncado: false });

    const processo = (url.searchParams.get("processo") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const q = "%" + (url.searchParams.get("q") || "").trim().replace(/[%_\\]/g, "") + "%";
    const permitidos = restrito ? (s.processos as string[]) : null;
    const rows = await db`
      select * from (
        select o.id,p.pedido,p.of,p.produto,p.descricao,p.cor,p.quantidade::float quantidade_produto,o.processo,o.sequencia,o.status,
          o.quantidade_planejada::float planejada,o.quantidade_produzida::float produzida,o.quantidade_refugo::float refugo,o.percentual::float percentual,
          lag(o.processo) over(partition by o.produto_id order by o.sequencia) anterior_processo,
          lag(o.status) over(partition by o.produto_id order by o.sequencia) anterior_status,
          o.atualizado_em
        from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where p.programacao_id=${prog.id}
      ) x
      where (${processo}='' or x.processo=${processo}) and (${status}='' or x.status=${status})
        and (${q}='%%' or x.pedido ilike ${q} or x.of ilike ${q} or x.produto ilike ${q} or x.descricao ilike ${q})
        and (${permitidos}::text[] is null or x.processo=any(${permitidos}::text[]))
      order by case x.status when 'EM_ANDAMENTO' then 0 when 'LIBERADA' then 1 when 'DIVERGENCIA' then 2 when 'PENDENTE' then 3 else 4 end, x.pedido, x.of, x.sequencia
      limit ${LIMITE + 1}`;
    const truncado = rows.length > LIMITE;
    return NextResponse.json({
      programacaoId: String(prog.id), filtro: String(prog.filtro || ""), truncado, total: Math.min(rows.length, LIMITE),
      operacoes: rows.slice(0, LIMITE), restritoAosSeusSetores: restrito,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    const forb = e?.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forb ? "Sem permissão." : e?.message || "Falha ao consultar operações." }, { status: forb ? 403 : 500 });
  }
}

export const GET = unidadeHandler(unidadeGET);
