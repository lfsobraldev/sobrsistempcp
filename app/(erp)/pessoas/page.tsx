"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Kpi, PageHeader, Panel } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const brl = (n: number) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dpt = (v: unknown) => String(v ?? "").slice(0, 10).split("-").reverse().join("/");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const ABAS = [["BANCO", "Banco de horas e férias", "banco"], ["CUSTO", "Custo e logins", "custo"], ["INSP", "Inspeções e CAT", "inspecoes"], ["CRONO", "Cronograma de projetos", "cronograma"]] as const;

export default function PessoasPage() {
  const { me } = useOps();
  const p = me?.perfil || "";
  const rh = ["PCP", "GERENTE"].includes(p), ehs = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"].includes(p), ps = ["PCP", "GERENTE", "ENCARREGADO"].includes(p);
  const abas = ABAS.filter(([k]) => (k === "BANCO" || k === "CUSTO" ? rh : k === "INSP" ? ehs : ps));
  const [aba, setAba] = useState<string>("");
  const ativa = aba || abas[0]?.[0] || "";
  const visao = ABAS.find(([k]) => k === ativa)?.[2] || "";
  const [d, setD] = useState<Row | null>(null); const [erro, setErro] = useState(""); const [ok, setOk] = useState("");
  const [proj, setProj] = useState(""); const [cr, setCr] = useState<Row | null>(null);
  const [itens, setItens] = useState<Row[]>([{ item: "", conforme: true, obs: "" }]); const [insp, setInsp] = useState({ tipo: "EPI", setor: "" });

  const carregar = useCallback(async () => { if (!visao) return; try { setD(await api("/api/pessoas?visao=" + visao)); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, [visao]);
  const carregarCr = useCallback(async (id: string) => { try { setCr(await api("/api/pessoas?visao=cronograma&id=" + id)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { setD(null); void carregar(); }, [carregar]);
  useEffect(() => { if (proj) void carregarCr(proj); else setCr(null); }, [proj, carregarCr]);
  const run = async (b: Row, msg: string, extra?: () => Promise<void>) => { setErro(""); setOk(""); try { const j = await api("/api/pessoas", b); setOk(msg + (j.saldo != null ? ` Saldo: ${j.saldo} h.` : "") + (j.valor != null ? ` Custo apropriado: ${brl(j.valor)}.` : "")); await carregar(); if (extra) await extra(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };

  return (
    <>
      <PageHeader eyebrow="Pessoas e projetos" title="Banco de horas, férias, EHS e cronograma" description="Saldo de horas pelo ponto, férias por período aquisitivo (frações e saldo), custo de hora-homem apropriado em projetos, inspeções de segurança, CAT e cronograma com dependências e caminho crítico." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}{ok && <div className="alert success">{ok}</div>}
      <div className="tabs" role="tablist">{abas.map(([k, l]) => <button key={k} role="tab" aria-selected={ativa === k} className={ativa === k ? "active" : ""} onClick={() => setAba(k)}>{l}</button>)}</div>

      {ativa === "BANCO" && d?.banco && (<>
        <div className="kpis"><Kpi label="Colaboradores com saldo negativo" value={d.banco.filter((b: Row) => b.saldo < 0).length} tone="warn" /><Kpi label="Férias a vencer (≤ 90 dias)" value={d.ferias.filter((f: Row) => f.dias_para_vencer <= 90).length} tone="warn" /></div>
        <Panel title="Banco de horas"><DataTable head={["Matrícula", "Nome", "Setor", "Saldo (h)", ""]} empty={<Empty title="Sem colaboradores" />}>
          {d.banco.map((b: Row) => <tr key={b.colaborador_id}><td>{b.matricula}</td><td>{b.nome}</td><td>{b.setor}</td><td><Badge tone={b.saldo < 0 ? "danger" : "success"}>{b.saldo}</Badge></td>
            <td><button onClick={() => { const h = window.prompt("Horas (negativo = compensação/pagamento):"); if (!h) return; const t = Number(h.replace(",", ".")) < 0 ? "COMPENSACAO" : "AJUSTE"; const m = window.prompt("Motivo:") || ""; void run({ acao: "BANCO_LANCAR", colaboradorId: b.colaborador_id, data: hoje(), horas: h, tipo: t, motivo: m }, "Lançado."); }}>Lançar</button></td></tr>)}
        </DataTable></Panel>
        <Panel title="Férias com saldo a gozar"><DataTable head={["Colaborador", "Ciclo", "Saldo (dias)", "Limite concessivo", "Dias p/ vencer"]} empty={<Empty title="Nenhum saldo de férias" />}>
          {d.ferias.map((f: Row, i: number) => <tr key={i}><td>{f.nome}</td><td>{f.ciclo}</td><td>{f.saldo_dias}</td><td>{dpt(f.concessivo_limite)}</td><td><Badge tone={f.dias_para_vencer < 0 ? "danger" : f.dias_para_vencer <= 90 ? "warning" : "neutral"}>{f.dias_para_vencer < 0 ? "VENCIDAS" : f.dias_para_vencer}</Badge></td></tr>)}
        </DataTable></Panel>
      </>)}

      {ativa === "CUSTO" && d?.colaboradores && <Panel title="Custo de hora-homem e vínculo com login"><DataTable head={["Matrícula", "Nome", "Cargo", "Salário", "Custo/hora", "Login", ""]} empty={<Empty title="Sem colaboradores" />}>
        {d.colaboradores.map((c: Row) => <tr key={c.id}><td>{c.matricula}</td><td>{c.nome} <Badge tone="neutral">{c.status}</Badge></td><td>{c.cargo || "—"}</td><td>{brl(c.salario_base)}</td><td>{brl(c.custo_hora)}</td><td>{c.usuario_login || "—"}</td><td>{c.login_a_desativar && <Badge tone="danger">Desativar login em Usuários</Badge>}</td></tr>)}
      </DataTable></Panel>}

      {ativa === "INSP" && d?.inspecoes && (<>
        <Panel title="Nova inspeção">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select value={insp.tipo} onChange={(e) => setInsp({ ...insp, tipo: e.target.value })}>{["EPI", "MAQUINA", "AMBIENTE", "EXTINTOR", "GERAL"].map((x) => <option key={x}>{x}</option>)}</select>
            <input placeholder="Setor" value={insp.setor} onChange={(e) => setInsp({ ...insp, setor: e.target.value })} />
          </div>
          {itens.map((it, i) => <div key={i} className="row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <input placeholder="Item verificado" value={it.item} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} />
            <label><input type="checkbox" checked={it.conforme} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, conforme: e.target.checked } : x)))} /> Conforme</label>
            {!it.conforme && <input placeholder="Descreva o problema" value={it.obs} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, obs: e.target.value } : x)))} />}
          </div>)}
          <div className="row" style={{ gap: 8, marginTop: 8 }}><button onClick={() => setItens([...itens, { item: "", conforme: true, obs: "" }])}>+ item</button><button className="primary" onClick={() => run({ acao: "EHS_INSPECAO", ...insp, data: hoje(), itens: itens.filter((x) => x.item) }, "Inspeção registrada (não conformidades viram ocorrência).", async () => setItens([{ item: "", conforme: true, obs: "" }]))}>Registrar</button></div>
        </Panel>
        <Panel title="Inspeções"><DataTable head={["Nº", "Tipo", "Setor", "Data", "Itens", "Não conformes"]} empty={<Empty title="Nenhuma inspeção" />}>{d.inspecoes.map((i: Row) => <tr key={i.id}><td>{i.numero}</td><td>{i.tipo}</td><td>{i.setor}</td><td>{dpt(i.data)}</td><td>{i.total}</td><td>{i.nao_conformes ? <Badge tone="danger">{i.nao_conformes}</Badge> : "0"}</td></tr>)}</DataTable></Panel>
        <Panel title="Acidentes e CAT"><DataTable head={["Nº", "Data", "Gravidade", "Descrição", "CAT", "Status", ""]} empty={<Empty title="Sem acidentes" />}>{d.acidentes.map((a: Row) => <tr key={a.id}><td>{a.numero}</td><td>{dpt(a.data)}</td><td>{a.gravidade}</td><td>{a.descricao}</td><td>{a.cat_numero ? `${a.cat_numero} · ${dpt(a.cat_data)}` : <Badge tone="warning">sem CAT</Badge>}</td><td>{a.status}</td>
          <td>{!a.cat_numero && <button onClick={() => { const n = window.prompt("Número da CAT:"); if (!n) return; const dt = window.prompt("Data da CAT (AAAA-MM-DD):", hoje()); if (dt) void run({ acao: "EHS_CAT", id: a.id, numero: n, data: dt }, "CAT registrada."); }}>Registrar CAT</button>}</td></tr>)}</DataTable></Panel>
      </>)}

      {ativa === "CRONO" && d?.projetos && (<>
        <Panel title="Projeto"><select value={proj} onChange={(e) => setProj(e.target.value)}><option value="">Selecione…</option>{d.projetos.map((x: Row) => <option key={x.id} value={x.id}>{x.codigo} · {x.nome}</option>)}</select></Panel>
        {cr && (<>
          <Panel title="Caminho crítico" subtitle="Sequência mais longa de tarefas dependentes: qualquer atraso aqui atrasa o projeto.">
            {cr.critico.length ? <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{cr.critico.map((c: Row) => <Badge key={c.wbs} tone="danger">{c.wbs} · {c.nome} ({c.dias} d)</Badge>)}</div> : <Empty title="Defina dependências entre tarefas" />}
          </Panel>
          <Panel title="Tarefas e dependências"><DataTable head={["WBS", "Tarefa", "Início", "Fim", "%", "Predecessoras", ""]} empty={<Empty title="Sem tarefas" />}>
            {cr.tarefas.map((t: Row) => <tr key={t.id}><td>{t.wbs}</td><td>{t.nome}</td><td>{dpt(t.inicio)}</td><td>{dpt(t.fim)}</td><td>{t.percentual}%</td>
              <td>{cr.deps.filter((x: Row) => x.tarefa_id === t.id).map((x: Row) => { const pr = cr.tarefas.find((y: Row) => y.id === x.predecessora_id); return <button key={x.predecessora_id} title="Remover dependência" onClick={() => run({ acao: "PS_DEPENDENCIA_REMOVER", tarefaId: t.id, predecessoraId: x.predecessora_id }, "Dependência removida.", () => carregarCr(proj))}>{pr?.wbs} ✕</button>; })}
                <select value="" onChange={(e) => { if (e.target.value) void run({ acao: "PS_DEPENDENCIA", tarefaId: t.id, predecessoraId: e.target.value, folga: 0 }, "Dependência criada.", () => carregarCr(proj)); }}><option value="">+ pred.</option>{cr.tarefas.filter((y: Row) => y.id !== t.id).map((y: Row) => <option key={y.id} value={y.id}>{y.wbs}</option>)}</select></td>
              <td><button onClick={() => { const n = window.prompt("Novo início (AAAA-MM-DD). Sucessoras são reprogramadas em cascata:", String(t.inicio).slice(0, 10)); if (n) void run({ acao: "PS_REPROGRAMAR", tarefaId: t.id, inicio: n }, "Reprogramado.", () => carregarCr(proj)); }}>Reprogramar</button></td></tr>)}
          </DataTable></Panel>
          <Panel title="Apontar horas da equipe no projeto"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select id="pcol">{(d.colaboradores || []).map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            <input id="phoras" placeholder="Horas" inputMode="decimal" style={{ width: 80 }} />
            <button className="primary" onClick={() => { const col = (document.getElementById("pcol") as HTMLSelectElement)?.value, h = (document.getElementById("phoras") as HTMLInputElement)?.value; void run({ acao: "PS_APONTAR_HORAS", projetoId: proj, colaboradorId: col, horas: h, data: hoje() }, "Horas apontadas."); }}>Apontar</button>
          </div></Panel>
        </>)}
      </>)}
    </>
  );
}
