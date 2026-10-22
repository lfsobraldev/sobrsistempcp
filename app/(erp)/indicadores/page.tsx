"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "PAINEL" | "ALERTAS" | "INTEGRACOES";
const pct = (v: unknown) => (v == null ? "—" : `${(Number(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const num = (v: unknown, d = 1) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dh = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const sev: Record<string, Tone> = { ALTA: "danger", MEDIA: "warning", BAIXA: "neutral" } as Record<string, Tone>;

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const hojeIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export default function IndicadoresPage() {
  const { me } = useOps();
  const gerente = me?.perfil === "GERENTE";
  const podeGerar = ["PCP", "GERENTE", "ENCARREGADO"].includes(me?.perfil || "");
  const [aba, setAba] = useState<Aba>("PAINEL");
  const [ini, setIni] = useState(() => `${hojeIso().slice(0, 7)}-01`);
  const [fim, setFim] = useState(hojeIso());
  const [d, setD] = useState<Row | null>(null);
  const [integ, setInteg] = useState<Row | null>(null);
  const [sac, setSac] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [segredo, setSegredo] = useState<{ titulo: string; valor: string } | null>(null);
  const [tk, setTk] = useState<Row>({ nome: "", escopos: ["leitura"], dias: "90" });
  const [wh, setWh] = useState<Row>({ nome: "", url: "", eventos: ["alerta.criado"] });

  const carregar = useCallback(async () => { try { setD(await api(`/api/indicadores?ini=${ini}&fim=${fim}`)); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, [ini, fim]);
  const carregarInteg = useCallback(async () => { if (!gerente) return; try { setInteg(await api("/api/integracoes")); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, [gerente]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { api(`/api/sac/indice?ini=${ini}&fim=${fim}`).then((j) => setSac(j.indice)).catch(() => setSac(null)); }, [ini, fim]);
  useEffect(() => { if (aba === "INTEGRACOES") void carregarInteg(); }, [aba, carregarInteg]);
  const run = async (fn: () => Promise<any>, msg: string, depois?: () => Promise<void>) => {
    setBusy(true); setErro(""); setOk("");
    try { const r = await fn(); setOk(typeof msg === "string" ? msg : ""); await (depois ?? carregar)(); return r; } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const p = d?.painel;

  return (
    <>
      <PageHeader eyebrow="Gestão" title="Indicadores, alertas e integrações" description="OTIF, lead time, giro, PPM, OEE parcial, comissões e carteira calculados direto do ledger; alertas proativos; tokens e webhooks assinados." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <Segmented value={aba} onChange={(v) => setAba(v as Aba)} options={[{ value: "PAINEL", label: "Painel" }, { value: "ALERTAS", label: `Alertas (${d?.alertas?.length ?? 0})` }, ...(gerente ? [{ value: "INTEGRACOES", label: "Integrações" }] : [])]} />

      {aba === "PAINEL" && (<>
        <Panel title="Período">
          <div className="formGrid">
            <Field label="De"><input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
            <Field label="Até"><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></Field>
          </div>
        </Panel>
        {p && (<>
          <div className="kpis">
            <Kpi label="OTIF" value={p.otif.percentual == null ? "—" : `${num(p.otif.percentual)}%`} sub={`${p.otif.otif} de ${p.otif.pedidos} pedidos`} tone={p.otif.percentual != null && p.otif.percentual < 90 ? "danger" : "success"} />
            <Kpi label="Lead time de OF" value={p.leadTime.leadTimeDias == null ? "—" : `${num(p.leadTime.leadTimeDias)} d`} sub={`${p.leadTime.ofsConcluidas} OF concluídas`} />
            <Kpi label="Giro anualizado" value={num(p.giro.giroAnualizado, 2)} sub={`Estoque ${brl(p.giro.valorEstoque)}`} />
            <Kpi label="PPM" value={num(p.ppm.ppm, 0)} sub={`${num(p.ppm.bloqueado, 0)} de ${num(p.ppm.inspecionado, 0)} peças`} />
          </div>
          <div className="kpis">
            <Kpi label={p.oee.oee != null ? "OEE" : "OEE parcial"} value={pct(p.oee.oee ?? p.oee.oeeParcial)} sub={`Disp. ${pct(p.oee.disponibilidade)} × Desemp. ${pct(p.oee.desempenho)} × Qual. ${pct(p.oee.qualidade)}`} />
            <Kpi label="Carteira a faturar" value={brl(p.carteira.saldoAFaturar)} sub={`${p.carteira.pedidosAbertos} pedidos abertos`} />
            <Kpi label="Carteira atrasada" value={brl(p.carteira.saldoAtrasado)} sub={`${p.carteira.atrasados} pedidos`} tone={p.carteira.atrasados ? "danger" : "success"} />
            <Kpi label="Comissões a pagar" value={brl(p.comissoes.A_PAGAR)} sub={`Previstas ${brl(p.comissoes.PREVISTA)}`} />
          </div>
          {sac && (
            <div className="kpis">
              <Kpi label="Reclamações" value={sac.reclamacoes} sub={`${sac.atendimentos} atendimentos no período`} tone={sac.reclamacoes ? "warn" : "success"} />
              <Kpi label="Índice de reclamação" value={sac.por100Pedidos == null ? "—" : `${num(sac.por100Pedidos, 2)} / 100 pedidos`} sub={`${sac.pedidosEntregues} pedidos entregues`} />
              <Kpi label="Tempo de resolução" value={sac.resolucao.diasMedios == null ? "—" : `${num(sac.resolucao.diasMedios)} d`} sub={`${sac.resolucao.concluidos} concluídos · ${sac.resolucao.noPrazo} no prazo`} />
              <Kpi label="Clientes reincidentes" value={sac.clientesReincidentes} sub="mais de um atendimento" />
            </div>
          )}
          <p className="muted">{p.oee.observacao}. Giro = custo das saídas no período anualizado ÷ valor atual do estoque.</p>
        </>)}
      </>)}

      {aba === "ALERTAS" && (
        <Panel title="Alertas abertos">
          {podeGerar && <button className="primary" disabled={busy} onClick={() => run(async () => { const j = await api("/api/indicadores", {}); setOk(`${j.novos} novo(s) alerta(s).`); return j; }, "")}>Recalcular alertas</button>}
          <DataTable head={["Severidade", "Tipo", "Mensagem", "Desde", ""]} empty={<Empty title="Nenhum alerta aberto" />}>
            {(d?.alertas ?? []).map((a: Row) => <tr key={a.id}><td data-label="Severidade"><Badge tone={sev[a.severidade]}>{a.severidade}</Badge></td><td data-label="Tipo">{a.tipo}</td><td data-label="Mensagem">{a.mensagem}</td><td data-label="Desde">{dh(a.criado_em)}</td><td>{a.link && <a href={a.link}>Abrir</a>}</td></tr>)}
          </DataTable>
        </Panel>
      )}

      {aba === "INTEGRACOES" && gerente && (<>
        <Panel title="Tokens da API (somente leitura: /api/v1/indicadores e /api/v1/alertas)">
          <div className="formGrid">
            <Field label="Nome *"><input value={tk.nome} onChange={(e) => setTk({ ...tk, nome: e.target.value })} /></Field>
            <Field label="Validade (dias)"><input inputMode="numeric" value={tk.dias} onChange={(e) => setTk({ ...tk, dias: e.target.value })} /></Field>
            <Field label="Escopos">{["leitura", "indicadores", "alertas"].map((e) => <label key={e}><input type="checkbox" checked={tk.escopos.includes(e)} onChange={() => setTk({ ...tk, escopos: toggle(tk.escopos, e) })} /> {e}</label>)}</Field>
            <button className="primary" disabled={busy || !tk.nome} onClick={() => run(async () => { const j = await api("/api/integracoes", { acao: "TOKEN", ...tk }); setSegredo({ titulo: "Token criado", valor: j.token }); }, "Token criado.", carregarInteg)}>Gerar token</button>
          </div>
          <DataTable head={["Nome", "Final", "Escopos", "Expira", "Último uso", "Situação", ""]} empty={<Empty title="Nenhum token" />}>
            {(integ?.tokens ?? []).map((t: Row) => <tr key={t.id}><td data-label="Nome">{t.nome}</td><td data-label="Final">…{t.prefixo}</td><td data-label="Escopos">{t.escopos.join(", ")}</td><td data-label="Expira">{dh(t.expira_em)}</td><td data-label="Último uso">{dh(t.ultimo_uso)}</td><td data-label="Situação"><Badge tone={t.ativo ? "success" : "neutral"}>{t.ativo ? "ativo" : "revogado"}</Badge></td>
              <td>{t.ativo && <button className="crm-secondary" disabled={busy} onClick={() => run(() => api("/api/integracoes", { acao: "TOKEN_REVOGAR", id: t.id }), "Token revogado.", carregarInteg)}>Revogar</button>}</td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Webhooks (https, assinados com HMAC-SHA256)">
          <div className="formGrid">
            <Field label="Nome *"><input value={wh.nome} onChange={(e) => setWh({ ...wh, nome: e.target.value })} /></Field>
            <Field label="URL https *"><input value={wh.url} onChange={(e) => setWh({ ...wh, url: e.target.value })} /></Field>
            <Field label="Eventos">{(integ?.eventos ?? []).map((e: string) => <label key={e}><input type="checkbox" checked={wh.eventos.includes(e)} onChange={() => setWh({ ...wh, eventos: toggle(wh.eventos, e) })} /> {e}</label>)}</Field>
            <button className="primary" disabled={busy || !wh.nome || !wh.url} onClick={() => run(async () => { const j = await api("/api/integracoes", { acao: "WEBHOOK", ...wh }); setSegredo({ titulo: "Segredo do webhook", valor: j.segredo }); }, "Webhook criado.", carregarInteg)}>Criar webhook</button>
            <button className="crm-secondary" disabled={busy} onClick={() => run(async () => { const j = await api("/api/integracoes", { acao: "ENTREGAR" }); setOk(`${j.ok} enviado(s), ${j.falhas} falha(s).`); }, "", carregarInteg)}>Enviar pendentes agora</button>
          </div>
          <DataTable head={["Nome", "URL", "Eventos", "Pendentes", "Falhas", ""]} empty={<Empty title="Nenhum webhook" />}>
            {(integ?.webhooks ?? []).map((w: Row) => <tr key={w.id}><td data-label="Nome">{w.nome}</td><td data-label="URL">{w.url}</td><td data-label="Eventos">{w.eventos.join(", ")}</td><td data-label="Pendentes">{w.pendentes}</td><td data-label="Falhas">{w.falhas}</td>
              <td><button className="crm-secondary" disabled={busy} onClick={() => run(() => api("/api/integracoes", { acao: "WEBHOOK_ATIVO", id: w.id, ativo: !w.ativo }), w.ativo ? "Webhook desativado." : "Webhook ativado.", carregarInteg)}>{w.ativo ? "Desativar" : "Ativar"}</button></td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Últimos envios">
          <DataTable head={["Webhook", "Evento", "Status", "Tentativas", "Erro", "Criado"]} empty={<Empty title="Sem envios" />}>
            {(integ?.fila ?? []).map((f: Row) => <tr key={f.id}><td data-label="Webhook">{f.webhook}</td><td data-label="Evento">{f.evento}</td><td data-label="Status"><Badge tone={f.status === "ENVIADO" ? "success" : f.status === "FALHA" ? "danger" : "warning"}>{f.status}</Badge></td><td data-label="Tentativas">{f.tentativas}</td><td data-label="Erro">{f.ultimo_erro || "—"}</td><td data-label="Criado">{dh(f.criado_em)}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      <Modal open={!!segredo} onClose={() => setSegredo(null)} title={segredo?.titulo ?? ""}>
        <p>Copie agora; não será exibido novamente.</p>
        <input readOnly value={segredo?.valor ?? ""} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
      </Modal>
    </>
  );
}
