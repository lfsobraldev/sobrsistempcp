"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Drawer, Empty, Field, Kpi, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";

type Row = Record<string, any>;
type Vista = "ABERTAS" | "TODAS" | "INDICADORES";
const dia = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const hora = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const tomStatus: Record<string, Tone> = { ABERTA: "danger", DECIDIDA: "warning", REPOSICAO: "info", FECHADA: "success", CANCELADA: "neutral" };
const nomeStatus: Record<string, string> = { ABERTA: "Aguardando decisão", DECIDIDA: "Retrabalho", REPOSICAO: "Reposição", FECHADA: "Fechada", CANCELADA: "Cancelada" };
const vazio = { pedido: "", peca: "", of: "", setor: "", quantidade: "1", motivo: "", classe: "REFUGO", obs: "" };

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function PerdasPecasPage() {
  const [d, setD] = useState<Row>({ itens: [], motivos: [], porMotivo: [], porSetor: [], eventos: [] });
  const [vista, setVista] = useState<Vista>("ABERTAS");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [novo, setNovo] = useState(false); const [f, setF] = useState(vazio);
  const [sel, setSel] = useState<Row | null>(null);
  const [dec, setDec] = useState({ decisao: "REPOR", responsavel: "", prazo: "", obs: "" });

  const carregar = useCallback(async (numero?: number) => {
    try { setD(await api(`/api/perdas-pecas${numero ? `?numero=${numero}` : ""}`)); } catch (e: any) { setErro(e.message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const itens: Row[] = d.itens;
  const abertas = itens.filter((i) => ["ABERTA", "DECIDIDA", "REPOSICAO"].includes(i.status));
  const lista = vista === "TODAS" ? itens : abertas;
  const venc = abertas.filter((i) => i.vencida).length;
  const extrav = abertas.filter((i) => i.classe === "EXTRAVIADA").length;

  async function agir(corpo: Record<string, unknown>, msg: string) {
    setBusy(true); setErro(""); setOk("");
    try { await api("/api/perdas-pecas", corpo); setOk(msg); setSel(null); setNovo(false); setF(vazio); await carregar(); } catch (e: any) { setErro(e.message); } finally { setBusy(false); }
  }
  const abrir = async (i: Row) => { setSel(i); setDec({ decisao: "REPOR", responsavel: i.responsavel || "", prazo: String(i.prazo || "").slice(0, 10), obs: "" }); await carregar(i.numero); };

  return (
    <>
      <PageHeader eyebrow="QM · Qualidade" title="Perdas, reposição e peças perdidas" description="Todo refugo, retrabalho ou extravio tem motivo, dono, prazo e fechamento."
        actions={<button className="primary" onClick={() => setNovo(true)}>Registrar perda</button>} />
      {erro && <p className="error">{erro}</p>}{ok && <p className="success">{ok}</p>}
      <div className="kpis">
        <Kpi label="Em aberto" value={abertas.length} />
        <Kpi label="Vencidas" value={venc} tone={venc ? "danger" : ""} />
        <Kpi label="Peças extraviadas" value={extrav} tone={extrav ? "warn" : ""} />
        <Kpi label="Em reposição" value={abertas.filter((i) => i.status === "REPOSICAO").length} />
      </div>
      <Segmented value={vista} onChange={setVista} options={[{ value: "ABERTAS", label: "Em aberto" }, { value: "TODAS", label: "Todas" }, { value: "INDICADORES", label: "Indicadores (90 dias)" }]} />

      {vista === "INDICADORES" ? (
        <div className="grid2">
          <Panel title="Por motivo">{d.porMotivo.length ? <DataTable head={["Motivo", "Ocorrências", "Peças"]}>{d.porMotivo.map((m: Row) => <tr key={m.nome}><td>{m.nome}</td><td>{m.n}</td><td>{Number(m.qtd)}</td></tr>)}</DataTable> : <Empty title="Sem perdas nos últimos 90 dias" />}</Panel>
          <Panel title="Por setor">{d.porSetor.length ? <DataTable head={["Setor", "Ocorrências"]}>{d.porSetor.map((m: Row) => <tr key={m.nome}><td>{m.nome}</td><td>{m.n}</td></tr>)}</DataTable> : <Empty title="Sem perdas nos últimos 90 dias" />}</Panel>
        </div>
      ) : (
        <Panel title={vista === "TODAS" ? "Todas as perdas" : "Perdas em aberto"}>
          {lista.length ? (
            <DataTable head={["Nº", "Pedido", "Peça", "Setor", "Motivo", "Tipo", "Situação", "Prazo", "Dias"]}>
              {lista.map((i) => (
                <tr key={i.numero} onClick={() => void abrir(i)} style={{ cursor: "pointer" }}>
                  <td>{i.numero}</td><td>{i.pedido}</td><td>{i.peca}</td><td>{i.setor || "—"}</td><td>{i.motivo_nome}</td><td>{i.classe}</td>
                  <td><Badge tone={tomStatus[i.status]}>{nomeStatus[i.status]}</Badge></td>
                  <td>{i.vencida ? <b className="error">{dia(i.prazo)}</b> : dia(i.prazo)}</td><td>{i.dias_aberta}</td>
                </tr>
              ))}
            </DataTable>
          ) : <Empty title="Nenhuma perda em aberto" sub="Use Registrar perda quando uma peça for refugada, voltar para retrabalho ou sumir." />}
        </Panel>
      )}

      <Drawer open={novo} title="Registrar perda" onClose={() => setNovo(false)}>
        <div className="form-grid">
          <Field label="Tipo"><select value={f.classe} onChange={(e) => setF({ ...f, classe: e.target.value, motivo: e.target.value === "EXTRAVIADA" ? "EXTRAVIO" : f.motivo })}><option value="REFUGO">Refugo (perdeu)</option><option value="RETRABALHO">Retrabalho (volta ao setor)</option><option value="EXTRAVIADA">Peça extraviada</option></select></Field>
          <Field label="Pedido"><input value={f.pedido} onChange={(e) => setF({ ...f, pedido: e.target.value })} /></Field>
          <Field label="Peça"><input value={f.peca} onChange={(e) => setF({ ...f, peca: e.target.value })} /></Field>
          <Field label="OF (opcional)"><input value={f.of} onChange={(e) => setF({ ...f, of: e.target.value })} /></Field>
          <Field label="Setor"><input value={f.setor} placeholder="Ex.: CNC" onChange={(e) => setF({ ...f, setor: e.target.value })} /></Field>
          <Field label="Quantidade"><input type="number" min={1} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} /></Field>
          <Field label="Motivo"><select value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })}><option value="">Selecione…</option>{d.motivos.map((m: Row) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}</select></Field>
          <Field label="Observação"><textarea value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /></Field>
        </div>
        <button className="primary" disabled={busy} onClick={() => void agir({ acao: "ABRIR", ...f, quantidade: Number(f.quantidade) }, "Perda registrada.")}>Registrar</button>
      </Drawer>

      <Drawer open={!!sel} title={sel ? `Perda ${sel.numero} · pedido ${sel.pedido}` : ""} onClose={() => setSel(null)}>
        {sel && (
          <>
            <p><b>{sel.peca}</b> · {sel.motivo_nome} · {sel.classe}{sel.setor ? ` · ${sel.setor}` : ""}</p>
            {sel.obs && <p>{sel.obs}</p>}
            {["ABERTA", "DECIDIDA"].includes(sel.status) && (
              <div className="form-grid">
                <Field label="Decisão"><select value={dec.decisao} onChange={(e) => setDec({ ...dec, decisao: e.target.value })}><option value="REPOR">Repor a peça</option><option value="RETRABALHAR">Retrabalhar</option><option value="ACEITAR">Aceitar sem reposição</option></select></Field>
                {dec.decisao !== "ACEITAR" && <><Field label="Responsável"><input value={dec.responsavel} onChange={(e) => setDec({ ...dec, responsavel: e.target.value })} /></Field><Field label="Prazo"><input type="date" value={dec.prazo} onChange={(e) => setDec({ ...dec, prazo: e.target.value })} /></Field></>}
                <Field label={dec.decisao === "ACEITAR" ? "Justificativa" : "Observação"}><textarea value={dec.obs} onChange={(e) => setDec({ ...dec, obs: e.target.value })} /></Field>
                <button className="primary" disabled={busy} onClick={() => void agir({ acao: "DECIDIR", numero: sel.numero, ...dec }, "Decisão registrada.")}>Registrar decisão</button>
              </div>
            )}
            {["DECIDIDA", "REPOSICAO"].includes(sel.status) && <button className="primary" disabled={busy} onClick={() => void agir({ acao: "FECHAR", numero: sel.numero, obs: "Peça reposta ou retrabalho concluído" }, "Perda fechada.")}>Fechar (peça reposta/retrabalhada)</button>}
            <h4>Histórico</h4>
            <DataTable head={["Quando", "Evento", "Detalhe", "Por"]}>{d.eventos.map((e: Row, k: number) => <tr key={k}><td>{hora(e.em)}</td><td>{e.evento}</td><td>{e.detalhe}</td><td>{e.por}</td></tr>)}</DataTable>
          </>
        )}
      </Drawer>
    </>
  );
}
