import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { criarChavePedidoSeguro, diffEvento, type PedidoCarteira } from "@/lib/carteira";

export const runtime = "nodejs";
const ROLES = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL", "LOGISTICA"] as const;

type Db = ReturnType<typeof sql>;
async function existe(db: Db, tabela: string) {
  const r = await db`select to_regclass(${"public." + tabela}) as n`;
  return r[0]?.n != null;
}
async function existeColuna(db: Db, tabela: string, coluna: string) {
  const rows = await db`select exists(
    select 1 from information_schema.columns where table_schema='public' and table_name=${tabela} and column_name=${coluna}
  ) as existe`;
  return Boolean(rows[0]?.existe);
}
const dt = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function programacao(db: Db, id: string) {
  const rows = id
    ? await db`select id,filtro from pcp_programacoes where id=${id} limit 1`
    : await db`select id,filtro from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  return rows[0] as { id: string; filtro: string } | undefined;
}

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...ROLES]);
    const url = new URL(req.url);
    const db = sql();
    const prog = await programacao(db, url.searchParams.get("programacaoId")?.trim() || "");
    const [tCtl, tPed, tRom, tCar, tSac, tEv, tEt] = await Promise.all(
      ["pcp_controle_entregas", "pcp_pedido_controle", "pcp_romaneios_preparados", "pcp_controle_entregas_carregamentos", "pcp_sac_atendimentos", "pcp_controle_entregas_eventos", "pcp_controle_entregas_etapas"].map((t) => existe(db, t)),
    );
    const tCrmLink = tCtl && await existeColuna(db, "pcp_controle_entregas", "crm_cliente_id") && await existe(db, "crm_clientes");
    const headers = { "Cache-Control": "no-store" };

    // ---------- Visão por produto (saldos por produto, somente pedidos ainda não entregues) ----------
    if (url.searchParams.get("visao") === "produtos") {
      if (!prog) return NextResponse.json({ programacaoId: "", filtro: "", produtos: [] }, { headers });
      const rows = tCtl ? await db`
        select p.produto, max(p.descricao) descricao, max(p.categoria) categoria,
          count(distinct p.pedido)::int pedidos, coalesce(sum(p.quantidade),0) solicitada,
          coalesce(sum(case when p.percentual_produto>=100 then p.quantidade else 0 end),0) concluida,
          coalesce(sum(p.quantidade*p.percentual_produto/100.0),0) equivalente
        from pcp_produtos p
        where p.programacao_id=${prog.id}
          and not exists(select 1 from pcp_controle_entregas c where c.pedido=p.pedido and c.status='ENTREGUE')
        group by p.produto order by coalesce(sum(p.quantidade-(p.quantidade*p.percentual_produto/100.0)),0) desc limit 1000` : await db`
        select p.produto, max(p.descricao) descricao, max(p.categoria) categoria,
          count(distinct p.pedido)::int pedidos, coalesce(sum(p.quantidade),0) solicitada,
          coalesce(sum(case when p.percentual_produto>=100 then p.quantidade else 0 end),0) concluida,
          coalesce(sum(p.quantidade*p.percentual_produto/100.0),0) equivalente
        from pcp_produtos p
        where p.programacao_id=${prog.id}
        group by p.produto order by coalesce(sum(p.quantidade-(p.quantidade*p.percentual_produto/100.0)),0) desc limit 1000`;
      return NextResponse.json({
        programacaoId: String(prog.id), filtro: String(prog.filtro || ""),
        produtos: rows.map((r: any) => ({ produto: r.produto, descricao: r.descricao, categoria: r.categoria, pedidos: r.pedidos, solicitada: num(r.solicitada), concluida: num(r.concluida), pendenteEquivalente: Math.max(0, num(r.solicitada) - num(r.equivalente)) })),
      }, { headers });
    }

    // ---------- Detalhe de um pedido ----------
    const pedidoDet = url.searchParams.get("pedido")?.trim();
    if (pedidoDet) {
      const itens = prog ? await db`
        select item,produto,descricao,tipo,cor,quantidade,of,percentual_produto,prioridade
        from pcp_produtos where programacao_id=${prog.id} and pedido=${pedidoDet}
        order by case when item ~ '^[0-9]{1,9}$' then item::int end nulls last, item, of` : [];
      const cargas = tCar ? await db`select id,romaneio,quantidade,volume_m3,nota_fiscal,transportadora,data_saida::text data_saida,data_entrega::text data_entrega,status,usuario,criado_em from pcp_controle_entregas_carregamentos where pedido=${pedidoDet} order by criado_em desc` : [];
      const ev = tEv ? await db`select acao,anterior,atual,usuario,criado_em from pcp_controle_entregas_eventos where pedido=${pedidoDet} order by criado_em desc limit 100` : [];
      const etapas = tEt ? await db`select area,etapa,data_inicio::text data_inicio,data_conclusao::text data_conclusao,status,observacao,usuario,atualizado_em from pcp_controle_entregas_etapas where pedido=${pedidoDet} and (${prog ? String(prog.id) : ""}='' or programacao_id::text=${prog ? String(prog.id) : ""} or programacao_id is null) order by area,etapa` : [];
      const sac = tSac ? await db`select id,protocolo,assunto,tipo,status,prioridade,responsavel,prazo::text prazo from pcp_sac_atendimentos where ltrim(trim(pedido),'0')=ltrim(${pedidoDet},'0') order by criado_em desc limit 50` : [];
      return NextResponse.json({
        itens: itens.map((i: any) => {
          const q = num(i.quantidade), pct = Math.min(100, Math.max(0, num(i.percentual_produto)));
          return { item: i.item, produto: i.produto, descricao: i.descricao, tipo: i.tipo, cor: i.cor, of: i.of, quantidade: q, avancoPct: pct, concluida: pct >= 100 ? q : 0, pendenteEquivalente: Number((q * (100 - pct) / 100).toFixed(1)), prioridade: i.prioridade };
        }),
        cargas: cargas.map((c: any) => ({ ...c, quantidade: num(c.quantidade), volume_m3: c.volume_m3 === null ? null : num(c.volume_m3) })),
        historico: ev.map((e: any) => ({ acao: e.acao, usuario: e.usuario, criadoEm: e.criado_em, alteracoes: diffEvento(e.anterior, e.atual), detalhe: e.acao.startsWith("CARREGAMENTO") ? e.atual : null })),
        etapas, sac,
      }, { headers });
    }

    // ---------- Lista da carteira ----------
    const pcp = prog && tCrmLink ? await db`
      select p.pedido, count(*)::int linhas, count(distinct nullif(p.of,''))::int ofs,
        coalesce(sum(p.quantidade),0) pecas,
        coalesce(sum(case when p.percentual_produto>=100 then p.quantidade else 0 end),0) concluidas,
        coalesce(sum(p.quantidade*p.percentual_produto)/nullif(sum(p.quantidade),0),0) avanco,
        coalesce(nullif(max(nullif(trim(cc.nome_fantasia),'')),''),nullif(max(trim(cc.razao_social)),''),nullif(max(trim(p.pedido_cliente)),''),'') cliente_pcp
      from pcp_produtos p left join pcp_controle_entregas c on c.pedido=p.pedido
      left join crm_clientes cc on cc.id=c.crm_cliente_id
      where p.programacao_id=${prog.id} group by p.pedido` : prog ? await db`
      select p.pedido, count(*)::int linhas, count(distinct nullif(p.of,''))::int ofs,
        coalesce(sum(p.quantidade),0) pecas,
        coalesce(sum(case when p.percentual_produto>=100 then p.quantidade else 0 end),0) concluidas,
        coalesce(sum(p.quantidade*p.percentual_produto)/nullif(sum(p.quantidade),0),0) avanco,
        coalesce(nullif(max(trim(p.pedido_cliente)),''),'') cliente_pcp
      from pcp_produtos p where p.programacao_id=${prog.id} group by p.pedido` : [];
    const prazosPcp = prog && tPed ? await db`select pedido,cliente,data_entrega::text data_entrega,atualizado_por,atualizado_em from pcp_pedido_controle where programacao_id=${prog.id}` : [];
    const rom = prog && tRom ? await db`select pedido,max(nullif(trim(cliente),'')) cliente from pcp_romaneios_preparados where programacao_id=${prog.id} group by pedido` : [];
    const ctl = tCtl && tCrmLink ? await db`select c.pedido,c.cliente,c.representante,c.crm_cliente_id,
      coalesce(nullif(cc.nome_fantasia,''),cc.razao_social) crm_cliente_nome,
      c.uf,c.cidade,c.status,c.previsao_informada::text previsao_informada,c.previsao_entrega::text previsao_entrega,
      c.data_entrega::text data_entrega,c.data_saida::text data_saida,c.transportadora,c.nota_fiscal,c.atualizado_por,c.atualizado_em
      from pcp_controle_entregas c left join crm_clientes cc on cc.id=c.crm_cliente_id` : tCtl ? await db`
      select pedido,cliente,representante,uf,cidade,status,previsao_informada::text previsao_informada,previsao_entrega::text previsao_entrega,data_entrega::text data_entrega,data_saida::text data_saida,transportadora,nota_fiscal,atualizado_por,atualizado_em from pcp_controle_entregas` : [];
    const cargas = tCar ? await db`select pedido,quantidade,status from pcp_controle_entregas_carregamentos where status<>'CANCELADO'` : [];
    const sac = tSac ? await db`select trim(pedido) pedido, count(*)::int n from pcp_sac_atendimentos where trim(pedido)<>'' and status not in ('CONCLUIDO','CANCELADO') group by trim(pedido)` : [];

    const key = criarChavePedidoSeguro([
      ...pcp.map((item: any) => item.pedido), ...ctl.map((item: any) => item.pedido),
      ...prazosPcp.map((item: any) => item.pedido), ...rom.map((item: any) => item.pedido),
      ...(cargas as any[]).map((item) => item.pedido), ...(sac as any[]).map((item) => item.pedido),
    ]);
    const mCtl = new Map<string, any>(ctl.map((c: any) => [key(c.pedido), c]));
    const mPed = new Map<string, any>(prazosPcp.map((c: any) => [key(c.pedido), c]));
    const mRom = new Map<string, any>(rom.map((c: any) => [key(c.pedido), c]));
    const mCar = new Map<string, { quantidade: number; status: string }[]>();
    for (const c of cargas as any[]) { const k = key(c.pedido); if (!mCar.has(k)) mCar.set(k, []); mCar.get(k)!.push({ quantidade: num(c.quantidade), status: String(c.status) }); }
    const mSac = new Map<string, number>(sac.map((s: any) => [key(s.pedido), num(s.n)]));
    const mPcp = new Map<string, any>(pcp.map((p: any) => [key(p.pedido), p]));

    const chaves = new Set<string>([...mPcp.keys(), ...mCtl.keys()]);
    const itens: PedidoCarteira[] = [];
    for (const k of chaves) {
      const p = mPcp.get(k), c = mCtl.get(k), pc = mPed.get(k), r = mRom.get(k);
      const original = String(p?.pedido ?? c?.pedido ?? k);
      itens.push({
        pedido: original,
        cliente: String(p?.cliente_pcp || r?.cliente || pc?.cliente || c?.crm_cliente_nome || c?.cliente || "").trim(),
        representante: String(c?.representante || ""), uf: String(c?.uf || ""), cidade: String(c?.cidade || ""),
        pecas: p ? num(p.pecas) : null, linhas: p ? p.linhas : 0, ofs: p ? p.ofs : 0,
        pecasConcluidas: p ? num(p.concluidas) : 0, avancoPct: p ? num(p.avanco) : 0,
        foraDaProgramacao: !p,
        statusEntrega: String(c?.status || "PLANEJADO"),
        previsaoInformada: dt(c?.previsao_informada), prazoPcp: dt(pc?.data_entrega), previsaoEntrega: dt(c?.previsao_entrega),
        dataEntrega: dt(c?.data_entrega), dataSaida: dt(c?.data_saida),
        transportadora: String(c?.transportadora || ""), notaFiscal: String(c?.nota_fiscal || ""),
        atualizadoPor: String(c?.atualizado_por || pc?.atualizado_por || ""),
        atualizadoEm: c?.atualizado_em ? new Date(c.atualizado_em).toISOString() : pc?.atualizado_em ? new Date(pc.atualizado_em).toISOString() : null,
        cargas: mCar.get(k) || [], sacAbertos: mSac.get(k) || 0,
      });
    }
    return NextResponse.json({
      programacaoId: prog ? String(prog.id) : "", filtro: prog ? String(prog.filtro || "") : "",
      fontes: { controleEntregas: tCtl, prazosPcp: tPed, remessas: tCar, sac: tSac, estoque: false },
      pedidos: itens,
    }, { headers });
  } catch (e: any) {
    const forb = e?.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forb ? "Sem permissão." : e?.message || "Falha ao consultar a carteira." }, { status: forb ? 403 : 500 });
  }
}

export const GET = unidadeHandler(unidadeGET);
