import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { publishRealtimeEvent } from "@/lib/realtime-server";
import { validarAcao, type Acao } from "@/lib/apontamento";
import { garantirApontamentos } from "@/lib/pcp-schema";

export const runtime = "nodejs";
const ACOES: Acao[] = ["INICIAR", "SOMAR", "FINALIZAR", "DIVERGENCIA", "PRODUZIDO", "REFUGO"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Apontamento por operação. Regras:
 * - LIDER/APONTADOR só apontam nos processos que lhes foram liberados (antes só a tela filtrava).
 * - Transições validadas em lib/apontamento.ts (não finaliza operação pendente/bloqueada/concluída).
 * - Cada lançamento de quantidade grava uma linha em pcp_apontamentos (responsável, data, delta) e um evento em pcp_eventos.
 * - `requestId` torna o lançamento idempotente (toque duplo / reenvio não soma duas vezes).
 * - Limite opcional de operações EM_ANDAMENTO simultâneas por processo (pcp_recursos_regras), com trava por processo.
 */
async function unidadePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireRoles(["PCP", "ENCARREGADO", "LIDER", "APONTADOR"]);
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    const b = await req.json();
    const acao = String(b.action || "") as Acao;
    if (!ACOES.includes(acao)) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const rid = String(b.requestId || "").trim().slice(0, 80);
    const force = b.force === true && ["PCP", "ENCARREGADO"].includes(s.perfil);
    const valor = b.value === undefined || b.value === null || b.value === "" ? undefined : Number(b.value);
    const anterior = b.anterior === undefined || b.anterior === null || b.anterior === "" ? null : Number(b.anterior);
    const obs = String(b.observacao || "").trim().slice(0, 300);
    const db = sql();
    await garantirApontamentos(db);

    const [op] = await db`select o.id,o.processo,o.status,o.quantidade_planejada,o.quantidade_produzida,o.quantidade_refugo,p.of,p.pedido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where o.id=${id}`;
    if (!op) return NextResponse.json({ error: "Operação não encontrada." }, { status: 404 });
    if (["LIDER", "APONTADOR"].includes(s.perfil) && s.processos?.length && !s.processos.includes(op.processo))
      return NextResponse.json({ error: `Você não tem permissão para apontar no setor ${op.processo}.`, codigo: "SETOR_NAO_PERMITIDO" }, { status: 403 });

    const v = validarAcao({ status: op.status, quantidadePlanejada: Number(op.quantidade_planejada), quantidadeProduzida: Number(op.quantidade_produzida), quantidadeRefugo: Number(op.quantidade_refugo) }, acao, valor, { force });
    if (!v.ok) {
      if (rid && v.codigo !== "QUANTIDADE_INVALIDA") {
        const [d] = await db`select 1 from pcp_apontamentos where request_id=${rid} limit 1`;
        if (d) return NextResponse.json({ ok: true, duplicado: true });
      }
      return NextResponse.json({ error: v.erro, codigo: v.codigo }, { status: v.http });
    }
    if (acao === "PRODUZIDO" && anterior !== null && anterior !== Number(op.quantidade_produzida))
      return NextResponse.json({ error: `A quantidade mudou para ${Number(op.quantidade_produzida)} desde que você abriu a tela. Atualize e confira.`, codigo: "CONCORRENCIA" }, { status: 409 });

    const [regra] = await db`select max_em_andamento from pcp_recursos_regras where processo=${op.processo}`;
    const max = regra?.max_em_andamento == null ? null : Number(regra.max_em_andamento);
    const usuario = s.usuario, ant = anterior;
    const rids = rid || null;

    const stmts: Record<string, () => any> = {
      INICIAR: () => db`
        with old as(select o.*,p.of,p.pedido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where o.id=${id}),
        upd as(update pcp_operacoes set status='EM_ANDAMENTO',iniciado_em=coalesce(iniciado_em,now()),atualizado_em=now()
          where id=${id} and status in('LIBERADA','EM_ANDAMENTO')
            and (status='EM_ANDAMENTO' or ${max}::int is null or (select count(*) from pcp_operacoes x where x.processo=pcp_operacoes.processo and x.status='EM_ANDAMENTO' and x.id<>pcp_operacoes.id)<${max}::int) returning *),
        ev as(insert into pcp_eventos(operacao_id,usuario,tipo,descricao,of,processo,antes,depois) select upd.id,${usuario},'INICIAR','Operação iniciada',old.of,upd.processo,to_jsonb(old),to_jsonb(upd) from upd join old on old.id=upd.id returning id)
        select (select count(*) from upd)::int n`,
      SOMAR: () => db`
        with old as(select o.*,p.of,p.pedido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where o.id=${id}),
        upd as(update pcp_operacoes set quantidade_produzida=quantidade_produzida+${valor}::numeric,status=case when status='LIBERADA' then 'EM_ANDAMENTO' else status end,iniciado_em=coalesce(iniciado_em,now()),atualizado_em=now()
          where id=${id} and status in('LIBERADA','EM_ANDAMENTO') and quantidade_produzida+${valor}::numeric>=0
            and (${force} or quantidade_produzida+${valor}::numeric<=quantidade_planejada)
            and (${rids}::text is null or not exists(select 1 from pcp_apontamentos where request_id=${rids}::text))
            and (status='EM_ANDAMENTO' or ${max}::int is null or (select count(*) from pcp_operacoes x where x.processo=pcp_operacoes.processo and x.status='EM_ANDAMENTO' and x.id<>pcp_operacoes.id)<${max}::int) returning *),
        led as(insert into pcp_apontamentos(operacao_id,pedido,of,processo,tipo,quantidade,request_id,usuario) select upd.id,old.pedido,old.of,upd.processo,case when ${valor}::numeric>0 then 'PRODUCAO' else 'CORRECAO' end,${valor}::numeric,${rids}::text,${usuario} from upd join old on old.id=upd.id returning id),
        ev as(insert into pcp_eventos(operacao_id,usuario,tipo,descricao,of,processo,antes,depois) select upd.id,${usuario},'PRODUZIDO','Apontamento de quantidade',old.of,upd.processo,to_jsonb(old),to_jsonb(upd) from upd join old on old.id=upd.id returning id)
        select (select count(*) from upd)::int n`,
      FINALIZAR: () => db`
        with old as(select o.*,p.of,p.pedido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where o.id=${id}),
        upd as(update pcp_operacoes set status='CONCLUIDA',percentual=100,quantidade_produzida=greatest(quantidade_produzida,quantidade_planejada),finalizado_em=now(),atualizado_em=now() where id=${id} and status in('LIBERADA','EM_ANDAMENTO','DIVERGENCIA') returning *),
        nx as(select id from pcp_operacoes where produto_id=(select produto_id from upd) and sequencia>(select sequencia from upd) and status<>'CONCLUIDA' order by sequencia limit 1),
        rel as(update pcp_operacoes set status='LIBERADA',atualizado_em=now() where id=(select id from nx) and status='PENDENTE' returning id),
        led as(insert into pcp_apontamentos(operacao_id,pedido,of,processo,tipo,quantidade,usuario) select upd.id,old.pedido,old.of,upd.processo,'FINALIZACAO',upd.quantidade_produzida-old.quantidade_produzida,${usuario} from upd join old on old.id=upd.id where upd.quantidade_produzida>old.quantidade_produzida returning id),
        ev as(insert into pcp_eventos(operacao_id,usuario,tipo,descricao,of,processo,antes,depois) select upd.id,${usuario},'FINALIZAR','Operação finalizada e próxima operação liberada',old.of,upd.processo,to_jsonb(old),to_jsonb(upd) from upd join old on old.id=upd.id returning id)
        select (select count(*) from upd)::int n`,
      DIVERGENCIA: () => db`
        with old as(select o.*,p.of,p.pedido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where o.id=${id}),
        upd as(update pcp_operacoes set status='DIVERGENCIA',atualizado_em=now() where id=${id} and status not in('CONCLUIDA','DIVERGENCIA') returning *),
        ev as(insert into pcp_eventos(operacao_id,usuario,tipo,descricao,of,processo,antes,depois) select upd.id,${usuario},'DIVERGENCIA',${"Divergência registrada" + (obs ? ": " + obs : "")},old.of,upd.processo,to_jsonb(old),to_jsonb(upd) from upd join old on old.id=upd.id returning id)
        select (select count(*) from upd)::int n`,
      PRODUZIDO: () => db`
        with old as(select o.*,p.of,p.pedido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where o.id=${id}),
        upd as(update pcp_operacoes set quantidade_produzida=${valor}::numeric,atualizado_em=now() where id=${id} and status not in('PENDENTE','BLOQUEADA') and (${ant}::numeric is null or quantidade_produzida=${ant}::numeric)
            and (${rids}::text is null or not exists(select 1 from pcp_apontamentos where request_id=${rids}::text)) returning *),
        led as(insert into pcp_apontamentos(operacao_id,pedido,of,processo,tipo,quantidade,request_id,usuario) select upd.id,old.pedido,old.of,upd.processo,'CORRECAO',upd.quantidade_produzida-old.quantidade_produzida,${rids}::text,${usuario} from upd join old on old.id=upd.id where upd.quantidade_produzida<>old.quantidade_produzida returning id),
        ev as(insert into pcp_eventos(operacao_id,usuario,tipo,descricao,of,processo,antes,depois) select upd.id,${usuario},'PRODUZIDO','Quantidade produzida registrada',old.of,upd.processo,to_jsonb(old),to_jsonb(upd) from upd join old on old.id=upd.id returning id)
        select (select count(*) from upd)::int n`,
      REFUGO: () => db`
        with old as(select o.*,p.of,p.pedido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where o.id=${id}),
        upd as(update pcp_operacoes set quantidade_refugo=${valor}::numeric,atualizado_em=now() where id=${id} and status not in('PENDENTE','BLOQUEADA')
            and (${rids}::text is null or not exists(select 1 from pcp_apontamentos where request_id=${rids}::text)) returning *),
        led as(insert into pcp_apontamentos(operacao_id,pedido,of,processo,tipo,quantidade,request_id,usuario) select upd.id,old.pedido,old.of,upd.processo,'REFUGO',upd.quantidade_refugo-old.quantidade_refugo,${rids}::text,${usuario} from upd join old on old.id=upd.id where upd.quantidade_refugo<>old.quantidade_refugo returning id),
        ev as(insert into pcp_eventos(operacao_id,usuario,tipo,descricao,of,processo,antes,depois) select upd.id,${usuario},'REFUGO','Refugo registrado',old.of,upd.processo,to_jsonb(old),to_jsonb(upd) from upd join old on old.id=upd.id returning id)
        select (select count(*) from upd)::int n`,
    };

    const usaLimite = max !== null && (acao === "INICIAR" || acao === "SOMAR") && op.status === "LIBERADA";
    let n = 0;
    try {
      if (usaLimite) {
        // trava por processo: o segundo lançamento só avalia o limite depois do primeiro confirmar
        const res = await db.transaction([db`select pg_advisory_xact_lock(hashtext(${"pcp-op-" + op.processo}))`, stmts[acao]()]);
        n = Number(res[1]?.[0]?.n || 0);
      } else {
        const r = await stmts[acao]();
        n = Number(r?.[0]?.n || 0);
      }
    } catch (e: any) {
      if (e?.code === "23505" || /ux_pcp_apont_request/.test(String(e?.message))) return NextResponse.json({ ok: true, duplicado: true });
      throw e;
    }

    if (!n) {
      if (rid) {
        const [d] = await db`select 1 from pcp_apontamentos where request_id=${rid} limit 1`;
        if (d) return NextResponse.json({ ok: true, duplicado: true });
      }
      if (usaLimite) {
        const ocupando = await db`select p.of,p.pedido from pcp_operacoes x join pcp_produtos p on p.id=x.produto_id where x.processo=${op.processo} and x.status='EM_ANDAMENTO' and x.id<>${id} limit 5`;
        if (ocupando.length >= (max as number))
          return NextResponse.json({ error: `O recurso ${op.processo} já tem ${max} operação(ões) em andamento (OF ${ocupando.map((o: any) => o.of || o.pedido).join(", ")}). Conclua ou pause antes de iniciar outra.`, codigo: "RECURSO_OCUPADO" }, { status: 409 });
      }
      return NextResponse.json({ error: "A operação foi alterada por outro usuário. Atualize a tela e confira antes de lançar novamente.", codigo: "CONCORRENCIA" }, { status: 409 });
    }
    await publishRealtimeEvent("PRODUCAO_ATUALIZADA", { operacaoId: id, acao });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const st = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({ error: st === 403 ? "Sem permissão." : e?.message || "Falha ao atualizar operação." }, { status: st });
  }
}

export const PATCH = unidadeHandler(unidadePATCH);
