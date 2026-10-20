import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles, session } from "@/lib/auth";

const VIEW = ["PCP","GERENTE","ENCARREGADO","COMERCIAL","SAC","LOGISTICA"] as const;
const EDIT = ["PCP","GERENTE","ENCARREGADO","COMERCIAL","SAC"] as const;
const SAC_TEAM = ["PCP","GERENTE","ENCARREGADO","SAC"] as const;
const STATUSES = ["ABERTO","EM_ANALISE","AGUARDANDO_CLIENTE","AGUARDANDO_FABRICA","AGENDADO","CONCLUIDO","CANCELADO"];
const PRIORITIES = ["BAIXA","NORMAL","ALTA","URGENTE"];
const clean = (v: unknown, max=240) => String(v ?? "").trim().slice(0,max);
const json = (v: unknown) => JSON.stringify(v ?? null);
type Db = ReturnType<typeof sql>;
let linksReady: Promise<void> | null = null;
async function ensureCrmLinks(db: Db) {
  if (!linksReady) linksReady = (async () => {
    await db`alter table pcp_sac_atendimentos add column if not exists crm_cliente_id uuid`;
    await db`alter table pcp_sac_atendimentos add column if not exists crm_representante_id uuid`;
    await db`alter table pcp_sac_atendimentos add column if not exists medicao_id uuid`;
    await db`alter table pcp_sac_atendimentos add column if not exists item_referencia varchar(80) not null default ''`;
    await db`create index if not exists ix_pcp_sac_crm_cliente on pcp_sac_atendimentos(crm_cliente_id)`;
    await db`create index if not exists ix_pcp_sac_medicao on pcp_sac_atendimentos(medicao_id)`;
  })().catch((error) => { linksReady = null; throw error; });
  await linksReady;
}

export async function GET(req: Request) {
  try {
    const user = await session();
    if (!user || !(VIEW as readonly string[]).includes(user.perfil)) return NextResponse.json({error:"Sem permissão."},{status:403});
    const url = new URL(req.url), q = clean(url.searchParams.get("q"),120), status = clean(url.searchParams.get("status"),40);
    const db = sql();
    await ensureCrmLinks(db);
    const id = clean(url.searchParams.get("id"),80);
    if (id) {
      const [item] = await db`select * from pcp_sac_atendimentos where id=${id}`;
      if (!item) return NextResponse.json({error:"Atendimento não encontrado."},{status:404});
      const eventos = await db`select id,usuario,tipo,descricao,antes,depois,criado_em from pcp_sac_eventos where atendimento_id=${id} order by criado_em desc limit 200`;
      return NextResponse.json({item,eventos},{headers:{"Cache-Control":"no-store"}});
    }
    const itens = await db`
      select a.*, (select count(*)::int from pcp_sac_eventos e where e.atendimento_id=a.id) as eventos_count
      from pcp_sac_atendimentos a
      where (${q} = '' or a.cliente ilike ${'%' + q + '%'} or a.pedido ilike ${'%' + q + '%'} or a.assunto ilike ${'%' + q + '%'} or a.protocolo::text ilike ${'%' + q + '%'})
        and (${status} = '' or a.status = ${status})
      order by case when a.prazo < current_date and a.status not in ('CONCLUIDO','CANCELADO') then 0 else 1 end,
        a.prazo asc nulls last, a.atualizado_em desc limit 500
    `;
    return NextResponse.json({itens},{headers:{"Cache-Control":"no-store"}});
  } catch (e) { return NextResponse.json({error:e instanceof Error ? e.message : "Falha ao consultar SAC."},{status:500}); }
}

export async function POST(req: Request) {
  try {
    const user = await requireRoles([...EDIT]), b = await req.json();
    if (String(b.action||"").toUpperCase()==="COMENTARIO") {
      const id=clean(b.id,80), descricao=clean(b.comentario,4000);
      if(!id||!descricao)return NextResponse.json({error:"Informe atendimento e comentário."},{status:400});
      const db=sql(), [item]=await db`select id from pcp_sac_atendimentos where id=${id}`;
      if(!item)return NextResponse.json({error:"Atendimento não encontrado."},{status:404});
      await db`insert into pcp_sac_eventos(atendimento_id,usuario,tipo,descricao) values(${id},${user.usuario},'COMENTARIO',${descricao})`;
      return NextResponse.json({ok:true},{status:201});
    }
    const crmClienteId=clean(b.crm_cliente_id,80), assunto=clean(b.assunto), descricao=clean(b.descricao,5000), solicitante=clean(b.solicitante,160);
    if (!crmClienteId || !assunto || !descricao || !solicitante) return NextResponse.json({error:"Selecione o cliente central e preencha assunto, descrição e solicitante."},{status:400});
    const prioridade=PRIORITIES.includes(String(b.prioridade)) ? String(b.prioridade) : "NORMAL";
    const tipo=clean(b.tipo,60) || "DUVIDA", prazo=clean(b.prazo,10);
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return NextResponse.json({error:"Prazo inválido."},{status:400});
    const db=sql(); await ensureCrmLinks(db);
    const [cliente]=await db`select id,razao_social,nome_fantasia from crm_clientes where id=${crmClienteId} and ativo=true`;
    if(!cliente)return NextResponse.json({error:"Cliente central não encontrado ou inativo."},{status:404});
    const crmRepresentanteId=clean(b.crm_representante_id,80)||null, medicaoId=clean(b.medicao_id,80)||null;
    if(crmRepresentanteId&&!(await db`select id from crm_cliente_representantes where cliente_id=${crmClienteId} and representante_id=${crmRepresentanteId} and ativo=true`).length)
      return NextResponse.json({error:"O representante não está vinculado ao cliente."},{status:400});
    const pedido=clean(b.pedido,80), itemReferencia=clean(b.item_referencia,80);
    if(pedido){
      const [pedidoLigado]=await db`select crm_cliente_id from pcp_controle_entregas where pedido=${pedido}`;
      if(!pedidoLigado||pedidoLigado.crm_cliente_id!==crmClienteId)return NextResponse.json({error:"Vincule primeiro o pedido ao cliente central no CRM."},{status:409});
    }
    if(medicaoId){
      const [med]=await db`select id,pedido,crm_cliente_id from pcp_medicao_revisoes where id=${medicaoId}`;
      if(!med||med.crm_cliente_id!==crmClienteId||(pedido&&med.pedido!==pedido))return NextResponse.json({error:"A revisão de medição não corresponde ao cliente e pedido selecionados."},{status:400});
    }
    const [item] = await db`
      insert into pcp_sac_atendimentos(cliente,crm_cliente_id,crm_representante_id,medicao_id,item_referencia,pedido,of_referencia,tipo,assunto,descricao,solicitante,responsavel,prioridade,prazo,medicao,observacoes,criado_por,atualizado_por)
      values(${cliente.nome_fantasia||cliente.razao_social},${crmClienteId},${crmRepresentanteId},${medicaoId},${itemReferencia},${pedido},${clean(b.of,80)},${tipo},${assunto},${descricao},${solicitante},${clean(b.responsavel,160)},${prioridade},${prazo || null},${clean(b.medicao,3000)},${clean(b.observacoes,5000)},${user.usuario},${user.usuario}) returning *
    `;
    await db`insert into pcp_sac_eventos(atendimento_id,usuario,tipo,descricao,depois) values(${item.id},${user.usuario},'CRIADO','Solicitação registrada',${json(item)}::jsonb)`;
    return NextResponse.json({item},{status:201});
  } catch (e) { const forbidden=e instanceof Error && e.message==="SEM_PERMISSAO"; return NextResponse.json({error:forbidden?"Sem permissão.":e instanceof Error?e.message:"Falha ao criar atendimento."},{status:forbidden?403:500}); }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRoles([...SAC_TEAM]), b=await req.json(), id=clean(b.id,80), db=sql(); await ensureCrmLinks(db);
    if (!id) return NextResponse.json({error:"Atendimento não informado."},{status:400});
    const [old]=await db`select * from pcp_sac_atendimentos where id=${id}`;
    if (!old) return NextResponse.json({error:"Atendimento não encontrado."},{status:404});
    const status=clean(b.status,30) || old.status, prioridade=clean(b.prioridade,20) || old.prioridade;
    if (!STATUSES.includes(status)) return NextResponse.json({error:"Status inválido."},{status:400});
    if (!PRIORITIES.includes(prioridade)) return NextResponse.json({error:"Prioridade inválida."},{status:400});
    const prazo = b.prazo===undefined ? old.prazo : (clean(b.prazo,10)||null);
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(String(prazo).slice(0,10))) return NextResponse.json({error:"Prazo inválido."},{status:400});
    const [updated] = await db`
      update pcp_sac_atendimentos set status=${status}, prioridade=${prioridade},
      responsavel=${b.responsavel===undefined?old.responsavel:clean(b.responsavel,160)},
      item_referencia=${b.item_referencia===undefined?old.item_referencia:clean(b.item_referencia,80)},
      medicao_id=${b.medicao_id===undefined?old.medicao_id:(clean(b.medicao_id,80)||null)},
      prazo=${prazo}, medicao=${b.medicao===undefined?old.medicao:clean(b.medicao,3000)},
      observacoes=${b.observacoes===undefined?old.observacoes:clean(b.observacoes,5000)},
      atualizado_por=${user.usuario}, atualizado_em=now(),
      concluido_em=case when ${status}='CONCLUIDO' then coalesce(concluido_em,now()) else null end
      where id=${id} returning *
    `;
    await db`insert into pcp_sac_eventos(atendimento_id,usuario,tipo,descricao,antes,depois) values(${id},${user.usuario},'ATUALIZADO',${'Status: '+old.status+' -> '+status},${json(old)}::jsonb,${json(updated)}::jsonb)`;
    return NextResponse.json({item:updated});
  } catch (e) { const forbidden=e instanceof Error && e.message==="SEM_PERMISSAO"; return NextResponse.json({error:forbidden?"Sem permissão.":e instanceof Error?e.message:"Falha ao atualizar atendimento."},{status:forbidden?403:500}); }
}
