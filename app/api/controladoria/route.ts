import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { q, clean, need, dec, H, erro } from "@/lib/api-util";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE"] as const;
const WRITE = ["GERENTE"] as const;
const PRIV = ["GERENTE", "PCP"] as const;

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "periodos";
    if (visao === "periodos") {
      const [periodos, hist] = await Promise.all([
        q("select competencia,status,fechado_por,fechado_em,observacao from fin_periodos order by competencia desc limit 36"),
        q("select competencia,acao,motivo,ator,em from fin_periodo_historico order by id desc limit 50"),
      ]);
      return NextResponse.json({ periodos, hist }, { headers: H });
    }
    if (visao === "rateio") {
      const [centros, regras, apur] = await Promise.all([
        q("select id,codigo,nome from fin_centros_custo where ativo order by codigo"),
        q("select r.origem_id,r.destino_id,r.percentual::float,o.codigo origem,d.codigo destino from fin_rateio_regras r join fin_centros_custo o on o.id=r.origem_id join fin_centros_custo d on d.id=r.destino_id order by o.codigo,d.codigo"),
        q("select a.competencia,o.codigo origem,d.codigo destino,a.valor_origem::float,a.percentual::float,a.valor::float from fin_rateio_apuracoes a join fin_centros_custo o on o.id=a.origem_id join fin_centros_custo d on d.id=a.destino_id order by a.competencia desc,o.codigo,d.codigo limit 200"),
      ]);
      return NextResponse.json({ centros, regras, apur }, { headers: H });
    }
    if (visao === "margem") {
      const [pedidos, clientes] = await Promise.all([
        q("select numero,pedido_pcp,cliente,status,receita::float,custo_material::float,comissao::float,margem::float,margem_pct::float from fin_v_margem_pedido_calc order by numero desc limit 300"),
        q("select cliente,pedidos,receita::float,custo::float,comissao::float,margem::float,margem_pct::float from fin_v_margem_cliente order by receita desc limit 200"),
      ]);
      return NextResponse.json({ pedidos, clientes }, { headers: H });
    }
    if (visao === "conciliacao") {
      const contas = await q("select id,nome from fin_contas_bancarias where ativo order by nome");
      const cid = url.searchParams.get("conta");
      const sug = cid ? await q("select extrato_id,extrato_data,extrato_desc,valor::float,titulo_id,titulo_numero::int,parceiro,vencimento,dias from fin_conciliar_sugestoes($1::uuid,7)", [need(cid, "Conta inválida.")]) : [];
      return NextResponse.json({ contas, sugestoes: sug }, { headers: H });
    }
    if (visao === "fiscal") {
      const [p] = await q("select fis_prontidao() p");
      return NextResponse.json({ checklist: p.p }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar a controladoria."); }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const user = await requireRoles([...(acao === "CONCILIAR" ? PRIV : WRITE)]);
    if (acao === "FECHAR") {
      const [r] = await q("select fin_periodo_fechar($1,$2,$3) r", [clean(b.competencia, 7), clean(b.obs, 500), user.usuario]);
      return NextResponse.json({ ok: true, resumo: r.r }, { headers: H });
    } else if (acao === "REABRIR") {
      await q("select fin_periodo_reabrir($1,$2,$3)", [clean(b.competencia, 7), clean(b.motivo, 500), user.usuario]);
    } else if (acao === "RATEIO_SALVAR") {
      const destinos = Array.isArray(b.destinos) ? b.destinos.slice(0, 50).map((d: any) => ({ destino: need(d.destino, "Destino inválido."), percentual: dec(d.percentual, "Percentual inválido.", 0.0001, 100) })) : [];
      await q("select fin_rateio_salvar($1::uuid,$2::jsonb,$3)", [need(b.origemId, "Origem inválida."), JSON.stringify(destinos), user.usuario]);
    } else if (acao === "RATEIO_APURAR") {
      const [r] = await q("select fin_rateio_apurar($1,$2) n", [clean(b.competencia, 7), user.usuario]);
      return NextResponse.json({ ok: true, linhas: r.n }, { headers: H });
    } else if (acao === "CONCILIAR") {
      await q("select fin_conciliar($1::uuid,$2::uuid,$3)", [need(b.extratoId, "Linha inválida."), need(b.tituloId, "Título inválido."), user.usuario]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: H });
  } catch (e) { return erro(e, "Falha ao gravar."); }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
