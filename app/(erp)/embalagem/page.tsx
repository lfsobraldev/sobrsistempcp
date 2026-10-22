"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Kpi, Modal, PageHeader, Panel, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { useImpressaoEtiquetas } from "@/components/etiquetas";

type Row = Record<string, any>;
const tomStatus: Record<string, Tone> = { VALIDO: "success", ATENCAO: "warning", INVALIDO: "danger", RASCUNHO: "neutral", EM_EMBALAGEM: "info", FECHADO: "success", CANCELADO: "neutral" } as Record<string, Tone>;

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const post = (b: Row) => api("/api/embalagem", b);

export default function EmbalagemPage() {
  const { me } = useOps();
  const pode = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"].includes(me?.perfil || "");
  const [d, setD] = useState<Row | null>(null); const [det, setDet] = useState<Row | null>(null);
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const { imprimir, area } = useImpressaoEtiquetas();
  const [folha, setFolha] = useState<number | null>(null);

  const carregar = useCallback(async () => { try { setD(await api("/api/embalagem?visao=planos")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { const l = () => setFolha(null); window.addEventListener("afterprint", l); return () => window.removeEventListener("afterprint", l); }, []);
  const abrir = async (id: string) => { try { setDet(await api("/api/embalagem?visao=plano&id=" + id)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const run = async (fn: () => Promise<unknown>, msg: string, recarregarDet?: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); if (recarregarDet) await abrir(recarregarDet); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Expedição e logística" title="Plano de embalagem" description="Pallets planejados pelo romaneio (limites de portas, m³ e jogos por tipo de montagem), lista de embalagem com conferência item a item e fechamento do pallet sem divergência." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      {d && (<>
        <div className="kpis">
          <Kpi label="Planos em aberto" value={d.planos.filter((p: Row) => ["RASCUNHO", "EM_EMBALAGEM"].includes(p.status)).length} />
          <Kpi label="Pallets inválidos" value={d.planos.filter((p: Row) => ["RASCUNHO", "EM_EMBALAGEM"].includes(p.status)).reduce((a: number, p: Row) => a + Number(p.invalidos), 0)} tone="warn" sub="excedem as regras" />
          <Kpi label="Pedidos prontos para planejar" value={d.prontos.length} />
        </div>
        <Panel title="Romaneios prontos para virar plano">
          <DataTable head={["Pedido", "Cliente", "Montagem", "Pallets", "Revisão", ""]} empty={!d.prontos.length && <Empty title="Nenhum romaneio preparado sem plano" />}>
            {d.prontos.map((r: Row) => <tr key={r.pedido}><td><b>{r.pedido}</b></td><td>{r.cliente}</td><td>{r.montagem}</td><td>{r.pallets}</td><td>{r.em_revisao ? <Badge tone="warning">Revisão aberta</Badge> : "—"}</td>
              <td>{pode && <button className="primary" disabled={busy || r.em_revisao} onClick={() => run(async () => { const j = await post({ acao: "PLANO_GERAR", pedido: r.pedido }); await abrir(j.id); }, "Plano gerado.")}>Gerar plano</button>}</td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Planos">
          <DataTable head={["Nº", "Pedido", "Montagem", "Status", "Pallets", "Fechados", "Inválidos", ""]} empty={!d.planos.length && <Empty title="Nenhum plano" />}>
            {d.planos.map((p: Row) => <tr key={p.id}><td>{p.numero}</td><td><b>{p.pedido}</b> {p.em_revisao && <Badge tone="warning">Revisão aberta</Badge>}</td><td>{p.montagem}</td><td><Badge tone={tomStatus[p.status]}>{p.status.replace("_", " ")}</Badge></td><td>{p.pallets}</td><td>{p.fechados}</td><td>{Number(p.invalidos) ? <Badge tone="danger">{p.invalidos}</Badge> : "—"}</td>
              <td><button onClick={() => abrir(p.id)}>Abrir</button></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      <Modal open={!!det} title={det ? `Plano #${det.plano.numero} · pedido ${det.plano.pedido}` : ""} onClose={() => setDet(null)}
        footer={det && <div className="row" style={{ gap: 8 }}>
          <button onClick={() => { setFolha(-1); setTimeout(() => window.print(), 150); }}>Imprimir plano completo</button>
          {pode && ["RASCUNHO", "EM_EMBALAGEM"].includes(det.plano.status) && !Number(det.plano.fechados) && <button disabled={busy} onClick={() => run(() => post({ acao: "CANCELAR", id: det.plano.id }), "Plano cancelado.", det.plano.id)}>Cancelar plano</button>}
        </div>}>
        {det && det.pallets.map((p: Row) => {
          const itens = det.itens.filter((i: Row) => i.pallet_numero === p.numero);
          const fechado = !!p.fechado_em;
          return <Panel key={p.numero} title={`Pallet ${p.numero} · ${p.tipo}`} subtitle={`${p.regra} · ${p.volume_m3?.toFixed?.(3) ?? p.volume_m3} m³${p.limite_m3 ? " de " + p.limite_m3 : ""}`}
            actions={<span className="row" style={{ gap: 6 }}><Badge tone={tomStatus[p.status]}>{p.status}</Badge>{fechado && <Badge tone="success">{p.pallet_codigo}</Badge>}
              <button onClick={() => { setFolha(p.numero); setTimeout(() => window.print(), 150); }}>Lista</button>
              {fechado && <button onClick={() => imprimir([{ titulo: `PALLET ${p.pallet_codigo}`, linhas: [`Pedido ${det.plano.pedido}`, `${itens.reduce((a: number, i: Row) => a + i.quantidade, 0)} peças`, p.regra], qr: `PALLET:${p.pallet_codigo}` }])}>Etiqueta</button>}
              {pode && !fechado && <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "FECHAR_PALLET", id: det.plano.id, pallet: p.numero }), "Pallet fechado.", det.plano.id)}>Fechar pallet</button>}</span>}>
            <DataTable head={["Item", "Medida", "Planejado", "Conferido", "Observação"]}>
              {itens.map((i: Row) => <tr key={i.linha}><td>{i.descricao}</td><td>{i.medida || "—"}</td><td>{i.quantidade}</td>
                <td>{fechado ? i.qtd_conferida : <input size={5} inputMode="decimal" defaultValue={i.qtd_conferida ?? ""} disabled={!pode}
                  onBlur={(e) => { if (e.target.value === "") return; const obs = Number(e.target.value.replace(",", ".")) !== i.quantidade ? window.prompt("Divergência. Observação (obrigatória):") || "" : ""; void run(() => post({ acao: "CONFERIR", id: det.plano.id, pallet: p.numero, linha: i.linha, quantidade: e.target.value, observacao: obs }), "Conferência registrada.", det.plano.id); }} />}</td>
                <td>{i.observacao}</td></tr>)}
            </DataTable>
          </Panel>;
        })}
      </Modal>
      {area}
      <div className="print-area folha" aria-hidden>
        {det && folha !== null && (<>
          <h2>Lista de embalagem · Pedido {det.plano.pedido} · {det.plano.montagem}</h2>
          {det.pallets.filter((p: Row) => folha === -1 || p.numero === folha).map((p: Row) => (
            <div key={p.numero} style={{ marginBottom: 16, breakInside: "avoid" }}>
              <h3>Pallet {p.numero} · {p.tipo} · {p.regra}</h3>
              <table><thead><tr><th>Item</th><th>Medida</th><th>Qtd</th><th>Conf.</th></tr></thead>
                <tbody>{det.itens.filter((i: Row) => i.pallet_numero === p.numero).map((i: Row) => <tr key={i.linha}><td>{i.descricao}</td><td>{i.medida}</td><td>{i.quantidade}</td><td>☐</td></tr>)}</tbody></table>
            </div>))}
        </>)}
      </div>
    </>
  );
}
