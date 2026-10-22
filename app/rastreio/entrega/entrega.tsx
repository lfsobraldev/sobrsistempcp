"use client";
import { useEffect, useState } from "react";

type Row = Record<string, any>;
const dt = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const ST: Record<string, string> = { ABERTA: "Em separação", SEPARANDO: "Em separação", FECHADA: "Em trânsito", ENTREGUE: "Entregue", CANCELADA: "Cancelada" };

export default function Entrega() {
  const [token, setToken] = useState("");
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const consultar = async (t: string, ocorrencia?: string) => {
    const r = await fetch("/api/expedicao/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, ocorrencia }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Link indisponível."); return; }
    setErro(""); setD(j);
  };
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") || "";
    setToken(t); if (t) void consultar(t); else setErro("Link inválido.");
  }, []);
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui,sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Acompanhe sua entrega</h1>
      {erro && <p role="alert" style={{ color: "#b00020" }}>{erro}</p>}
      {d && (<>
        <p><strong>Remessa {d.remessa.numero}</strong> · Pedido {d.remessa.pedido_cliente || d.remessa.pedido}</p>
        <p>Situação: <strong>{ST[d.remessa.status] || d.remessa.status}</strong></p>
        <p>Previsão: {dt(d.remessa.previsao)} · Saída: {dt(d.remessa.fechada_em)} · Entrega: {dt(d.remessa.entregue_em)}</p>
        {d.remessa.transportadora && <p>Transportadora: {d.remessa.transportadora}</p>}
        <ul>{d.itens.map((i: Row) => <li key={i.codigo}>{i.codigo} — {i.descricao}: {i.quantidade}</li>)}</ul>
        <h2 style={{ fontSize: 16 }}>Ocorrências</h2>
        {d.eventos.length === 0 ? <p>Nenhuma ocorrência.</p> : <ul>{d.eventos.map((e: Row, n: number) => <li key={n}>{dt(e.criado_em)} · {e.tipo}: {e.descricao}</li>)}</ul>}
        <form onSubmit={(ev) => { ev.preventDefault(); const f = new FormData(ev.currentTarget).get("o") as string; void consultar(token, f).then(() => setMsg("Registrado. Obrigado!")); ev.currentTarget.reset(); }}>
          <label>Informar um problema<textarea name="o" required minLength={3} maxLength={500} style={{ display: "block", width: "100%", minHeight: 80 }} /></label>
          <button type="submit" style={{ marginTop: 8, padding: "10px 16px" }}>Enviar</button>
          {msg && <p>{msg}</p>}
        </form>
      </>)}
    </main>
  );
}
