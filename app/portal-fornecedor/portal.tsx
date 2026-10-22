"use client";
import { useEffect, useState } from "react";

type Row = Record<string, any>;
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");

export default function Portal() {
  const [t, setT] = useState("");
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previsao, setPrevisao] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    const tk = new URLSearchParams(window.location.search).get("t") ?? "";
    setT(tk);
    if (!tk) { setErro("Link inválido."); return; }
    fetch(`/api/compras/portal?t=${encodeURIComponent(tk)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); if (j.pedido.previsao) setPrevisao(String(j.pedido.previsao).slice(0, 10)); })
      .catch((e) => setErro(e.message));
  }, []);

  const enviar = async () => {
    setBusy(true); setErro("");
    try {
      const r = await fetch("/api/compras/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t, previsao, observacao: obs }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setOk(true);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", fontFamily: "system-ui, sans-serif", color: "#14201a" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Confirmação de entrega</h1>
      <p style={{ margin: "0 0 20px", color: "#52645a" }}>Portal do fornecedor</p>
      {erro && <div role="alert" style={{ background: "#fdecea", border: "1px solid #f3b4ae", padding: 12, borderRadius: 8, marginBottom: 16 }}>{erro}</div>}
      {ok && <div role="status" style={{ background: "#e8f5ec", border: "1px solid #a8d5b5", padding: 12, borderRadius: 8, marginBottom: 16 }}>Previsão de entrega registrada. Obrigado!</div>}
      {d && (<>
        <p><b>Pedido de compra nº {d.pedido.numero}</b> · {d.pedido.fornecedor}</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "2px solid #cfdad3" }}><th>Item</th><th>Descrição</th><th>Qtd</th><th>Já recebido</th></tr></thead>
            <tbody>{d.itens.map((i: Row) => <tr key={i.linha} style={{ borderBottom: "1px solid #e3ebe6" }}><td>{i.codigo}</td><td>{i.descricao}</td><td>{i.quantidade}</td><td>{i.recebida}</td></tr>)}</tbody>
          </table>
        </div>
        {["APROVADO", "PARCIAL"].includes(d.pedido.status) ? (
          <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
            <label style={{ display: "grid", gap: 4 }}>Data prevista de entrega<input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} style={{ padding: 10, border: "1px solid #b9c9bf", borderRadius: 6 }} /></label>
            <label style={{ display: "grid", gap: 4 }}>Observação (opcional)<textarea value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} rows={3} style={{ padding: 10, border: "1px solid #b9c9bf", borderRadius: 6 }} /></label>
            <button disabled={busy || !previsao} onClick={enviar} style={{ padding: "12px 16px", background: "#1f7a45", color: "#fff", border: 0, borderRadius: 6, fontSize: 16, cursor: "pointer" }}>Confirmar previsão</button>
          </div>
        ) : <p>Este pedido não está disponível para confirmação (situação: {d.pedido.status}).</p>}
        {d.confirmacoes.length > 0 && <p style={{ marginTop: 24, color: "#52645a" }}>Última confirmação: {dataPt(d.confirmacoes[0].previsao_entrega)}</p>}
      </>)}
    </main>
  );
}
