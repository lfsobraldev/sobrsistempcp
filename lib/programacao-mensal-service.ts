import { z } from "zod";
import { unidadeAtual } from "./unidades/context";
import { multiAtiva } from "./unidades/core";
import { sql } from "./db";
import { requireRoles } from "./auth";
import { querySchema } from "./programacao-mensal";

export async function acessoMensal(escrita = false) {
  const sessao = await requireRoles(escrita ? ["PCP"] : ["PCP","GERENTE","ENCARREGADO"]);
  const db = sql();
  const unidade = unidadeAtual();
  // Somente contas de administração configuradas no servidor têm escopo global.
  const admin = sessao.perfil === "PCP" && [process.env.PCP_USER,process.env.ADMIN_USER].filter(Boolean).includes(sessao.usuario);
  const filiais = await db`
    select distinct f.id,f.codigo,f.nome,f.empresa_id,coalesce(nullif(e.nome_fantasia,''),e.razao_social) as empresa_nome from pcp_filiais f
    join pcp_empresas e on e.id=f.empresa_id and e.ativo
    where f.ativo and f.codigo in ('SUL','NORDESTE') and (${!multiAtiva()} or f.codigo=${unidade}) and (
      ${admin || (multiAtiva() && !!unidade)} or exists(select 1 from pcp_programacao_acessos a where a.usuario=${sessao.usuario} and a.filial_id=f.id)
      or exists(select 1 from pcp_usuario_empresas ue join pcp_usuarios u on u.id=ue.usuario_id and u.ativo
        where u.usuario=${sessao.usuario} and ue.ativo and ue.empresa_id=f.empresa_id
        and (ue.escopo_filiais='TODAS' or exists(select 1 from pcp_usuario_filiais uf where uf.usuario_empresa_id=ue.id and uf.filial_id=f.id)))
    ) order by f.codigo`;
  return {sessao,db,filiais:z.array(z.object({id:z.string().uuid(),codigo:z.enum(["SUL","NORDESTE"]),nome:z.string(),empresa_id:z.string().uuid(),empresa_nome:z.string()})).parse(filiais)};
}
export function selecionarFiliais(filiais: {id: unknown; codigo: unknown}[], unidade: string) {
  const alvo = unidade === "CONSOLIDADO" ? ["SUL","NORDESTE"] : [unidade];
  if (alvo.some(u=>!filiais.some(f=>f.codigo===u))) throw new Error("SEM_PERMISSAO");
  return filiais.filter(f=>alvo.includes(String(f.codigo))).map(f=>String(f.id));
}
export async function consultarMensal(req: Request) {
  const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const {sessao,db,filiais} = await acessoMensal();
  const ids = selecionarFiliais(filiais,q.unidade);
  const estadosHabilitados=process.env.ERP_PROGRAMACAO_STATUS==='enabled';
  if(estadosHabilitados){const [schema]=await db`select to_regclass('public.pcp_programacao_competencias') tabela`;if(!schema?.tabela)throw new Error('MIGRACAO_COMPETENCIAS_PENDENTE');}
  const statusJoin=estadosHabilitados?'left join pcp_programacao_competencias c on c.filial_id=b.filial_id and c.competencia=b.competencia':'';
  const statusWhere=estadosHabilitados?" and ($6='TODOS' or coalesce(c.status,'PLANEJADO')=$6)":" and ($6::text is not null)";
  const filtros = q.filtros.split("|").filter(Boolean);
  // Colunas e direção interpoladas somente a partir de enums fechados acima.
  const columns = {filtro:"b.filtro",quantidade:"b.quantidade",data:"b.data",pedido:"b.pedido"};
  const base = `from pcp_programacao_mensal_efetiva b join pcp_filiais f on f.id=b.filial_id ${statusJoin}
    where b.filial_id=any($1::uuid[]) and ($2='' or to_char(b.competencia,'YYYY-MM')=$2)
    and ($3='' or b.filtro ilike '%'||$3||'%' or b.descricao ilike '%'||$3||'%' or b.produto ilike '%'||$3||'%')
    and (cardinality($4::text[])=0 or b.filtro=any($4::text[]))
    and (cardinality($5::text[])=0 or b.pedido=any($5::text[])) ${statusWhere}`;
  const args = [ids,q.mes,q.busca,filtros,q.pedidos.split("|").filter(Boolean),q.estado];
  const limit = q.formato ? 10001 : 50;
  const [rows,resumo,mensal,opcoes,lotes,competencias,opcoesPedidos] = await Promise.all([
    db.query(`select b.*,f.codigo as unidade ${base} order by ${columns[q.sort]} ${q.dir},b.id limit $7 offset $8`,[...args,limit,q.formato?0:(q.page-1)*50]),
    db.query(`select count(*)::int as itens,coalesce(sum(b.quantidade),0) as quantidade,
      count(*) filter(where b.data<current_date)::int as vencidos,
      coalesce(sum(b.quantidade) filter(where f.codigo='SUL'),0) as sul,
      coalesce(sum(b.quantidade) filter(where f.codigo='NORDESTE'),0) as nordeste ${base}`,args),
    db.query(`select to_char(b.competencia,'YYYY-MM') as mes,f.codigo as unidade,sum(b.quantidade) as quantidade ${base} group by 1,2 order by 1,2`,args),
    db`select distinct b.filtro from pcp_programacao_mensal_efetiva b where b.filial_id=any(${ids}::uuid[]) order by b.filtro limit 2000`,
    db`select l.*,f.codigo as unidade from pcp_programacao_lotes l join pcp_filiais f on f.id=l.filial_id where l.filial_id=any(${ids}::uuid[]) and (${q.mes}='' or to_char(l.competencia,'YYYY-MM')=${q.mes}) order by l.criado_em desc limit 50`,
    estadosHabilitados?db`select c.*,f.codigo unidade from pcp_programacao_competencias c join pcp_filiais f on f.id=c.filial_id where c.filial_id=any(${ids}::uuid[]) order by c.competencia desc limit 120`:[],
    db`select distinct pedido from pcp_programacao_mensal_efetiva where filial_id=any(${ids}::uuid[]) order by pedido limit 500`,
  ]);
  return {q,rows,competencias,opcoesPedidos,estadosHabilitados,resumo:resumo[0],mensal,opcoes,lotes,pagina:q.page,porPagina:50,podeImportar:sessao.perfil==='PCP',sessao,db};
}
