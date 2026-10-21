import Link from "next/link";
import { getMigrationCatalog } from "@/lib/migration-service";

export default async function MigracoesAdminPage() {
  const catalog = await getMigrationCatalog();
  const enabled = catalog.environment.allow;
  const count = catalog.migrations.length;

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div>
          <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: 1.2 }}>Administração</p>
          <h1 style={{ margin: "8px 0 0" }}>Migrações do banco</h1>
        </div>
        <Link href="/configuracoes" style={{ color: "#0f172a", textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 999, padding: "10px 16px", fontWeight: 600 }}>Voltar</Link>
      </header>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 24 }}>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <small>Ambiente</small>
          <h3 style={{ margin: "8px 0 0" }}>{catalog.environment.branch}</h3>
        </div>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <small>Banco</small>
          <h3 style={{ margin: "8px 0 0" }}>{catalog.environment.database}</h3>
        </div>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <small>Status</small>
          <h3 style={{ margin: "8px 0 0" }}>{enabled ? "Painel habilitado" : "Desabilitado por padrão"}</h3>
        </div>
      </section>

      {catalog.environment.production && (
        <div style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          Aviso: este ambiente está em produção. Use confirmação administrativa antes de aplicar qualquer migration.
        </div>
      )}

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12 }}>Migração</th>
              <th style={{ textAlign: "left", padding: 12 }}>Checksum</th>
              <th style={{ textAlign: "left", padding: 12 }}>Status</th>
              <th style={{ textAlign: "left", padding: 12 }}>SQL</th>
            </tr>
          </thead>
          <tbody>
            {catalog.migrations.map((migration) => (
              <tr key={migration.name} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: 12, verticalAlign: "top" }}>{migration.name}</td>
                <td style={{ padding: 12, verticalAlign: "top", fontFamily: "monospace" }}>{migration.checksum.slice(0, 12)}</td>
                <td style={{ padding: 12, verticalAlign: "top" }}>{migration.reverse ? "Reversível" : "Pendente"}</td>
                <td style={{ padding: 12, verticalAlign: "top", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{migration.up || migration.down || "Sem SQL"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {count === 0 && <p style={{ marginTop: 20 }}>Nenhuma migration registrada na pasta de migrações.</p>}
    </main>
  );
}
