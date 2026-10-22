"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "REMESSAS" | "NOVA" | "FATURAMENTO" | "TRANSPORTADORAS";
const n3 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPt = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("pt-BR") : "—");
const tom: Record<string, Tone> = { ABERTA: "warning", SEPARANDO: "warning", FECHADA: "info", ENTREGUE: "success", CANCELADA: "neutral" } as Record<string, Tone>;

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function ExpedicaoPage() {
  const { me } = useOps();
  const pode = ["PCP", "GERENTE", "LOGISTICA"].includes(me?.perfil || "");
  const [aba, setAba] = useState<Aba>("REMESSAS");
  const [d, setD] = useState<Row | null>(null);
  const [det, setDet] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [nova, setNova] = useState<Row>({ pedidoId: "", localId: "", transportadoraId: "", frete: "0", previsaoEntrega: "", qtd: {} });
  const [atp, setAtp] = useState<Row | null>(null);
  const [leitura, setLeitura] = useState("");
  const [dev, setDev] = useState<Row | null>(null);
  const [oc, setOc] = useState<Row | null>(null);
  const [tr, setTr] = useState<Row>({ nome: "", documento: "", contato: "" });
  const [link, setLink] = useState("");

  const carregar = useCallback(async () => {
    try { setD(await api("/api/expedicao")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const abrir = useCallback(async (id: string) => { try { setDet(await api(`/api/expedicao?remessa=${id}`)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);

  const run = async (fn: () => Promise<unknown>, msg: string, refresh?: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); if (refresh) await abrir(refresh); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };

  const pedido = d?.pedidos.find((p: Row) => p.id === nova.pedidoId);
  const consultarAtp = async (it: Row) => {
    try { const j = await api(`/api/expedicao?atp=${it.produto_id}|${Number(nova.qtd[it.linha] || it.quantidade - it.expedido)}|${nova.previsaoEntrega || new Date().toISOString().slice(0, 10)}`); setAtp({ linha: it.linha, ...j.atp }); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  };
  const criar = () => run(async () => {
    const itens = (pedido?.itens ?? []).map((i: Row) => ({ pedidoLinha: i.linha, produtoId: i.produto_id, quantidade: Number(String(nova.qtd[i.linha] ?? "").replace(",", ".") || 0) })).filter((i: Row) => i.quantidade > 0);
    const j = await api("/api/expedicao", { acao: "REMESSA", pedidoId: nova.pedidoId, localId: nova.localId, transportadoraId: nova.transportadoraId || undefined, frete: Number(String(nova.frete).replace(",", ".")), previsaoEntrega: nova.previsaoEntrega, itens });
    setNova({ pedidoId: "", localId: nova.localId, transportadoraId: "", frete: "0", previsaoEntrega: "", qtd: {} }); setAba("REMESSAS"); await abrir(j.id);
  }, "Remessa criada.");

  const r = det?.remessa;
  const aberta = r && ["ABERTA", "SEPARANDO"].includes(r.status);
  return (
    <>
      <PageHeader eyebrow="Expedição" title="Remessas, carga e devoluções" description="Reserva, leitura de pallets liberados, fechamento da carga, entrega, devolução e link de acompanhamento do cliente." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <div className="kpis">
        <Kpi label="Abertas" value={d?.remessas.filter((x: Row) => ["ABERTA", "SEPARANDO"].includes(x.status)).length ?? 0} />
        <Kpi label="Em trânsito" value={d?.remessas.filter((x: Row) => x.status === "FECHADA").length ?? 0} />
        <Kpi label="Entregues" value={d?.remessas.filter((x: Row) => x.status === "ENTREGUE").length ?? 0} tone="success" />
        <Kpi label="Pedidos a expedir" value={d?.pedidos.length ?? 0} tone="warn" />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "REMESSAS", label: "Remessas" }, { value: "NOVA", label: "Nova remessa" }, { value: "FATURAMENTO", label: "Faturamento" }, { value: "TRANSPORTADORAS", label: "Transportadoras" }]} />

      {aba === "REMESSAS" && (
        <Panel title="Remessas">
          <DataTable head={["Nº", "Cliente", "Pedido", "Transportadora", "Pallets", "Previsão", "Status", ""]} empty={<Empty title="Sem remessas" />}>
            {(d?.remessas ?? []).map((x: Row) => (
              <tr key={x.id}><td data-label="Nº">{x.numero}</td><td data-label="Cliente">{x.cliente}</td><td data-label="Pedido">{x.pedido_numero}</td><td data-label="Transportadora">{x.transportadora || "—"}</td><td data-label="Pallets">{x.pallets}</td><td data-label="Previsão">{dataPt(x.previsao_entrega)}</td>
                <td data-label="Status"><Badge tone={tom[x.status] ?? "neutral"}>{x.status}</Badge></td><td><button className="crm-secondary" onClick={() => abrir(x.id)}>Abrir</button></td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "NOVA" && (
        <Panel title="Nova remessa">
          {!pode ? <Empty title="Sem permissão para criar remessas" /> : (<>
            <div className="formGrid">
              <Field label="Pedido de venda *"><select value={nova.pedidoId} onChange={(e) => { setNova({ ...nova, pedidoId: e.target.value, qtd: {} }); setAtp(null); }}><option value="">Selecione</option>{(d?.pedidos ?? []).map((p: Row) => <option key={p.id} value={p.id}>#{p.numero} · {p.cliente} · {p.pedido_cliente || p.pedido_pcp}</option>)}</select></Field>
              <Field label="Depósito *"><select value={nova.localId} onChange={(e) => setNova({ ...nova, localId: e.target.value })}><option value="">Selecione</option>{(d?.locais ?? []).map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
              <Field label="Transportadora"><select value={nova.transportadoraId} onChange={(e) => setNova({ ...nova, transportadoraId: e.target.value })}><option value="">—</option>{(d?.transportadoras ?? []).filter((t: Row) => t.ativo).map((t: Row) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></Field>
              <Field label="Frete (R$)"><input inputMode="decimal" value={nova.frete} onChange={(e) => setNova({ ...nova, frete: e.target.value })} /></Field>
              <Field label="Previsão de entrega"><input type="date" value={nova.previsaoEntrega} onChange={(e) => setNova({ ...nova, previsaoEntrega: e.target.value })} /></Field>
            </div>
            {pedido && (
              <DataTable head={["Item", "Pedido", "Já expedido", "Esta remessa", "Disponibilidade (ATP)", ""]}>
                {pedido.itens.map((i: Row) => (
                  <tr key={i.linha}><td data-label="Item">{i.codigo} · {i.descricao}</td><td data-label="Pedido">{n3(i.quantidade)}</td><td data-label="Já expedido">{n3(i.expedido)}</td>
                    <td data-label="Esta remessa"><input inputMode="decimal" disabled={!i.produto_id} placeholder={i.produto_id ? String(Math.max(0, i.quantidade - i.expedido)) : "sem cadastro"} value={nova.qtd[i.linha] ?? ""} onChange={(e) => setNova({ ...nova, qtd: { ...nova.qtd, [i.linha]: e.target.value } })} /></td>
                    <td data-label="ATP">{atp?.linha === i.linha ? <Badge tone={atp!.atende ? "success" : "danger"}>{atp!.atende ? "Atende" : "Não atende"} · livre {n3(atp!.livre_agora)} + produção {n3(atp!.producao_ate_data)}</Badge> : "—"}</td>
                    <td><button className="crm-secondary" disabled={!i.produto_id} onClick={() => consultarAtp(i)}>Verificar</button></td></tr>
                ))}
              </DataTable>
            )}
            <button className="primary" disabled={busy || !nova.pedidoId || !nova.localId} onClick={criar}>Criar remessa</button>
          </>)}
        </Panel>
      )}

      {aba === "FATURAMENTO" && (
        <Panel title="Eventos de faturamento (prontos para o fiscal)">
          <DataTable head={["Remessa", "Status", "Data", "Itens"]} empty={<Empty title="Nenhuma carga fechada" />}>
            {(d?.eventos ?? []).map((e: Row) => (
              <tr key={e.id}><td data-label="Remessa">{e.remessa}</td><td data-label="Status"><Badge tone={e.status === "PRONTO" ? "info" : "neutral"}>{e.status}</Badge></td><td data-label="Data">{dataPt(e.criado_em)}</td>
                <td data-label="Itens">{(e.payload?.itens ?? []).map((i: Row) => `${i.produto} × ${n3(i.quantidade)} (${brl(i.valor)})`).join("; ")}</td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "TRANSPORTADORAS" && (
        <Panel title="Transportadoras">
          {pode && (
            <div className="formGrid">
              <Field label="Nome *"><input value={tr.nome} onChange={(e) => setTr({ ...tr, nome: e.target.value })} /></Field>
              <Field label="CNPJ"><input value={tr.documento} onChange={(e) => setTr({ ...tr, documento: e.target.value })} /></Field>
              <Field label="Contato"><input value={tr.contato} onChange={(e) => setTr({ ...tr, contato: e.target.value })} /></Field>
              <button className="primary" disabled={busy || !tr.nome.trim()} onClick={() => run(async () => { await api("/api/expedicao", { acao: "TRANSPORTADORA", ...tr }); setTr({ nome: "", documento: "", contato: "" }); }, "Transportadora cadastrada.")}>Cadastrar</button>
            </div>
          )}
          <DataTable head={["Nome", "CNPJ", "Contato"]} empty={<Empty title="Nenhuma transportadora" />}>
            {(d?.transportadoras ?? []).map((t: Row) => <tr key={t.id}><td data-label="Nome">{t.nome}</td><td data-label="CNPJ">{t.documento || "—"}</td><td data-label="Contato">{t.contato || "—"}</td></tr>)}
          </DataTable>
        </Panel>
      )}

      <Modal open={!!det} onClose={() => { setDet(null); setLink(""); }} title={r ? `Remessa ${r.numero} · ${r.cliente}` : ""}>
        {r && (<>
          <p><Badge tone={tom[r.status] ?? "neutral"}>{r.status}</Badge> Pedido #{r.pedido_numero} · {r.transportadora || "sem transportadora"} · frete {brl(r.frete)} {r.nota_numero && `· NF ${r.nota_numero}`}</p>
          <DataTable head={["Item", "Quantidade"]}>{det!.itens.map((i: Row) => <tr key={i.linha}><td data-label="Item">{i.codigo} · {i.descricao}</td><td data-label="Quantidade">{n3(i.quantidade)}</td></tr>)}</DataTable>
          <h4>Pallets lidos ({det!.pallets.length})</h4>
          {aberta && pode && (
            <div className="formGrid">
              <Field label="Código / QR do pallet"><input value={leitura} onChange={(e) => setLeitura(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter" && leitura.trim()) { const c = leitura; setLeitura(""); void run(() => api("/api/expedicao", { acao: "LER_PALLET", remessaId: r.id, codigo: c }), `Pallet ${c} lido.`, r.id); } }} /></Field>
              <button className="primary" disabled={busy || !leitura.trim()} onClick={() => { const c = leitura; setLeitura(""); void run(() => api("/api/expedicao", { acao: "LER_PALLET", remessaId: r.id, codigo: c }), `Pallet ${c} lido.`, r.id); }}>Ler</button>
            </div>
          )}
          {det!.pallets.length ? <ul>{det!.pallets.map((p: Row) => <li key={p.codigo}>{p.codigo} · {n3(p.quantidade)} · {p.status}</li>)}</ul> : <Empty title="Nenhum pallet lido" />}
          <div className="actions">
            {aberta && pode && <button className="primary" disabled={busy} onClick={() => run(() => api("/api/expedicao", { acao: "FECHAR", remessaId: r.id }), "Carga fechada. Estoque baixado e evento de faturamento gerado.", r.id)}>Fechar carga</button>}
            {aberta && pode && <button className="crm-secondary" disabled={busy} onClick={() => run(() => api("/api/expedicao", { acao: "CANCELAR", remessaId: r.id }), "Remessa cancelada.", r.id)}>Cancelar</button>}
            {r.status === "FECHADA" && pode && <button className="primary" disabled={busy} onClick={() => run(() => api("/api/expedicao", { acao: "ENTREGAR", remessaId: r.id, nota: "" }), "Entrega confirmada.", r.id)}>Confirmar entrega</button>}
            {["FECHADA", "ENTREGUE"].includes(r.status) && pode && <button className="crm-secondary" onClick={() => setDev({ produtoId: det!.itens[0]?.produto_id ?? "", quantidade: "", destino: "ESTOQUE", motivo: "", localId: r.local_id })}>Registrar devolução</button>}
            {pode && <button className="crm-secondary" onClick={() => setOc({ tipo: "ATRASO", descricao: "" })}>Registrar ocorrência</button>}
            {pode && r.status !== "CANCELADA" && <button className="crm-secondary" disabled={busy} onClick={() => run(async () => { const j = await api("/api/expedicao", { acao: "PORTAL_LINK", remessaId: r.id }); setLink(`${window.location.origin}${j.caminho}`); }, "Link do cliente gerado (válido por 30 dias).")}>Link do cliente</button>}
            {pode && <button className="crm-secondary" disabled={busy} onClick={() => run(async () => { await api("/api/expedicao", { acao: "PORTAL_REVOGAR", remessaId: r.id }); setLink(""); }, "Link do cliente revogado.")}>Revogar link</button>}
          </div>
          {link && <Field label="Link para o cliente"><input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></Field>}
          {det!.devolucoes.length > 0 && (<><h4>Devoluções</h4><ul>{det!.devolucoes.map((x: Row) => <li key={x.id}>#{x.numero} · {x.codigo} × {n3(x.quantidade)} → {x.destino} · {brl(x.valor_aplicado)} · {x.motivo}</li>)}</ul></>)}
          {det!.ocorrencias.length > 0 && (<><h4>Ocorrências</h4><ul>{det!.ocorrencias.map((x: Row) => <li key={x.id}>{dataPt(x.criado_em)} · {x.origem} · {x.tipo}: {x.descricao}</li>)}</ul></>)}
        </>)}
      </Modal>

      <Modal open={!!dev} onClose={() => setDev(null)} title="Registrar devolução" footer={<button className="primary" disabled={busy} onClick={() => run(async () => { await api("/api/expedicao", { acao: "DEVOLVER", remessaId: r.id, produtoId: dev!.produtoId, quantidade: Number(String(dev!.quantidade).replace(",", ".")), destino: dev!.destino, motivo: dev!.motivo, localId: dev!.localId }); setDev(null); }, "Devolução registrada. Estoque e comissão ajustados.", r.id)}>Confirmar</button>}>
        {dev && (<div className="formGrid">
          <Field label="Produto"><select value={dev.produtoId} onChange={(e) => setDev({ ...dev, produtoId: e.target.value })}>{(det?.itens ?? []).map((i: Row) => <option key={i.linha} value={i.produto_id}>{i.codigo}</option>)}</select></Field>
          <Field label="Quantidade"><input inputMode="decimal" value={dev.quantidade} onChange={(e) => setDev({ ...dev, quantidade: e.target.value })} /></Field>
          <Field label="Destino"><select value={dev.destino} onChange={(e) => setDev({ ...dev, destino: e.target.value })}><option value="ESTOQUE">Volta ao estoque</option><option value="QUARENTENA">Quarentena</option></select></Field>
          <Field label="Depósito"><select value={dev.localId} onChange={(e) => setDev({ ...dev, localId: e.target.value })}>{(d?.locais ?? []).map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
          <Field label="Motivo *"><textarea value={dev.motivo} onChange={(e) => setDev({ ...dev, motivo: e.target.value })} /></Field>
        </div>)}
      </Modal>

      <Modal open={!!oc} onClose={() => setOc(null)} title="Registrar ocorrência" footer={<button className="primary" disabled={busy} onClick={() => run(async () => { await api("/api/expedicao", { acao: "OCORRENCIA", remessaId: r.id, ...oc }); setOc(null); }, "Ocorrência registrada.", r.id)}>Salvar</button>}>
        {oc && (<div className="formGrid">
          <Field label="Tipo"><select value={oc.tipo} onChange={(e) => setOc({ ...oc, tipo: e.target.value })}>{["ATRASO", "AVARIA", "FALTA", "RECUSA", "OUTRO"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Descrição *"><textarea value={oc.descricao} onChange={(e) => setOc({ ...oc, descricao: e.target.value })} /></Field>
        </div>)}
      </Modal>
    </>
  );
}
