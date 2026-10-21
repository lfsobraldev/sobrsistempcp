"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";

const tabs = [
  { id: "perfil", label: "Meu perfil" },
  { id: "preferencias", label: "Preferências" },
  { id: "notificacoes", label: "Notificações" },
  { id: "usuarios", label: "Usuários" },
  { id: "permissoes", label: "Papéis e permissões" },
  { id: "sistema", label: "Sistema" },
] as const;

export default function ConfiguracoesPage() {
  const { me } = useOps();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("perfil");
  const isAdmin = me?.perfil === "PCP" || me?.perfil === "GERENTE";

  const content = useMemo(() => {
    switch (tab) {
      case "perfil":
        return <PerfilTab />;
      case "preferencias":
        return <PreferenciasTab />;
      case "notificacoes":
        return <NotificacoesTab />;
      case "usuarios":
        return <UsuariosTab admin={isAdmin} />;
      case "permissoes":
        return <PermissoesTab admin={isAdmin} />;
      case "sistema":
        return <SistemaTab admin={isAdmin} />;
      default:
        return null;
    }
  }, [isAdmin, tab]);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: 1.2, color: "#475569" }}>Configurações</p>
          <h1 style={{ margin: "8px 0 0" }}>Ajustes do usuário e administração</h1>
        </div>
        {isAdmin && (
          <Link href="/admin/migracoes" style={{ textDecoration: "none", border: "1px solid #cbd5e1", padding: "10px 16px", borderRadius: 999, color: "#0f172a", fontWeight: 600 }}>
            Migrações
          </Link>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {tabs.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} style={{
            border: tab === item.id ? "1px solid #2563eb" : "1px solid #cbd5e1",
            background: tab === item.id ? "#dbeafe" : "#fff",
            color: "#0f172a",
            borderRadius: 999,
            padding: "8px 14px",
            cursor: "pointer",
            fontWeight: 600,
          }}>
            {item.label}
          </button>
        ))}
      </div>

      {content}
    </main>
  );
}

function PerfilTab() {
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Meu perfil</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Field label="Nome">João da Silva</Field>
        <Field label="E-mail">joao@empresa.com</Field>
        <Field label="Perfil">PCP</Field>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Foto (opcional)</span>
          <input type="file" disabled />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Trocar senha</span>
          <input type="password" value="********" readOnly />
        </label>
      </div>
    </section>
  );
}

function PreferenciasTab() {
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Preferências</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Field label="Tema">Escuro</Field>
        <Field label="Densidade">Compacta</Field>
        <Field label="Unidade padrão">Sul</Field>
        <Field label="Mês padrão">10/2026</Field>
        <Field label="Idioma">pt-BR</Field>
        <Field label="Formato de número">Brasil</Field>
      </div>
    </section>
  );
}

function NotificacoesTab() {
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Notificações</h2>
      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
        <li>Atraso em programação</li>
        <li>Ruptura de material</li>
        <li>Qualidade e inspeção</li>
        <li>Calibração de máquina</li>
      </ul>
    </section>
  );
}

function UsuariosTab({ admin }: { admin: boolean }) {
  if (!admin) return <EmptyAccess />;
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Usuários</h2>
      <p>Administração de usuários será habilitada junto com a fundação de RBAC e perfis por unidade.</p>
      <ul>
        <li>Criar / convidar usuários</li>
        <li>Ativar e desativar contas</li>
        <li>Redefinir senha</li>
        <li>Atribuir papéis e permissões</li>
      </ul>
    </section>
  );
}

function PermissoesTab({ admin }: { admin: boolean }) {
  if (!admin) return <EmptyAccess />;
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Papéis e permissões</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ padding: 8, textAlign: "left" }}>Papel</th>
            <th style={{ padding: 8, textAlign: "left" }}>Programação</th>
            <th style={{ padding: 8, textAlign: "left" }}>Estoque</th>
            <th style={{ padding: 8, textAlign: "left" }}>Admin</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={{ padding: 8 }}>PCP</td><td style={{ padding: 8 }}>Sim</td><td style={{ padding: 8 }}>Sim</td><td style={{ padding: 8 }}>Sim</td></tr>
          <tr><td style={{ padding: 8 }}>GERENTE</td><td style={{ padding: 8 }}>Sim</td><td style={{ padding: 8 }}>Sim</td><td style={{ padding: 8 }}>Não</td></tr>
          <tr><td style={{ padding: 8 }}>QUALIDADE</td><td style={{ padding: 8 }}>Leitura</td><td style={{ padding: 8 }}>Não</td><td style={{ padding: 8 }}>Não</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function SistemaTab({ admin }: { admin: boolean }) {
  if (!admin) return <EmptyAccess />;
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Sistema</h2>
      <p><strong>Versão:</strong> 8.0.0</p>
      <p><strong>Variáveis esperadas:</strong> AUTH_SECRET, DATABASE_URL, ALLOW_ADMIN_MIGRATIONS</p>
      <p><strong>Estado:</strong> saúde do sistema operacional satisfatória.</p>
      <Link href="/admin/migracoes" style={{ textDecoration: "none", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 999, padding: "10px 16px", display: "inline-block", width: "fit-content" }}>
        Abrir painel de migrações
      </Link>
    </section>
  );
}

function EmptyAccess() {
  return <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20 }}>Acesso administrativo indisponível para o perfil atual.</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: "#475569" }}>{label}</span>
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#f8fafc" }}>{children}</div>
    </label>
  );
}
