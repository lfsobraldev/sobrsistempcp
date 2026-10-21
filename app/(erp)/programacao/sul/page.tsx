import Link from "next/link";

const rows = [
  { filtro: "SUL-27", pedido: "2026-0401", item: "A-001", quantidade: 180, status: "Em produção" },
  { filtro: "SUL-28", pedido: "2026-0402", item: "B-114", quantidade: 95, status: "Atendido" },
  { filtro: "SUL-31", pedido: "2026-0403", item: "C-220", quantidade: 250, status: "Atrasado" },
];

export default function ProgramacaoSulPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Programação — Sul</h1>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "18px 0" }}>
        <Link href="/programacao/sul">Sul</Link>
        <Link href="/programacao/nordeste">Nordeste</Link>
        <Link href="/programacao/consolidado">Consolidado</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Card title="Total programado" value="1.224 peças" />
        <Card title="Itens" value="38" />
        <Card title="Atrasados" value="3" />
        <Card title="Unidade" value="SUL" />
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
