"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";

type Row = Record<string, any>;
type Aba = "ORDENS" | "ATIVOS" | "PLANOS" | "INDICADORES";
const n1 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dh = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const tom: Record<string, Tone> = { ABERTA: "warning", EM_EXECUCAO: "info", CONCLUIDA: "success", CANCELADA: "neutral" } as Record<string, Tone>;
const hojeIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function ManutencaoPage() {
  const [aba, setAba] = useState<Aba>("ORDENS");
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [conc, setConc] = useState<Row | null>(null);
  const [peca, setPeca] = useState<Row | null>(null);
  const [ativo, setAtivo] = useState<Row>({ codigo: "", nome: "", processo: "", centroId: "", criticidade: "MEDIA" });
  const [plano, setPlano] = useState<Row>({ ativoId: "", descricao: "", periodicidadeDias: "30" });
  const [ordem, setOrdem] = useState<Row>({ ativoId: "", tipo: "CORRETIVA", prioridade: "MEDIA", descricao: "" });
  const [ini, setIni] = useState(() => `${hojeIso().slice(0, 7)}-01`);
  const [fim, setFim] = useState(hojeIso());
  const [ind, setInd] = useState<Row[] | null>(null);

  const carregar = useCallback(async () => { try { setD(await api("/api/manutencao")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (aba === "INDICADORES") api(`/api/manutencao?indicadores=${ini}|${fim}`).then((j) => setInd(j.indicadores)).catch((e) => setErro(e.message)); }, [aba, ini, fim]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const post = (b: Row) => api("/api/manutencao", b);
  const abertas = (d?.ordens ?? []).filter((o: Row) => ["ABERTA", "EM_EXECUCAO"].includes(o.status));
  const paradasAbertas = (d?.paradas ?? []).filter((p: Row) => !p.fim).length;

  return (
    <>
      <PageHeader eyebrow="Manutenção" title="Manutenção industrial" description="Ordens corretivas abertas automaticamente por parada de máquina (Andon), preventivas por periodicidade, peças do estoque e MTBF/MTTR." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <div className="kpis">
        <Kpi label="Ordens abertas" value={abertas.length} tone={abertas.length ? "warn" : ""} />
        <Kpi label="Corretivas abertas" value={abertas.filter((o: Row) => o.tipo === "CORRETIVA").length} tone="danger" />
        <Kpi label="Máquinas paradas agora" value={paradasAbertas} tone={paradasAbertas ? "danger" : "success"} />
        <Kpi label="Ativos" value={d?.ativos.length ?? 0} />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "ORDENS", label: "Ordens" }, { value: "ATIVOS", label: "Ativos" }, { value: "PLANOS", label: "Preventivas" }, { value: "INDICADORES", label: "MTBF / MTTR" }]} />

      {aba === "ORDENS" && (<>
        <Panel title="Nova ordem manual">
          <div className="formGrid">
            <Field label="Ativo *"><select value={ordem.ativoId} onChange={(e) => setOrdem({ ...ordem, ativoId: e.target.value })}><option value="">Selecione</option>{(d?.ativos ?? []).map((a: Row) => <option key={a.id} value={a.id}>{a.codigo} · {a.nome}</option>)}</select></Field>
            <Field label="Tipo"><select value={ordem.tipo} onChange={(e) => setOrdem({ ...ordem, tipo: e.target.value })}><option>CORRETIVA</option><option>PREVENTIVA</option></select></Field>
            <Field label="Prioridade"><select value={ordem.prioridade} onChange={(e) => setOrdem({ ...ordem, prioridade: e.target.value })}><option>MEDIA</option><option>ALTA</option><option>CRITICA</option></select></Field>
            <Field label="Descrição"><input value={ordem.descricao} onChange={(e) => setOrdem({ ...ordem, descricao: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !ordem.ativoId} onClick={() => run(() => post({ acao: "ORDEM", ...ordem }), "Ordem criada.")}>Abrir ordem</button>
            <button className="crm-secondary" disabled={busy} onClick={() => run(async () => { const j = await post({ acao: "GERAR_PREVENTIVAS" }); setOk(`${j.geradas} preventiva(s) gerada(s).`); }, "Planos verificados.")}>Gerar preventivas vencidas</button>
          </div>
        </Panel>
        <Panel title="Ordens de manutenção">
          <DataTable head={["OM", "Ativo", "Tipo", "Origem", "Prioridade", "Aberta em", "Peças", "Status", ""]} empty={<Empty title="Nenhuma ordem" />}>
            {(d?.ordens ?? []).map((o: Row) => (
              <tr key={o.id}><td data-label="OM">{o.numero}</td><td data-label="Ativo">{o.ativo} · {o.ativo_nome}</td><td data-label="Tipo"><Badge tone={o.tipo === "CORRETIVA" ? "danger" : "info"}>{o.tipo}</Badge></td><td data-label="Origem">{o.origem}</td><td data-label="Prioridade">{o.prioridade}</td><td data-label="Aberta em">{dh(o.aberta_em)}</td>
                <td data-label="Peças">{o.pecas.map((p: Row) => `${p.codigo}×${p.quantidade}`).join(", ") || "—"}</td><td data-label="Status"><Badge tone={tom[o.status] ?? "neutral"}>{o.status}</Badge></td>
                <td className="actions">
                  {o.status === "ABERTA" && <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "INICIAR", ordemId: o.id }), "Ordem iniciada.")}>Iniciar</button>}
                  {["ABERTA", "EM_EXECUCAO"].includes(o.status) && <>
                    <button className="crm-secondary" onClick={() => setPeca({ ordemId: o.id, produtoId: "", localId: d!.locais[0]?.id ?? "", quantidade: "1" })}>Peça</button>
                    <button className="primary" onClick={() => setConc({ ordemId: o.id, tipo: o.tipo, causa: "", solucao: "" })}>Concluir</button>
                    <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "CANCELAR", ordemId: o.id }), "Ordem cancelada.")}>Cancelar</button></>}</td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Últimas paradas">
          <DataTable head={["Ativo", "Início", "Fim", "Motivo"]} empty={<Empty title="Sem paradas registradas" />}>
            {(d?.paradas ?? []).map((p: Row) => <tr key={p.id}><td data-label="Ativo">{p.ativo}</td><td data-label="Início">{dh(p.inicio)}</td><td data-label="Fim">{p.fim ? dh(p.fim) : <Badge tone="danger">parada</Badge>}</td><td data-label="Motivo">{p.motivo}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "ATIVOS" && (
        <Panel title="Ativos e máquinas">
          <div className="formGrid">
            <Field label="Código *"><input value={ativo.codigo} onChange={(e) => setAtivo({ ...ativo, codigo: e.target.value })} /></Field>
            <Field label="Nome *"><input value={ativo.nome} onChange={(e) => setAtivo({ ...ativo, nome: e.target.value })} /></Field>
            <Field label="Setor (processo)" hint="liga o Andon ao ativo quando só há uma máquina no setor"><input value={ativo.processo} onChange={(e) => setAtivo({ ...ativo, processo: e.target.value })} /></Field>
            <Field label="Centro de capacidade" hint="vínculo exato com o roteiro"><select value={ativo.centroId} onChange={(e) => setAtivo({ ...ativo, centroId: e.target.value })}><option value="">—</option>{(d?.centros ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.processo} · {c.maquina} ({c.turno})</option>)}</select></Field>
            <Field label="Criticidade"><select value={ativo.criticidade} onChange={(e) => setAtivo({ ...ativo, criticidade: e.target.value })}><option>BAIXA</option><option>MEDIA</option><option>ALTA</option></select></Field>
            <button className="primary" disabled={busy || !ativo.codigo || !ativo.nome} onClick={() => run(() => post({ acao: "ATIVO", ...ativo }), "Ativo cadastrado.")}>Cadastrar</button>
          </div>
          <DataTable head={["Código", "Nome", "Setor", "Centro", "Criticidade"]} empty={<Empty title="Nenhum ativo" />}>
            {(d?.ativos ?? []).map((a: Row) => <tr key={a.id}><td data-label="Código">{a.codigo}</td><td data-label="Nome">{a.nome}</td><td data-label="Setor">{a.processo || "—"}</td><td data-label="Centro">{a.maquina ? `${a.cp} · ${a.maquina}` : "—"}</td><td data-label="Criticidade">{a.criticidade}</td></tr>)}
          </DataTable>
        </Panel>
      )}

      {aba === "PLANOS" && (
        <Panel title="Planos preventivos">
          <div className="formGrid">
            <Field label="Ativo *"><select value={plano.ativoId} onChange={(e) => setPlano({ ...plano, ativoId: e.target.value })}><option value="">Selecione</option>{(d?.ativos ?? []).map((a: Row) => <option key={a.id} value={a.id}>{a.codigo} · {a.nome}</option>)}</select></Field>
            <Field label="Descrição *"><input value={plano.descricao} onChange={(e) => setPlano({ ...plano, descricao: e.target.value })} /></Field>
            <Field label="A cada (dias)"><input inputMode="numeric" value={plano.periodicidadeDias} onChange={(e) => setPlano({ ...plano, periodicidadeDias: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !plano.ativoId || !plano.descricao} onClick={() => run(() => post({ acao: "PLANO", ...plano }), "Plano criado.")}>Criar plano</button>
          </div>
          <DataTable head={["Ativo", "Plano", "Periodicidade", "Última execução", "Próxima"]} empty={<Empty title="Nenhum plano" />}>
            {(d?.planos ?? []).map((p: Row) => <tr key={p.id}><td data-label="Ativo">{p.ativo}</td><td data-label="Plano">{p.descricao}</td><td data-label="Periodicidade">{p.periodicidade_dias} dias</td><td data-label="Última execução">{dataPt(p.ultima_execucao)}</td><td data-label="Próxima"><Badge tone={String(p.proxima).slice(0, 10) <= hojeIso() ? "danger" : "neutral"}>{dataPt(p.proxima)}</Badge></td></tr>)}
          </DataTable>
        </Panel>
      )}

      {aba === "INDICADORES" && (
        <Panel title="MTBF e MTTR por ativo (tempo de calendário)">
          <div className="formGrid">
            <Field label="De"><input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
            <Field label="Até"><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></Field>
          </div>
          <DataTable head={["Ativo", "Falhas", "Parada (h)", "MTTR (h)", "MTBF (h)"]} empty={<Empty title="Sem dados" />}>
            {(ind ?? []).map((i) => <tr key={i.ativo}><td data-label="Ativo">{i.ativo}</td><td data-label="Falhas">{i.falhas}</td><td data-label="Parada (h)">{n1(i.downtime_h)}</td><td data-label="MTTR (h)">{i.mttr_h == null ? "—" : n1(i.mttr_h)}</td><td data-label="MTBF (h)">{i.mtbf_h == null ? "—" : n1(i.mtbf_h)}</td></tr>)}
          </DataTable>
        </Panel>
      )}

      <Modal open={!!conc} onClose={() => setConc(null)} title="Concluir ordem" footer={<button className="primary" disabled={busy} onClick={() => run(async () => { await post({ acao: "CONCLUIR", ...conc }); setConc(null); }, "Ordem concluída.")}>Concluir</button>}>
        {conc && (<div className="formGrid">
          {conc.tipo === "CORRETIVA" && <Field label="Causa da falha *"><input value={conc.causa} onChange={(e) => setConc({ ...conc, causa: e.target.value })} /></Field>}
          <Field label={conc.tipo === "CORRETIVA" ? "Solução aplicada *" : "Observações"}><textarea value={conc.solucao} onChange={(e) => setConc({ ...conc, solucao: e.target.value })} /></Field>
        </div>)}
      </Modal>
      <Modal open={!!peca} onClose={() => setPeca(null)} title="Consumir peça do estoque" footer={<button className="primary" disabled={busy || !peca?.produtoId} onClick={() => run(async () => { await post({ acao: "PECA", ...peca }); setPeca(null); }, "Peça baixada do estoque.")}>Baixar peça</button>}>
        {peca && (<div className="formGrid">
          <Field label="Peça *"><select value={peca.produtoId} onChange={(e) => setPeca({ ...peca, produtoId: e.target.value })}><option value="">Selecione</option>{(d?.produtos ?? []).map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select></Field>
          <Field label="Depósito"><select value={peca.localId} onChange={(e) => setPeca({ ...peca, localId: e.target.value })}>{(d?.locais ?? []).map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
          <Field label="Quantidade"><input inputMode="decimal" value={peca.quantidade} onChange={(e) => setPeca({ ...peca, quantidade: e.target.value })} /></Field>
        </div>)}
      </Modal>
    </>
  );
}
