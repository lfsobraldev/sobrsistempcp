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

export async function GET(req: Request) {
  try {
    const user = await session();
    if (!user || !(VIEW as readonly string[]).includes(user.perfil)) return NextResponse.json({error:"Sem permissão."},{status:403});
    const url = new URL(req.url), q = clean(url.searchParams.get("q"),120), status = clean(url.searchParams.get("status"),40);
    const db = sql();
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
    const cliente=clean(b.cliente), assunto=clean(b.assunto), descricao=clean(b.descricao,5000), solicitante=clean(b.solicitante,160);
    if (!cliente || !assunto || !descricao || !solicitante) return NextResponse.json({error:"Preencha cliente, assunto, descrição e solicitante."},{status:400});
    const prioridade=PRIORITIES.includes(String(b.prioridade)) ? String(b.prioridade) : "NORMAL";
    const tipo=clean(b.tipo,60) || "DUVIDA", prazo=clean(b.prazo,10);
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return NextResponse.json({error:"Prazo inválido."},{status:400});
    const db=sql();
    const [item] = await db`
      insert into pcp_sac_atendimentos(cliente,pedido,of_referencia,tipo,assunto,descricao,solicitante,responsavel,prioridade,prazo,medicao,observacoes,criado_por,atualizado_por)
      values(${cliente},${clean(b.pedido,80)},${clean(b.of,80)},${tipo},${assunto},${descricao},${solicitante},${clean(b.responsavel,160)},${prioridade},${prazo || null},${clean(b.medicao,3000)},${clean(b.observacoes,5000)},${user.usuario},${user.usuario}) returning *
    `;
    await db`insert into pcp_sac_eventos(atendimento_id,usuario,tipo,descricao,depois) values(${item.id},${user.usuario},'CRIADO','Solicitação registrada',${json(item)}::jsonb)`;
    return NextResponse.json({item},{status:201});
  } catch (e) { const forbidden=e instanceof Error && e.message==="SEM_PERMISSAO"; return NextResponse.json({error:forbidden?"Sem permissão.":e instanceof Error?e.message:"Falha ao criar atendimento."},{status:forbidden?403:500}); }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRoles([...SAC_TEAM]), b=await req.json(), id=clean(b.id,80), db=sql();
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
