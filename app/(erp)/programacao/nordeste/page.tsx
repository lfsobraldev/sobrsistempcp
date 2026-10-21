import Link from "next/link";

const rows = [
  { filtro: "NE-14", pedido: "2026-0902", item: "D-011", quantidade: 260, status: "Em produção" },
  { filtro: "NE-19", pedido: "2026-0905", item: "E-512", quantidade: 130, status: "Atrasado" },
  { filtro: "NE-21", pedido: "2026-0906", item: "F-110", quantidade: 210, status: "Atendido" },
];

export default function ProgramacaoNordestePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Programação — Nordeste</h1>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "18px 0" }}>
        <Link href="/programacao/sul">Sul</Link>
        <Link href="/programacao/nordeste">Nordeste</Link>
        <Link href="/programacao/consolidado">Consolidado</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Card title="Total programado" value="1.118 peças" />
        <Card title="Itens" value="33" />
        <Card title="Atrasados" value="2" />
        <Card title="Unidade" value="NORDESTE" />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Filtro</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Pedido</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Item</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Qtde</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.filtro}>
              <td style={{ padding: 8 }}>{row.filtro}</td>
              <td style={{ padding: 8 }}>{row.pedido}</td>
              <td style={{ padding: 8 }}>{row.item}</td>
              <td style={{ padding: 8 }}>{row.quantidade}</td>
              <td style={{ padding: 8 }}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
