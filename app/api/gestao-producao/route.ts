import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { publishRealtimeEvent } from "@/lib/realtime-server";

const TIPOS = new Set(["FALTA_PECA", "REPOSICAO", "RETRABALHO"]);

async function ensure(db: ReturnType<typeof sql>) {
  await db`
    create table if not exists pcp_pedido_controle(
      id uuid primary key default gen_random_uuid(),
      programacao_id uuid not null references pcp_programacoes(id) on delete cascade,
      pedido varchar(80) not null,
      cliente varchar(240) not null default '',
      data_entrega date,
      status_entrega varchar(30) not null default 'SEM_DATA',
      observacao text not null default '',
      atualizado_por varchar(120) not null default '',
      atualizado_em timestamptz not null default now(),
      unique(programacao_id,pedido)
    )
  `;
  await db`
    create table if not exists pcp_excecoes_peca(
      id uuid primary key default gen_random_uuid(),
      programacao_id uuid not null references pcp_programacoes(id) on delete cascade,
      produto_id uuid references pcp_produtos(id) on delete set null,
      pedido varchar(80) not null,
      of varchar(80) not null default '',
      tipo varchar(30) not null,
      quantidade numeric(16,3) not null default 0,
      motivo varchar(240) not null default '',
      processo_retorno varchar(80) not null default '',
      observacao text not null default '',
      status varchar(30) not null default 'ABERTA',
      criado_por varchar(120) not null default '',
      criado_em timestamptz not null default now(),
      resolvido_por varchar(120) not null default '',
      resolvido_em timestamptz
    )
  `;
}

async function ativa(db: ReturnType<typeof sql>) {
  const rows = await db`
    select id
    from pcp_programacoes
    where status='ATIVA'
    order by criado_em desc
    limit 1
  `;
  return rows[0]?.id ? String(rows[0].id) : "";
}

export async function GET() {
  try {
    await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER"]);
    const db = sql();
    await ensure(db);
    const programacaoId = await ativa(db);

    if (!programacaoId) {
      return NextResponse.json({ controles: [], excecoes: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const controles = await db`
      select
        pedido,
        cliente,
        to_char(data_entrega,'YYYY-MM-DD') data_entrega,
        case
          when data_entrega is null then 'SEM_DATA'
          when data_entrega < current_date then 'ATRASADO'
          when data_entrega <= current_date + 2 then 'URGENTE'
          else 'NO_PRAZO'
        end status_entrega,
        observacao,
        atualizado_por,
        atualizado_em
      from pcp_pedido_controle
      where programacao_id=${programacaoId}
      order by data_entrega nulls last, pedido
    `;

    const excecoes = await db`
      select
        e.id,
        e.produto_id,
        e.pedido,
        e.of,
        e.tipo,
        e.quantidade,
        e.motivo,
        e.processo_retorno,
        e.observacao,
        e.status,
        e.criado_por,
        e.criado_em,
        e.resolvido_por,
        e.resolvido_em,
        p.descricao,
        p.categoria,
        p.medida,
        p.material
      from pcp_excecoes_peca e
      left join pcp_produtos p on p.id=e.produto_id
      where e.programacao_id=${programacaoId}
      order by
        case when e.status='ABERTA' then 0 else 1 end,
        e.criado_em desc
    `;

    return NextResponse.json({
      controles: controles.map((x:any)=>({
        pedido:x.pedido,
        cliente:x.cliente,
        dataEntrega:x.data_entrega,
        statusEntrega:x.status_entrega,
        observacao:x.observacao,
        atualizadoPor:x.atualizado_por,
        atualizadoEm:x.atualizado_em,
      })),
      excecoes: excecoes.map((x:any)=>({
        id:x.id,
        produtoId:x.produto_id,
        pedido:x.pedido,
        of:x.of,
        tipo:x.tipo,
        quantidade:Number(x.quantidade||0),
        motivo:x.motivo,
        processoRetorno:x.processo_retorno,
        observacao:x.observacao,
        status:x.status,
        criadoPor:x.criado_por,
        criadoEm:x.criado_em,
        resolvidoPor:x.resolvido_por,
        resolvidoEm:x.resolvido_em,
        descricao:x.descricao||"",
        categoria:x.categoria||"",
        medida:x.medida||"",
        material:x.material||"",
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e:any) {
    return NextResponse.json(
      { error: e?.message==="SEM_PERMISSAO" ? "Sem permissão." : e?.message || "Falha ao carregar gestão." },
      { status: e?.message==="SEM_PERMISSAO" ? 403 : 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const s = await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
    const body = await req.json();
    const db = sql();
    await ensure(db);
    const programacaoId = await ativa(db);
    if (!programacaoId) return NextResponse.json({ error:"Nenhuma programação ativa." }, { status:404 });

    const action = String(body.action || "ENTREGA").toUpperCase();

    if (action === "RESOLVER_EXCECAO") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error:"Exceção não informada." }, { status:400 });

      const rows = await db`
        update pcp_excecoes_peca
        set status='RESOLVIDA', resolvido_por=${s.usuario}, resolvido_em=now()
        where id=${id}::uuid and programacao_id=${programacaoId}
        returning id,pedido
      `;
      if (!rows.length) return NextResponse.json({ error:"Exceção não encontrada." }, { status:404 });
      await publishRealtimeEvent("GESTAO_ATUALIZADA",{ tipo:"EXCECAO_RESOLVIDA", pedido:String(rows[0].pedido) });
      return NextResponse.json({ ok:true });
    }

    const pedido = String(body.pedido || "").trim();
    const dataEntrega = String(body.dataEntrega || "").trim();
    const cliente = String(body.cliente || "").trim();
    const observacao = String(body.observacao || "").trim();

    if (!pedido) return NextResponse.json({ error:"Pedido não informado." }, { status:400 });

    const rows = await db`
      insert into pcp_pedido_controle(
        programacao_id,pedido,cliente,data_entrega,status_entrega,observacao,atualizado_por,atualizado_em
      )
      values(
        ${programacaoId},${pedido},${cliente},
        ${dataEntrega || null}::date,
        case
          when ${dataEntrega || ""}='' then 'SEM_DATA'
          when ${dataEntrega || null}::date < current_date then 'ATRASADO'
          when ${dataEntrega || null}::date <= current_date + 2 then 'URGENTE'
          else 'NO_PRAZO'
        end,
        ${observacao},${s.usuario},now()
      )
      on conflict(programacao_id,pedido)
      do update set
        cliente=excluded.cliente,
        data_entrega=excluded.data_entrega,
        status_entrega=excluded.status_entrega,
        observacao=excluded.observacao,
        atualizado_por=excluded.atualizado_por,
        atualizado_em=now()
      returning pedido,to_char(data_entrega,'YYYY-MM-DD') data_entrega,status_entrega
    `;

    await publishRealtimeEvent("GESTAO_ATUALIZADA",{ tipo:"PRAZO_ATUALIZADO", pedido });
    return NextResponse.json({ ok:true, controle:rows[0] });
  } catch (e:any) {
    return NextResponse.json(
      { error: e?.message==="SEM_PERMISSAO" ? "Sem permissão." : e?.message || "Falha ao atualizar gestão." },
      { status: e?.message==="SEM_PERMISSAO" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER"]);
    const body = await req.json();
    const db = sql();
    await ensure(db);
    const programacaoId = await ativa(db);
    if (!programacaoId) return NextResponse.json({ error:"Nenhuma programação ativa." }, { status:404 });

    const pedido = String(body.pedido || "").trim();
    const produtoId = String(body.produtoId || "").trim();
    const tipo = String(body.tipo || "").trim().toUpperCase();
    const quantidade = Math.max(0, Number(body.quantidade || 0));
    const motivo = String(body.motivo || "").trim();
    const processoRetorno = String(body.processoRetorno || "").trim().toUpperCase();
    const observacao = String(body.observacao || "").trim();

    if (!pedido) return NextResponse.json({ error:"Pedido não informado." }, { status:400 });
    if (!TIPOS.has(tipo)) return NextResponse.json({ error:"Tipo de ocorrência inválido." }, { status:400 });
    if (!(quantidade > 0)) return NextResponse.json({ error:"Informe uma quantidade maior que zero." }, { status:400 });

    let of = "";
    if (produtoId) {
      const prod = await db`
        select id,of,pedido
        from pcp_produtos
        where id=${produtoId}::uuid and programacao_id=${programacaoId}
        limit 1
      `;
      if (!prod.length) return NextResponse.json({ error:"Peça não encontrada." }, { status:404 });
      of = String(prod[0].of || "");
    }

    const rows = await db`
      insert into pcp_excecoes_peca(
        programacao_id,produto_id,pedido,of,tipo,quantidade,motivo,processo_retorno,observacao,status,criado_por
      )
      values(
        ${programacaoId},
        ${produtoId || null}::uuid,
        ${pedido},
        ${of},
        ${tipo},
        ${quantidade},
        ${motivo},
        ${processoRetorno},
        ${observacao},
        'ABERTA',
        ${s.usuario}
      )
      returning id,pedido,tipo
    `;

    await publishRealtimeEvent("GESTAO_ATUALIZADA",{ tipo, pedido });
    return NextResponse.json({ ok:true, item:rows[0] });
  } catch (e:any) {
    return NextResponse.json(
      { error: e?.message==="SEM_PERMISSAO" ? "Sem permissão." : e?.message || "Falha ao registrar ocorrência." },
      { status: e?.message==="SEM_PERMISSAO" ? 403 : 500 }
    );
  }
}
