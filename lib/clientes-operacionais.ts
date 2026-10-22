/** Resolução única de identidades. Não deduz cliente por semelhança de nome. */
type Banco={query:(sql:string,args?:unknown[])=>Promise<Record<string,unknown>[]>};
export const pedidoSQL=(campo:string)=>`case when trim(${campo}) ~ '^[0-9]+$' then coalesce(nullif(ltrim(trim(${campo}),'0'),''),'0') else upper(trim(${campo})) end`;
export function consultaIdentidades(crm=true,controle=true){
 const controleJoin=controle?`left join lateral(select to_jsonb(c) dados from pcp_controle_entregas c where c.pedido=p.pedido or (${pedidoSQL('c.pedido')}=${pedidoSQL('p.pedido')} and not exists(select 1 from pcp_controle_entregas ex where ex.pedido=p.pedido) and (select count(*) from pcp_controle_entregas cnt where ${pedidoSQL('cnt.pedido')}=${pedidoSQL('p.pedido')})=1) order by (c.pedido=p.pedido) desc limit 1) ctl on true`:`left join lateral(select '{}'::jsonb dados) ctl on true`;
 const clienteJoin=crm?`left join crm_clientes vinculo on vinculo.id=coalesce(nullif(to_jsonb(p)->>'crm_cliente_id','')::uuid,nullif(ctl.dados->>'crm_cliente_id','')::uuid)
 left join lateral(select x.* from (select c.*,count(*) over() n from crm_clientes c where nullif(to_jsonb(c)->>'codigo','')=coalesce(nullif(ctl.dados->>'cliente',''),nullif(g.cliente,'')) or (nullif(c.documento,'') is not null and regexp_replace(c.documento,'[^[:alnum:]]','','g')=regexp_replace(coalesce(nullif(ctl.dados->>'cliente',''),g.cliente),'[^[:alnum:]]','','g'))) x where x.n=1) por_codigo on vinculo.id is null
 left join crm_representantes rep on rep.id=nullif(ctl.dados->>'crm_representante_id','')::uuid`:'';
 return `select p.id produto_id,p.programacao_id,p.pedido,
 ${crm?"coalesce(vinculo.id,por_codigo.id)":"null::uuid"} cliente_id,
 ${crm?"coalesce(nullif(to_jsonb(vinculo)->>'codigo',''),nullif(to_jsonb(por_codigo)->>'codigo',''),'')":"''::text"} cliente_codigo,
 coalesce(${crm?"nullif(vinculo.nome_fantasia,''),nullif(vinculo.razao_social,''),nullif(por_codigo.nome_fantasia,''),nullif(por_codigo.razao_social,''),":""}nullif(ctl.dados->>'cliente',''),nullif(g.cliente,''),'Cliente não informado') cliente_nome,
 ${crm?"rep.id":"null::uuid"} representante_id,${crm?"coalesce(to_jsonb(rep)->>'codigo','')":"''::text"} representante_codigo,
 coalesce(${crm?"nullif(rep.nome,''),":""}nullif(ctl.dados->>'representante',''),'Representante não informado') representante_nome
 from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id ${controleJoin} ${clienteJoin}`;
}
export type IdentidadeCliente={produto_id:string;programacao_id:string;pedido:string;cliente_id:string|null;cliente_codigo:string;cliente_nome:string;representante_id:string|null;representante_codigo:string;representante_nome:string};
export async function consultarIdentidades(db:Banco,ids:string[]|null,pedidos:string[]|null=null){
 if(ids?.length===0&&(!pedidos||!pedidos.length))return [] as IdentidadeCliente[];
 const [schema]=await db.query("select to_regclass('pcp_clientes_operacionais') is not null visao,to_regclass('pcp_controle_entregas') is not null controle,to_regclass('crm_clientes') is not null and to_regclass('crm_representantes') is not null crm");
 const base=schema.visao?'select * from pcp_clientes_operacionais':consultaIdentidades(Boolean(schema.crm),Boolean(schema.controle));
 return await db.query(`select * from (${base}) i where ($1::uuid[] is null or produto_id=any($1::uuid[])) and ($2::text[] is null or ${pedidoSQL('i.pedido')}=any($2::text[]))`,[ids,pedidos?.map(p=>/^\d+$/.test(p.trim())?p.trim().replace(/^0+(?=\d)/,''):p.trim().toUpperCase())||null]) as IdentidadeCliente[];
}
export function aplicarIdentidade<T extends Record<string,unknown>>(row:T,i?:IdentidadeCliente){return {...row,cliente:i?.cliente_nome||String(row.cliente||'').trim()||'Cliente não informado',clienteNome:i?.cliente_nome||String(row.cliente||'').trim()||'Cliente não informado',clienteCodigo:i?.cliente_codigo||String(row.clienteCodigo||''),clienteId:i?.cliente_id||null,representante:i?.representante_nome||String(row.representante||'').trim()||'Representante não informado',representanteNome:i?.representante_nome||String(row.representante||'').trim()||'Representante não informado',representanteCodigo:i?.representante_codigo||'',representanteId:i?.representante_id||null};}
export async function enriquecerClientes<T extends Record<string,unknown>>(db:Banco,rows:T[],campo='produto_id'){
 if(!rows.length)return rows.map(r=>aplicarIdentidade(r));
 const ids=rows.map(r=>String(r[campo]||r.produtoId||'')).filter(v=>/^[0-9a-f-]{36}$/i.test(v));
 const identidades=await consultarIdentidades(db,ids.length?ids:null,ids.length?null:rows.map(r=>String(r.pedido||'')));
 return rows.map(r=>{const id=String(r[campo]||r.produtoId||'');const candidatos=identidades.filter(i=>id?i.produto_id===id:pedidoNormalizado(i.pedido)===pedidoNormalizado(String(r.pedido||'')));const unicos=new Set(candidatos.map(i=>JSON.stringify([i.cliente_id,i.cliente_nome,i.representante_id,i.representante_nome])));return aplicarIdentidade(r,unicos.size===1?candidatos[0]:undefined);});
}
function pedidoNormalizado(v:string){return /^\d+$/.test(v.trim())?v.trim().replace(/^0+(?=\d)/,''):v.trim().toUpperCase();}
