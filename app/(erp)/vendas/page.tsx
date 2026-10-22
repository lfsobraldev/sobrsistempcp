"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { STATUS_PEDIDO } from "@/lib/vendas";

type Row = Record<string, any>;
type ItemDraft = { itemCodigo: string; familia: string; descricao: string; unidade: string; quantidade: string; precoUnitario: string; descontoPercentual: string };
const novoItem = (): ItemDraft => ({ itemCodigo: "", familia: "", descricao: "", unidade: "UN", quantidade: "1", precoUnitario: "", descontoPercentual: "0" });
const brl = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPt = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const LABEL: Record<string, string> = { RASCUNHO: "Rascunho", EM_APROVACAO: "Em aprovação", APROVADO: "Aprovado", EM_PRODUCAO: "Em produção", PARCIAL: "Parcial", ATENDIDO: "Atendido", FATURADO: "Faturado", CANCELADO: "Cancelado" };
const TONE: Record<string, Tone> = { RASCUNHO: "neutral", EM_APROVACAO: "warning", APROVADO: "info", EM_PRODUCAO: "info", PARCIAL: "warning", ATENDIDO: "success", FATURADO: "success", CANCELADO: "danger" };

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function VendasPage() {
  const { me } = useOps();
  const perfil = me?.perfil || "";
  const podeEditar = ["PCP", "GERENTE", "COMERCIAL"].includes(perfil);
  const financeiro = ["PCP", "GERENTE"].includes(perfil);
  const [aba, setAba] = useState<"PEDIDOS" | "COMISSOES">("PEDIDOS");
  const [lista, setLista] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [clientes, setClientes] = useState<Row[]>([]);
  const [representantes, setRepresentantes] = useState<Row[]>([]);
  const [resumo, setResumo] = useState<Row[]>([]);
  const [f, setF] = useState({ status: "", cliente: "", representante: "", mes: "", q: "" });
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [detalhe, setDetalhe] = useState<Row | null>(null);
  const [editor, setEditor] = useState<{ id?: string; v: Row; itens: ItemDraft[] } | null>(null);
  const [fin, setFin] = useState<{ acao: string; valor: string } | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ ...f, page: String(page) });
      const j = await api(`/api/vendas/pedidos?${qs}`);
      setLista(j.pedidos); setTotal(j.total); setResumo(j.resumo);
      if (j.clientes) setClientes(j.clientes);
      if (j.representantes) setRepresentantes(j.representantes);
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, [f, page]);
  useEffect(() => { void carregar(); }, [carregar]);

  const abrir = async (id: string) => { try { setDetalhe(await api(`/api/vendas/pedidos?id=${id}`)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const executar = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try {
      const j = await api("/api/vendas/pedidos", body);
      setOk(msg); await carregar();
      const id = (body.id as string) || j.id;
      if (id) await abrir(id);
      return true;
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); return false; } finally { setBusy(false); }
  };

  const kpi = useMemo(() => {
    const g = (s: string) => resumo.find((r) => r.status === s);
    return { aprov: g("EM_APROVACAO"), abertos: ["APROVADO", "EM_PRODUCAO", "PARCIAL"].map(g).filter(Boolean) as Row[], fat: g("FATURADO") };
  }, [resumo]);

  const abrirEditor = (p?: Row, itens?: Row[]) => setEditor({
    id: p?.id,
    v: p ? { clienteId: p.cliente_id, representanteId: p.representante_id || "", pedidoCliente: p.pedido_cliente, pedidoPcp: p.pedido_pcp, condicaoPagamento: p.condicao_pagamento, descontoPercentual: String(p.desconto_percentual), frete: String(p.frete), dataEntrega: p.data_entrega ? String(p.data_entrega).slice(0, 10) : "", observacoes: p.observacoes } : { clienteId: "", representanteId: "", pedidoCliente: "", pedidoPcp: "", condicaoPagamento: "", descontoPercentual: "0", frete: "0", dataEntrega: "", observacoes: "" },
    itens: itens?.length ? itens.map((i) => ({ itemCodigo: i.item_codigo, familia: i.familia, descricao: i.descricao, unidade: i.unidade, quantidade: String(i.quantidade), precoUnitario: String(i.preco_unitario), descontoPercentual: String(i.desconto_percentual) })) : [novoItem()],
  });

  const salvar = async () => {
    if (!editor) return;
    const itens = editor.itens.map((i) => ({ ...i, quantidade: Number(i.quantidade.replace(",", ".")), precoUnitario: Number(i.precoUnitario.replace(",", ".")), descontoPercentual: Number(i.descontoPercentual.replace(",", ".") || 0) }));
    const body = { acao: "SALVAR", id: editor.id, ...editor.v, descontoPercentual: Number(String(editor.v.descontoPercentual).replace(",", ".") || 0), frete: Number(String(editor.v.frete).replace(",", ".") || 0), itens };
    setBusy(true); setErro("");
    try { const j = await api("/api/vendas/pedidos", body); setEditor(null); setOk("Pedido salvo."); await carregar(); await abrir(j.id); }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar."); } finally { setBusy(false); }
  };
  const totalEditor = useMemo(() => editor ? editor.itens.reduce((s, i) => { const b = Number(i.quantidade.replace(",", ".")) * Number(i.precoUnitario.replace(",", ".")); return s + (Number.isFinite(b) ? b * (1 - Number(i.descontoPercentual.replace(",", ".") || 0) / 100) : 0); }, 0) : 0, [editor]);

  const p = detalhe?.pedido as Row | undefined;
  const st = p?.status as string | undefined;

  return (
    <div className="page">
      <PageHeader eyebrow="Comercial" title="Pedidos de Venda" description="Pedido → aprovação → produção → faturamento, com comissão do representante."
        actions={<>{podeEditar && aba === "PEDIDOS" && <button className="primary" onClick={() => abrirEditor()}>Novo pedido</button>}</>} />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success" role="status">{ok}</div>}
      <div className="kpis">
        <Kpi label="Aguardando aprovação" value={kpi.aprov?.qtd ?? 0} sub={brl(kpi.aprov?.total)} tone={kpi.aprov?.qtd ? "warn" : ""} />
        <Kpi label="Em carteira" value={kpi.abertos.reduce((s, r) => s + r.qtd, 0)} sub={brl(kpi.abertos.reduce((s, r) => s + Number(r.total), 0))} />
        <Kpi label="Faturados" value={kpi.fat?.qtd ?? 0} sub={brl(kpi.fat?.total)} tone="success" />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "PEDIDOS", label: "Pedidos" }, { value: "COMISSOES", label: "Comissões" }]} />

      {aba === "PEDIDOS" ? (
        <>
          <div className="filters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, margin: "12px 0" }}>
            <Field label="Busca"><input value={f.q} onChange={(e) => { setPage(1); setF({ ...f, q: e.target.value }); }} placeholder="Nº, cliente, pedido PCP" /></Field>
            <Field label="Status"><select value={f.status} onChange={(e) => { setPage(1); setF({ ...f, status: e.target.value }); }}><option value="">Todos</option>{STATUS_PEDIDO.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select></Field>
            <Field label="Cliente"><select value={f.cliente} onChange={(e) => { setPage(1); setF({ ...f, cliente: e.target.value }); }}><option value="">Todos</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}</select></Field>
            <Field label="Representante"><select value={f.representante} onChange={(e) => { setPage(1); setF({ ...f, representante: e.target.value }); }}><option value="">Todos</option>{representantes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <Field label="Mês de entrega"><input type="month" value={f.mes} onChange={(e) => { setPage(1); setF({ ...f, mes: e.target.value }); }} /></Field>
          </div>
          <DataTable head={["Nº", "Cliente", "Representante", "Pedido cliente", "Entrega", "Total", "Status"]} empty={<Empty title="Nenhum pedido" sub="Ajuste os filtros ou crie um novo pedido." />}>
            {lista.map((r) => (
              <tr key={r.id} onClick={() => abrir(r.id)} style={{ cursor: "pointer" }}>
                <td data-label="Nº">{r.numero}</td>
                <td data-label="Cliente"><b>{r.cliente_nome}</b>{r.cliente_fantasia && <small style={{ display: "block" }}>{r.cliente_fantasia}</small>}</td>
                <td data-label="Representante">{r.representante_nome || "—"}</td>
                <td data-label="Pedido cliente">{r.pedido_cliente || "—"}</td>
                <td data-label="Entrega">{dataPt(r.data_entrega)}</td>
                <td data-label="Total">{brl(r.total)}</td>
                <td data-label="Status"><Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>{r.bloqueio_credito && <Badge tone="danger">Crédito</Badge>}</td>
              </tr>
            ))}
          </DataTable>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button className="crm-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span>Página {page} · {total} pedidos</span>
            <button className="crm-secondary" disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>
        </>
      ) : <Comissoes financeiro={financeiro} podeVer={podeEditar} representantes={representantes} clientes={clientes} onErro={setErro} onOk={setOk} />}

      <Modal open={!!detalhe} onClose={() => setDetalhe(null)} title={p ? `Pedido ${p.numero} · ${p.cliente_nome}` : ""}
        footer={p && <>
          {podeEditar && ["RASCUNHO", "EM_APROVACAO"].includes(st!) && <button className="crm-secondary" onClick={() => { abrirEditor(p, detalhe!.itens); setDetalhe(null); }}>Editar</button>}
          {podeEditar && st === "RASCUNHO" && <button className="primary" disabled={busy} onClick={() => executar({ acao: "ENVIAR", id: p.id }, "Pedido enviado.")}>Enviar</button>}
          {financeiro && st === "EM_APROVACAO" && <button className="primary" disabled={busy} onClick={() => executar({ acao: "APROVAR", id: p.id }, "Pedido aprovado.")}>Aprovar</button>}
          {financeiro && ["APROVADO", "EM_PRODUCAO", "PARCIAL", "ATENDIDO"].includes(st!) && <button className="primary" onClick={() => setFin({ acao: "FATURAR", valor: "" })}>Faturar</button>}
          {financeiro && Number(p.faturado_valor) > 0 && <button className="crm-secondary" onClick={() => setFin({ acao: "RECEBER", valor: "" })}>Receber</button>}
          {financeiro && Number(p.faturado_valor) > 0 && <button className="crm-secondary" onClick={() => setFin({ acao: "DEVOLVER", valor: "" })}>Devolução</button>}
          {podeEditar && ["RASCUNHO", "EM_APROVACAO", "APROVADO", "EM_PRODUCAO", "PARCIAL"].includes(st!) && Number(p.faturado_valor) === 0 && <button className="crm-secondary" onClick={() => setCancel("")}>Cancelar pedido</button>}
        </>}>
        {p && detalhe && (
          <div style={{ display: "grid", gap: 12 }}>
            <div><Badge tone={TONE[st!]}>{LABEL[st!]}</Badge> {p.requer_aprovacao && <Badge tone="warning">Desconto acima do limite</Badge>} {p.bloqueio_credito && <Badge tone="danger">Crédito excedido em {brl(p.credito_excedente)}</Badge>}</div>
            <div>Representante: <b>{p.representante_nome || "—"}</b> · Pedido cliente: <b>{p.pedido_cliente || "—"}</b> · PCP: <b>{p.pedido_pcp || "—"}</b> · Entrega: <b>{dataPt(p.data_entrega)}</b></div>
            <DataTable head={["#", "Descrição", "Qtd", "Preço", "Desc.%", "Total"]}>
              {detalhe.itens.map((i: Row) => <tr key={i.id}><td data-label="#">{i.linha}</td><td data-label="Descrição">{i.descricao}</td><td data-label="Qtd">{Number(i.quantidade)} {i.unidade}</td><td data-label="Preço">{brl(i.preco_unitario)}</td><td data-label="Desc.%">{Number(i.desconto_percentual)}</td><td data-label="Total">{brl(i.total)}</td></tr>)}
            </DataTable>
            <div>Total: <b>{brl(p.total)}</b> · Faturado: <b>{brl(p.faturado_valor)}</b> · Recebido: <b>{brl(p.recebido_valor)}</b> · Devolvido: <b>{brl(p.devolvido_valor)}</b></div>
            {detalhe.comissoes.length > 0 && <div><b>Comissões</b>{detalhe.comissoes.map((c: Row) => <div key={c.id}>{c.tipo} · {brl(c.valor)} · {c.status} · {c.competencia}</div>)}</div>}
            <details><summary>Histórico</summary>{detalhe.historico.map((h: Row) => <div key={h.id}>{new Date(h.criado_em).toLocaleString("pt-BR")} · {h.evento} {h.de ? `${LABEL[h.de] ?? h.de} → ${LABEL[h.para] ?? h.para}` : ""} · {h.usuario}</div>)}</details>
          </div>
        )}
      </Modal>

      <Modal open={!!fin} onClose={() => setFin(null)} title={fin ? { FATURAR: "Faturar", RECEBER: "Registrar recebimento", DEVOLVER: "Registrar devolução" }[fin.acao] : ""}
        footer={<><button className="crm-secondary" onClick={() => setFin(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (fin && p && await executar({ acao: fin.acao, id: p.id, valor: Number(fin.valor.replace(",", ".")) }, "Registrado.")) setFin(null); }}>Confirmar</button></>}>
        <Field label="Valor (R$)"><input inputMode="decimal" value={fin?.valor ?? ""} onChange={(e) => setFin(fin && { ...fin, valor: e.target.value })} /></Field>
      </Modal>
      <Modal open={cancel !== null} onClose={() => setCancel(null)} title="Cancelar pedido"
        footer={<><button className="crm-secondary" onClick={() => setCancel(null)}>Voltar</button><button className="primary" disabled={busy} onClick={async () => { if (p && await executar({ acao: "CANCELAR", id: p.id, motivo: cancel }, "Pedido cancelado.")) setCancel(null); }}>Cancelar pedido</button></>}>
        <Field label="Motivo"><textarea value={cancel ?? ""} onChange={(e) => setCancel(e.target.value)} rows={3} /></Field>
      </Modal>

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? "Editar pedido" : "Novo pedido"}
        footer={<><span style={{ marginRight: "auto" }}>Total estimado: <b>{brl(totalEditor)}</b></span><button className="crm-secondary" onClick={() => setEditor(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={salvar}>Salvar</button></>}>
        {editor && (
          <div style={{ display: "grid", gap: 10 }}>
            <Field label="Cliente *"><select value={editor.v.clienteId} onChange={(e) => { const c = clientes.find((x) => x.id === e.target.value); setEditor({ ...editor, v: { ...editor.v, clienteId: e.target.value, condicaoPagamento: editor.v.condicaoPagamento || c?.condicao_pagamento || "" } }); }}><option value="">Selecione</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}</select></Field>
            <Field label="Representante"><select value={editor.v.representanteId} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, representanteId: e.target.value } })}><option value="">Sem representante</option>{representantes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
              <Field label="Pedido do cliente"><input value={editor.v.pedidoCliente} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, pedidoCliente: e.target.value } })} /></Field>
              <Field label="Pedido PCP"><input value={editor.v.pedidoPcp} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, pedidoPcp: e.target.value } })} /></Field>
              <Field label="Entrega"><input type="date" value={editor.v.dataEntrega} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, dataEntrega: e.target.value } })} /></Field>
              <Field label="Cond. pagamento"><input value={editor.v.condicaoPagamento} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, condicaoPagamento: e.target.value } })} /></Field>
              <Field label="Desconto geral %"><input inputMode="decimal" value={editor.v.descontoPercentual} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, descontoPercentual: e.target.value } })} /></Field>
              <Field label="Frete (R$)"><input inputMode="decimal" value={editor.v.frete} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, frete: e.target.value } })} /></Field>
            </div>
            <b>Itens</b>
            {editor.itens.map((it, idx) => {
              const set = (k: keyof ItemDraft, val: string) => setEditor({ ...editor, itens: editor.itens.map((x, j) => (j === idx ? { ...x, [k]: val } : x)) });
              return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 6, padding: 8, border: "1px solid var(--line,#ddd)", borderRadius: 8 }}>
                  <Field label="Descrição" className="span2"><input value={it.descricao} onChange={(e) => set("descricao", e.target.value)} /></Field>
                  <Field label="Código"><input value={it.itemCodigo} onChange={(e) => set("itemCodigo", e.target.value)} /></Field>
                  <Field label="Família"><input value={it.familia} onChange={(e) => set("familia", e.target.value)} /></Field>
                  <Field label="Qtd"><input inputMode="decimal" value={it.quantidade} onChange={(e) => set("quantidade", e.target.value)} /></Field>
                  <Field label="Preço"><input inputMode="decimal" value={it.precoUnitario} onChange={(e) => set("precoUnitario", e.target.value)} /></Field>
                  <Field label="Desc. %"><input inputMode="decimal" value={it.descontoPercentual} onChange={(e) => set("descontoPercentual", e.target.value)} /></Field>
                  {editor.itens.length > 1 && <button type="button" className="crm-secondary" onClick={() => setEditor({ ...editor, itens: editor.itens.filter((_, j) => j !== idx) })}>Remover</button>}
                </div>
              );
            })}
            <button type="button" className="crm-secondary" onClick={() => setEditor({ ...editor, itens: [...editor.itens, novoItem()] })}>Adicionar item</button>
            <Field label="Observações"><textarea rows={2} value={editor.v.observacoes} onChange={(e) => setEditor({ ...editor, v: { ...editor.v, observacoes: e.target.value } })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Comissoes({ financeiro, podeVer, representantes, clientes, onErro, onOk }: { financeiro: boolean; podeVer: boolean; representantes: Row[]; clientes: Row[]; onErro: (s: string) => void; onOk: (s: string) => void }) {
  const [rep, setRep] = useState("");
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<Row>({ resumo: [], lancamentos: [], regras: [] });
  const [regra, setRegra] = useState<Row | null>(null);
  const carregar = useCallback(async () => {
    try { setD(await api(`/api/vendas/comissoes?${new URLSearchParams({ representante: rep, competencia: comp })}`)); onErro(""); }
    catch (e) { onErro(e instanceof Error ? e.message : "Falha."); }
  }, [rep, comp, onErro]);
  useEffect(() => { if (podeVer) void carregar(); }, [carregar, podeVer]);
  const post = async (body: Record<string, unknown>, msg: string) => { try { await api("/api/vendas/comissoes", body); onOk(msg); onErro(""); await carregar(); return true; } catch (e) { onErro(e instanceof Error ? e.message : "Falha."); return false; } };
  if (!podeVer) return <Empty title="Sem acesso às comissões" />;
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
        <Field label="Representante"><select value={rep} onChange={(e) => setRep(e.target.value)}><option value="">Todos</option>{representantes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Field>
        <Field label="Competência"><input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></Field>
      </div>
      <DataTable head={["Representante", "Previsto", "A pagar", "Pago", ""]} empty={<Empty title="Sem lançamentos" />}>
        {d.resumo.map((r: Row) => (
          <tr key={r.representante_id}><td data-label="Representante"><b>{r.nome}</b></td><td data-label="Previsto">{brl(r.previsto)}</td><td data-label="A pagar">{brl(r.a_pagar)}</td><td data-label="Pago">{brl(r.pago)}</td>
            <td>{financeiro && Number(r.a_pagar) > 0 && <button className="primary" onClick={() => post({ acao: "PAGAR", representanteId: r.representante_id, competencia: comp }, "Comissões marcadas como pagas.")}>Pagar</button>}</td></tr>
        ))}
      </DataTable>
      <b>Lançamentos</b>
      <DataTable head={["Pedido", "Cliente", "Representante", "Tipo", "Valor", "Status"]} empty={<Empty title="Nenhum lançamento na competência" />}>
        {d.lancamentos.map((l: Row) => <tr key={l.id}><td data-label="Pedido">{l.pedido_numero}</td><td data-label="Cliente">{l.cliente_nome}</td><td data-label="Representante">{l.representante_nome}</td><td data-label="Tipo">{l.tipo}</td><td data-label="Valor">{brl(l.valor)}</td><td data-label="Status">{l.status}</td></tr>)}
      </DataTable>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b>Regras de comissão</b>{financeiro && <button className="crm-secondary" onClick={() => setRegra({ representanteId: rep, clienteId: "", itemCodigo: "", familia: "", faixaMin: "", faixaMax: "", percentual: "", base: "FATURADO", vigenciaInicio: new Date().toISOString().slice(0, 10), vigenciaFim: "" })}>Nova regra</button>}</div>
      <DataTable head={["Representante", "Escopo", "%", "Base", "Vigência", ""]} empty={<Empty title="Sem regras — vale o % do cadastro do representante" />}>
        {d.regras.map((g: Row) => (
          <tr key={g.id} style={{ opacity: g.ativo ? 1 : 0.5 }}><td data-label="Representante">{g.representante_nome}</td>
            <td data-label="Escopo">{[g.cliente_nome, g.item_codigo, g.familia, g.faixa_min != null || g.faixa_max != null ? `${g.faixa_min ?? 0}–${g.faixa_max ?? "∞"}` : ""].filter(Boolean).join(" · ") || "Geral"}</td>
            <td data-label="%">{Number(g.percentual)}</td><td data-label="Base">{g.base}</td><td data-label="Vigência">{dataPt(g.vigencia_inicio)} → {dataPt(g.vigencia_fim)}</td>
            <td>{financeiro && g.ativo && <button className="crm-secondary" onClick={() => post({ acao: "REGRA_DESATIVAR", id: g.id }, "Regra desativada.")}>Desativar</button>}</td></tr>
        ))}
      </DataTable>
      <Modal open={!!regra} onClose={() => setRegra(null)} title="Nova regra de comissão"
        footer={<><button className="crm-secondary" onClick={() => setRegra(null)}>Cancelar</button><button className="primary" onClick={async () => { if (regra && await post({ acao: "REGRA", ...regra, percentual: Number(String(regra.percentual).replace(",", ".")) }, "Regra criada.")) setRegra(null); }}>Salvar</button></>}>
        {regra && (
          <div style={{ display: "grid", gap: 8 }}>
            <Field label="Representante *"><select value={regra.representanteId} onChange={(e) => setRegra({ ...regra, representanteId: e.target.value })}><option value="">Selecione</option>{representantes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Field>
            <Field label="Cliente (opcional)"><select value={regra.clienteId} onChange={(e) => setRegra({ ...regra, clienteId: e.target.value })}><option value="">Todos</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}</select></Field>
            <Field label="Código do item"><input value={regra.itemCodigo} onChange={(e) => setRegra({ ...regra, itemCodigo: e.target.value })} /></Field>
            <Field label="Família"><input value={regra.familia} onChange={(e) => setRegra({ ...regra, familia: e.target.value })} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Faixa mín. (R$)"><input inputMode="decimal" value={regra.faixaMin} onChange={(e) => setRegra({ ...regra, faixaMin: e.target.value })} /></Field>
              <Field label="Faixa máx. (R$)"><input inputMode="decimal" value={regra.faixaMax} onChange={(e) => setRegra({ ...regra, faixaMax: e.target.value })} /></Field>
              <Field label="Percentual *"><input inputMode="decimal" value={regra.percentual} onChange={(e) => setRegra({ ...regra, percentual: e.target.value })} /></Field>
              <Field label="Base"><select value={regra.base} onChange={(e) => setRegra({ ...regra, base: e.target.value })}><option value="FATURADO">Faturado</option><option value="RECEBIDO">Recebido</option></select></Field>
              <Field label="Início"><input type="date" value={regra.vigenciaInicio} onChange={(e) => setRegra({ ...regra, vigenciaInicio: e.target.value })} /></Field>
              <Field label="Fim"><input type="date" value={regra.vigenciaFim} onChange={(e) => setRegra({ ...regra, vigenciaFim: e.target.value })} /></Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
