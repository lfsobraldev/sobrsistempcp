"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "PEDIDOS" | "SOLICITACOES" | "SUGESTAO" | "TERCEIROS" | "FORNECEDORES" | "ABC";
const brl = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n3 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dataPt = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const LABEL: Record<string, string> = { RASCUNHO: "Rascunho", EM_APROVACAO: "Em aprovação", APROVADO: "Aprovado", PARCIAL: "Parcial", RECEBIDO: "Recebido", CANCELADO: "Cancelado", APROVADA: "Aprovada", ATENDIDA: "Atendida", CANCELADA: "Cancelada" };
const TONE: Record<string, Tone> = { RASCUNHO: "neutral", EM_APROVACAO: "warning", APROVADO: "info", PARCIAL: "warning", RECEBIDO: "success", CANCELADO: "danger", APROVADA: "info", ATENDIDA: "success", CANCELADA: "danger" };

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function ComprasPage() {
  const { me } = useOps();
  const pode = ["PCP", "GERENTE"].includes(me?.perfil || "");
  const [aba, setAba] = useState<Aba>("PEDIDOS");
  const [d, setD] = useState<Row>({ fornecedores: [], pedidos: [], solicitacoes: [], sugestao: [], abc: [], terceiros: [], produtos: [], locais: [], alcadas: [] });
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<Row | null>(null);
  const [modal, setModal] = useState<{ tipo: string; v: Row } | null>(null);
  const [xml, setXml] = useState<Row | null>(null);

  const carregar = useCallback(async () => { try { setD(await api("/api/compras")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const abrir = async (id: string) => { try { setDoc(await api(`/api/compras?id=${id}`)); setXml(null); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const post = async (body: Record<string, unknown>, msg: string, reabrir?: string) => {
    setBusy(true); setErro(""); setOk("");
    try { const j = await api("/api/compras", body); setOk(msg); await carregar(); if (reabrir) await abrir(reabrir); return j; }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha."); return null; } finally { setBusy(false); }
  };
  const prod = (id: string) => d.produtos.find((p: Row) => p.id === id);
  const set = (k: string, val: unknown) => setModal(modal && { ...modal, v: { ...modal.v, [k]: val } });
  const ver = (id: string) => d.fornecedores.find((f: Row) => f.id === id)?.razao_social || "";

  const pc = doc?.pedido as Row | undefined;
  const abertos = d.pedidos.filter((p: Row) => ["EM_APROVACAO", "APROVADO", "PARCIAL"].includes(p.status));

  return (
    <div className="page">
      <PageHeader eyebrow="Suprimentos" title="Compras e Terceirização" description="Solicitação → cotação → pedido com alçada → recebimento com conferência (XML) → estoque."
        actions={pode && <>
          {aba === "PEDIDOS" && <button className="primary" onClick={() => setModal({ tipo: "PEDIDO", v: { fornecedorId: "", previsao: "", itens: [{ produtoId: "", quantidade: "1", precoUnitario: "" }] } })}>Novo pedido</button>}
          {aba === "SOLICITACOES" && <button className="primary" onClick={() => setModal({ tipo: "SOLICITACAO", v: { motivo: "", itens: [{ produtoId: "", quantidade: "1" }] } })}>Nova solicitação</button>}
          {aba === "FORNECEDORES" && <button className="primary" onClick={() => setModal({ tipo: "FORNECEDOR", v: { razaoSocial: "", documento: "", email: "", telefone: "", condicaoPagamento: "", prazoMedioDias: "0", terceirizador: false } })}>Novo fornecedor</button>}
          {aba === "TERCEIROS" && <button className="primary" onClick={() => setModal({ tipo: "TERCEIRO", v: { tipo: "REMESSA", fornecedorId: "", produtoId: "", quantidade: "", custoServico: "0", localId: "", notaNumero: "" } })}>Remessa / retorno</button>}
        </>} />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success" role="status">{ok}</div>}
      <div className="kpis">
        <Kpi label="Pedidos em aberto" value={abertos.length} sub={brl(abertos.reduce((s: number, p: Row) => s + Number(p.total), 0))} />
        <Kpi label="Itens a comprar" value={d.sugestao.length} tone={d.sugestao.length ? "warn" : ""} />
        <Kpi label="Em poder de terceiros" value={d.terceiros.filter((t: Row) => Number(t.saldo) > 0).length} />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "PEDIDOS", label: "Pedidos" }, { value: "SOLICITACOES", label: "Solicitações" }, { value: "SUGESTAO", label: "Sugestão" }, { value: "TERCEIROS", label: "Terceiros" }, { value: "FORNECEDORES", label: "Fornecedores" }, { value: "ABC", label: "ABC/XYZ" }]} />
      <div style={{ marginTop: 12 }}>
        {aba === "PEDIDOS" && (
          <DataTable head={["Nº", "Fornecedor", "Previsão", "Total", "Aprovador", "Status"]} empty={<Empty title="Nenhum pedido de compra" />}>
            {d.pedidos.map((p: Row) => <tr key={p.id} onClick={() => abrir(p.id)} style={{ cursor: "pointer" }}><td data-label="Nº">{p.numero}</td><td data-label="Fornecedor"><b>{p.fornecedor_nome}</b></td><td data-label="Previsão">{dataPt(p.previsao)}</td><td data-label="Total">{brl(p.total)}</td><td data-label="Aprovador">{p.aprovador_exigido === "GERENTE" ? "Gerente" : "PCP"}</td><td data-label="Status"><Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge></td></tr>)}
          </DataTable>
        )}
        {aba === "SOLICITACOES" && d.solicitacoes.map((s: Row) => (
          <div key={s.id} className="panel" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b>Solicitação {s.numero}</b><Badge tone={TONE[s.status]}>{LABEL[s.status]}</Badge></div>
            <small>{s.motivo}</small>
            <DataTable head={["Item", "Qtd", "Propostas (menor preço vence)"]}>
              {(s.itens || []).map((i: Row) => (
                <tr key={i.linha}><td data-label="Item"><b>{i.codigo}</b> {i.descricao}</td><td data-label="Qtd">{n3(i.quantidade)}</td>
                  <td data-label="Propostas">{(i.propostas || []).map((p: Row) => <div key={p.fornecedor_id}>{p.fornecedor}: {brl(p.preco)} · {p.prazo}d {p.escolhida && <Badge tone="success">Escolhida</Badge>}</div>)}
                    {pode && s.status === "APROVADA" && <button className="crm-secondary" onClick={() => setModal({ tipo: "PROPOSTA", v: { solicitacaoId: s.id, linha: i.linha, fornecedorId: "", precoUnitario: "", prazoDias: "0" } })}>Cotar</button>}</td></tr>
              ))}
            </DataTable>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {pode && s.status === "RASCUNHO" && <button className="primary" disabled={busy} onClick={() => post({ acao: "SOLICITACAO_APROVAR", id: s.id }, "Solicitação aprovada.")}>Aprovar</button>}
              {pode && s.status === "APROVADA" && <button className="primary" disabled={busy} onClick={() => post({ acao: "COTACAO_GERAR_PEDIDOS", solicitacaoId: s.id }, "Pedidos gerados pelo menor preço.")}>Gerar pedidos (menor preço)</button>}
            </div>
          </div>
        ))}
        {aba === "SOLICITACOES" && !d.solicitacoes.length && <Empty title="Nenhuma solicitação" />}
        {aba === "SUGESTAO" && (
          <DataTable head={["Produto", "Disponível", "Em compra", "Nec. OFs", "Projeção", "Alvo", "Sugerido", "Prazo"]} empty={<Empty title="Nada a comprar" sub="Projeção cobre mínimo + segurança." />}>
            {d.sugestao.map((s: Row) => <tr key={s.produto_id}><td data-label="Produto"><b>{s.codigo}</b> {s.descricao}</td><td data-label="Disponível">{n3(s.disponivel)}</td><td data-label="Em compra">{n3(s.em_compra)}</td><td data-label="Nec. OFs">{n3(s.necessidade_of)}</td><td data-label="Projeção">{n3(s.projecao)}</td><td data-label="Alvo">{n3(s.alvo)}</td><td data-label="Sugerido"><b>{n3(s.sugerido)}</b></td><td data-label="Prazo">{s.lead_time_dias}d</td></tr>)}
          </DataTable>
        )}
        {aba === "TERCEIROS" && (
          <DataTable head={["Terceiro", "Produto", "Remetido", "Retornado", "Saldo", "Serviço"]} empty={<Empty title="Nada em poder de terceiros" />}>
            {d.terceiros.map((t: Row) => <tr key={`${t.fornecedor_id}${t.produto_id}`}><td data-label="Terceiro"><b>{t.fornecedor}</b></td><td data-label="Produto">{t.codigo}</td><td data-label="Remetido">{n3(t.remetido)}</td><td data-label="Retornado">{n3(t.retornado)}</td><td data-label="Saldo"><b>{n3(t.saldo)}</b></td><td data-label="Serviço">{brl(t.custo_servico)}</td></tr>)}
          </DataTable>
        )}
        {aba === "FORNECEDORES" && (
          <DataTable head={["Fornecedor", "Documento", "Contato", "Pagamento", "Tipo"]} empty={<Empty title="Nenhum fornecedor" />}>
            {d.fornecedores.map((f: Row) => <tr key={f.id} style={{ opacity: f.ativo ? 1 : 0.5 }}><td data-label="Fornecedor"><b>{f.razao_social}</b></td><td data-label="Documento">{f.documento || "—"}</td><td data-label="Contato">{f.email || f.telefone || "—"}</td><td data-label="Pagamento">{f.condicao_pagamento || "—"} · {f.prazo_medio_dias}d</td><td data-label="Tipo">{f.terceirizador ? "Terceirização" : "Compras"}</td></tr>)}
          </DataTable>
        )}
        {aba === "ABC" && (
          <DataTable head={["Produto", "Consumo (R$)", "% acum.", "ABC", "Variação", "XYZ"]} empty={<Empty title="Sem consumo nos últimos 180 dias" />}>
            {d.abc.map((a: Row) => <tr key={a.produto_id}><td data-label="Produto"><b>{a.codigo}</b> {a.descricao}</td><td data-label="Consumo (R$)">{brl(a.consumo_valor)}</td><td data-label="% acum.">{Number(a.percentual_acum)}%</td><td data-label="ABC"><Badge tone={a.classe_abc === "A" ? "danger" : a.classe_abc === "B" ? "warning" : "neutral"}>{a.classe_abc}</Badge></td><td data-label="Variação">{Number(a.coef_variacao)}</td><td data-label="XYZ">{a.classe_xyz}</td></tr>)}
          </DataTable>
        )}
      </div>

      <Modal open={!!pc} onClose={() => setDoc(null)} title={pc ? `Pedido de compra ${pc.numero} · ${pc.fornecedor_nome}` : ""}
        footer={pc && pode && <>
          {pc.status === "RASCUNHO" && <button className="primary" disabled={busy} onClick={() => post({ acao: "PEDIDO_ENVIAR", id: pc.id }, "Enviado para aprovação.", pc.id)}>Enviar para aprovação</button>}
          {["APROVADO", "PARCIAL"].includes(pc.status) && <button className="crm-secondary" disabled={busy} onClick={async () => { const j = await post({ acao: "PORTAL_LINK", pedidoId: pc.id }, "Link do fornecedor gerado."); if (j?.caminho) { const url = `${window.location.origin}${j.caminho}`; try { await navigator.clipboard.writeText(url); setOk("Link do fornecedor copiado. Vale por 30 dias; o anterior foi invalidado."); } catch { setOk(`Link do fornecedor: ${url}`); } } }}>Link para o fornecedor</button>}
          {pc.status === "EM_APROVACAO" && <button className="primary" disabled={busy} onClick={() => post({ acao: "PEDIDO_APROVAR", id: pc.id }, "Pedido aprovado.", pc.id)}>Aprovar ({pc.aprovador_exigido === "GERENTE" ? "Gerente" : "PCP/Gerente"})</button>}
          {["APROVADO", "PARCIAL"].includes(pc.status) && <button className="primary" onClick={() => setModal({ tipo: "RECEBER", v: { notaNumero: "", chave: "", localId: d.locais[0]?.id || "", itens: (doc!.itens as Row[]).filter((i) => Number(i.pendente) > 0).map((i) => ({ linha: i.linha, codigo: i.codigo, quantidade: String(Number(i.pendente)), precoNf: String(Number(i.preco_unitario)) })) } })}>Receber</button>}
          {["RASCUNHO", "EM_APROVACAO", "APROVADO"].includes(pc.status) && <button className="crm-secondary" onClick={() => setModal({ tipo: "CANCELAR", v: { motivo: "" } })}>Cancelar pedido</button>}
        </>}>
        {pc && doc && <div style={{ display: "grid", gap: 10 }}>
          <div><Badge tone={TONE[pc.status]}>{LABEL[pc.status]}</Badge> Total <b>{brl(pc.total)}</b> · Previsão {dataPt(pc.previsao)}</div>
          <DataTable head={["#", "Produto", "Pedido", "Recebido", "Pendente", "Preço"]}>
            {doc.itens.map((i: Row) => <tr key={i.linha}><td data-label="#">{i.linha}</td><td data-label="Produto"><b>{i.codigo}</b> {i.descricao}</td><td data-label="Pedido">{n3(i.quantidade)}</td><td data-label="Recebido">{n3(i.quantidade_recebida)}</td><td data-label="Pendente">{n3(i.pendente)}</td><td data-label="Preço">{brl(i.preco_unitario)}</td></tr>)}
          </DataTable>
          {doc.recebimentos.length > 0 && <div><b>Recebimentos</b>{doc.recebimentos.map((r: Row) => <div key={r.id}>NF {r.nota_numero || "s/n"} · {new Date(r.criado_em).toLocaleString("pt-BR")} {r.divergente && <Badge tone="warning">Divergência</Badge>}{(r.itens || []).filter((x: Row) => x.divergencia).map((x: Row) => <small key={x.linha} style={{ display: "block" }}>Linha {x.linha}: {x.divergencia}</small>)}</div>)}</div>}
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "RECEBER"} onClose={() => setModal(null)} title="Receber mercadoria"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && pc && await post({ acao: "RECEBER", pedidoId: pc.id, notaNumero: modal.v.notaNumero, chave: modal.v.chave, localId: modal.v.localId, itens: modal.v.itens.map((i: Row) => ({ linha: i.linha, quantidade: Number(String(i.quantidade).replace(",", ".")), precoNf: i.precoNf === "" ? null : Number(String(i.precoNf).replace(",", ".")) })) }, "Recebimento conferido e lançado no estoque.", pc.id)) setModal(null); }}>Confirmar recebimento</button></>}>
        {modal?.tipo === "RECEBER" && pc && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Arquivo XML da NF-e (opcional)"><input type="file" accept=".xml,text/xml" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try {
              const r = await api("/api/compras", { acao: "XML_CONFERIR", pedidoId: pc.id, xml: await f.text() });
              if (r.jaRecebida) throw new Error("Esta NF-e já foi recebida.");
              const itens = modal.v.itens.map((i: Row) => { const c = r.conferencia.find((x: Row) => x.linhaPedido === i.linha); return c ? { ...i, quantidade: String(c.quantidade), precoNf: String(c.precoNf) } : i; });
              setModal({ ...modal, v: { ...modal.v, chave: r.nfe.chave, notaNumero: r.nfe.numero, itens } });
              setXml(r); setErro(r.emitenteConfere ? "" : "Atenção: o CNPJ do emitente não é o do fornecedor do pedido.");
            } catch (x) { setErro(x instanceof Error ? x.message : "XML inválido."); }
          }} /></Field>
          {xml && <div className="alert">{xml.conferencia.map((c: Row) => <div key={c.linhaNfe}>Item NF {c.linhaNfe}: {c.situacao === "OK" ? "confere" : c.situacao === "PRECO_DIVERGE" ? "preço diverge" : c.situacao === "ACIMA_DO_PENDENTE" ? "acima do pendente" : "sem item no pedido (ignorado)"}</div>)}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            <Field label="Nº da nota"><input value={modal.v.notaNumero} onChange={(e) => set("notaNumero", e.target.value)} /></Field>
            <Field label="Chave NF-e (44 dígitos)"><input value={modal.v.chave} inputMode="numeric" onChange={(e) => set("chave", e.target.value.replace(/\D/g, "").slice(0, 44))} /></Field>
            <Field label="Depósito"><select value={modal.v.localId} onChange={(e) => set("localId", e.target.value)}>{d.locais.map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
          </div>
          {modal.v.itens.map((i: Row, idx: number) => (
            <div key={i.linha} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "end" }}>
              <b>{i.codigo}</b>
              <Field label="Qtd recebida"><input inputMode="decimal" value={i.quantidade} onChange={(e) => set("itens", modal.v.itens.map((x: Row, j: number) => j === idx ? { ...x, quantidade: e.target.value } : x))} /></Field>
              <Field label="Preço na NF"><input inputMode="decimal" value={i.precoNf} onChange={(e) => set("itens", modal.v.itens.map((x: Row, j: number) => j === idx ? { ...x, precoNf: e.target.value } : x))} /></Field>
            </div>
          ))}
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "CANCELAR"} onClose={() => setModal(null)} title="Cancelar pedido de compra"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Voltar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && pc && await post({ acao: "PEDIDO_CANCELAR", id: pc.id, motivo: modal.v.motivo }, "Pedido cancelado.", pc.id)) setModal(null); }}>Cancelar pedido</button></>}>
        {modal?.tipo === "CANCELAR" && <Field label="Motivo"><textarea rows={3} value={modal.v.motivo} onChange={(e) => set("motivo", e.target.value)} /></Field>}
      </Modal>

      <Modal open={modal?.tipo === "PEDIDO" || modal?.tipo === "SOLICITACAO"} onClose={() => setModal(null)} title={modal?.tipo === "PEDIDO" ? "Novo pedido de compra" : "Nova solicitação de compra"}
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => {
          if (!modal) return; const ped = modal.tipo === "PEDIDO";
          const itens = modal.v.itens.map((i: Row) => ({ produtoId: i.produtoId, quantidade: Number(String(i.quantidade).replace(",", ".")), precoUnitario: Number(String(i.precoUnitario ?? 0).replace(",", ".")) }));
          if (await post(ped ? { acao: "PEDIDO", fornecedorId: modal.v.fornecedorId, previsao: modal.v.previsao, itens } : { acao: "SOLICITACAO", motivo: modal.v.motivo, itens }, ped ? "Pedido criado." : "Solicitação criada.")) setModal(null);
        }}>Salvar</button></>}>
        {(modal?.tipo === "PEDIDO" || modal?.tipo === "SOLICITACAO") && <div style={{ display: "grid", gap: 8 }}>
          {modal.tipo === "PEDIDO" ? <>
            <Field label="Fornecedor *"><select value={modal.v.fornecedorId} onChange={(e) => set("fornecedorId", e.target.value)}><option value="">Selecione</option>{d.fornecedores.filter((f: Row) => f.ativo).map((f: Row) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}</select></Field>
            <Field label="Previsão de entrega"><input type="date" value={modal.v.previsao} onChange={(e) => set("previsao", e.target.value)} /></Field>
          </> : <Field label="Motivo"><input value={modal.v.motivo} onChange={(e) => set("motivo", e.target.value)} /></Field>}
          {modal.v.itens.map((i: Row, idx: number) => {
            const upd = (k: string, val: string) => set("itens", modal.v.itens.map((x: Row, j: number) => j === idx ? { ...x, [k]: val } : x));
            return <div key={idx} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 6 }}>
              <Field label="Produto" className="span2"><select value={i.produtoId} onChange={(e) => upd("produtoId", e.target.value)}><option value="">Selecione</option>{d.produtos.map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select></Field>
              <Field label="Qtd"><input inputMode="decimal" value={i.quantidade} onChange={(e) => upd("quantidade", e.target.value)} /></Field>
              {modal.tipo === "PEDIDO" && <Field label="Preço"><input inputMode="decimal" value={i.precoUnitario} onChange={(e) => upd("precoUnitario", e.target.value)} /></Field>}
              {modal.v.itens.length > 1 && <button type="button" className="crm-secondary" onClick={() => set("itens", modal.v.itens.filter((_: Row, j: number) => j !== idx))}>Remover</button>}
            </div>;
          })}
          <button type="button" className="crm-secondary" onClick={() => set("itens", [...modal.v.itens, modal.tipo === "PEDIDO" ? { produtoId: "", quantidade: "1", precoUnitario: "" } : { produtoId: "", quantidade: "1" }])}>Adicionar item</button>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "PROPOSTA"} onClose={() => setModal(null)} title="Registrar proposta"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "PROPOSTA", ...modal.v, precoUnitario: Number(String(modal.v.precoUnitario).replace(",", ".")), prazoDias: Number(modal.v.prazoDias) }, "Proposta registrada.")) setModal(null); }}>Salvar</button></>}>
        {modal?.tipo === "PROPOSTA" && <div style={{ display: "grid", gap: 8 }}>
          <Field label="Fornecedor *"><select value={modal.v.fornecedorId} onChange={(e) => set("fornecedorId", e.target.value)}><option value="">Selecione</option>{d.fornecedores.filter((f: Row) => f.ativo).map((f: Row) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}</select></Field>
          <Field label="Preço unitário"><input inputMode="decimal" value={modal.v.precoUnitario} onChange={(e) => set("precoUnitario", e.target.value)} /></Field>
          <Field label="Prazo (dias)"><input inputMode="numeric" value={modal.v.prazoDias} onChange={(e) => set("prazoDias", e.target.value)} /></Field>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "FORNECEDOR"} onClose={() => setModal(null)} title="Novo fornecedor"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "FORNECEDOR", ...modal.v, prazoMedioDias: Number(modal.v.prazoMedioDias) }, "Fornecedor cadastrado.")) setModal(null); }}>Salvar</button></>}>
        {modal?.tipo === "FORNECEDOR" && <div style={{ display: "grid", gap: 8 }}>
          {([["razaoSocial", "Razão social *"], ["documento", "CNPJ/CPF"], ["email", "E-mail"], ["telefone", "Telefone"], ["condicaoPagamento", "Condição de pagamento"], ["prazoMedioDias", "Prazo médio (dias)"]] as const).map(([k, l]) => <Field key={k} label={l}><input value={modal.v[k]} onChange={(e) => set(k, e.target.value)} /></Field>)}
          <label><input type="checkbox" checked={modal.v.terceirizador} onChange={(e) => set("terceirizador", e.target.checked)} /> Presta serviço de terceirização</label>
        </div>}
      </Modal>

      <Modal open={modal?.tipo === "TERCEIRO"} onClose={() => setModal(null)} title="Remessa / retorno de terceiro"
        footer={<><button className="crm-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { if (modal && await post({ acao: "TERCEIRO", ...modal.v, quantidade: Number(String(modal.v.quantidade).replace(",", ".")), custoServico: Number(String(modal.v.custoServico).replace(",", ".") || 0) }, modal.v.tipo === "REMESSA" ? "Remessa registrada e baixada do estoque." : "Retorno registrado e entrada no estoque.")) setModal(null); }}>Confirmar</button></>}>
        {modal?.tipo === "TERCEIRO" && <div style={{ display: "grid", gap: 8 }}>
          <Segmented value={modal.v.tipo} onChange={(v) => set("tipo", v)} options={[{ value: "REMESSA", label: "Remessa" }, { value: "RETORNO", label: "Retorno" }]} />
          <Field label="Terceiro *"><select value={modal.v.fornecedorId} onChange={(e) => set("fornecedorId", e.target.value)}><option value="">Selecione</option>{d.fornecedores.filter((f: Row) => f.ativo && f.terceirizador).map((f: Row) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}</select></Field>
          <Field label="Produto *"><select value={modal.v.produtoId} onChange={(e) => set("produtoId", e.target.value)}><option value="">Selecione</option>{d.produtos.map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select></Field>
          <Field label="Quantidade *"><input inputMode="decimal" value={modal.v.quantidade} onChange={(e) => set("quantidade", e.target.value)} /></Field>
          {modal.v.tipo === "RETORNO" && <Field label="Custo do serviço (R$)"><input inputMode="decimal" value={modal.v.custoServico} onChange={(e) => set("custoServico", e.target.value)} /></Field>}
          <Field label="Depósito *"><select value={modal.v.localId} onChange={(e) => set("localId", e.target.value)}><option value="">Selecione</option>{d.locais.map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
          <Field label="Nota fiscal"><input value={modal.v.notaNumero} onChange={(e) => set("notaNumero", e.target.value)} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
