"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "RH" | "EHS" | "PROJETOS";
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const post = (b: Row) => api("/api/corporativo", b);

export default function CorporativoPage() {
  const { me } = useOps();
  const perfil = me?.perfil || "";
  const veRH = ["PCP", "GERENTE"].includes(perfil);
  const veEHS = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"].includes(perfil);
  const veProj = ["PCP", "GERENTE", "ENCARREGADO"].includes(perfil);
  const abas: Array<{ value: Aba; label: string }> = [...(veRH ? [{ value: "RH" as Aba, label: "RH e folha" }] : []), ...(veEHS ? [{ value: "EHS" as Aba, label: "Segurança (EHS)" }] : []), ...(veProj ? [{ value: "PROJETOS" as Aba, label: "Projetos" }] : [])];
  const [aba, setAba] = useState<Aba>("EHS");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [rh, setRh] = useState<Row | null>(null); const [ehs, setEhs] = useState<Row | null>(null); const [ps, setPs] = useState<Row[] | null>(null);
  const [proj, setProj] = useState<{ p: Row; tarefas: Row[]; custos: Row[] } | null>(null);
  const [folhaDet, setFolhaDet] = useState<{ comp: string; itens: Row[] } | null>(null);
  const [f, setF] = useState<Row>({});
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { if (abas.length && !abas.some((a) => a.value === aba)) setAba(abas[0].value); }, [abas.length, perfil]); // eslint-disable-line react-hooks/exhaustive-deps
  const carregar = useCallback(async () => {
    try {
      if (aba === "RH" && veRH) setRh(await api("/api/corporativo?visao=rh"));
      if (aba === "EHS" && veEHS) setEhs(await api("/api/corporativo?visao=ehs"));
      if (aba === "PROJETOS" && veProj) setPs((await api("/api/corporativo?visao=projetos")).projetos);
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, [aba, veRH, veEHS, veProj]);
  useEffect(() => { if (me) void carregar(); }, [carregar, me]);
  const run = async (fn: () => Promise<unknown>, msg: string, depois?: () => Promise<void>) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); if (depois) await depois(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const abrirProj = async (p: Row) => { try { const d = await api("/api/corporativo?visao=projetos&id=" + p.id); setProj({ p, ...d }); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };

  return (
    <>
      <PageHeader eyebrow="Pessoas, segurança e projetos" title="RH, EHS e Projetos" description="Cadastro de colaboradores e folha gerencial, ocorrências, EPI e treinamentos, e acompanhamento de projetos com orçamento e cronograma." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      {abas.length > 0 && <Segmented value={aba} onChange={(v) => { setAba(v as Aba); setF({}); }} options={abas} />}

      {aba === "RH" && rh && (<>
        <div className="kpis">
          <Kpi label="Colaboradores ativos" value={rh.colaboradores.filter((c: Row) => c.status === "ATIVO").length} />
          <Kpi label="Em férias / afastados" value={rh.colaboradores.filter((c: Row) => ["FERIAS", "AFASTADO"].includes(c.status)).length} />
          <Kpi label="Cargos" value={rh.cargos.length} />
        </div>
        <Panel title="Cargos">
          <div className="formGrid">
            <Field label="Código"><input value={f.cCodigo || ""} onChange={(e) => set("cCodigo", e.target.value)} /></Field>
            <Field label="Nome"><input value={f.cNome || ""} onChange={(e) => set("cNome", e.target.value)} /></Field>
            <Field label="Nível hierárquico (1-9)" hint="9 = diretoria"><input inputMode="numeric" value={f.cNivel || ""} onChange={(e) => set("cNivel", e.target.value)} /></Field>
            <button className="primary" disabled={busy || !f.cCodigo || !f.cNome} onClick={() => run(async () => { await post({ acao: "RH_CARGO", codigo: f.cCodigo, nome: f.cNome, nivel: f.cNivel }); set("cCodigo", ""); set("cNome", ""); }, "Cargo criado.")}>Criar cargo</button>
          </div>
          <DataTable head={["Código", "Cargo", "Nível"]} empty={!rh.cargos.length && <Empty title="Sem cargos" />}>{rh.cargos.map((c: Row) => <tr key={c.id}><td>{c.codigo}</td><td>{c.nome}</td><td>{c.nivel}</td></tr>)}</DataTable>
        </Panel>
        <Panel title="Colaboradores">
          <div className="formGrid">
            <Field label="Matrícula *"><input value={f.matricula || ""} onChange={(e) => set("matricula", e.target.value)} /></Field>
            <Field label="Nome *"><input value={f.nome || ""} onChange={(e) => set("nome", e.target.value)} /></Field>
            <Field label="Cargo"><select value={f.cargoId || ""} onChange={(e) => set("cargoId", e.target.value)}><option value="">—</option>{rh.cargos.map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Setor"><input value={f.setor || ""} onChange={(e) => set("setor", e.target.value)} /></Field>
            <Field label="Admissão *"><input type="date" value={f.admissao || ""} onChange={(e) => set("admissao", e.target.value)} /></Field>
            <Field label="Salário base (R$)"><input inputMode="decimal" value={f.salario || ""} onChange={(e) => set("salario", e.target.value)} /></Field>
            <Field label="Login no ERP"><input value={f.login || ""} onChange={(e) => set("login", e.target.value)} /></Field>
            <button className="primary" disabled={busy || !f.matricula || !f.nome || !f.admissao} onClick={() => run(async () => { await post({ acao: "RH_COLABORADOR", matricula: f.matricula, nome: f.nome, cargoId: f.cargoId, setor: f.setor, admissao: f.admissao, salarioBase: f.salario || 0, usuarioLogin: f.login }); setF({}); }, "Colaborador cadastrado.")}>Cadastrar</button>
          </div>
          <DataTable head={["Matrícula", "Nome", "Cargo", "Setor", "Admissão", "Salário", "Status"]} empty={!rh.colaboradores.length && <Empty title="Sem colaboradores" />}>
            {rh.colaboradores.map((c: Row) => <tr key={c.id}><td>{c.matricula}</td><td>{c.nome}</td><td>{c.cargo || "—"}</td><td>{c.setor}</td><td>{dataPt(c.admissao)}</td><td>{brl(c.salario_base)}</td>
              <td><select value={c.status} onChange={(e) => run(() => post({ acao: "RH_STATUS", id: c.id, status: e.target.value }), "Status atualizado.")}>{["ATIVO", "FERIAS", "AFASTADO", "DESLIGADO"].map((s) => <option key={s}>{s}</option>)}</select></td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Ausências e ponto">
          <div className="formGrid">
            <Field label="Colaborador"><select value={f.aCol || ""} onChange={(e) => set("aCol", e.target.value)}><option value="">Selecione</option>{rh.colaboradores.filter((c: Row) => c.status !== "DESLIGADO").map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Tipo"><select value={f.aTipo || "FALTA"} onChange={(e) => set("aTipo", e.target.value)}>{["FALTA", "ATESTADO", "FERIAS", "LICENCA"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Início"><input type="date" value={f.aIni || ""} onChange={(e) => set("aIni", e.target.value)} /></Field>
            <Field label="Fim"><input type="date" value={f.aFim || ""} onChange={(e) => set("aFim", e.target.value)} /></Field>
            <button disabled={busy || !f.aCol || !f.aIni || !f.aFim} onClick={() => run(() => post({ acao: "RH_AUSENCIA", colaboradorId: f.aCol, tipo: f.aTipo || "FALTA", inicio: f.aIni, fim: f.aFim }), "Ausência registrada.")}>Registrar ausência</button>
          </div>
          <div className="formGrid">
            <Field label="Colaborador"><select value={f.pCol || ""} onChange={(e) => set("pCol", e.target.value)}><option value="">Selecione</option>{rh.colaboradores.filter((c: Row) => c.status !== "DESLIGADO").map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Data"><input type="date" value={f.pData || hoje()} onChange={(e) => set("pData", e.target.value)} /></Field>
            <Field label="Horas trabalhadas"><input inputMode="decimal" value={f.pHoras || ""} onChange={(e) => set("pHoras", e.target.value)} /></Field>
            <button disabled={busy || !f.pCol || !f.pHoras} onClick={() => run(() => post({ acao: "RH_PONTO", colaboradorId: f.pCol, data: f.pData || hoje(), horas: f.pHoras }), "Ponto lançado.")}>Lançar ponto</button>
          </div>
          <DataTable head={["Colaborador", "Tipo", "Início", "Fim"]} empty={!rh.ausencias.length && <Empty title="Sem ausências" />}>{rh.ausencias.map((a: Row) => <tr key={a.id}><td>{a.colaborador}</td><td>{a.tipo}</td><td>{dataPt(a.inicio)}</td><td>{dataPt(a.fim)}</td></tr>)}</DataTable>
        </Panel>
        <Panel title="Folha gerencial" subtitle="Salário − faltas (dias/30) + horas extras (50%). Apoio à gestão; não substitui o eSocial nem o cálculo de INSS/IRRF.">
          <div className="formGrid">
            <Field label="Competência"><input type="month" value={f.comp || ""} onChange={(e) => set("comp", e.target.value)} /></Field>
            <button className="primary" disabled={busy || !f.comp} onClick={() => run(() => post({ acao: "RH_FOLHA_GERAR", competencia: f.comp }), "Folha gerada.")}>Gerar / recalcular</button>
            <button disabled={busy || !f.comp} onClick={() => { if (window.confirm("Fechar a competência? Não poderá ser recalculada.")) void run(() => post({ acao: "RH_FOLHA_FECHAR", competencia: f.comp }), "Competência fechada."); }}>Fechar competência</button>
          </div>
          <DataTable head={["Competência", "Colaboradores", "Bruto", "Faltas", "Extras", "Líquido", "Status", ""]} empty={!rh.folha.length && <Empty title="Nenhuma folha gerada" />}>
            {rh.folha.map((r: Row) => <tr key={r.competencia}><td>{r.competencia}</td><td>{r.colaboradores}</td><td>{brl(r.bruto)}</td><td>{brl(r.faltas)}</td><td>{brl(r.extras)}</td><td><b>{brl(r.liquido)}</b></td><td><Badge tone={r.status === "FECHADA" ? "success" : "warning"}>{r.status}</Badge></td>
              <td><button onClick={async () => setFolhaDet({ comp: r.competencia, itens: (await api("/api/corporativo?visao=folha&competencia=" + r.competencia)).itens })}>Detalhar</button></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "EHS" && ehs && (<>
        <div className="kpis">
          <Kpi label="Dias sem acidente" value={ehs.indicadores.diasSemAcidente} tone="success" />
          <Kpi label="Acidentes no ano" value={ehs.indicadores.acidentesAno} tone={ehs.indicadores.acidentesAno ? "danger" : "success"} />
          <Kpi label="Quase-acidentes no ano" value={ehs.indicadores.quaseAcidentesAno} />
          <Kpi label="Ocorrências abertas" value={ehs.indicadores.abertas} tone={ehs.indicadores.abertas ? "warn" : "success"} />
          <Kpi label="EPI/treinamento vencidos" value={ehs.indicadores.vencidos} tone={ehs.indicadores.vencidos ? "danger" : "success"} sub={`${ehs.indicadores.aVencer30} a vencer em 30 dias`} />
        </div>
        <Panel title="Registrar ocorrência">
          <div className="formGrid">
            <Field label="Tipo"><select value={f.oTipo || "QUASE_ACIDENTE"} onChange={(e) => set("oTipo", e.target.value)}>{["ACIDENTE", "QUASE_ACIDENTE", "INCIDENTE", "AMBIENTAL"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Data"><input type="date" value={f.oData || hoje()} onChange={(e) => set("oData", e.target.value)} /></Field>
            <Field label="Setor"><input value={f.oSetor || ""} onChange={(e) => set("oSetor", e.target.value)} /></Field>
            <Field label="Colaborador"><select value={f.oCol || ""} onChange={(e) => set("oCol", e.target.value)}><option value="">—</option>{ehs.colaboradores.map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Gravidade"><select value={f.oGrav || "LEVE"} onChange={(e) => set("oGrav", e.target.value)}>{["LEVE", "MODERADA", "GRAVE"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Descrição *" className="wide"><input value={f.oDesc || ""} onChange={(e) => set("oDesc", e.target.value)} /></Field>
            <label><input type="checkbox" checked={!!f.oCat} onChange={(e) => set("oCat", e.target.checked)} /> Emitiu CAT</label>
            <button className="primary" disabled={busy || !f.oDesc} onClick={() => run(async () => { await post({ acao: "EHS_OCORRENCIA", tipo: f.oTipo || "QUASE_ACIDENTE", data: f.oData || hoje(), setor: f.oSetor, colaboradorId: f.oCol, gravidade: f.oGrav || "LEVE", descricao: f.oDesc, emitiuCat: !!f.oCat }); set("oDesc", ""); }, "Ocorrência registrada.")}>Registrar</button>
          </div>
          <DataTable head={["Nº", "Tipo", "Data", "Setor", "Colaborador", "Gravidade", "Descrição", "Status", ""]} empty={!ehs.ocorrencias.length && <Empty title="Sem ocorrências" />}>
            {ehs.ocorrencias.map((o: Row) => <tr key={o.id}><td>{o.numero}</td><td>{o.tipo}</td><td>{dataPt(o.data)}</td><td>{o.setor}</td><td>{o.colaborador || "—"}</td><td><Badge tone={o.gravidade === "GRAVE" ? "danger" : o.gravidade === "MODERADA" ? "warning" : "neutral"}>{o.gravidade}</Badge></td><td>{o.descricao}</td><td>{o.status}</td>
              <td>{o.status !== "ENCERRADA" && <button disabled={busy} onClick={() => { const a = window.prompt("Ação corretiva adotada:"); if (a) void run(() => post({ acao: "EHS_OCORRENCIA_STATUS", id: o.id, status: "ENCERRADA", acaoCorretiva: a }), "Ocorrência encerrada."); }}>Encerrar</button>}</td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Vencimentos de EPI e treinamentos (próximos 30 dias)">
          <DataTable head={["Tipo", "Colaborador", "Item", "Vence em", "Situação"]} empty={!ehs.vencimentos.length && <Empty title="Nada vencendo" />}>
            {ehs.vencimentos.map((v: Row, i: number) => <tr key={i}><td>{v.tipo}</td><td>{v.colaborador}</td><td>{v.item}</td><td>{dataPt(v.vence_em)}</td><td>{v.dias < 0 ? <Badge tone="danger">Vencido há {-v.dias} d</Badge> : <Badge tone="warning">{v.dias} d</Badge>}</td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="EPI e treinamentos">
          <div className="formGrid">
            <Field label="Código EPI"><input value={f.eCod || ""} onChange={(e) => set("eCod", e.target.value)} /></Field>
            <Field label="Nome"><input value={f.eNome || ""} onChange={(e) => set("eNome", e.target.value)} /></Field>
            <Field label="CA"><input value={f.eCa || ""} onChange={(e) => set("eCa", e.target.value)} /></Field>
            <button disabled={busy || !f.eCod || !f.eNome} onClick={() => run(async () => { await post({ acao: "EHS_EPI", codigo: f.eCod, nome: f.eNome, ca: f.eCa }); set("eCod", ""); set("eNome", ""); }, "EPI cadastrado.")}>Cadastrar EPI</button>
          </div>
          <div className="formGrid">
            <Field label="Colaborador"><select value={f.dCol || ""} onChange={(e) => set("dCol", e.target.value)}><option value="">Selecione</option>{ehs.colaboradores.map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="EPI"><select value={f.dEpi || ""} onChange={(e) => set("dEpi", e.target.value)}><option value="">Selecione</option>{ehs.epis.map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Entregue em"><input type="date" value={f.dData || hoje()} onChange={(e) => set("dData", e.target.value)} /></Field>
            <Field label="Vence em"><input type="date" value={f.dVence || ""} onChange={(e) => set("dVence", e.target.value)} /></Field>
            <button disabled={busy || !f.dCol || !f.dEpi} onClick={() => run(() => post({ acao: "EHS_EPI_ENTREGA", colaboradorId: f.dCol, epiId: f.dEpi, entregueEm: f.dData || hoje(), venceEm: f.dVence }), "Entrega registrada.")}>Registrar entrega</button>
          </div>
          <div className="formGrid">
            <Field label="Treinamento"><input value={f.tNome || ""} onChange={(e) => set("tNome", e.target.value)} /></Field>
            <Field label="Validade (meses)"><input inputMode="numeric" value={f.tMeses || ""} onChange={(e) => set("tMeses", e.target.value)} /></Field>
            <label><input type="checkbox" checked={!!f.tObr} onChange={(e) => set("tObr", e.target.checked)} /> Obrigatório</label>
            <button disabled={busy || !f.tNome} onClick={() => run(async () => { await post({ acao: "EHS_TREINAMENTO", nome: f.tNome, validadeMeses: f.tMeses || 12, obrigatorio: !!f.tObr }); set("tNome", ""); }, "Treinamento cadastrado.")}>Cadastrar treinamento</button>
          </div>
          <div className="formGrid">
            <Field label="Colaborador"><select value={f.rCol || ""} onChange={(e) => set("rCol", e.target.value)}><option value="">Selecione</option>{ehs.colaboradores.map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Treinamento"><select value={f.rTr || ""} onChange={(e) => set("rTr", e.target.value)}><option value="">Selecione</option>{ehs.treinamentos.map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Realizado em"><input type="date" value={f.rData || hoje()} onChange={(e) => set("rData", e.target.value)} /></Field>
            <button disabled={busy || !f.rCol || !f.rTr} onClick={() => run(() => post({ acao: "EHS_TREINAMENTO_REGISTRO", colaboradorId: f.rCol, treinamentoId: f.rTr, data: f.rData || hoje() }), "Treinamento registrado.")}>Registrar treinamento</button>
          </div>
        </Panel>
      </>)}

      {aba === "PROJETOS" && ps && (<>
        <Panel title="Novo projeto">
          <div className="formGrid">
            <Field label="Código *"><input value={f.pjCod || ""} onChange={(e) => set("pjCod", e.target.value)} /></Field>
            <Field label="Nome *"><input value={f.pjNome || ""} onChange={(e) => set("pjNome", e.target.value)} /></Field>
            <Field label="Responsável"><input value={f.pjResp || ""} onChange={(e) => set("pjResp", e.target.value)} /></Field>
            <Field label="Início *"><input type="date" value={f.pjIni || ""} onChange={(e) => set("pjIni", e.target.value)} /></Field>
            <Field label="Fim previsto *"><input type="date" value={f.pjFim || ""} onChange={(e) => set("pjFim", e.target.value)} /></Field>
            <Field label="Orçamento (R$)"><input inputMode="decimal" value={f.pjOrc || ""} onChange={(e) => set("pjOrc", e.target.value)} /></Field>
            <button className="primary" disabled={busy || !f.pjCod || !f.pjNome || !f.pjIni || !f.pjFim} onClick={() => run(async () => { await post({ acao: "PS_PROJETO", codigo: f.pjCod, nome: f.pjNome, responsavel: f.pjResp, inicio: f.pjIni, fimPrevisto: f.pjFim, orcamento: f.pjOrc || 0 }); setF({}); }, "Projeto criado.")}>Criar projeto</button>
          </div>
        </Panel>
        <Panel title="Projetos">
          <DataTable head={["Código", "Projeto", "Status", "Prazo", "Orçamento", "Realizado", "% físico", "Tarefas atrasadas", ""]} empty={!ps.length && <Empty title="Nenhum projeto" />}>
            {ps.map((p) => <tr key={p.id}><td><b>{p.codigo}</b></td><td>{p.nome}</td><td>{p.atrasado ? <Badge tone="danger">ATRASADO</Badge> : <Badge>{p.status}</Badge>}</td><td>{dataPt(p.fim_previsto)}</td><td>{brl(p.orcamento)}</td>
              <td>{brl(p.realizado)} <small>({p.pct_orcamento}%)</small></td><td>{p.pct_fisico}%</td><td>{p.tarefas_atrasadas}</td><td><button onClick={() => abrirProj(p)}>Abrir</button></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      <Modal open={!!proj} title={proj ? `${proj.p.codigo} · ${proj.p.nome}` : ""} onClose={() => setProj(null)}>
        {proj && (<>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {["PLANEJADO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"].map((s) => <button key={s} disabled={busy} className={proj.p.status === s ? "primary" : ""} onClick={() => run(() => post({ acao: "PS_STATUS", id: proj.p.id, status: s }), "Status atualizado.", async () => setProj({ ...proj, p: { ...proj.p, status: s } }))}>{s.replace("_", " ")}</button>)}
          </div>
          <h4>Tarefas (WBS)</h4>
          <div className="formGrid">
            <Field label="WBS"><input value={f.tWbs || ""} onChange={(e) => set("tWbs", e.target.value)} /></Field>
            <Field label="Tarefa"><input value={f.tNomeP || ""} onChange={(e) => set("tNomeP", e.target.value)} /></Field>
            <Field label="Início"><input type="date" value={f.tIni || ""} onChange={(e) => set("tIni", e.target.value)} /></Field>
            <Field label="Fim"><input type="date" value={f.tFim || ""} onChange={(e) => set("tFim", e.target.value)} /></Field>
            <button disabled={busy || !f.tWbs || !f.tNomeP || !f.tIni || !f.tFim} onClick={() => run(async () => { await post({ acao: "PS_TAREFA", projetoId: proj.p.id, wbs: f.tWbs, nome: f.tNomeP, inicio: f.tIni, fim: f.tFim }); setProj({ ...proj, ...(await api("/api/corporativo?visao=projetos&id=" + proj.p.id)) }); set("tWbs", ""); set("tNomeP", ""); }, "Tarefa criada.")}>Adicionar</button>
          </div>
          <DataTable head={["WBS", "Tarefa", "Início", "Fim", "% concluído"]} empty={!proj.tarefas.length && <Empty title="Sem tarefas" />}>
            {proj.tarefas.map((t) => <tr key={t.id}><td>{t.wbs}</td><td>{t.nome} {t.atrasada && <Badge tone="danger">atrasada</Badge>}</td><td>{dataPt(t.inicio)}</td><td>{dataPt(t.fim)}</td>
              <td><input size={4} inputMode="numeric" defaultValue={t.percentual} onBlur={(e) => { if (Number(e.target.value) !== t.percentual) void run(() => post({ acao: "PS_TAREFA_PERCENTUAL", id: t.id, percentual: e.target.value }), "Avanço atualizado.", async () => setProj({ ...proj, ...(await api("/api/corporativo?visao=projetos&id=" + proj.p.id)) })); }} />%</td></tr>)}
          </DataTable>
          <h4>Custos lançados</h4>
          <div className="formGrid">
            <Field label="Data"><input type="date" value={f.cData || hoje()} onChange={(e) => set("cData", e.target.value)} /></Field>
            <Field label="Descrição"><input value={f.cDesc || ""} onChange={(e) => set("cDesc", e.target.value)} /></Field>
            <Field label="Valor (R$)"><input inputMode="decimal" value={f.cVal || ""} onChange={(e) => set("cVal", e.target.value)} /></Field>
            <button disabled={busy || !f.cDesc || !f.cVal} onClick={() => run(async () => { await post({ acao: "PS_CUSTO", projetoId: proj.p.id, data: f.cData || hoje(), descricao: f.cDesc, valor: f.cVal }); setProj({ ...proj, ...(await api("/api/corporativo?visao=projetos&id=" + proj.p.id)) }); set("cDesc", ""); set("cVal", ""); }, "Custo lançado.")}>Lançar</button>
          </div>
          <DataTable head={["Data", "Descrição", "Valor"]} empty={!proj.custos.length && <Empty title="Sem custos" />}>{proj.custos.map((c) => <tr key={c.id}><td>{dataPt(c.data)}</td><td>{c.descricao}</td><td>{brl(c.valor)}</td></tr>)}</DataTable>
        </>)}
      </Modal>

      <Modal open={!!folhaDet} title={`Folha ${folhaDet?.comp ?? ""}`} onClose={() => setFolhaDet(null)}>
        {folhaDet && <DataTable head={["Matrícula", "Nome", "Bruto", "Faltas", "Extras", "Outros", "Líquido"]}>{folhaDet.itens.map((i) => <tr key={i.matricula}><td>{i.matricula}</td><td>{i.nome}</td><td>{brl(i.bruto)}</td><td>{brl(i.desconto_faltas)}</td><td>{brl(i.horas_extras)}</td><td>{brl(i.outros_descontos)}</td><td><b>{brl(i.liquido)}</b></td></tr>)}</DataTable>}
      </Modal>
    </>
  );
}
