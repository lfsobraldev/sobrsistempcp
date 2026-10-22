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
const brl = (n: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ABAS = [["PER", "Fechamento de período"], ["RAT", "Rateios"], ["MAR", "Margem"], ["CON", "Conciliação"], ["FIS", "Prontidão fiscal"]] as const;

export default function ControladoriaPage() {
  const { me } = useOps();
  const gerente = me?.perfil === "GERENTE";
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("PER");
  const [d, setD] = useState<Row | null>(null); const [erro, setErro] = useState(""); const [ok, setOk] = useState("");
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [conta, setConta] = useState(""); const [origem, setOrigem] = useState(""); const [dest, setDest] = useState<Row[]>([{ destino: "", percentual: "" }]);
  const visao = { PER: "periodos", RAT: "rateio", MAR: "margem", CON: "conciliacao", FIS: "fiscal" }[aba];

  const carregar = useCallback(async () => { try { setD(await api(`/api/controladoria?visao=${visao}${aba === "CON" && conta ? "&conta=" + conta : ""}`)); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, [visao, aba, conta]);
  useEffect(() => { setD(null); void carregar(); }, [carregar]);
  const run = async (b: Row, msg: string) => { setErro(""); setOk(""); try { const j = await api("/api/controladoria", b); setOk(msg + (j.resumo ? ` Débitos ${brl(j.resumo.debitos)} = créditos ${brl(j.resumo.creditos)}.` : "")); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };

  return (
    <>
      <PageHeader eyebrow="Financeiro e controladoria" title="Controladoria" description="Fechamento mensal com bloqueio de lançamentos, rateio de custos indiretos, margem por pedido e cliente, conciliação sugerida e prontidão da NF-e em homologação." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}{ok && <div className="alert success">{ok}</div>}
      <div className="tabs" role="tablist">{ABAS.map(([k, l]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? "active" : ""} onClick={() => setAba(k)}>{l}</button>)}</div>

      {aba === "PER" && d?.periodos && (<>
        {gerente && <Panel title="Fechar período"><div className="row" style={{ gap: 8 }}><input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /><button className="primary" onClick={() => run({ acao: "FECHAR", competencia: comp }, "Período fechado.")}>Fechar</button></div></Panel>}
        <Panel title="Períodos"><DataTable head={["Competência", "Situação", "Fechado por", "Em", ""]} empty={<Empty title="Nenhum período fechado" />}>
          {d.periodos.map((p: Row) => <tr key={p.competencia}><td><b>{p.competencia}</b></td><td><Badge tone={p.status === "FECHADO" ? "success" : "warning"}>{p.status}</Badge></td><td>{p.fechado_por || "—"}</td><td>{p.fechado_em ? String(p.fechado_em).slice(0, 10) : "—"}</td>
            <td>{gerente && p.status === "FECHADO" && <button onClick={() => { const m = window.prompt("Motivo da reabertura (mín. 10 caracteres):"); if (m) void run({ acao: "REABRIR", competencia: p.competencia, motivo: m }, "Período reaberto."); }}>Reabrir</button>}</td></tr>)}
        </DataTable></Panel>
        <Panel title="Histórico"><DataTable head={["Competência", "Ação", "Motivo", "Quem", "Quando"]}>{d.hist.map((h: Row, i: number) => <tr key={i}><td>{h.competencia}</td><td>{h.acao}</td><td>{h.motivo || "—"}</td><td>{h.ator}</td><td>{String(h.em).slice(0, 16).replace("T", " ")}</td></tr>)}</DataTable></Panel>
      </>)}

      {aba === "RAT" && d?.centros && (<>
        {gerente && <Panel title="Regra de rateio">
          <select value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Centro de origem…</option>{d.centros.map((c: Row) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}</select>
          {dest.map((x, i) => <div key={i} className="row" style={{ gap: 8, marginTop: 6 }}>
            <select value={x.destino} onChange={(e) => setDest(dest.map((y, j) => (j === i ? { ...y, destino: e.target.value } : y)))}><option value="">Destino…</option>{d.centros.filter((c: Row) => c.id !== origem).map((c: Row) => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select>
            <input placeholder="%" inputMode="decimal" value={x.percentual} onChange={(e) => setDest(dest.map((y, j) => (j === i ? { ...y, percentual: e.target.value } : y)))} style={{ width: 80 }} /></div>)}
          <div className="row" style={{ gap: 8, marginTop: 8 }}><button onClick={() => setDest([...dest, { destino: "", percentual: "" }])}>+ destino</button><button className="primary" onClick={() => run({ acao: "RATEIO_SALVAR", origemId: origem, destinos: dest }, "Regra salva.")}>Salvar regra</button></div>
        </Panel>}
        <Panel title="Regras vigentes"><DataTable head={["Origem", "Destino", "%"]} empty={<Empty title="Sem regras" />}>{d.regras.map((r: Row, i: number) => <tr key={i}><td>{r.origem}</td><td>{r.destino}</td><td>{r.percentual}</td></tr>)}</DataTable></Panel>
        <Panel title="Apuração" actions={gerente && <span className="row" style={{ gap: 6 }}><input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /><button className="primary" onClick={() => run({ acao: "RATEIO_APURAR", competencia: comp }, "Rateio apurado.")}>Apurar mês</button></span>}>
          <DataTable head={["Competência", "Origem", "Destino", "Valor origem", "%", "Rateado"]} empty={<Empty title="Nada apurado" />}>{d.apur.map((a: Row, i: number) => <tr key={i}><td>{a.competencia}</td><td>{a.origem}</td><td>{a.destino}</td><td>{brl(a.valor_origem)}</td><td>{a.percentual}</td><td><b>{brl(a.valor)}</b></td></tr>)}</DataTable>
        </Panel>
      </>)}

      {aba === "MAR" && d?.pedidos && (<>
        <div className="kpis"><Kpi label="Receita" value={brl(d.pedidos.reduce((a: number, p: Row) => a + p.receita, 0))} /><Kpi label="Margem" value={brl(d.pedidos.reduce((a: number, p: Row) => a + p.margem, 0))} /></div>
        <Panel title="Por cliente"><DataTable head={["Cliente", "Pedidos", "Receita", "Custo", "Comissão", "Margem", "%"]} empty={<Empty title="Sem vendas faturadas" />}>{d.clientes.map((c: Row, i: number) => <tr key={i}><td><b>{c.cliente}</b></td><td>{c.pedidos}</td><td>{brl(c.receita)}</td><td>{brl(c.custo)}</td><td>{brl(c.comissao)}</td><td>{brl(c.margem)}</td><td><Badge tone={c.margem_pct == null ? "neutral" : c.margem_pct < 10 ? "danger" : c.margem_pct < 25 ? "warning" : "success"}>{c.margem_pct ?? "—"}%</Badge></td></tr>)}</DataTable></Panel>
        <Panel title="Por pedido"><DataTable head={["Pedido", "Cliente", "Receita", "Custo", "Comissão", "Margem", "%"]}>{d.pedidos.map((p: Row) => <tr key={p.numero}><td>#{p.numero} {p.pedido_pcp}</td><td>{p.cliente}</td><td>{brl(p.receita)}</td><td>{brl(p.custo_material)}</td><td>{brl(p.comissao)}</td><td>{brl(p.margem)}</td><td>{p.margem_pct ?? "—"}</td></tr>)}</DataTable></Panel>
      </>)}

      {aba === "CON" && d?.contas && (<>
        <Panel title="Conta bancária"><select value={conta} onChange={(e) => setConta(e.target.value)}><option value="">Selecione…</option>{d.contas.map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Panel>
        <Panel title="Sugestões (valor igual, sentido certo, vencimento ±7 dias)"><DataTable head={["Extrato", "Valor", "Título", "Parceiro", "Vencimento", ""]} empty={<Empty title={conta ? "Sem sugestões" : "Selecione uma conta"} />}>
          {d.sugestoes.map((s: Row, i: number) => <tr key={i}><td>{String(s.extrato_data).slice(0, 10)} · {s.extrato_desc}</td><td>{brl(s.valor)}</td><td>#{s.titulo_numero}</td><td>{s.parceiro}</td><td>{String(s.vencimento).slice(0, 10)} ({s.dias} d)</td><td><button className="primary" onClick={() => run({ acao: "CONCILIAR", extratoId: s.extrato_id, tituloId: s.titulo_id }, "Conciliado.")}>Conciliar</button></td></tr>)}
        </DataTable></Panel>
      </>)}

      {aba === "FIS" && d?.checklist && <Panel title="Prontidão para NF-e (homologação)"><DataTable head={["Item", "Situação"]}>{d.checklist.map((c: Row, i: number) => <tr key={i}><td>{c.item}</td><td><Badge tone={c.ok ? "success" : "warning"}>{c.ok ? "OK" : "Pendente"}</Badge></td></tr>)}</DataTable></Panel>}
    </>
  );
}
