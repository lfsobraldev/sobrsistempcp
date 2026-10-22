import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { unidadeHandler } from "@/lib/unidades/handler";
import { unidadeAtual } from "@/lib/unidades/context";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"] as const;
const WRITE = ["PCP", "GERENTE", "LOGISTICA"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
type Row = Record<string, any>;
const db = () => sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]>; transaction: (q: unknown[]) => Promise<Row[][]> };
const q = (t: string, p: unknown[] = []) => db().query(t, p);
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const atp = url.searchParams.get("atp");
    if (atp) {
      const [prod, qtd, data] = atp.split("|");
      const [r] = await q(`select * from exp_atp($1::uuid,$2::numeric,$3::date)`, [need(prod, "Produto inválido."), Number(qtd), data]);
      return NextResponse.json({ atp: r }, { headers: { "Cache-Control": "no-store" } });
    }
    const id = url.searchParams.get("remessa");
    if (id) {
      need(id, "Remessa inválida.");
      const [r] = await q(`select r.*,c.razao_social cliente,t.nome transportadora,p.numero pedido_numero,p.pedido_cliente from exp_remessas r join crm_clientes c on c.id=r.cliente_id join crm_pedidos_venda p on p.id=r.pedido_venda_id left join exp_transportadoras t on t.id=r.transportadora_id where r.id=$1`, [id]);
      if (!r) throw new Error("Remessa não encontrada.");
      const [itens, pallets, ocorrencias, devolucoes] = await Promise.all([
        q(`select i.*,pr.codigo,pr.descricao from exp_remessa_itens i join est_produtos pr on pr.id=i.produto_id where i.remessa_id=$1 order by i.linha`, [id]),
        q(`select x.lido_em,x.lido_por,p.codigo,p.quantidade,p.status from exp_remessa_pallets x join pcp_pallets p on p.id=x.pallet_id where x.remessa_id=$1 order by x.lido_em`, [id]),
        q(`select * from exp_ocorrencias where remessa_id=$1 order by criado_em desc`, [id]),
        q(`select d.*,pr.codigo from exp_devolucoes d join est_produtos pr on pr.id=d.produto_id where d.remessa_id=$1 order by d.criado_em desc`, [id]),
      ]);
      return NextResponse.json({ remessa: r, itens, pallets, ocorrencias, devolucoes }, { headers: { "Cache-Control": "no-store" } });
    }
    const [remessas, pedidos, transportadoras, locais, eventos] = await Promise.all([
      q(`select r.id,r.numero,r.status,r.frete,r.previsao_entrega,r.nota_numero,r.criado_em,c.razao_social cliente,p.numero pedido_numero,t.nome transportadora,
          (select count(*) from exp_remessa_pallets x where x.remessa_id=r.id) pallets
         from exp_remessas r join crm_clientes c on c.id=r.cliente_id join crm_pedidos_venda p on p.id=r.pedido_venda_id left join exp_transportadoras t on t.id=r.transportadora_id order by r.numero desc limit 200`),
      q(`select p.id,p.numero,p.pedido_cliente,p.pedido_pcp,p.status,c.razao_social cliente,
          (select json_agg(json_build_object('linha',i.linha,'codigo',i.item_codigo,'descricao',i.descricao,'quantidade',i.quantidade,
            'expedido',coalesce((select sum(ri.quantidade) from exp_remessa_itens ri join exp_remessas rr on rr.id=ri.remessa_id where rr.pedido_venda_id=p.id and rr.status in ('ABERTA','SEPARANDO','FECHADA','ENTREGUE') and ri.pedido_linha=i.linha),0),
            'produto_id',(select e.id from est_produtos e where e.codigo=i.item_codigo limit 1)) order by i.linha) from crm_pedido_venda_itens i where i.pedido_id=p.id) itens
         from crm_pedidos_venda p join crm_clientes c on c.id=p.cliente_id where p.status in ('APROVADO','EM_PRODUCAO','PARCIAL') order by p.numero desc limit 200`),
      q(`select id,nome,documento,contato,ativo from exp_transportadoras order by nome`),
      q(`select id,codigo,descricao from est_locais where ativo order by codigo`),
      q(`select e.id,e.status,e.criado_em,r.numero remessa,e.payload from exp_eventos_faturamento e join exp_remessas r on r.id=e.remessa_id order by e.criado_em desc limit 50`),
    ]);
    return NextResponse.json({ remessas, pedidos, transportadoras, locais, eventos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha ao consultar a expedição." }, { status: forbidden ? 403 : /does not exist/.test(m) ? 503 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const ator = user.usuario;
    if (acao === "TRANSPORTADORA") {
      if (!clean(b.nome, 200)) throw new Error("Informe o nome da transportadora.");
      await q(`insert into exp_transportadoras(nome,documento,contato,criado_por) values($1,$2,$3,$4)`, [clean(b.nome, 200), clean(b.documento, 40), clean(b.contato, 160), ator]);
    } else if (acao === "RESERVAR") {
      const [r] = await q(`select exp_reservar($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5) id`, [need(clean(b.pedidoId, 40), "Pedido inválido."), need(clean(b.produtoId, 40), "Produto inválido."), need(clean(b.localId, 40), "Selecione o depósito."), Number(b.quantidade), ator]);
      return NextResponse.json({ ok: true, id: r.id });
    } else if (acao === "REMESSA") {
      const pedidoId = need(clean(b.pedidoId, 40), "Pedido inválido."), localId = need(clean(b.localId, 40), "Selecione o depósito.");
      const itens = Array.isArray(b.itens) ? b.itens : [];
      if (!itens.length || itens.length > 200) throw new Error("Informe ao menos um item.");
      const [pv] = await q(`select id,cliente_id,status from crm_pedidos_venda where id=$1`, [pedidoId]);
      if (!pv) throw new Error("Pedido não encontrado.");
      if (!["APROVADO", "EM_PRODUCAO", "PARCIAL"].includes(pv.status)) throw new Error(`Pedido ${pv.status} não pode ser expedido.`);
      const previsao = clean(b.previsaoEntrega, 10);
      if (previsao && !isDate(previsao)) throw new Error("Previsão inválida.");
      const frete = Number(b.frete ?? 0);
      if (!(frete >= 0)) throw new Error("Frete inválido.");
      const lista = itens.map((i: Row, n: number) => ({ linha: n + 1, pl: Number(i.pedidoLinha), prod: need(clean(i.produtoId, 40), "Item sem produto cadastrado no estoque."), q: Number(i.quantidade) }));
      for (const i of lista) if (!(i.q > 0) || !(i.pl > 0)) throw new Error("Quantidade inválida.");
      const [dis] = await q(`select count(*)::int n from jsonb_to_recordset($2::jsonb) x(pl int,q numeric) join crm_pedido_venda_itens i on i.pedido_id=$1 and i.linha=x.pl
        where x.q > i.quantidade - coalesce((select sum(ri.quantidade) from exp_remessa_itens ri join exp_remessas rr on rr.id=ri.remessa_id where rr.pedido_venda_id=$1 and rr.status<>'CANCELADA' and ri.pedido_linha=i.linha),0)`, [pedidoId, JSON.stringify(lista)]);
      if (dis.n > 0) throw new Error("Quantidade da remessa excede o saldo a expedir do pedido.");
      const [r] = await q(`insert into exp_remessas(pedido_venda_id,cliente_id,transportadora_id,local_id,frete,previsao_entrega,observacoes,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [pedidoId, pv.cliente_id, b.transportadoraId ? need(clean(b.transportadoraId, 40), "Transportadora inválida.") : null, localId, frete, previsao || null, clean(b.observacoes, 500), ator]);
      await q(`insert into exp_remessa_itens(remessa_id,linha,pedido_linha,produto_id,quantidade) select $1::uuid,x.linha,x.pl,x.prod::uuid,x.q from jsonb_to_recordset($2::jsonb) x(linha int,pl int,prod text,q numeric)`, [r.id, JSON.stringify(lista)]);
      return NextResponse.json({ ok: true, id: r.id });
    } else if (acao === "LER_PALLET") {
      await q(`select exp_ler_pallet($1::uuid,$2,$3)`, [need(clean(b.remessaId, 40), "Remessa inválida."), clean(b.codigo, 80), ator]);
    } else if (acao === "FECHAR") {
      await q(`select exp_fechar_remessa($1::uuid,$2)`, [need(clean(b.remessaId, 40), "Remessa inválida."), ator]);
    } else if (acao === "ENTREGAR") {
      await q(`select exp_entregar($1::uuid,$2,$3)`, [need(clean(b.remessaId, 40), "Remessa inválida."), clean(b.nota, 40), ator]);
    } else if (acao === "CANCELAR") {
      const [r] = await q(`update exp_remessas set status='CANCELADA' where id=$1 and status in ('ABERTA','SEPARANDO') returning id`, [need(clean(b.remessaId, 40), "Remessa inválida.")]);
      if (!r) throw new Error("Somente remessa aberta pode ser cancelada.");
      await q(`delete from exp_remessa_pallets where remessa_id=$1`, [r.id]);
    } else if (acao === "OCORRENCIA") {
      const desc = clean(b.descricao, 1000);
      if (desc.length < 3) throw new Error("Descreva a ocorrência.");
      const tipo = clean(b.tipo, 20).toUpperCase();
      if (!["ATRASO", "AVARIA", "FALTA", "RECUSA", "OUTRO"].includes(tipo)) throw new Error("Tipo inválido.");
      await q(`insert into exp_ocorrencias(remessa_id,tipo,descricao,criado_por) values($1,$2,$3,$4)`, [need(clean(b.remessaId, 40), "Remessa inválida."), tipo, desc, ator]);
    } else if (acao === "DEVOLVER") {
      await q(`select exp_devolver($1::uuid,$2::uuid,$3::numeric,$4,$5,$6::uuid,$7)`, [need(clean(b.remessaId, 40), "Remessa inválida."), need(clean(b.produtoId, 40), "Produto inválido."), Number(b.quantidade), clean(b.destino, 12).toUpperCase(), clean(b.motivo, 500), need(clean(b.localId, 40), "Selecione o depósito."), ator]);
    } else if (acao === "PORTAL_LINK") {
      const remessaId = need(clean(b.remessaId, 40), "Remessa inválida.");
      const token = `${unidadeAtual() ?? "-"}.${randomBytes(24).toString("base64url")}`;
      await q(`update exp_portal_tokens set revogado_em=now() where remessa_id=$1 and revogado_em is null`, [remessaId]);
      await q(`insert into exp_portal_tokens(remessa_id,token_hash,expira_em,criado_por) values($1,$2,now()+interval '30 days',$3)`, [remessaId, hashToken(token), ator]);
      return NextResponse.json({ ok: true, token, caminho: `/rastreio/entrega?t=${encodeURIComponent(token)}` });
    } else if (acao === "PORTAL_REVOGAR") {
      await q(`update exp_portal_tokens set revogado_em=now() where remessa_id=$1 and revogado_em is null`, [need(clean(b.remessaId, 40), "Remessa inválida.")]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /duplicate key/.test(m) ? "Registro duplicado." : m || "Falha ao gravar." }, { status: forbidden ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
