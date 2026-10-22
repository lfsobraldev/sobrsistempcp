import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const ADMIN = ["PCP", "GERENTE"] as const;
const EHS_LEITURA = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"] as const;
const EHS_ESCRITA = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"] as const;
const PS_LEITURA = ["PCP", "GERENTE", "ENCARREGADO"] as const;
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: unknown, msg: string) => { const s = clean(v, 40); if (!isUuid(s)) throw new Error(msg); return s; };
const opt = (v: unknown, msg: string) => (clean(v, 40) ? need(v, msg) : null);
const money = (v: unknown, msg: string, allowZero = true) => { const n = Number(String(v ?? "").replace(",", ".")); if (!Number.isFinite(n) || n < 0 || n > 1e10 || (!allowZero && n === 0)) throw new Error(msg); return n; };
const date = (v: unknown, msg: string) => { const s = clean(v, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error(msg); return s; };
const optDate = (v: unknown, msg: string) => (clean(v, 10) ? date(v, msg) : null);
const comp = (v: unknown) => { const s = clean(v, 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new Error("Competência inválida (AAAA-MM)."); return s; };
const H = { "Cache-Control": "no-store" };
const erro = (e: unknown, fb: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || fb }, { status: proibido ? 403 : 400 });
};

async function unidadeGET(req: Request) {
  try {
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "rh";
    if (visao === "rh") {
      await requireRoles([...ADMIN]);
      const [cargos, colaboradores, ausencias, folha] = await Promise.all([
        q("select id,codigo,nome,nivel,ativo from rh_cargos order by nivel,nome"),
        q("select c.id,c.matricula,c.nome,c.setor,c.admissao,c.desligamento,c.salario_base::float,c.status,c.usuario_login,g.nome cargo,c.cargo_id from rh_colaboradores c left join rh_cargos g on g.id=c.cargo_id order by c.nome limit 1000"),
        q("select a.id,a.tipo,a.inicio,a.fim,a.observacao,c.nome colaborador from rh_ausencias a join rh_colaboradores c on c.id=a.colaborador_id order by a.inicio desc limit 200"),
        q("select f.competencia,count(*)::int colaboradores,sum(f.bruto)::float bruto,sum(f.desconto_faltas)::float faltas,sum(f.horas_extras)::float extras,sum(f.liquido)::float liquido,min(f.status) status from rh_folha f group by f.competencia order by f.competencia desc limit 24"),
      ]);
      return NextResponse.json({ cargos, colaboradores, ausencias, folha }, { headers: H });
    }
    if (visao === "folha") {
      await requireRoles([...ADMIN]);
      const rows = await q("select c.matricula,c.nome,f.bruto::float,f.desconto_faltas::float,f.horas_extras::float,f.outros_descontos::float,f.liquido::float,f.status from rh_folha f join rh_colaboradores c on c.id=f.colaborador_id where f.competencia=$1 order by c.nome", [comp(url.searchParams.get("competencia"))]);
      return NextResponse.json({ itens: rows }, { headers: H });
    }
    if (visao === "ehs") {
      await requireRoles([...EHS_LEITURA]);
      const [ind, ocorrencias, vencimentos, epis, treinamentos, colaboradores] = await Promise.all([
        q("select ehs_indicadores() i"),
        q("select o.id,o.numero,o.tipo,o.data,o.setor,o.gravidade,o.descricao,o.acao_corretiva,o.emitiu_cat,o.status,c.nome colaborador from ehs_ocorrencias o left join rh_colaboradores c on c.id=o.colaborador_id order by o.data desc,o.numero desc limit 200"),
        q("select tipo,colaborador,item,vence_em,dias::int from ehs_v_vencimentos order by dias limit 300"),
        q("select id,codigo,nome,ca,validade_ca,ativo from ehs_epis order by nome"),
        q("select id,nome,validade_meses,obrigatorio,ativo from ehs_treinamentos order by nome"),
        q("select id,matricula,nome from rh_colaboradores where status<>'DESLIGADO' order by nome limit 1000"),
      ]);
      return NextResponse.json({ indicadores: ind[0].i, ocorrencias, vencimentos, epis, treinamentos, colaboradores }, { headers: H });
    }
    if (visao === "projetos") {
      await requireRoles([...PS_LEITURA]);
      const id = clean(url.searchParams.get("id"), 40);
      if (id) {
        const pid = need(id, "Projeto inválido.");
        const [tarefas, custos] = await Promise.all([
          q("select id,wbs,nome,responsavel,inicio,fim,percentual,(fim<current_date and percentual<100) atrasada from ps_tarefas where projeto_id=$1::uuid order by wbs", [pid]),
          q("select id,data,descricao,valor::float from ps_custos where projeto_id=$1::uuid order by data desc", [pid]),
        ]);
        return NextResponse.json({ tarefas, custos }, { headers: H });
      }
      return NextResponse.json({ projetos: await q("select * from ps_resumo()") }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar."); }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const papeis: readonly string[] = acao.startsWith("EHS_") ? EHS_ESCRITA : acao.startsWith("PS_") ? ["PCP", "GERENTE", "ENCARREGADO"] : ADMIN;
    const user = await requireRoles([...papeis] as never);
    const ator = user.usuario;
    let resp: Record<string, unknown> = { ok: true };
    if (acao === "RH_CARGO") {
      await q("insert into rh_cargos(codigo,nome,nivel,criado_por) values($1,$2,$3,$4)", [clean(b.codigo, 30).toUpperCase(), clean(b.nome, 120), Math.min(9, Math.max(1, Math.floor(Number(b.nivel) || 1))), ator]);
    } else if (acao === "RH_COLABORADOR") {
      await q("insert into rh_colaboradores(matricula,nome,cargo_id,setor,admissao,salario_base,usuario_login,criado_por) values($1,$2,$3::uuid,$4,$5::date,$6,$7,$8)",
        [clean(b.matricula, 30), clean(b.nome, 200), opt(b.cargoId, "Cargo inválido."), clean(b.setor, 80), date(b.admissao, "Data de admissão inválida."), money(b.salarioBase, "Salário inválido."), clean(b.usuarioLogin, 160), ator]);
    } else if (acao === "RH_STATUS") {
      const st = clean(b.status, 10).toUpperCase();
      if (!["ATIVO", "FERIAS", "AFASTADO", "DESLIGADO"].includes(st)) throw new Error("Status inválido.");
      await q("update rh_colaboradores set status=$2,desligamento=case when $2='DESLIGADO' then coalesce(desligamento,current_date) else null end where id=$1::uuid", [need(b.id, "Colaborador inválido."), st]);
    } else if (acao === "RH_AUSENCIA") {
      await q("insert into rh_ausencias(colaborador_id,tipo,inicio,fim,observacao,criado_por) values($1::uuid,$2,$3::date,$4::date,$5,$6)", [need(b.colaboradorId, "Colaborador inválido."), clean(b.tipo, 10).toUpperCase(), date(b.inicio, "Início inválido."), date(b.fim, "Fim inválido."), clean(b.observacao, 300), ator]);
    } else if (acao === "RH_PONTO") {
      const h = money(b.horas, "Horas inválidas.");
      await q("insert into rh_ponto(colaborador_id,data,horas,criado_por) values($1::uuid,$2::date,$3,$4) on conflict(colaborador_id,data) do update set horas=excluded.horas", [need(b.colaboradorId, "Colaborador inválido."), date(b.data, "Data inválida."), h, ator]);
    } else if (acao === "RH_FOLHA_GERAR") {
      const [r] = await q("select rh_folha_gerar($1,$2) n", [comp(b.competencia), ator]);
      resp = { ok: true, colaboradores: Number(r.n) };
    } else if (acao === "RH_FOLHA_FECHAR") {
      await q("select rh_folha_fechar($1,$2)", [comp(b.competencia), ator]);
    } else if (acao === "EHS_OCORRENCIA") {
      await q("insert into ehs_ocorrencias(tipo,data,setor,colaborador_id,gravidade,descricao,acao_corretiva,emitiu_cat,criado_por) values($1,$2::date,$3,$4::uuid,$5,$6,$7,$8,$9)",
        [clean(b.tipo, 14).toUpperCase(), date(b.data, "Data inválida."), clean(b.setor, 80), opt(b.colaboradorId, "Colaborador inválido."), clean(b.gravidade, 8).toUpperCase() || "LEVE", clean(b.descricao, 2000), clean(b.acaoCorretiva, 2000), b.emitiuCat === true, ator]);
    } else if (acao === "EHS_OCORRENCIA_STATUS") {
      const st = clean(b.status, 12).toUpperCase();
      if (!["EM_TRATAMENTO", "ENCERRADA"].includes(st)) throw new Error("Status inválido.");
      if (st === "ENCERRADA" && !clean(b.acaoCorretiva, 2000)) throw new Error("Registre a ação corretiva para encerrar.");
      await q("update ehs_ocorrencias set status=$2,acao_corretiva=case when $3='' then acao_corretiva else $3 end,encerrada_em=case when $2='ENCERRADA' then now() end where id=$1::uuid and status<>'ENCERRADA'", [need(b.id, "Ocorrência inválida."), st, clean(b.acaoCorretiva, 2000)]);
    } else if (acao === "EHS_EPI") {
      await q("insert into ehs_epis(codigo,nome,ca,validade_ca,criado_por) values($1,$2,$3,$4::date,$5)", [clean(b.codigo, 30).toUpperCase(), clean(b.nome, 160), clean(b.ca, 20), optDate(b.validadeCa, "Validade do CA inválida."), ator]);
    } else if (acao === "EHS_EPI_ENTREGA") {
      await q("insert into ehs_epi_entregas(colaborador_id,epi_id,entregue_em,vence_em,quantidade,criado_por) values($1::uuid,$2::uuid,$3::date,$4::date,$5,$6)", [need(b.colaboradorId, "Colaborador inválido."), need(b.epiId, "EPI inválido."), date(b.entregueEm, "Data inválida."), optDate(b.venceEm, "Vencimento inválido."), Math.max(1, Math.floor(Number(b.quantidade) || 1)), ator]);
    } else if (acao === "EHS_TREINAMENTO") {
      await q("insert into ehs_treinamentos(nome,validade_meses,obrigatorio) values($1,$2,$3)", [clean(b.nome, 160), Math.max(1, Math.floor(Number(b.validadeMeses) || 12)), b.obrigatorio === true]);
    } else if (acao === "EHS_TREINAMENTO_REGISTRO") {
      await q("select ehs_registrar_treinamento($1::uuid,$2::uuid,$3::date,$4)", [need(b.colaboradorId, "Colaborador inválido."), need(b.treinamentoId, "Treinamento inválido."), date(b.data, "Data inválida."), ator]);
    } else if (acao === "PS_PROJETO") {
      await q("insert into ps_projetos(codigo,nome,responsavel,pedido,inicio,fim_previsto,orcamento,criado_por) values($1,$2,$3,$4,$5::date,$6::date,$7,$8)", [clean(b.codigo, 30).toUpperCase(), clean(b.nome, 200), clean(b.responsavel, 160), clean(b.pedido, 60), date(b.inicio, "Início inválido."), date(b.fimPrevisto, "Fim previsto inválido."), money(b.orcamento, "Orçamento inválido."), ator]);
    } else if (acao === "PS_STATUS") {
      const st = clean(b.status, 12).toUpperCase();
      if (!["PLANEJADO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"].includes(st)) throw new Error("Status inválido.");
      await q("update ps_projetos set status=$2 where id=$1::uuid", [need(b.id, "Projeto inválido."), st]);
    } else if (acao === "PS_TAREFA") {
      await q("insert into ps_tarefas(projeto_id,wbs,nome,responsavel,inicio,fim,predecessora_id,criado_por) values($1::uuid,$2,$3,$4,$5::date,$6::date,$7::uuid,$8)", [need(b.projetoId, "Projeto inválido."), clean(b.wbs, 30), clean(b.nome, 200), clean(b.responsavel, 160), date(b.inicio, "Início inválido."), date(b.fim, "Fim inválido."), opt(b.predecessoraId, "Predecessora inválida."), ator]);
    } else if (acao === "PS_TAREFA_PERCENTUAL") {
      const p = Math.floor(Number(b.percentual));
      if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error("Percentual inválido.");
      await q("update ps_tarefas set percentual=$2 where id=$1::uuid", [need(b.id, "Tarefa inválida."), p]);
    } else if (acao === "PS_CUSTO") {
      await q("insert into ps_custos(projeto_id,data,descricao,valor,criado_por) values($1::uuid,$2::date,$3,$4,$5)", [need(b.projetoId, "Projeto inválido."), date(b.data, "Data inválida."), clean(b.descricao, 300), money(b.valor, "Valor inválido.", false), ator]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json(resp, { headers: H });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/duplicate key/.test(m)) return NextResponse.json({ error: "Registro já existe (código/matrícula duplicado)." }, { status: 409 });
    if (/violates check constraint/.test(m)) return NextResponse.json({ error: "Dados inválidos para este cadastro." }, { status: 400 });
    return erro(e, "Falha ao gravar.");
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
