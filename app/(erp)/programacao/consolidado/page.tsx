import Link from "next/link";

const groups = [
  { unidade: "Sul", programado: 1224, itens: 38, atrasados: 3 },
  { unidade: "Nordeste", programado: 1118, itens: 33, atrasados: 2 },
];

export default function ProgramacaoConsolidadoPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Programação — Consolidado</h1>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "18px 0" }}>
        <Link href="/programacao/sul">Sul</Link>
        <Link href="/programacao/nordeste">Nordeste</Link>
        <Link href="/programacao/consolidado">Consolidado</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Card title="Total geral" value="2.342 peças" />
        <Card title="Itens" value="71" />
        <Card title="Atrasados" value="5" />
        <Card title="Comparativo" value="+9,4%" />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Unidade</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Programado</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Itens</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}>Atrasados</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.unidade}>
              <td style={{ padding: 8 }}>{group.unidade}</td>
              <td style={{ padding: 8 }}>{group.programado}</td>
              <td style={{ padding: 8 }}>{group.itens}</td>
              <td style={{ padding: 8 }}>{group.atrasados}</td>
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
