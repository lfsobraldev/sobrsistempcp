"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { addDias, diffDias } from "@/lib/aps-fina";

type Row = Record<string, any>;
type Aba = "MRP" | "GANTT" | "CARGA" | "SOP" | "URGENTE";
const n3 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dataPt = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const hm = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;
const COLW = 28;

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function PlanejamentoApsPage() {
  const { me } = useOps();
  const pode = ["PCP", "GERENTE"].includes(me?.perfil || "");
  const [aba, setAba] = useState<Aba>("MRP");
  const [d, setD] = useState<Row | null>(null);
  const [agenda, setAgenda] = useState<Row | null>(null);
  const [aux, setAux] = useState<Row>({ produtos: [], locais: [], fornecedores: [] });
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ tipo: string; v: Row } | null>(null);
  const [sim, setSim] = useState<Row | null>(null);
  const [aviso, setAviso] = useState<Row | null>(null);

  const [horizonte, setHorizonte] = useState("TODOS");
  const carregar = useCallback(async () => {
    try { const j = await api("/api/planejamento/aps?horizonte=" + horizonte); setD(j); setAgenda(j.agenda); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, [horizonte]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { api("/api/compras").then((j) => setAux({ produtos: j.produtos, locais: j.locais, fornecedores: j.fornecedores })).catch(() => undefined); }, []);

  const mover = async (ofId: string, inicio: string, motivo = "Reprogramação no Gantt") => {
    setBusy(true); setErro(""); setOk("");
    try {
      const j = await api("/api/planejamento/aps", { acao: "MOVER", ofId, inicio, motivo });
      setAgenda(j.agenda);
      const o = j.agenda.ofs.find((x: Row) => x.id === ofId);
      setAviso(o ? { numero: o.numero, fim: o.fim, atraso: o.atrasoDias, sem: o.semCapacidade, outras: j.agenda.atrasadas.filter((x: string) => x !== ofId).length } : null);
      setOk(`OF ${o?.numero} reprogramada para ${dataPt(inicio)}.`);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const limpar = async (ofId: string) => { try { const j = await api("/api/planejamento/aps", { acao: "LIMPAR", ofId }); setAgenda(j.agenda); setOk("Data fixa removida."); setAviso(null); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };

  // ---------------- Gantt
  const ofs: Row[] = agenda?.ofs ?? [];
  const origem = useMemo(() => {
    const ini = ofs.map((o) => o.inicio).filter(Boolean).sort()[0] ?? d?.hoje ?? new Date().toISOString().slice(0, 10);
    return addDias(ini < (d?.hoje ?? ini) ? ini : d?.hoje ?? ini, 0);
  }, [ofs, d?.hoje]);
  const fimMax = useMemo(() => [...ofs.map((o) => o.fim), ...ofs.map((o) => o.prazo)].filter(Boolean).sort().pop() ?? origem, [ofs, origem]);
  const dias = Math.min(120, Math.max(30, diffDias(origem, fimMax) + 8));
  const drag = useRef<{ id: string; x0: number; ini: string; moved: boolean } | null>(null);
  const [off, setOff] = useState<Record<string, number>>({});

  const onDown = (e: React.PointerEvent, o: Row) => {
    if (!pode || !o.inicio) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: o.id, x0: e.clientX, ini: o.inicio, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const g = drag.current; if (!g) return;
    const delta = Math.round((e.clientX - g.x0) / COLW);
    if (delta !== 0) g.moved = true;
    setOff((s) => ({ ...s, [g.id]: delta }));
  };
  const onUp = async () => {
    const g = drag.current; drag.current = null; if (!g) return;
    const delta = off[g.id] ?? 0;
    setOff((s) => { const n = { ...s }; delete n[g.id]; return n; });
    if (g.moved && delta !== 0) await mover(g.id, addDias(g.ini, delta));
  };

  const centros: Row[] = d?.centros ?? [];
  const ocup: Record<string, Record<string, number>> = agenda?.ocupacao ?? {};
  const mrpAcao = (d?.mrp ?? []).filter((m: Row) => m.acao !== "OK");

  return (
    <div className="page">
      <PageHeader eyebrow="PCP" title="Planejamento: MRP, capacidade e Gantt" description="Necessidade líquida, sugestões aprováveis, carga por centro, reprogramação arrastando e S&OP."
        actions={aba === "URGENTE" ? null : <button className="crm-secondary" onClick={carregar}>Atualizar</button>} />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success" role="status">{ok}</div>}
      {aviso && (aviso.atraso > 0 || aviso.sem || aviso.outras > 0) && (
        <div className="alert warning" role="alert">
          {aviso.sem ? `OF ${aviso.numero}: sem capacidade cadastrada em algum centro. ` : aviso.atraso > 0 ? `OF ${aviso.numero} termina em ${dataPt(aviso.fim)}, ${aviso.atraso} dia(s) após o prazo. ` : ""}
          {aviso.outras > 0 ? `${aviso.outras} outra(s) OF(s) atrasam com a nova agenda.` : ""}
        </div>
      )}
      <div className="kpis">
        <Kpi label="OFs em planejamento" value={ofs.length} />
        <Kpi label="Atrasadas pela capacidade" value={agenda?.atrasadas?.length ?? 0} tone={agenda?.atrasadas?.length ? "danger" : ""} />
        <Kpi label="Sem centro/capacidade" value={agenda?.semCapacidade?.length ?? 0} tone={agenda?.semCapacidade?.length ? "warn" : ""} />
        <Kpi label="Sugestões MRP" value={mrpAcao.length} tone={mrpAcao.length ? "warn" : ""} />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "MRP", label: "MRP" }, { value: "GANTT", label: "Gantt" }, { value: "CARGA", label: "Carga" }, { value: "SOP", label: "S&OP" }, { value: "URGENTE", label: "Pedido urgente" }]} />
      <div style={{ marginTop: 12 }}>
        {aba === "MRP" && (<>
          <label className="fb-field" style={{ display: "inline-flex", flexDirection: "column", gap: 3, marginBottom: 8, fontSize: 11, fontWeight: 600 }}>Horizonte do MRP
            <select value={horizonte} onChange={(e) => setHorizonte(e.target.value)}>
              <option value="TODOS">Todas as OFs abertas</option>
              {d?.meses?.atual && <option value="ATUAL">Mês atual · {d.meses.atual}</option>}
              {d?.meses?.proximo && <option value="PROXIMO">Próximo mês · {d.meses.proximo}</option>}
              <option value="ATE30">Próximos 30 dias</option><option value="ATE60">Próximos 60 dias</option>
            </select>
          </label>
          <DataTable head={["Item", "Classe", "Necessidade", "Saldo", "Em compra", "Em produção", "Líquida", "Ação"]} empty={<Empty title="Sem necessidade em OFs abertas" />}>
            {(d?.mrp ?? []).map((m: Row) => (
              <tr key={m.produto_id}><td data-label="Item"><b>{m.codigo}</b> {m.descricao}</td><td data-label="Classe">{m.classificacao}</td><td data-label="Necessidade">{n3(m.necessidade_bruta)}</td><td data-label="Saldo">{n3(m.saldo_livre)}</td><td data-label="Em compra">{n3(m.em_compra)}</td><td data-label="Em produção">{n3(m.em_producao)}</td><td data-label="Líquida"><b>{n3(m.necessidade_liquida)}</b></td>
                <td data-label="Ação">{m.acao === "OK" ? <Badge tone="success">Coberto</Badge> : pode ? (
                  <button className="primary" onClick={() => setModal({ tipo: m.acao, v: { produtoId: m.produto_id, codigo: m.codigo, quantidade: String(Number(m.necessidade_liquida)), prazo: String(m.prazo_mais_cedo ?? "").slice(0, 10), localId: aux.locais[0]?.id ?? "", fornecedorId: "", preco: "" } })}>{m.acao === "COMPRAR" ? "Gerar compra" : "Gerar OF"}</button>
                ) : <Badge tone="warning">{m.acao === "COMPRAR" ? "Comprar" : "Produzir"}</Badge>}</td></tr>
            ))}
          </DataTable>
          </>
        )}

        {aba === "GANTT" && (ofs.length === 0 ? <Empty title="Nenhuma OF aberta para programar" sub="Gere/confirme OFs integradas (ciclo industrial) para vê-las aqui." /> : (
          <>
            <small>Arraste a barra para fixar o início (toque: use “Reprogramar”). A agenda é recalculada respeitando a capacidade dos centros.</small>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginTop: 8 }}>
              <div style={{ minWidth: 180 + dias * COLW, position: "relative" }}>
                <div style={{ display: "flex", marginLeft: 180, position: "sticky", top: 0, background: "var(--surface-2)", zIndex: 2 }}>
                  {Array.from({ length: dias }, (_, i) => { const dia = addDias(origem, i); const w = new Date(`${dia}T12:00:00`).getDay(); return <div key={i} style={{ width: COLW, flex: "0 0 auto", fontSize: 10, textAlign: "center", padding: "4px 0", background: w === 0 || w === 6 ? "var(--surface-3)" : undefined, borderLeft: dia === d?.hoje ? "2px solid var(--primary)" : undefined }}>{dia.slice(8)}{(i === 0 || dia.slice(8) === "01") && <div>{dia.slice(5, 7)}</div>}</div>; })}
                </div>
                {ofs.filter((o) => o.inicio).map((o) => {
                  const ini = diffDias(origem, o.inicio) + (off[o.id] ?? 0), len = Math.max(1, diffDias(o.inicio, o.fim) + 1), prazo = diffDias(origem, o.prazo);
                  const tone = o.semCapacidade ? "var(--warning)" : o.atrasada ? "var(--danger)" : "var(--primary)";
                  return (
                    <div key={o.id} style={{ display: "flex", alignItems: "center", height: 36, borderTop: "1px solid var(--border)" }}>
                      <div style={{ width: 180, flex: "0 0 180px", padding: "0 8px", fontSize: 12, position: "sticky", left: 0, background: "var(--surface)", zIndex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <b>OF {o.numero}</b> {o.produto} {o.fixa && <span title="Data fixa" className="pin-fixa">fixa</span>}
                      </div>
                      <div style={{ position: "relative", height: 36, width: dias * COLW }}>
                        <div title={`Prazo ${dataPt(o.prazo)}`} style={{ position: "absolute", left: prazo * COLW + COLW / 2, top: 4, bottom: 4, width: 2, background: "var(--text-3)" }} />
                        <div role="button" tabIndex={0} aria-label={`OF ${o.numero}: ${dataPt(o.inicio)} a ${dataPt(o.fim)}`} onPointerDown={(e) => onDown(e, o)} onPointerMove={onMove} onPointerUp={onUp}
                          onKeyDown={(e) => { if (pode && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); void mover(o.id, addDias(o.inicio, e.key === "ArrowRight" ? 1 : -1)); } }}
                          style={{ position: "absolute", left: ini * COLW, width: len * COLW - 2, top: 6, height: 24, background: tone, borderRadius: 6, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", padding: "0 6px", cursor: pode ? "grab" : "default", touchAction: "none", opacity: busy ? 0.6 : 1, userSelect: "none" }}>
                          {o.atrasoDias > 0 ? `+${o.atrasoDias}d` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <DataTable head={["OF", "Produto", "Início", "Fim", "Prazo", "Situação", ""]}>
              {ofs.map((o) => <tr key={o.id}><td data-label="OF">{o.numero}</td><td data-label="Produto">{o.produto}</td><td data-label="Início">{dataPt(o.inicio)}</td><td data-label="Fim">{dataPt(o.fim)}</td><td data-label="Prazo">{dataPt(o.prazo)}</td>
                <td data-label="Situação">{o.semCapacidade ? <Badge tone="warning">Sem capacidade</Badge> : o.atrasada ? <Badge tone="danger">Atraso {o.atrasoDias}d</Badge> : <Badge tone="success">No prazo</Badge>}</td>
                <td>{pode && <><button className="crm-secondary" onClick={() => setModal({ tipo: "REPROGRAMAR", v: { ofId: o.id, numero: o.numero, inicio: o.inicio ?? d?.hoje } })}>Reprogramar</button>{o.fixa && <button className="crm-secondary" onClick={() => limpar(o.id)}>Soltar</button>}</>}</td></tr>)}
            </DataTable>
          </>
        ))}

        {aba === "CARGA" && (
          <div style={{ overflowX: "auto" }}>
            <small>Ocupação (%) por centro nos próximos 21 dias úteis/corridos. Vermelho ≥ 100%.</small>
            <table style={{ borderCollapse: "collapse", marginTop: 8, fontSize: 11 }}>
              <thead><tr><th style={{ textAlign: "left", padding: 4 }}>Centro</th>{Array.from({ length: 21 }, (_, i) => <th key={i} style={{ padding: 2, minWidth: 34 }}>{addDias(d?.hoje ?? origem, i).slice(5).replace("-", "/")}</th>)}</tr></thead>
              <tbody>{centros.map((c) => <tr key={c.id}><td style={{ padding: 4, whiteSpace: "nowrap" }}>{c.nome}</td>{Array.from({ length: 21 }, (_, i) => {
                const dia = addDias(d?.hoje ?? origem, i), usado = ocup[c.id]?.[dia] ?? 0, pct = c.minutosDia > 0 ? Math.round((usado / c.minutosDia) * 100) : 0;
                return <td key={i} title={`${hm(usado)} de ${hm(c.minutosDia)}`} style={{ textAlign: "center", padding: 2, background: pct >= 100 ? "var(--danger-soft)" : pct >= 80 ? "var(--warning-soft)" : pct > 0 ? "var(--info-soft)" : undefined }}>{usado ? pct : ""}</td>;
              })}</tr>)}</tbody>
            </table>
            {!centros.length && <Empty title="Cadastre a capacidade dos centros (Capacidades de máquina)" />}
          </div>
        )}

        {aba === "SOP" && (
          <DataTable head={["Mês", "Demanda (h)", "Capacidade (h)", "Ocupação", "Saldo (h)", "Situação"]} empty={<Empty title="Sem dados" />}>
            {(d?.sop ?? []).map((s: Row) => <tr key={s.mes}><td data-label="Mês">{s.mes}</td><td data-label="Demanda (h)">{hm(s.demandaMin)}</td><td data-label="Capacidade (h)">{hm(s.capacidadeMin)}</td><td data-label="Ocupação">{s.ocupacaoPct}%</td><td data-label="Saldo (h)">{s.saldoMin < 0 ? "-" : ""}{hm(Math.abs(s.saldoMin))}</td><td data-label="Situação"><Badge tone={({ OK: "success", ATENCAO: "warning", ESTOURO: "danger" } as Record<string, Tone>)[s.situacao]}>{s.situacao === "OK" ? "Folga" : s.situacao === "ATENCAO" ? "Atenção" : "Estouro"}</Badge></td></tr>)}
          </DataTable>
        )}

        {aba === "URGENTE" && (
          <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
            <Field label="Produto *"><select value={modal?.tipo === "SIM" ? modal.v.produtoId : ""} onChange={(e) => setModal({ tipo: "SIM", v: { ...(modal?.v ?? { quantidade: "1", prazo: "" }), produtoId: e.target.value } })}><option value="">Selecione</option>{aux.produtos.filter((p: Row) => p.classificacao !== "INSUMO").map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select></Field>
            <Field label="Quantidade"><input inputMode="decimal" value={modal?.tipo === "SIM" ? modal.v.quantidade : "1"} onChange={(e) => setModal({ tipo: "SIM", v: { ...(modal?.v ?? { produtoId: "", prazo: "" }), quantidade: e.target.value } })} /></Field>
            <Field label="Prazo desejado"><input type="date" value={modal?.tipo === "SIM" ? modal.v.prazo : ""} onChange={(e) => setModal({ tipo: "SIM", v: { ...(modal?.v ?? { produtoId: "", quantidade: "1" }), prazo: e.target.value } })} /></Field>
            <button className="primary" disabled={busy || modal?.tipo !== "SIM" || !modal.v.produtoId || !modal.v.prazo} title={modal?.tipo !== "SIM" || !modal.v.produtoId || !modal.v.prazo ? "Escolha produto e prazo" : ""} onClick={async () => {
              if (modal?.tipo !== "SIM") return; setBusy(true); setErro("");
              try { const j = await api("/api/planejamento/aps", { acao: "SIMULAR", produtoId: modal.v.produtoId, quantidade: Number(String(modal.v.quantidade).replace(",", ".")), prazo: modal.v.prazo }); setSim(j.simulacao); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
            }}>Simular</button>
            {sim && <div className="panel" style={{ padding: 12 }}>
              <div>{sim.atendePrazo ? <Badge tone="success">Atende o prazo</Badge> : <Badge tone="danger">Não atende o prazo</Badge>} Termina em <b>{dataPt(sim.urgente.fim)}</b> (prazo {dataPt(sim.urgente.prazo)}).</div>
              {sim.impactadas.length ? <><b>OFs que atrasam por causa do urgente:</b>{sim.impactadas.map((i: Row) => <div key={i.id}>OF {i.numero} {i.produto}: atraso {i.atrasoAntes}d → {i.atrasoDepois}d</div>)}</> : <div>Nenhuma OF existente é prejudicada.</div>}
            </div>}
          </div>
        )}
      </div>

      <Modal open={modal?.tipo === "REPROGRAMAR"} onClose={() => setModal(null)} title={modal ? `Reprogramar OF ${modal.v.numero}` : ""}
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal) { await mover(modal.v.ofId, modal.v.inicio); setModal(null); } }}>Fixar início</button></>}>
        {modal?.tipo === "REPROGRAMAR" && <Field label="Novo início"><input type="date" value={modal.v.inicio} onChange={(e) => setModal({ ...modal, v: { ...modal.v, inicio: e.target.value } })} /></Field>}
      </Modal>

      <Modal open={modal?.tipo === "PRODUZIR"} onClose={() => setModal(null)} title={modal ? `Gerar OF · ${modal.v.codigo}` : ""}
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => {
          if (!modal) return; setBusy(true); setErro("");
          try { await api("/api/planejamento/aps", { acao: "MRP_GERAR_OF", produtoId: modal.v.produtoId, quantidade: Number(String(modal.v.quantidade).replace(",", ".")), prazo: modal.v.prazo, localId: modal.v.localId }); setOk("OF planejada criada. Confirme em Ordens de Fabricação para reservar materiais."); setModal(null); await carregar(); }
          catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
        }}>Gerar OF</button></>}>
        {modal?.tipo === "PRODUZIR" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Quantidade"><input inputMode="decimal" value={modal.v.quantidade} onChange={(e) => setModal({ ...modal, v: { ...modal.v, quantidade: e.target.value } })} /></Field>
          <Field label="Prazo"><input type="date" value={modal.v.prazo} onChange={(e) => setModal({ ...modal, v: { ...modal.v, prazo: e.target.value } })} /></Field>
          <Field label="Depósito"><select value={modal.v.localId} onChange={(e) => setModal({ ...modal, v: { ...modal.v, localId: e.target.value } })}>{aux.locais.map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "COMPRAR"} onClose={() => setModal(null)} title={modal ? `Gerar pedido de compra · ${modal.v.codigo}` : ""}
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy || !modal?.v.fornecedorId} title={!modal?.v.fornecedorId ? "Escolha o fornecedor" : ""} onClick={async () => {
          if (!modal) return; setBusy(true); setErro("");
          try { await api("/api/compras", { acao: "PEDIDO", fornecedorId: modal.v.fornecedorId, previsao: modal.v.prazo, itens: [{ produtoId: modal.v.produtoId, quantidade: Number(String(modal.v.quantidade).replace(",", ".")), precoUnitario: Number(String(modal.v.preco || 0).replace(",", ".")) }] }); setOk("Pedido de compra criado em rascunho (Compras)."); setModal(null); await carregar(); }
          catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
        }}>Gerar pedido</button></>}>
        {modal?.tipo === "COMPRAR" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Fornecedor *"><select value={modal.v.fornecedorId} onChange={(e) => setModal({ ...modal, v: { ...modal.v, fornecedorId: e.target.value } })}><option value="">Selecione</option>{aux.fornecedores.filter((f: Row) => f.ativo).map((f: Row) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}</select></Field>
          <Field label="Quantidade"><input inputMode="decimal" value={modal.v.quantidade} onChange={(e) => setModal({ ...modal, v: { ...modal.v, quantidade: e.target.value } })} /></Field>
          <Field label="Preço unitário"><input inputMode="decimal" value={modal.v.preco} onChange={(e) => setModal({ ...modal, v: { ...modal.v, preco: e.target.value } })} /></Field>
          <Field label="Necessário até"><input type="date" value={modal.v.prazo} onChange={(e) => setModal({ ...modal, v: { ...modal.v, prazo: e.target.value } })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
