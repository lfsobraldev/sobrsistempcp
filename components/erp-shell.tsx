"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  Factory,
  Flag,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Route,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OperationalProvider, useOps } from "@/components/operational-provider";

type MenuItem = { path: string; label: string; icon: LucideIcon };
type MenuGroup = { label: string; items: MenuItem[] };

const menus: MenuGroup[] = [
  {
    label: "Início",
    items: [{ path: "/dashboard", label: "Central de Produção", icon: LayoutDashboard }],
  },
  {
    label: "Produção",
    items: [
      { path: "/programacao", label: "Programação", icon: UploadCloud },
      { path: "/programacao-gerente", label: "Programação Gerente", icon: Route },
      { path: "/lideres", label: "Líderes / Setores", icon: UsersRound },
      { path: "/apontamentos", label: "Apontamento", icon: ClipboardCheck },
      { path: "/excecoes", label: "Faltas e Retrabalho", icon: PackageSearch },
    ],
  },
  {
    label: "Qualidade",
    items: [{ path: "/inspecao-pallets", label: "Qualidade", icon: ShieldCheck }],
  },
  {
    label: "Expedição",
    items: [{ path: "/romaneios", label: "Romaneios", icon: Boxes }],
  },
  {
    label: "Relatórios",
    items: [
      { path: "/prioridades", label: "Prioridades", icon: Flag },
      { path: "/historico", label: "Histórico", icon: History },
    ],
  },
  {
    label: "Configurações",
    items: [{ path: "/configuracoes", label: "Configurações", icon: Settings }],
  },
];

function allowed(role: string, path: string) {
  const pcp = [
    "/dashboard",
    "/programacao",
    "/programacao-gerente",
    "/prioridades",
    "/criticos",
    "/lideres",
    "/apontamentos",
    "/excecoes",
    "/inspecao-pallets",
    "/romaneios",
    "/historico",
    "/configuracoes",
  ];

  if (role === "PCP") return pcp.includes(path);
  if (role === "GERENTE")
    return ["/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico"].includes(path);
  if (role === "ENCARREGADO")
    return ["/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios"].includes(path);
  if (role === "LIDER") return ["/lideres", "/excecoes"].includes(path);
  if (role === "APONTADOR") return ["/apontamentos"].includes(path);
  if (role === "QUALIDADE") return ["/dashboard", "/inspecao-pallets"].includes(path);
  return false;
}

function Inner({ children }: { children: React.ReactNode }) {
  const { me, pg, lastSync, realtimeStatus, refresh, loading } = useOps();
  const path = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const visible = useMemo(
    () =>
      menus
        .map((g) => ({ ...g, items: g.items.filter((i) => me && allowed(me.perfil, i.path)) }))
        .filter((g) => g.items.length),
    [me]
  );

  const current = useMemo(() => {
    for (const g of menus) {
      const i = g.items.find((x) => x.path === path);
      if (i) return i.label;
    }
    return "Central de Produção";
  }, [path]);

  const allVisible = useMemo(() => visible.flatMap((g) => g.items), [visible]);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (allowed(me.perfil, path)) return;
    if (me.perfil === "LIDER") {
      router.replace("/lideres");
      return;
    }
    if (me.perfil === "APONTADOR") {
      router.replace("/apontamentos");
      return;
    }
    if (me.perfil === "QUALIDADE") {
      router.replace("/inspecao-pallets");
      return;
    }
    router.replace("/dashboard");
  }, [me, path, router, loading]);

  useEffect(() => {
    setMobileNav(false);
    setProfileOpen(false);
  }, [path]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function searchModule() {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return;
    const found = allVisible.find((item) => item.label.toLocaleLowerCase("pt-BR").includes(q));
    if (found) {
      router.push(found.path);
      setQuery("");
    }
  }

  if (loading)
    return (
      <div className="boot fioriBoot">
        <Factory />
        <b>SOBRAL PCP</b>
        <span>Preparando ambiente...</span>
      </div>
    );
  if (!me) return null;

  return (
    <div className={`fioriShell ${collapsed ? "isCollapsed" : ""} ${mobileNav ? "mobileOpen" : ""}`}>
      <header className="fioriShellBar">
        <div className="fioriShellLeft">
          <button
            className="fioriIconButton mobileMenuButton"
            onClick={() => setMobileNav((v) => !v)}
            aria-label="Abrir menu"
            title="Menu"
          >
            <Menu />
          </button>

          <button
            className="fioriIconButton desktopCollapseButton"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>

          <Link href="/dashboard" className="fioriSystemName">
            <span className="fioriSystemMark"><Factory /></span>
            <span>
              <b>Sobral PCP</b>
              <small>{current}</small>
            </span>
          </Link>
        </div>

        <div className="fioriGlobalSearch" role="search">
          <Search />
          <input
            aria-label="Buscar módulo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchModule();
            }}
            placeholder="Pesquisar módulos e funções"
          />
          {query && (
            <button onClick={searchModule} aria-label="Ir para resultado">
              Ir
            </button>
          )}
        </div>

        <div className="fioriShellRight">
          {pg && (
            <div className="fioriContextMeta">
              <span><small>Filtro</small><b>{pg.filtro || "-"}</b></span>
              <span><small>Turno</small><b>{pg.turno || "-"}</b></span>
              <span><small>Data</small><b>{new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}</b></span>
            </div>
          )}

          <button className="fioriIconButton" onClick={() => void refresh()} aria-label="Atualizar" title="Atualizar">
            <RefreshCw />
          </button>

          <button className="fioriIconButton notificationButton" aria-label="Notificações" title="Notificações">
            <Bell />
            <i className="notificationBadge">{realtimeStatus === "tempo_real" ? "1" : "!"}</i>
          </button>

          <button className="fioriIconButton" aria-label="Ajuda" title="Ajuda">
            <HelpCircle />
          </button>

          <div className="fioriProfileWrap">
            <button
              className="fioriAvatarButton"
              onClick={() => setProfileOpen((v) => !v)}
              aria-expanded={profileOpen}
            >
              <span className="fioriAvatar">{me.usuario.slice(0, 2).toUpperCase()}</span>
              <span className="fioriAvatarText">
                <b>{me.usuario}</b>
                <small>{me.perfil}</small>
              </span>
              <ChevronDown />
            </button>

            {profileOpen && (
              <div className="fioriProfileMenu">
                <div>
                  <b>{me.usuario}</b>
                  <span>{me.perfil}</span>
                </div>
                <div className="fioriLiveRow">
                  <i className={realtimeStatus === "tempo_real" ? "online" : ""} />
                  <span>
                    {realtimeStatus === "tempo_real" ? "Tempo real ativo" : "Sincronização"}
                    <small>{lastSync ? lastSync.toLocaleTimeString("pt-BR") : "--:--:--"}</small>
                  </span>
                </div>
                <button onClick={logout}><LogOut /> Sair</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="fioriSideNav">
        <nav>
          {visible.map((group) => (
            <section key={group.label} className="fioriNavGroup">
              {!collapsed && <label>{group.label}</label>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={path === item.path ? "active" : ""}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>

        {!collapsed && (
          <div className="fioriSideFooter">
            <span>Programação ativa</span>
            <b>{pg?.filtro || "Sem filtro"}</b>
            <small>
              {pg
                ? `Turno ${pg.turno} · ${new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}`
                : "Aguardando programação"}
            </small>
          </div>
        )}
      </aside>

      {mobileNav && <button className="fioriNavBackdrop" onClick={() => setMobileNav(false)} aria-label="Fechar menu" />}

      <main className="fioriMain">
        <div className="fioriPage">{children}</div>
      </main>
    </div>
  );
}

export default function ErpShell({ children }: { children: React.ReactNode }) {
  return (
    <OperationalProvider>
      <Inner>{children}</Inner>
    </OperationalProvider>
  );
}
