"use client";

import ImportarMedicoes from "@/components/importar-medicoes";
import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "LOTES" | "PLANOS" | "INSTRUMENTOS" | "NC" | "PPM";
const n4 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dataPt = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const TONE: Record<string, Tone> = { ABERTO: "info", QUARENTENA: "danger", APROVADO: "success", REPROVADO: "danger", SUCATEADO: "danger", ABERTA: "warning", EM_ANALISE: "info", EM_ACAO: "info", ENCERRADA: "success" };

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function QualidadeInspecaoPage() {
  const { me } = useOps();
  const pode = ["PCP", "GERENTE", "QUALIDADE"].includes(me?.perfil || "");
  const [aba, setAba] = useState<Aba>("LOTES");
  const [d, setD] = useState<Row>({ lotes: [], instrumentos: [], planos: [], ncs: [], ppm: [], produtos: [], locais: [] });
  const [doc, setDoc] = useState<Row | null>(null);
  const [modal, setModal] = useState<{ tipo: string; v: Row } | null>(null);
  const [medir, setMedir] = useState<Record<number, { valor: string; instrumentoId: string }>>({});
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => { try { setD(await api("/api/qualidade")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const abrir = async (id: string) => { try { setDoc(await api(`/api/qualidade?id=${id}`)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const post = async (body: Record<string, unknown>, msg: string, reabrir?: string) => {
    setBusy(true); setErro(""); setOk("");
    try { const j = await api("/api/qualidade", body); setOk(typeof j.conforme === "boolean" ? (j.conforme ? "Medição conforme." : "Medição FORA da tolerância — lote em quarentena.") : msg); await carregar(); if (reabrir) await abrir(reabrir); return j; }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha."); return null; } finally { setBusy(false); }
  };
  const set = (k: string, val: unknown) => setModal(modal && { ...modal, v: { ...modal.v, [k]: val } });
  const validos = d.instrumentos.filter((i: Row) => i.ativo && !i.vencido);
  const l = doc?.lote as Row | undefined;
  const venc = d.instrumentos.filter((i: Row) => i.ativo && (i.vencido || Number(i.dias) <= 15)).length;

  return (
    <div className="page">
      <PageHeader eyebrow="Qualidade" title="Inspeção, medições e CAPA" description="Plano de inspeção → lote → medição com instrumento calibrado → decisão de uso → certificado."
        actions={pode && <>
          {aba === "LOTES" && <button className="primary" onClick={() => setModal({ tipo: "LOTE", v: { planoId: "", quantidade: "", referenciaTipo: "MANUAL", referencia: "", localId: "" } })}>Abrir lote de inspeção</button>}
          {aba === "PLANOS" && <button className="primary" onClick={() => setModal({ tipo: "PLANO", v: { produtoId: "", tipo: "FINAL", processo: "", amostragem: "TOTAL", amostragemValor: "0", caracteristicas: [{ nome: "", unidade: "mm", nominal: "", tolMin: "", tolMax: "", tipoInstrumento: "" }] } })}>Novo plano</button>}
          {aba === "INSTRUMENTOS" && <button className="primary" onClick={() => setModal({ tipo: "INSTRUMENTO", v: { codigo: "", descricao: "", tipo: "", calibradoEm: "", calibracaoValidade: "" } })}>Novo instrumento</button>}
          {aba === "NC" && <button className="primary" onClick={() => setModal({ tipo: "NC", v: { origem: "INTERNA", descricao: "", responsavel: "", prazo: "" } })}>Nova não conformidade</button>}
        </>} />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success" role="status">{ok}</div>}
      <div className="kpis">
        <Kpi label="Em quarentena" value={d.lotes.filter((x: Row) => x.status === "QUARENTENA").length} tone={d.lotes.some((x: Row) => x.status === "QUARENTENA") ? "danger" : ""} />
        <Kpi label="Lotes abertos" value={d.lotes.filter((x: Row) => x.status === "ABERTO").length} />
        <Kpi label="Calibração vencida/≤15d" value={venc} tone={venc ? "warn" : ""} />
        <Kpi label="NC abertas" value={d.ncs.filter((x: Row) => x.status !== "ENCERRADA").length} />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "LOTES", label: "Lotes" }, { value: "PLANOS", label: "Planos" }, { value: "INSTRUMENTOS", label: "Instrumentos" }, { value: "NC", label: "NC / CAPA" }, { value: "PPM", label: "PPM" }]} />
      <div style={{ marginTop: 12 }}>
        {aba === "LOTES" && <DataTable head={["Nº", "Produto", "Tipo", "Referência", "Qtd", "Amostra", "Status"]} empty={<Empty title="Nenhum lote de inspeção" />}>
          {d.lotes.map((x: Row) => <tr key={x.id} onClick={() => abrir(x.id)} style={{ cursor: "pointer" }}><td data-label="Nº">{x.numero}</td><td data-label="Produto"><b>{x.produto_codigo}</b> {x.produto_descricao}</td><td data-label="Tipo">{x.tipo}</td><td data-label="Referência">{x.referencia || "—"}</td><td data-label="Qtd">{n4(x.quantidade)}</td><td data-label="Amostra">{x.amostra}</td><td data-label="Status"><Badge tone={TONE[x.status]}>{x.status}</Badge></td></tr>)}
        </DataTable>}
        {aba === "PLANOS" && <DataTable head={["Produto", "Tipo", "Operação", "Amostragem", "Características"]} empty={<Empty title="Nenhum plano de inspeção" />}>
          {d.planos.map((p: Row) => <tr key={p.id}><td data-label="Produto"><b>{p.produto_codigo}</b> {p.produto_descricao}</td><td data-label="Tipo">{p.tipo}</td><td data-label="Operação">{p.processo || "—"}</td><td data-label="Amostragem">{p.amostragem}{p.amostragem !== "TOTAL" ? ` ${n4(p.amostragem_valor)}${p.amostragem === "PERCENTUAL" ? "%" : ""}` : ""}</td><td data-label="Características">{(p.caracteristicas || []).map((c: Row) => <div key={c.linha}>{c.nome}: {n4(c.tol_min)}–{n4(c.tol_max)} {c.unidade}</div>)}</td></tr>)}
        </DataTable>}
        {aba === "INSTRUMENTOS" && <DataTable head={["Código", "Tipo", "Calibrado em", "Validade", "Situação"]} empty={<Empty title="Nenhum instrumento" />}>
          {d.instrumentos.map((i: Row) => <tr key={i.id}><td data-label="Código"><b>{i.codigo}</b> {i.descricao}</td><td data-label="Tipo">{i.tipo || "—"}</td><td data-label="Calibrado em">{dataPt(i.calibrado_em)}</td><td data-label="Validade">{dataPt(i.calibracao_validade)}</td><td data-label="Situação">{i.vencido ? <Badge tone="danger">Vencido — bloqueado</Badge> : Number(i.dias) <= 15 ? <Badge tone="warning">Vence em {i.dias}d</Badge> : <Badge tone="success">Calibrado</Badge>}</td></tr>)}
        </DataTable>}
        {aba === "NC" && d.ncs.map((n: Row) => (
          <div key={n.id} className="panel" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b>NC {n.numero} · {n.origem}</b><Badge tone={TONE[n.status]}>{n.status.replace("_", " ")}</Badge></div>
            <p>{n.descricao}</p>
            {n.causa_raiz && <small>Causa raiz: {n.causa_raiz}</small>}
            {(n.porques || []).map((p: string, i: number) => <small key={i} style={{ display: "block" }}>{i + 1}º porquê: {p}</small>)}
            {(n.acoes || []).map((a: Row) => <div key={a.linha}>{a.tipo}: {a.descricao} {a.concluida_em ? <Badge tone="success">Concluída</Badge> : pode && n.status !== "ENCERRADA" && <button className="crm-secondary" onClick={() => post({ acao: "NC_ACAO_CONCLUIR", id: n.id, linha: a.linha }, "Ação concluída.")}>Concluir</button>}</div>)}
            {pode && n.status !== "ENCERRADA" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button className="crm-secondary" onClick={() => setModal({ tipo: "NC_ANALISE", v: { id: n.id, causaRaiz: n.causa_raiz, porques: [...(n.porques || []), "", "", "", "", ""].slice(0, 5) } })}>Análise (5 porquês)</button>
              <button className="crm-secondary" onClick={() => setModal({ tipo: "NC_ACAO", v: { id: n.id, tipo: "CORRETIVA", descricao: "", responsavel: "", prazo: "" } })}>Nova ação</button>
              <button className="primary" disabled={busy} onClick={() => post({ acao: "NC_ENCERRAR", id: n.id }, "NC encerrada.")}>Encerrar</button>
            </div>}
          </div>
        ))}
        {aba === "NC" && !d.ncs.length && <Empty title="Nenhuma não conformidade" />}
        {aba === "PPM" && <DataTable head={["Mês", "Inspecionado", "Rejeitado", "PPM", "Lotes", "Reprovados"]} empty={<Empty title="Sem lotes decididos" />}>
          {d.ppm.map((p: Row) => <tr key={p.mes}><td data-label="Mês">{p.mes}</td><td data-label="Inspecionado">{n4(p.inspecionado)}</td><td data-label="Rejeitado">{n4(p.rejeitado)}</td><td data-label="PPM"><b>{Number(p.ppm).toLocaleString("pt-BR")}</b></td><td data-label="Lotes">{p.lotes}</td><td data-label="Reprovados">{p.lotes_reprovados}</td></tr>)}
        </DataTable>}
      </div>

      <Modal open={!!l} onClose={() => setDoc(null)} title={l ? `Lote de inspeção ${l.numero} · ${l.produto_codigo}` : ""}
        footer={l && <>
          {l.status === "APROVADO" && <a className="btn primary" href={`/api/qualidade/certificado?id=${l.id}`} target="_blank" rel="noreferrer">Certificado (PDF)</a>}
          {pode && ["ABERTO", "QUARENTENA"].includes(l.status) && <>
            <button className="primary" disabled={busy} onClick={() => post({ acao: "DECIDIR", loteId: l.id, decisao: "APROVAR" }, "Lote aprovado.", l.id)}>Aprovar</button>
            <button className="crm-secondary" onClick={() => setModal({ tipo: "DECISAO", v: { decisao: "REPROVAR", motivo: "" } })}>Reprovar / desvio</button>
          </>}
        </>}>
        {l && doc && <div style={{ display: "grid", gap: 10 }}>
          <div><Badge tone={TONE[l.status]}>{l.status}</Badge> Qtd {n4(l.quantidade)} · Amostra por característica: <b>{l.amostra}</b> {Number(l.qtd_bloqueada) > 0 && <Badge tone="danger">{n4(l.qtd_bloqueada)} bloqueadas no estoque</Badge>}</div>
          {doc.caracteristicas.map((c: Row) => {
            const ms = doc.medicoes.filter((m: Row) => m.linha === c.linha), cep = doc.cep.find((x: Row) => x.linha === c.linha);
            const m = medir[c.linha] || { valor: "", instrumentoId: "" };
            return <div key={c.linha} className="panel" style={{ padding: 10 }}>
              <b>{c.nome}</b> <small>{n4(c.tol_min)} a {n4(c.tol_max)} {c.unidade}{c.tipo_instrumento ? ` · ${c.tipo_instrumento}` : ""} · {ms.length}/{l.amostra}</small>
              <div>{ms.map((x: Row) => <Badge key={x.id} tone={x.conforme ? "success" : "danger"}>{n4(x.valor)}</Badge>)}</div>
              {cep?.cpk != null && <small>Cp {cep.cp} · Cpk {cep.cpk} · Pp {cep.pp} · Ppk {cep.ppk} {cep.alertas?.length ? `· ${cep.alertas.length} alerta(s) de regra` : ""}</small>}
              {["ABERTO", "QUARENTENA"].includes(l.status) && ms.length < l.amostra && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "end", marginTop: 6 }}>
                <Field label="Valor"><input inputMode="decimal" value={m.valor} onChange={(e) => setMedir({ ...medir, [c.linha]: { ...m, valor: e.target.value } })} /></Field>
                <Field label="Instrumento"><select value={m.instrumentoId} onChange={(e) => setMedir({ ...medir, [c.linha]: { ...m, instrumentoId: e.target.value } })}><option value="">Selecione</option>{validos.map((i: Row) => <option key={i.id} value={i.id}>{i.codigo}</option>)}</select></Field>
                <button className="primary" disabled={busy || !m.valor || !m.instrumentoId} title={!m.valor || !m.instrumentoId ? "Informe valor e instrumento calibrado" : ""} onClick={async () => { if (await post({ acao: "MEDIR", loteId: l.id, linha: c.linha, valor: m.valor, instrumentoId: m.instrumentoId }, "", l.id)) setMedir({ ...medir, [c.linha]: { ...m, valor: "" } }); }}>Medir</button>
              </div>}
            </div>;
          })}
          {["ABERTO", "QUARENTENA"].includes(l.status) && <ImportarMedicoes instrumentos={validos} busy={busy} onImportar={async (medicoes, instrumentoId) => { const j = await post({ acao: "MEDIR_LOTE", loteId: l.id, instrumentoId, medicoes }, "Medições importadas.", l.id); return !!j; }} />}
          {l.decisao_por && <small>Decisão por {l.decisao_por} em {new Date(l.decisao_em).toLocaleString("pt-BR")} {l.decisao_motivo && `— ${l.decisao_motivo}`}</small>}
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "DECISAO"} onClose={() => setModal(null)} title="Decisão de uso"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Voltar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && l && await post({ acao: "DECIDIR", loteId: l.id, decisao: modal.v.decisao, motivo: modal.v.motivo }, "Decisão registrada.", l.id)) setModal(null); }}>Confirmar</button></>}>
        {modal?.tipo === "DECISAO" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Decisão"><select value={modal.v.decisao} onChange={(e) => set("decisao", e.target.value)}><option value="REPROVAR">Reprovar</option><option value="SUCATEAR">Sucatear</option><option value="LIBERAR_COM_DESVIO">Liberar com desvio</option></select></Field>
          <Field label="Motivo *"><textarea rows={3} value={modal.v.motivo} onChange={(e) => set("motivo", e.target.value)} /></Field>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "LOTE"} onClose={() => setModal(null)} title="Abrir lote de inspeção"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal) { const j = await post({ acao: "ABRIR_LOTE", ...modal.v, quantidade: Number(String(modal.v.quantidade).replace(",", ".")) }, "Lote aberto."); if (j) { setModal(null); await abrir(j.id); } } }}>Abrir</button></>}>
        {modal?.tipo === "LOTE" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Plano *"><select value={modal.v.planoId} onChange={(e) => set("planoId", e.target.value)}><option value="">Selecione</option>{d.planos.map((p: Row) => <option key={p.id} value={p.id}>{p.produto_codigo} · {p.tipo}{p.processo ? ` · ${p.processo}` : ""}</option>)}</select></Field>
          <Field label="Quantidade *"><input inputMode="decimal" value={modal.v.quantidade} onChange={(e) => set("quantidade", e.target.value)} /></Field>
          <Field label="Origem"><select value={modal.v.referenciaTipo} onChange={(e) => set("referenciaTipo", e.target.value)}><option value="MANUAL">Manual</option><option value="RECEBIMENTO">Recebimento</option><option value="OF">OF</option><option value="PALLET">Pallet</option></select></Field>
          <Field label="Referência (nº OF, nota, pallet)"><input value={modal.v.referencia} onChange={(e) => set("referencia", e.target.value)} /></Field>
          <Field label="Depósito (bloqueia saldo se reprovar)"><select value={modal.v.localId} onChange={(e) => set("localId", e.target.value)}><option value="">Sem bloqueio de saldo</option>{d.locais.map((x: Row) => <option key={x.id} value={x.id}>{x.codigo}</option>)}</select></Field>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "PLANO"} onClose={() => setModal(null)} title="Novo plano de inspeção"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "PLANO", ...modal.v }, "Plano salvo (versão anterior desativada).")) setModal(null); }}>Salvar</button></>}>
        {modal?.tipo === "PLANO" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Produto *"><select value={modal.v.produtoId} onChange={(e) => set("produtoId", e.target.value)}><option value="">Selecione</option>{d.produtos.map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select></Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
            <Field label="Tipo"><select value={modal.v.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="RECEBIMENTO">Recebimento</option><option value="PROCESSO">Processo</option><option value="FINAL">Final</option></select></Field>
            <Field label="Operação (processo)"><input value={modal.v.processo} onChange={(e) => set("processo", e.target.value)} /></Field>
            <Field label="Amostragem"><select value={modal.v.amostragem} onChange={(e) => set("amostragem", e.target.value)}><option value="TOTAL">100%</option><option value="FIXA">Qtd fixa</option><option value="PERCENTUAL">Percentual</option></select></Field>
            {modal.v.amostragem !== "TOTAL" && <Field label={modal.v.amostragem === "FIXA" ? "Peças" : "% do lote"}><input inputMode="decimal" value={modal.v.amostragemValor} onChange={(e) => set("amostragemValor", e.target.value)} /></Field>}
          </div>
          {modal.v.caracteristicas.map((c: Row, idx: number) => {
            const upd = (k: string, val: string) => set("caracteristicas", modal.v.caracteristicas.map((x: Row, j: number) => j === idx ? { ...x, [k]: val } : x));
            return <div key={idx} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 6, padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
              <Field label="Característica *"><input value={c.nome} onChange={(e) => upd("nome", e.target.value)} /></Field>
              <Field label="Unidade"><input value={c.unidade} onChange={(e) => upd("unidade", e.target.value)} /></Field>
              <Field label="Nominal"><input inputMode="decimal" value={c.nominal} onChange={(e) => upd("nominal", e.target.value)} /></Field>
              <Field label="Tol. mín *"><input inputMode="decimal" value={c.tolMin} onChange={(e) => upd("tolMin", e.target.value)} /></Field>
              <Field label="Tol. máx *"><input inputMode="decimal" value={c.tolMax} onChange={(e) => upd("tolMax", e.target.value)} /></Field>
              <Field label="Tipo de instrumento"><input value={c.tipoInstrumento} onChange={(e) => upd("tipoInstrumento", e.target.value)} placeholder="ex.: paquimetro" /></Field>
              {modal.v.caracteristicas.length > 1 && <button type="button" className="crm-secondary" onClick={() => set("caracteristicas", modal.v.caracteristicas.filter((_: Row, j: number) => j !== idx))}>Remover</button>}
            </div>;
          })}
          <button type="button" className="crm-secondary" onClick={() => set("caracteristicas", [...modal.v.caracteristicas, { nome: "", unidade: "mm", nominal: "", tolMin: "", tolMax: "", tipoInstrumento: "" }])}>Adicionar característica</button>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "INSTRUMENTO"} onClose={() => setModal(null)} title="Instrumento de medição"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "INSTRUMENTO", ...modal.v }, "Instrumento salvo.")) setModal(null); }}>Salvar</button></>}>
        {modal?.tipo === "INSTRUMENTO" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Código *"><input value={modal.v.codigo} onChange={(e) => set("codigo", e.target.value)} /></Field>
          <Field label="Descrição"><input value={modal.v.descricao} onChange={(e) => set("descricao", e.target.value)} /></Field>
          <Field label="Tipo (ex.: paquimetro, trena)"><input value={modal.v.tipo} onChange={(e) => set("tipo", e.target.value)} /></Field>
          <Field label="Calibrado em"><input type="date" value={modal.v.calibradoEm} onChange={(e) => set("calibradoEm", e.target.value)} /></Field>
          <Field label="Validade da calibração *"><input type="date" value={modal.v.calibracaoValidade} onChange={(e) => set("calibracaoValidade", e.target.value)} /></Field>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "NC"} onClose={() => setModal(null)} title="Nova não conformidade"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "NC", ...modal.v }, "NC aberta.")) setModal(null); }}>Abrir NC</button></>}>
        {modal?.tipo === "NC" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Origem"><select value={modal.v.origem} onChange={(e) => set("origem", e.target.value)}><option value="INTERNA">Interna</option><option value="FORNECEDOR">Fornecedor</option><option value="CLIENTE">Cliente</option></select></Field>
          <Field label="Descrição *"><textarea rows={3} value={modal.v.descricao} onChange={(e) => set("descricao", e.target.value)} /></Field>
          <Field label="Responsável"><input value={modal.v.responsavel} onChange={(e) => set("responsavel", e.target.value)} /></Field>
          <Field label="Prazo"><input type="date" value={modal.v.prazo} onChange={(e) => set("prazo", e.target.value)} /></Field>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "NC_ANALISE"} onClose={() => setModal(null)} title="Análise de causa (5 porquês)"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "NC_ANALISE", ...modal.v }, "Análise salva.")) setModal(null); }}>Salvar</button></>}>
        {modal?.tipo === "NC_ANALISE" && <div style={{ display: "grid", gap: 8 }}>
          {modal.v.porques.map((p: string, i: number) => <Field key={i} label={`${i + 1}º porquê`}><input value={p} onChange={(e) => set("porques", modal.v.porques.map((x: string, j: number) => j === i ? e.target.value : x))} /></Field>)}
          <Field label="Causa raiz *"><textarea rows={2} value={modal.v.causaRaiz} onChange={(e) => set("causaRaiz", e.target.value)} /></Field>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "NC_ACAO"} onClose={() => setModal(null)} title="Nova ação"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "NC_ACAO", ...modal.v }, "Ação registrada.")) setModal(null); }}>Salvar</button></>}>
        {modal?.tipo === "NC_ACAO" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Tipo"><select value={modal.v.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="CONTENCAO">Contenção</option><option value="CORRETIVA">Corretiva</option><option value="PREVENTIVA">Preventiva</option></select></Field>
          <Field label="Descrição *"><textarea rows={2} value={modal.v.descricao} onChange={(e) => set("descricao", e.target.value)} /></Field>
          <Field label="Responsável"><input value={modal.v.responsavel} onChange={(e) => set("responsavel", e.target.value)} /></Field>
          <Field label="Prazo"><input type="date" value={modal.v.prazo} onChange={(e) => set("prazo", e.target.value)} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
