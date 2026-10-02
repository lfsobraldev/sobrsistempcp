import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles, session } from "@/lib/auth";

const MANAGE_ROLES = ["PCP", "GERENTE", "ENCARREGADO"] as const;
const VIEW_ROLES = ["PCP", "GERENTE", "ENCARREGADO", "LIDER"] as const;

type Area = "QUALIDADE" | "MSAC";

function statusGlobal(q: string, m: string) {
  if (q === "BLOQUEADO" || m === "BLOQUEADO") return "BLOQUEADO";
  if (q === "LIBERADO" && m === "LIBERADO") return "LIBERADO";
  if (q === "LIBERADO" || m === "LIBERADO") return "EM_LIBERACAO";
  return "AGUARDANDO_INSPECAO";
}

function clean(v: unknown, max = 240) {
  return String(v ?? "").trim().slice(0, max);
}

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function audit(db: ReturnType<typeof sql>, palletId: string, usuario: string, tipo: string, descricao: string, antes: unknown, depois: unknown) {
  await db`
    insert into pcp_pallet_eventos(pallet_id,usuario,tipo,descricao,antes,depois)
    values(${palletId},${usuario},${tipo},${descricao},${JSON.stringify(antes)}::jsonb,${JSON.stringify(depois)}::jsonb)
  `;
}

export async function GET(req: Request) {
  try {
    const s = await session();
    if (!s || !VIEW_ROLES.includes(s.perfil as any)) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const url = new URL(req.url);
    const q = clean(url.searchParams.get("q"), 120);
    const status = clean(url.searchParams.get("status"), 40);
    const id = clean(url.searchParams.get("id"), 80);
    const db = sql();

    if (id) {
      const [item] = await db`
        select p.*,
          coalesce((select count(*)::int from pcp_pallet_fotos f where f.pallet_id=p.id),0) as fotos_count,
          coalesce((select json_agg(json_build_object(
            'id',f.id,'dataUrl',f.data_url,'legenda',f.legenda,'area',f.area,'usuario',f.usuario,'criadoEm',f.criado_em
          ) order by f.criado_em desc) from pcp_pallet_fotos f where f.pallet_id=p.id),'[]'::json) as fotos,
          coalesce((select json_agg(json_build_object(
            'id',i.id,'area',i.area,'resultado',i.resultado,'checklist',i.checklist,'observacao',i.observacao,'usuario',i.usuario,'criadoEm',i.criado_em
          ) order by i.criado_em desc) from pcp_pallet_inspecoes i where i.pallet_id=p.id),'[]'::json) as inspecoes,
          coalesce((select json_agg(json_build_object(
            'id',e.id,'tipo',e.tipo,'descricao',e.descricao,'usuario',e.usuario,'criadoEm',e.criado_em
          ) order by e.criado_em desc) from pcp_pallet_eventos e where e.pallet_id=p.id),'[]'::json) as eventos
        from pcp_pallets p where p.id=${id}
      `;
      if (!item) return NextResponse.json({ error: "Pallet não encontrado." }, { status: 404 });
      return NextResponse.json({ item }, { headers: { "Cache-Control": "no-store" } });
    }

    const rows = await db`
      select p.*,
        coalesce((select count(*)::int from pcp_pallet_fotos f where f.pallet_id=p.id),0) as fotos_count
      from pcp_pallets p
      where (${q}='' or p.codigo ilike ${`%${q}%`} or p.pedido ilike ${`%${q}%`} or p.cliente ilike ${`%${q}%`} or p.pallet ilike ${`%${q}%`} or p.filtro ilike ${`%${q}%`})
        and (${status}='' or p.status=${status})
      order by
        case p.status when 'BLOQUEADO' then 0 when 'EM_LIBERACAO' then 1 when 'AGUARDANDO_INSPECAO' then 2 else 3 end,
        p.atualizado_em desc
      limit 500
    `;

    const resumoRows = await db`
      select
        count(*)::int total,
        count(*) filter(where status='LIBERADO')::int liberados,
        count(*) filter(where status='BLOQUEADO')::int bloqueados,
        count(*) filter(where status='EM_LIBERACAO')::int em_liberacao,
        count(*) filter(where status='AGUARDANDO_INSPECAO')::int aguardando
      from pcp_pallets
      where criado_em >= current_date - interval '30 days'
    `;

    return NextResponse.json({ itens: rows, resumo: resumoRows[0] || {} }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao carregar pallets." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);
    const b = await req.json();
    const db = sql();

    const pedido = clean(b.pedido, 60);
    const pallet = clean(b.pallet, 60);
    if (!pedido || !pallet) {
      return NextResponse.json({ error: "Pedido e pallet são obrigatórios." }, { status: 400 });
    }

    const codigo = `PLT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const [created] = await db`
      insert into pcp_pallets(
        codigo,pedido,cliente,filtro,pallet,tipo_produto,quantidade,jogos,turno,destino,montador,conferente,observacao,criado_por
      ) values(
        ${codigo},${pedido},${clean(b.cliente)},${clean(b.filtro,60)},${pallet},${clean(b.tipoProduto)},${num(b.quantidade)},${num(b.jogos)},${clean(b.turno,20)||'A'},${clean(b.destino)},${clean(b.montador)},${clean(b.conferente)},${clean(b.observacao,1000)},${s.usuario}
      ) returning *
    `;
    await audit(db, created.id, s.usuario, "PALLET_CRIADO", `Pallet ${pallet} criado`, {}, created);
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Sem permissão." : e?.message || "Falha ao criar pallet." }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);
    const b = await req.json();
    const id = clean(b.id, 80);
    const action = clean(b.action, 50).toUpperCase();
    const db = sql();
    const [old] = await db`select * from pcp_pallets where id=${id}`;
    if (!old) return NextResponse.json({ error: "Pallet não encontrado." }, { status: 404 });

    if (action === "INSPECIONAR") {
      const area = clean(b.area, 20).toUpperCase() as Area;
      if (!(["QUALIDADE", "MSAC"] as string[]).includes(area)) return NextResponse.json({ error: "Área inválida." }, { status: 400 });
      const checklist = b.checklist && typeof b.checklist === "object" ? b.checklist : {};
      const resultado = clean(b.resultado, 30).toUpperCase() || "CONFORME";
      await db`
        insert into pcp_pallet_inspecoes(pallet_id,area,resultado,checklist,observacao,usuario)
        values(${id},${area},${resultado},${JSON.stringify(checklist)}::jsonb,${clean(b.observacao,1500)},${s.usuario})
      `;
      await db`update pcp_pallets set atualizado_em=now() where id=${id}`;
      await audit(db, id, s.usuario, "INSPECAO_REGISTRADA", `Inspeção ${area} registrada`, old, { area, resultado, checklist });
      return NextResponse.json({ ok: true });
    }

    if (["QUALIDADE_LIBERAR", "QUALIDADE_BLOQUEAR", "MSAC_LIBERAR", "MSAC_BLOQUEAR", "REABRIR"].includes(action)) {
      if (!MANAGE_ROLES.includes(s.perfil as any)) return NextResponse.json({ error: "Somente PCP, Gerente ou Encarregado pode liberar/bloquear." }, { status: 403 });

      if (action.startsWith("MSAC_") && old.qualidade_status !== "LIBERADO" && action !== "MSAC_BLOQUEAR") {
        return NextResponse.json({ error: "A Qualidade precisa liberar o pallet antes da liberação MSAC." }, { status: 409 });
      }

      let q = old.qualidade_status;
      let m = old.msac_status;
      let motivo = clean(b.motivo, 800);
      const obs = clean(b.observacao, 1000);

      if (action === "QUALIDADE_LIBERAR") q = "LIBERADO";
      if (action === "QUALIDADE_BLOQUEAR") q = "BLOQUEADO";
      if (action === "MSAC_LIBERAR") m = "LIBERADO";
      if (action === "MSAC_BLOQUEAR") m = "BLOQUEADO";
      if (action === "REABRIR") { q = "PENDENTE"; m = "PENDENTE"; motivo = ""; }

      if ((action.endsWith("BLOQUEAR")) && !motivo) return NextResponse.json({ error: "Informe o motivo do bloqueio." }, { status: 400 });

      const global = statusGlobal(q, m);
      const [updated] = await db`
        update pcp_pallets set
          qualidade_status=${q},
          msac_status=${m},
          status=${global},
          qualidade_usuario=case when ${action} like 'QUALIDADE_%' then ${s.usuario} else qualidade_usuario end,
          qualidade_em=case when ${action} like 'QUALIDADE_%' then now() else qualidade_em end,
          qualidade_observacao=case when ${action} like 'QUALIDADE_%' then ${obs} else qualidade_observacao end,
          msac_usuario=case when ${action} like 'MSAC_%' then ${s.usuario} else msac_usuario end,
          msac_em=case when ${action} like 'MSAC_%' then now() else msac_em end,
          msac_observacao=case when ${action} like 'MSAC_%' then ${obs} else msac_observacao end,
          bloqueio_motivo=${global === 'BLOQUEADO' ? motivo : ''},
          bloqueado_por=${global === 'BLOQUEADO' ? s.usuario : ''},
          bloqueado_em=${global === 'BLOQUEADO' ? new Date().toISOString() : null},
          atualizado_em=now()
        where id=${id}
        returning *
      `;
      await audit(db, id, s.usuario, action, `${action.replaceAll('_',' ')} — ${old.pallet}`, old, updated);
      return NextResponse.json({ ok: true, item: updated });
    }

    if (action === "ATUALIZAR") {
      const [updated] = await db`
        update pcp_pallets set
          cliente=${clean(b.cliente)}, filtro=${clean(b.filtro,60)}, tipo_produto=${clean(b.tipoProduto)},
          quantidade=${num(b.quantidade)}, jogos=${num(b.jogos)}, turno=${clean(b.turno,20)}, destino=${clean(b.destino)},
          montador=${clean(b.montador)}, conferente=${clean(b.conferente)}, observacao=${clean(b.observacao,1000)}, atualizado_em=now()
        where id=${id} returning *
      `;
      await audit(db, id, s.usuario, "PALLET_ATUALIZADO", `Pallet ${old.pallet} atualizado`, old, updated);
      return NextResponse.json({ ok: true, item: updated });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Sem permissão." : e?.message || "Falha ao atualizar pallet." }, { status });
  }
}
