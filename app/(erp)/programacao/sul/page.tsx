import Link from "next/link";

const rows = [
  { filtro: "SUL-27", pedido: "2026-0401", item: "A-001", quantidade: 180, status: "Em produção", atraso: "2 dias" },
  { filtro: "SUL-28", pedido: "2026-0402", item: "B-114", quantidade: 95, status: "Atendido", atraso: "0" },
  { filtro: "SUL-31", pedido: "2026-0403", item: "C-220", quantidade: 250, status: "Atrasado", atraso: "4 dias" },
];

export default function ProgramacaoSulPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: 1.2, color: "#475569" }}>Programação</p>
          <h1 style={{ margin: "8px 0 0" }}>Unidade Sul</h1>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/programacao/sul">Sul</Link>
          <Link href="/programacao/nordeste">Nordeste</Link>
          <Link href="/programacao/consolidado">Consolidado</Link>
        </div>
      </header>

      <section style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong>Competência</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={chipStyle}>10/2026</button>
              <button type="button" style={chipStyle}>11/2026</button>
              <button type="button" style={{ ...chipStyle, borderColor: "#2563eb", background: "#dbeafe" }}>Todos</button>
            </div>
          </div>
          <div>
            <strong>Filtro</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={chipStyle}>Atrasados</button>
              <button type="button" style={chipStyle}>Busca</button>
              <button type="button" style={chipStyle}>Visualização geral</button>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Card title="Total programado" value="1.224 peças" />
        <Card title="Itens" value="38" />
        <Card title="Atrasados" value="3" />
        <Card title="Comparativo" value="+6,8%" />
      </div>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12 }}>Filtro</th>
              <th style={{ textAlign: "left", padding: 12 }}>Pedido</th>
              <th style={{ textAlign: "left", padding: 12 }}>Item</th>
              <th style={{ textAlign: "left", padding: 12 }}>Qtde</th>
              <th style={{ textAlign: "left", padding: 12 }}>Status</th>
              <th style={{ textAlign: "left", padding: 12 }}>Atraso</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.filtro} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: 12 }}>{row.filtro}</td>
                <td style={{ padding: 12 }}>{row.pedido}</td>
                <td style={{ padding: 12 }}>{row.item}</td>
                <td style={{ padding: 12 }}>{row.quantidade}</td>
                <td style={{ padding: 12 }}>{row.status}</td>
                <td style={{ padding: 12 }}>{row.atraso}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
      <small>{title}</small>
      <h3 style={{ margin: "8px 0 0" }}>{value}</h3>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 999,
  padding: "7px 12px",
  cursor: "pointer",
  color: "#0f172a",
};
