import Link from "next/link";

const groups = [
  { unidade: "Sul", programado: 1224, itens: 38, atrasados: 3 },
  { unidade: "Nordeste", programado: 1118, itens: 33, atrasados: 2 },
];

export default function ProgramacaoConsolidadoPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: 1.2, color: "#475569" }}>Programação</p>
          <h1 style={{ margin: "8px 0 0" }}>Consolidado</h1>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/programacao/sul">Sul</Link>
          <Link href="/programacao/nordeste">Nordeste</Link>
          <Link href="/programacao/consolidado">Consolidado</Link>
        </div>
      </header>

      <section style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <strong>Competência</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={chipStyle}>10/2026</button>
              <button type="button" style={chipStyle}>11/2026</button>
              <button type="button" style={{ ...chipStyle, borderColor: "#2563eb", background: "#dbeafe" }}>Todos</button>
            </div>
          </div>
          <div>
            <strong>Visão</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={chipStyle}>Sul × Nordeste</button>
              <button type="button" style={chipStyle}>Totais gerais</button>
              <button type="button" style={chipStyle}>Resumo executivo</button>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Card title="Total geral" value="2.342 peças" />
        <Card title="Itens" value="71" />
        <Card title="Atrasados" value="5" />
        <Card title="Comparativo" value="+9,4%" />
      </div>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12 }}>Unidade</th>
              <th style={{ textAlign: "left", padding: 12 }}>Programado</th>
              <th style={{ textAlign: "left", padding: 12 }}>Itens</th>
              <th style={{ textAlign: "left", padding: 12 }}>Atrasados</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.unidade} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: 12 }}>{group.unidade}</td>
                <td style={{ padding: 12 }}>{group.programado}</td>
                <td style={{ padding: 12 }}>{group.itens}</td>
                <td style={{ padding: 12 }}>{group.atrasados}</td>
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
