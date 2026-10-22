"use client";

import Link from "next/link";
import GlobalPCPFilters from "@/components/global-pcp-filters";
import UnidadeSelector from "./unidade-selector";
import { ResponsiveTables } from "./responsive-tables";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Boxes, BrainCircuit, Briefcase, ChevronDown, Flag, History, LayoutDashboard, LogOut, Menu, ClipboardList,
  PackageSearch, PanelLeftClose, PanelLeftOpen, RefreshCw, Route, Search, Settings, ShieldCheck,
  UploadCloud, UsersRound, Truck, ClipboardCheck, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OperationalProvider, useOps } from "@/components/operational-provider";
import AiAssistant from "@/components/ai-assistant";
import RomaneioAIModal from "@/components/romaneio-ai";
import { allowedPath } from "@/lib/permissions";
import { BrandLogo } from "@/components/brand-logo";

type MenuItem = { path: string; label: string; icon: LucideIcon };
type MenuGroup = { label: string; items: MenuItem[] };

const menus: MenuGroup[] = [
  { label: "Visão Geral", items: [{ path: "/dashboard", label: "Central de Produção", icon: LayoutDashboard }] },
  { label: "Comercial", items: [
    { path: "/marketing", label: "Marketing", icon: Briefcase },
    { path: "/comercial", label: "CRM Comercial", icon: Briefcase },
    { path: "/vendas", label: "Pedidos de Venda", icon: ClipboardList },
    { path: "/gestao-pedidos", label: "Pedidos e Entregas", icon: Truck },
  ] },
  { label: "Medição e Engenharia", items: [{ path: "/engenharia", label: "Engenharia de Produto", icon: ClipboardList }, { path: "/medicoes", label: "Medições e Aprovação", icon: ClipboardCheck }, { path: "/producao-consultas", label: "Rastreio e Onde é Usado", icon: ClipboardList }] },
  { label: "Carteira de Pedidos", items: [{ path: "/carteira", label: "Carteira de Pedidos", icon: ClipboardList }] },
  { label: "Compras e Estoque", items: [{ path: "/estoque", label: "Estoque", icon: Boxes }] },
  {
    label: "PCP e Produção",
    items: [
      { path: "/programacao", label: "Programação", icon: UploadCloud },
      { path: "/ordens-fabricacao", label: "Ordens de Fabricação", icon: ClipboardList },
      { path: "/planejamento-mensal", label: "Planejamento mensal", icon: ClipboardList },
      { path: "/programacao-gerente", label: "Planejamento", icon: Route },
      { path: "/apontamento-operacoes", label: "Apontamento de Operações", icon: ClipboardCheck },
      { path: "/lideres", label: "Líderes / Setores", icon: UsersRound },
      { path: "/pcp-painel", label: "Painel PCP", icon: LayoutDashboard },
      { path: "/integracao-consistem", label: "Integração Consistem", icon: RefreshCw },
      { path: "/excecoes", label: "Faltas e Retrabalho", icon: PackageSearch },
      { path: "/andon", label: "Andon", icon: Bell },
    ],
  },
  { label: "Qualidade", items: [{ path: "/inspecao-pallets", label: "Qualidade", icon: ShieldCheck }] },
  {
    label: "Expedição e Entregas",
    items: [
      { path: "/romaneios", label: "Romaneios", icon: Boxes },
      { path: "/apontamento-entregas", label: "Apontamento de Entregas", icon: Truck },
    ],
  },
  { label: "SAC", items: [{ path: "/sac", label: "Atendimento", icon: ClipboardList }] },
  {
    label: "Relatórios",
    items: [
      { path: "/prioridades", label: "Prioridades", icon: Flag },
      { path: "/criticos", label: "Pedidos Críticos", icon: PackageSearch },
      { path: "/fluxo", label: "Fluxo de Produção", icon: Route },
      { path: "/performance", label: "Performance", icon: RefreshCw },
      { path: "/perdas", label: "Perdas de Produção", icon: PackageSearch },
      { path: "/historico", label: "Histórico", icon: History },
      { path: "/sobral-ia", label: "Inteligência Operacional", icon: BrainCircuit },
    ],
  },
  { label: "Administração", items: [{ path: "/acessos", label: "Usuários e Unidades", icon: ShieldCheck }, { path: "/configuracoes", label: "Configurações", icon: Settings }] },
];

const HOME: Record<string, string> = { LIDER: "/lideres", APONTADOR: "/lideres", QUALIDADE: "/inspecao-pallets", COMERCIAL: "/comercial", LOGISTICA: "/gestao-pedidos", LIDER_ENTREGAS: "/apontamento-entregas", SAC: "/sac" };

function Inner({ children }: { children: React.ReactNode }) {
  const { me, pg, selectedProgramacaoId, selectProgramacao, lastSync, realtimeStatus, refresh, toast, loading,recorteQuery } = useOps();
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceTabs, setWorkspaceTabs] = useState<{path:string;label:string}[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [programacoesGlobais, setProgramacoesGlobais] = useState<Array<{id:string;filtro:string;data:string;turno:string;status:string}>>([]);

  const visible = useMemo(
    () => menus.map((g) => ({ ...g, items: g.items.filter((i) => me && allowedPath(me.perfil, i.path)) })).filter((g) => g.items.length),
    [me]
  );
  const allVisible = useMemo(() => visible.flatMap((g) => g.items), [visible]);
  const current = allVisible.find((i) => i.path === path)?.label || "Central de Produção";

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.topbar .search input, header .search input, .search input[aria-label="Buscar módulo"]')?.focus();
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    if (!me || !allowedPath(me.perfil, path)) return;
    const label = allVisible.find((item) => item.path === path)?.label || path;
    setWorkspaceTabs((previous) => previous.some((item) => item.path === path)
      ? previous
      : [...previous, { path, label }].slice(-12));
  }, [path, me, allVisible]);

  useEffect(() => {
    if (!me) return;
    let cancelado = false;
    fetch("/api/programacoes/historico", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Falha ao carregar filtros globais.");
        if (!cancelado) setProgramacoesGlobais((j.itens || []).map((x:any) => ({
          id: String(x.id), filtro: String(x.filtro || ""), data: String(x.data || ""),
          turno: String(x.turno || ""), status: String(x.status || "")
        })));
      })
      .catch(() => { if (!cancelado) setProgramacoesGlobais([]); });
    return () => { cancelado = true; };
  }, [me]);

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace("/login"); return; }
    if (allowedPath(me.perfil, path)) return;
    router.replace(HOME[me.perfil] || "/dashboard");
  }, [me, path, router, loading]);

  useEffect(() => { setMobileNav(false); setProfileOpen(false); }, [path]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  function searchModule() {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    const found = q && allVisible.find((i) => i.label.toLocaleLowerCase("pt-BR").includes(q));
    if (found) { router.push(found.path+window.location.search); setQuery(""); }
  }

  if (loading) return <div className="boot"><BrandLogo size={42} /><b>Sobral PCP</b><span>Preparando ambiente...</span></div>;
  if (!me) return null;

  const live = realtimeStatus === "tempo_real";
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${mobileNav ? "mobileOpen" : ""}`}>
      <ResponsiveTables />
      <aside className="sidenav">
        <div className="brand"><BrandLogo size={34} /><span className="brand-copy"><b>Sobral PCP</b><small>PCP Industrial</small></span></div>
        <div className="mobile-module-search search" role="search">
          <Search />
          <input aria-label="Buscar módulo" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchModule(); }} placeholder="Buscar módulo..." />
        </div>
        <nav aria-label="Navegação principal">
          {visible.map((g) => (
            <section key={g.label} className="navgroup">
              <label>{g.label}</label>
              {g.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} href={item.path+"?"+recorteQuery} className={`navlink ${path === item.path ? "active" : ""}`} title={collapsed ? item.label : undefined} aria-current={path === item.path ? "page" : undefined}>
                    <Icon /><span>{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidefoot">
          Programação ativa
          <b>{pg?.filtro || "Sem filtro"}</b>
          {pg ? `Turno ${pg.turno} · ${new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}` : "Aguardando programação"}
        </div>
      </aside>

      {mobileNav && <button className="backdrop" onClick={() => setMobileNav(false)} aria-label="Fechar menu" />}

      <header className="topbar2">
        <button className="ghost iconBtn menubtn" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu /></button>
        <button className="ghost iconBtn" onClick={() => setCollapsed((v) => !v)} aria-label="Recolher menu" style={{ display: undefined }}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
        <h2>{current}</h2>
        <UnidadeSelector />
        <div className="search" role="search">
          <Search />
          <input aria-label="Buscar módulo" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchModule(); }} placeholder="Ir para módulo…" />
        </div>
        <div className="spacer" />
        <div className="ctxmeta ctxmeta-global">
          <label className="ctxfilter-select">
            <span>Filtro / programação</span>
            <select
              aria-label="Selecionar filtro e programação para todo o sistema"
              value={selectedProgramacaoId || pg?.id || ""}
              onChange={async (e) => {
                try { await selectProgramacao(e.target.value); }
                catch (error) { toast("error", error instanceof Error ? error.message : "Não foi possível trocar a programação global."); }
              }}
              disabled={!programacoesGlobais.length}
            >
              {!programacoesGlobais.length && <option value="">Sem programações</option>}
              {programacoesGlobais.map((x) => (
                <option key={x.id} value={x.id}>
                  {`Filtro ${x.filtro || "-"} · ${x.data || "sem data"} · Turno ${x.turno || "-"}${x.status === "ATIVA" ? " · Atual" : ""}`}
                </option>
              ))}
            </select>
          </label>
          <span>Turno<b>{pg?.turno || "-"}</b></span>
          <span>Data<b>{pg?.data ? new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR") : "-"}</b></span>
        </div>
        <span className={`livedot ${live ? "on" : ""}`} title={live ? "Tempo real ativo" : "Sincronizando"} />
        <button className="ghost iconBtn" onClick={() => void refresh()} aria-label="Atualizar" title="Atualizar"><RefreshCw /></button>
        <button className="ghost iconBtn" aria-label="Notificações" title="Notificações"><Bell /></button>
        <div style={{ position: "relative" }}>
          <button className="userchip" onClick={() => setProfileOpen((v) => !v)} aria-expanded={profileOpen}>
            <span className="avatar">{me.usuario.slice(0, 2).toUpperCase()}</span>
            <span className="usercopy"><b>{me.usuario}</b><small>{me.perfil}</small></span>
            <ChevronDown size={14} />
          </button>
          {profileOpen && (
            <div className="menu">
              <div><b>{me.usuario}</b><br /><small>{me.perfil}</small></div>
              <div><small>Última sincronização: {lastSync ? lastSync.toLocaleTimeString("pt-BR") : "--:--:--"}</small></div>
              <button onClick={logout}><LogOut /> Sair</button>
            </div>
          )}
        </div>
      </header>

      <main className="main">
        {workspaceTabs.length > 1 && <nav className="erp-workspace-tabs" aria-label="Módulos abertos">
          {workspaceTabs.map((tab) => <div key={tab.path} className={tab.path === path ? "erp-workspace-tab active" : "erp-workspace-tab"}>
            <button type="button" onClick={() => router.push(tab.path+window.location.search)} title={tab.label}>{tab.label}</button>
            <button type="button" className="erp-workspace-close" title={`Fechar ${tab.label}`} aria-label={`Fechar ${tab.label}`}
              onClick={() => {
                setWorkspaceTabs((previous) => previous.filter((item) => item.path !== tab.path));
                if (tab.path === path) router.push(workspaceTabs.find((item) => item.path !== tab.path)?.path || "/dashboard");
              }}>×</button>
          </div>)}
        </nav>}
        <div className={`page ${["/programacao", "/programacao-gerente"].includes(path) ? "industrial-page-area" : ""}`}><UnidadeSelector bloquear><GlobalPCPFilters/>{children}</UnidadeSelector></div>
      </main>
      <AiAssistant />
      <RomaneioAIModal />
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
