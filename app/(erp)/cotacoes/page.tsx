"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Kpi, PageHeader, Panel, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
const CLASSE: Record<string, Tone> = { A: "success", B: "warning", C: "danger", SEM_DADOS: "neutral" } as Record<string, Tone>;
async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CotacoesPage() {
  const { me } = useOps();
  const pode = ["PCP", "GERENTE", "QUALIDADE"].includes(me?.perfil || "");
  const [aba, setAba] = useState<"COT" | "AVAL">("COT");
  const [d, setD] = useState<Row | null>(null); const [av, setAv] = useState<Row[]>([]);
  const [sel, setSel] = useState<string>(""); const [cmp, setCmp] = useState<Row | null>(null);
  const [erro, setErro] = useState(""); const [ok, setOk] = useState("");
  const [f, setF] = useState({ linha: 1, fornecedorId: "", preco: "", frete: "0", prazo: "0", condicao: "" });

  const carregar = useCallback(async () => {
    try { setD(await api("/api/suprimentos?visao=cotacoes")); setAv((await api("/api/suprimentos?visao=avaliacao")).score); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, []);
  const comparar = useCallback(async (id: string) => { try { setCmp(await api("/api/suprimentos?visao=comparativo&id=" + id)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (sel) void comparar(sel); else setCmp(null); }, [sel, comparar]);
  const run = async (b: Row, msg: string) => { setErro(""); setOk(""); try { await api("/api/suprimentos", b); setOk(msg); await carregar(); if (sel) await comparar(sel); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };

  return (
    <>
      <PageHeader eyebrow="Suprimentos" title="Cotações e avaliação de fornecedores" description="Mapa comparativo por item (preço, frete, prazo, condição) com justificativa quando não é o menor preço, e ranking de fornecedores por entrega no prazo, qualidade e avaliação." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}{ok && <div className="alert success">{ok}</div>}
      <div className="tabs" role="tablist">{(["COT", "AVAL"] as const).map((a) => <button key={a} role="tab" aria-selected={aba === a} className={aba === a ? "active" : ""} onClick={() => setAba(a)}>{a === "COT" ? "Cotação comparativa" : "Avaliação de fornecedores"}</button>)}</div>
      {aba === "COT" && d && (<>
        <Panel title="Solicitação">
          <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Solicitação de compra"><option value="">Selecione…</option>{d.solicitacoes.map((s: Row) => <option key={s.id} value={s.id}>#{s.numero} · {s.motivo || "sem motivo"} · {s.fornecedores} forn.</option>)}</select>
        </Panel>
        {cmp && (<>
          {pode && <Panel title="Lançar proposta">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select value={f.linha} onChange={(e) => setF({ ...f, linha: Number(e.target.value) })}>{cmp.itens.map((i: Row) => <option key={i.linha} value={i.linha}>{i.linha} · {i.descricao}</option>)}</select>
              <select value={f.fornecedorId} onChange={(e) => setF({ ...f, fornecedorId: e.target.value })}><option value="">Fornecedor…</option>{d.fornecedores.map((x: Row) => <option key={x.id} value={x.id}>{x.razao_social}</option>)}</select>
              <input placeholder="Preço unit." inputMode="decimal" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} style={{ width: 100 }} />
              <input placeholder="Frete" inputMode="decimal" value={f.frete} onChange={(e) => setF({ ...f, frete: e.target.value })} style={{ width: 80 }} />
              <input placeholder="Prazo (dias)" inputMode="numeric" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} style={{ width: 90 }} />
              <input placeholder="Condição" value={f.condicao} onChange={(e) => setF({ ...f, condicao: e.target.value })} />
              <button className="primary" onClick={() => run({ acao: "PROPOSTA", id: sel, ...f }, "Proposta registrada.")}>Registrar</button>
            </div>
          </Panel>}
          {cmp.itens.map((i: Row) => (
            <Panel key={i.linha} title={`${i.codigo} · ${i.descricao}`} subtitle={`${i.quantidade} un.`}>
              <DataTable head={["Fornecedor", "Preço", "Frete", "Total", "Prazo", "Condição", "Situação", ""]} empty={<Empty title="Sem propostas" />}>
                {cmp.propostas.filter((p: Row) => p.linha === i.linha).map((p: Row) => <tr key={p.fornecedor_id}>
                  <td><b>{p.fornecedor}</b></td><td>{brl(p.preco_unitario)}</td><td>{brl(p.frete)}</td><td>{brl(p.total_proposta)} {p.menor_preco && <Badge tone="success">menor</Badge>}</td><td>{p.prazo_dias} d</td><td>{p.condicao_pagamento || "—"}</td>
                  <td>{p.escolhida ? <Badge tone="info">Escolhida</Badge> : "—"}{p.motivo_escolha && <small style={{ display: "block" }}>{p.motivo_escolha}</small>}</td>
                  <td>{pode && !p.escolhida && <button onClick={() => { const m = p.menor_preco ? "" : window.prompt("Justificativa (não é o menor preço):") || ""; if (!p.menor_preco && !m) return; void run({ acao: "ESCOLHER", id: sel, linha: i.linha, fornecedorId: p.fornecedor_id, motivo: m }, "Fornecedor escolhido."); }}>Escolher</button>}</td></tr>)}
              </DataTable>
            </Panel>))}
        </>)}
      </>)}
      {aba === "AVAL" && (<>
        <div className="kpis"><Kpi label="Fornecedores A" value={av.filter((x) => x.classe === "A").length} /><Kpi label="Classe C" value={av.filter((x) => x.classe === "C").length} tone="warn" /></div>
        <Panel title="Ranking">
          <DataTable head={["Fornecedor", "Recebimentos", "Entrega no prazo", "NCs", "Nota manual", "Score", "Classe", ""]} empty={<Empty title="Sem fornecedores" />}>
            {av.map((x) => <tr key={x.fornecedor_id}><td><b>{x.razao_social}</b></td><td>{x.recebimentos}</td><td>{x.otd_pct == null ? "—" : x.otd_pct + "%"}</td><td>{x.ncs}</td><td>{x.nota_manual ?? "—"}</td><td>{x.score ?? "—"}</td><td><Badge tone={CLASSE[x.classe]}>{x.classe.replace("_", " ")}</Badge></td>
              <td>{pode && <button onClick={() => { const a = window.prompt("Nota de atendimento (0–10):"); const dc = a == null ? null : window.prompt("Nota de documentação (0–10):"); if (a == null || dc == null) return; void run({ acao: "AVALIAR", fornecedorId: x.fornecedor_id, competencia: new Date().toISOString().slice(0, 7), atendimento: a, documentacao: dc }, "Avaliação registrada."); }}>Avaliar mês</button>}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}
    </>
  );
}
