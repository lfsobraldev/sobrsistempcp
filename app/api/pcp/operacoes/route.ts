import {enriquecerClientes} from '@/lib/clientes-operacionais';
import {podeOperarProcesso} from '@/lib/apontamento';
import {lerFiltrosPCP,recortePCP,OPCOES_PCP_SQL,opcoesPCP} from "@/lib/pcp-filters";
import {ZodError} from "zod";
import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirApontamentos } from "@/lib/pcp-schema";

export const runtime = "nodejs";
const LIMITE = 50;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function unidadeGET(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER", "APONTADOR"]);
    const url = new URL(req.url);
    const db = sql();
    await garantirApontamentos(db);
    const restrito = ["LIDER", "APONTADOR"].includes(s.perfil) && true;

    const hist = url.searchParams.get("historico");
    if (hist) {
      if (!/^[0-9a-f-]{36}$/i.test(hist)) return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
      const [op] = await db`select processo from pcp_operacoes where id=${hist}`;
      if (!op) return NextResponse.json({ error: "Operação não encontrada." }, { status: 404 });
      if (!podeOperarProcesso(s.perfil,s.processos,op.processo)) return NextResponse.json({ error: "Sem permissão para este setor." }, { status: 403 });
      const [lancamentos, eventos] = await Promise.all([
        db`select tipo,quantidade,usuario,data_producao::text data_producao,criado_em from pcp_apontamentos where operacao_id=${hist} order by criado_em desc limit 100`,
        db`select tipo,descricao,usuario,criado_em from pcp_eventos where operacao_id=${hist} order by criado_em desc limit 50`,
      ]);
      return NextResponse.json({ lancamentos: lancamentos.map((l: any) => ({ ...l, quantidade: num(l.quantidade) })), eventos }, { headers: { "Cache-Control": "no-store" } });
    }

    const filtros=lerFiltrosPCP(url.searchParams),recorte=recortePCP(filtros);
    const page=Number(url.searchParams.get('page')||1);
    if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});
    const ids=await db.query(`select p.id from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where ${recorte.sql}`,recorte.values);
    const produtosIds=ids.map(p=>String(p.id));
    const opcoes=await opcoesPCP(db,filtros.mes);
    const processo = (url.searchParams.get("processo") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const q = "%" + (url.searchParams.get("q") || "").trim().replace(/[%_\\]/g, "") + "%";
    const permitidos = restrito ? (s.processos as string[]) : null;
    const rows = await db`
      select *,count(*) over()::int total_filtrado from (
        select o.id,p.id produto_id,p.pedido,p.of,p.produto,p.descricao,p.cor,p.quantidade::float quantidade_produto,o.processo,o.sequencia,o.status,
          o.quantidade_planejada::float planejada,o.quantidade_produzida::float produzida,o.quantidade_refugo::float refugo,o.percentual::float percentual,
          lag(o.processo) over(partition by o.produto_id order by o.sequencia) anterior_processo,
          lag(o.status) over(partition by o.produto_id order by o.sequencia) anterior_status,
          o.atualizado_em
        from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where p.id=any(${produtosIds}::uuid[])
      ) x
      where (${processo}='' or x.processo=${processo}) and (${status}='' or x.status=${status})
        and (${q}='%%' or x.pedido ilike ${q} or x.of ilike ${q} or x.produto ilike ${q} or x.descricao ilike ${q})
        and (${permitidos}::text[] is null or x.processo=any(${permitidos}::text[]))
      order by case x.status when 'EM_ANDAMENTO' then 0 when 'LIBERADA' then 1 when 'DIVERGENCIA' then 2 when 'PENDENTE' then 3 else 4 end, x.pedido, x.of, x.sequencia
      limit ${LIMITE + 1} offset ${(page-1)*LIMITE}`;
    const truncado = rows.length > LIMITE;
    return NextResponse.json({
      programacaoId: filtros.programacaoId||"", filtro: filtros.filtros.join(", ")||"Todos no período", opcoes,page,truncado,total:Number(rows[0]?.total_filtrado||0),
      operacoes: await enriquecerClientes(db,rows.slice(0, LIMITE)), restritoAosSeusSetores: restrito,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if(/relation .* does not exist|column .* does not exist/.test(String(e?.message)))return NextResponse.json({error:'Módulo aguardando migração',codigo:'MIGRACAO_PENDENTE'},{status:503,headers:{'Cache-Control':'no-store'}});
    if(e instanceof ZodError)return NextResponse.json({error:"Filtros inválidos."},{status:400});
    const forb = e?.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forb ? "Sem permissão." : e?.message || "Falha ao consultar operações." }, { status: forb ? 403 : 500 });
  }
}

export const GET = unidadeHandler(unidadeGET);
