import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { q, clean, need, dec, dia, H, erro } from "@/lib/api-util";

export const runtime = "nodejs";
const RH = ["PCP", "GERENTE"] as const;
const EHS = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"] as const;
const PS = ["PCP", "GERENTE", "ENCARREGADO"] as const;

async function unidadeGET(req: Request) {
  try {
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "banco";
    if (visao === "banco") {
      await requireRoles([...RH]);
      const [banco, ferias] = await Promise.all([
        q("select colaborador_id,matricula,nome,setor,round(saldo_ponto+lancamentos,2)::float saldo from rh_v_banco_horas order by nome limit 500"),
        q("select colaborador_id,matricula,nome,ciclo,aquisitivo_fim,concessivo_limite,saldo_dias::int,dias_para_vencer::int from rh_v_ferias_saldo where saldo_dias>0 order by concessivo_limite limit 500"),
      ]);
      return NextResponse.json({ banco, ferias }, { headers: H });
    }
    if (visao === "custo") {
      await requireRoles([...RH]);
      const colab = await q("select id,matricula,nome,cargo,setor,status,usuario_login,salario_base::float,custo_hora::float,login_a_desativar from rh_v_colaborador_custo order by nome limit 1000");
      return NextResponse.json({ colaboradores: colab }, { headers: H });
    }
    if (visao === "inspecoes") {
      await requireRoles([...EHS]);
      const insp = await q("select id,numero,tipo,setor,data,total::int,nao_conformes::int,ocorrencia_id from ehs_inspecoes order by numero desc limit 100");
      const acidentes = await q("select id,numero,data,gravidade,descricao,cat_numero,cat_data,status from ehs_ocorrencias where tipo='ACIDENTE' order by data desc limit 50");
      return NextResponse.json({ inspecoes: insp, acidentes }, { headers: H });
    }
    if (visao === "cronograma") {
      await requireRoles([...PS]);
      const pid = url.searchParams.get("id");
      if (!pid) return NextResponse.json({ projetos: await q("select id,codigo,nome from ps_projetos where status in('PLANEJADO','EM_ANDAMENTO') order by codigo"), colaboradores: await q("select id,nome from rh_colaboradores where status<>'DESLIGADO' order by nome limit 500").catch(() => []) }, { headers: H });
      const id = need(pid, "Projeto inválido.");
      const [tarefas, deps, critico] = await Promise.all([
        q("select id,wbs,nome,inicio,fim,percentual from ps_tarefas where projeto_id=$1::uuid order by wbs", [id]),
        q("select d.tarefa_id,d.predecessora_id,d.folga_dias::int from ps_tarefa_dependencias d join ps_tarefas t on t.id=d.tarefa_id where t.projeto_id=$1::uuid", [id]),
        q("select ordem,wbs,nome,inicio,fim,dias from ps_caminho_critico($1::uuid)", [id]),
      ]);
      return NextResponse.json({ tarefas, deps, critico }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar."); }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const papeis: readonly string[] = acao.startsWith("EHS_") ? EHS : acao.startsWith("PS_") ? PS : RH;
    const user = await requireRoles([...papeis] as never);
    let resp: Record<string, unknown> = { ok: true };
    if (acao === "BANCO_LANCAR") {
      const [r] = await q("select rh_banco_lancar($1::uuid,$2::date,$3::numeric,$4,$5,$6) s", [need(b.colaboradorId, "Colaborador inválido."), dia(b.data, "Data inválida."), dec(b.horas, "Horas inválidas.", -240, 240), clean(b.tipo, 12).toUpperCase(), clean(b.motivo, 300), user.usuario]);
      resp = { ok: true, saldo: Number(r.s) };
    } else if (acao === "EHS_INSPECAO") {
      const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 100).map((i: any) => ({ item: clean(i.item, 120), conforme: i.conforme === true, obs: clean(i.obs, 300) }));
      if (!itens.length) throw new Error("Informe ao menos um item.");
      const [r] = await q("select ehs_inspecao_registrar($1,$2,$3::date,$4::jsonb,$5) id", [clean(b.tipo, 14).toUpperCase(), clean(b.setor, 80), dia(b.data, "Data inválida."), JSON.stringify(itens), user.usuario]);
      resp = { ok: true, id: r.id };
    } else if (acao === "EHS_CAT") {
      await q("update ehs_ocorrencias set cat_numero=$2,cat_data=$3::date,emitiu_cat=true where id=$1::uuid and tipo='ACIDENTE'", [need(b.id, "Ocorrência inválida."), clean(b.numero, 40), dia(b.data, "Data inválida.")]);
    } else if (acao === "PS_APONTAR_HORAS") {
      const [r] = await q("select ps_apontar_horas($1::uuid,$2::uuid,$3::numeric,$4::date,$5) v", [need(b.projetoId, "Projeto inválido."), need(b.colaboradorId, "Colaborador inválido."), dec(b.horas, "Horas inválidas.", 0.1, 24), dia(b.data, "Data inválida."), user.usuario]);
      resp = { ok: true, valor: Number(r.v) };
    } else if (acao === "PS_DEPENDENCIA") {
      await q("insert into ps_tarefa_dependencias(tarefa_id,predecessora_id,folga_dias) values($1::uuid,$2::uuid,$3) on conflict(tarefa_id,predecessora_id) do update set folga_dias=excluded.folga_dias", [need(b.tarefaId, "Tarefa inválida."), need(b.predecessoraId, "Predecessora inválida."), Math.max(0, Math.min(365, Math.floor(Number(b.folga) || 0)))]);
    } else if (acao === "PS_DEPENDENCIA_REMOVER") {
      await q("delete from ps_tarefa_dependencias where tarefa_id=$1::uuid and predecessora_id=$2::uuid", [need(b.tarefaId, "Tarefa inválida."), need(b.predecessoraId, "Predecessora inválida.")]);
    } else if (acao === "PS_REPROGRAMAR") {
      await q("select ps_reprogramar($1::uuid,$2::date,$3)", [need(b.tarefaId, "Tarefa inválida."), dia(b.inicio, "Data inválida."), user.usuario]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json(resp, { headers: H });
  } catch (e) { return erro(e, "Falha ao gravar."); }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
