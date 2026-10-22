import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const READ_ROLES = ["PCP", "GERENTE", "COMERCIAL"] as const;
const FIN_ROLES = ["PCP", "GERENTE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
type Row = Record<string, any>;
const q = (db: unknown, text: string, params: unknown[] = []) => (db as any).query(text, params) as Promise<Row[]>;

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ_ROLES]);
    const db = sql();
    const url = new URL(req.url);
    const rep = clean(url.searchParams.get("representante"), 40);
    const comp = clean(url.searchParams.get("competencia"), 7);
    if ((rep && !isUuid(rep)) || (comp && !/^\d{4}-\d{2}$/.test(comp))) return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });
    const [resumo, lancamentos, regras, representantes] = await Promise.all([
      q(db, `select r.id representante_id, r.nome,
          coalesce(sum(c.valor) filter (where c.tipo='PROVISAO' and c.status='PREVISTA'),0)::numeric previsto,
          coalesce(sum(c.valor) filter (where c.tipo<>'PROVISAO' and c.status='A_PAGAR'),0)::numeric a_pagar,
          coalesce(sum(c.valor) filter (where c.tipo<>'PROVISAO' and c.status='PAGA'),0)::numeric pago
        from crm_representantes r left join crm_comissoes c on c.representante_id=r.id and ($2='' or c.competencia=$2)
        where ($1='' or r.id=$1::uuid) group by r.id,r.nome order by r.nome`, [rep, comp]),
      q(db, `select c.*, p.numero pedido_numero, p.pedido_cliente, cl.razao_social cliente_nome, r.nome representante_nome
        from crm_comissoes c join crm_pedidos_venda p on p.id=c.pedido_id join crm_clientes cl on cl.id=p.cliente_id join crm_representantes r on r.id=c.representante_id
        where ($1='' or c.representante_id=$1::uuid) and ($2='' or c.competencia=$2) order by c.criado_em desc limit 500`, [rep, comp]),
      q(db, `select g.*, r.nome representante_nome, cl.razao_social cliente_nome from crm_comissao_regras g join crm_representantes r on r.id=g.representante_id
        left join crm_clientes cl on cl.id=g.cliente_id where ($1='' or g.representante_id=$1::uuid) order by g.ativo desc, r.nome, g.vigencia_inicio desc limit 500`, [rep]),
      q(db, `select id,nome,comissao_percentual from crm_representantes where ativo order by nome`),
    ]);
    return NextResponse.json({ resumo, lancamentos, regras, representantes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const forbidden = e instanceof Error && e.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : e instanceof Error ? e.message : "Falha ao consultar comissões." }, { status: forbidden ? 403 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...FIN_ROLES]);
    const body = await req.json();
    const acao = clean(body.acao, 30).toUpperCase();
    const db = sql();
    if (acao === "REGRA") {
      const representanteId = clean(body.representanteId, 40);
      if (!isUuid(representanteId)) throw new Error("Selecione o representante.");
      const clienteId = clean(body.clienteId, 40) || null;
      if (clienteId && !isUuid(clienteId)) throw new Error("Cliente inválido.");
      const pct = Number(body.percentual);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Percentual deve estar entre 0 e 100.");
      const base = clean(body.base, 10).toUpperCase() || "FATURADO";
      if (base !== "FATURADO" && base !== "RECEBIDO") throw new Error("Base inválida.");
      const ini = clean(body.vigenciaInicio, 10) || new Date().toISOString().slice(0, 10), fim = clean(body.vigenciaFim, 10) || null;
      if (!isDate(ini) || (fim && (!isDate(fim) || fim < ini))) throw new Error("Vigência inválida.");
      const fmin = body.faixaMin === "" || body.faixaMin == null ? null : Number(body.faixaMin);
      const fmax = body.faixaMax === "" || body.faixaMax == null ? null : Number(body.faixaMax);
      if ((fmin != null && !(fmin >= 0)) || (fmax != null && !(fmax >= 0)) || (fmin != null && fmax != null && fmax < fmin)) throw new Error("Faixa inválida.");
      await q(db, `insert into crm_comissao_regras(representante_id,cliente_id,item_codigo,familia,faixa_min,faixa_max,percentual,base,vigencia_inicio,vigencia_fim,criado_por)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [representanteId, clienteId, clean(body.itemCodigo, 80), clean(body.familia, 80), fmin, fmax, pct, base, ini, fim, user.usuario]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "REGRA_DESATIVAR") {
      const id = clean(body.id, 40);
      if (!isUuid(id)) throw new Error("Regra inválida.");
      await q(db, `update crm_comissao_regras set ativo=false where id=$1`, [id]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "PAGAR") {
      const representanteId = clean(body.representanteId, 40), comp = clean(body.competencia, 7);
      if (!isUuid(representanteId) || !/^\d{4}-\d{2}$/.test(comp)) throw new Error("Informe representante e competência.");
      const [saldo] = await q(db, `select coalesce(sum(valor),0)::numeric s from crm_comissoes where representante_id=$1 and competencia<=$2 and tipo<>'PROVISAO' and status='A_PAGAR'`, [representanteId, comp]);
      if (Number(saldo.s) < 0) throw new Error("Saldo líquido negativo (estornos maiores que liberações); nada a pagar.");
      const r = await q(db, `with u as (update crm_comissoes set status='PAGA',pago_em=now(),pago_por=$3 where representante_id=$1 and competencia<=$2 and tipo<>'PROVISAO' and status='A_PAGAR' returning valor)
        select count(*)::int qtd, coalesce(sum(valor),0)::numeric total from u`, [representanteId, comp, user.usuario]);
      return NextResponse.json({ ok: true, ...r[0] });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    const forbidden = e instanceof Error && e.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : e instanceof Error ? e.message : "Falha ao gravar comissão." }, { status: forbidden ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
