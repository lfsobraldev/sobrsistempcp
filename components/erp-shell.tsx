"use client";

import Link from "next/link";
import GlobalPCPFilters from "@/components/global-pcp-filters";
import UnidadeSelector from "./unidade-selector";
import { ResponsiveTables } from "./responsive-tables";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Boxes, Briefcase, ChevronDown, Flag, History, LayoutDashboard, LogOut, Menu, ClipboardList,
  PackageSearch, PanelLeftClose, PanelLeftOpen, RefreshCw, Route, Search, Settings, ShieldCheck,
  UploadCloud, UsersRound, Truck, ClipboardCheck, type LucideIcon,
  Megaphone, FileText, PackageCheck, Scissors, Scale, Ruler, Target, ShoppingCart, Warehouse, CalendarRange, GanttChartSquare, Hammer, Network,
  AlertOctagon, Siren, ScanSearch, BadgeCheck, Undo2, Receipt, Landmark, Calculator, Wrench, FolderOpen, LineChart, Headset,
  TrendingUp, Gauge, Container, Building2, ShieldAlert, TrendingDown, Activity, Users, SlidersHorizontal, ListOrdered, Layers, BookOpen,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OperationalProvider, useOps } from "@/components/operational-provider";
import AiAssistant from "@/components/ai-assistant";
import RomaneioAIModal from "@/components/romaneio-ai";
import { allowedPath } from "@/lib/permissions";
import { BrandLogo } from "@/components/brand-logo";
import { DoorLoader } from "@/components/door-art";

type MenuItem = { path: string; label: string; icon: LucideIcon };
type MenuGroup = { label: string; items: MenuItem[] };

const menus: MenuGroup[] = [
  { label: "Visão Geral", items: [{ path: "/dashboard", label: "Central de Produção", icon: LayoutDashboard }] },
  { label: "Comercial", items: [
    { path: "/marketing", label: "Marketing", icon: Megaphone },
    { path: "/comercial", label: "CRM Comercial", icon: Briefcase },
    { path: "/vendas", label: "Pedidos de Venda", icon: ShoppingCart },
    { path: "/gestao-pedidos", label: "Pedidos e Entregas", icon: Truck },
  ] },
  { label: "Medição e Engenharia", items: [{ path: "/engenharia", label: "Engenharia de Produto", icon: Layers }, { path: "/medicoes", label: "Medições e Aprovação", icon: Ruler }, { path: "/producao-consultas", label: "Rastreio e Onde é Usado", icon: Target }] },
  { label: "Carteira de Pedidos", items: [{ path: "/carteira", label: "Carteira de Pedidos", icon: FolderOpen }] },
  { label: "Compras e Estoque", items: [{ path: "/compras", label: "Compras e Terceirização", icon: Receipt }, { path: "/cotacoes", label: "Cotações e Fornecedores", icon: Scale }, { path: "/estoque", label: "Estoque", icon: Warehouse }, { path: "/estoque-avancado", label: "Endereços, Cíclico e PEPS", icon: Layers }, { path: "/mapa-fabrica", label: "Mapa da Fábrica e Rastro", icon: Container }, { path: "/wms", label: "WMS: Setores, Pallets e Revisões", icon: Container }] },
  {
    label: "PCP e Produção",
    items: [
      { path: "/programacao", label: "Programação", icon: UploadCloud },
      { path: "/ordens-fabricacao", label: "Ordens de Fabricação", icon: Hammer },
      { path: "/planejamento-mensal", label: "Planejamento mensal", icon: CalendarRange },
      { path: "/planejamento-aps", label: "MRP, Gantt e S&OP", icon: GanttChartSquare },
      { path: "/programacao-gerente", label: "Planejamento", icon: ListOrdered },
      { path: "/apontamento-operacoes", label: "Apontamento de Operações", icon: ClipboardCheck },
      { path: "/lideres", label: "Líderes / Setores", icon: UsersRound },
      { path: "/pcp-painel", label: "Painel PCP", icon: LayoutDashboard },
      { path: "/integracao-consistem", label: "Integração Consistem", icon: Network },
      { path: "/excecoes", label: "Faltas e Retrabalho", icon: PackageSearch },
      { path: "/andon", label: "Andon", icon: Siren },
    ],
  },
  { label: "Qualidade", items: [{ path: "/inspecao-pallets", label: "Qualidade", icon: BadgeCheck }, { path: "/qualidade-inspecao", label: "Inspeção e CAPA", icon: ScanSearch }] },
  {
    label: "Expedição e Entregas",
    items: [
      { path: "/expedicao", label: "Remessas e Devoluções", icon: Undo2 },
      { path: "/romaneios", label: "Romaneios", icon: FileText },
      { path: "/embalagem", label: "Plano de Embalagem", icon: PackageCheck },
      { path: "/plano-corte", label: "Plano de Corte", icon: Scissors },
      { path: "/apontamento-entregas", label: "Apontamento de Entregas", icon: PackageCheck },
    ],
  },
  { label: "Custos, Fiscal e Financeiro", items: [{ path: "/custos", label: "Custos Industriais", icon: Calculator }, { path: "/fiscal", label: "Fiscal e NF-e", icon: Landmark }, { path: "/financeiro", label: "Financeiro e Contábil", icon: TrendingUp }, { path: "/controladoria", label: "Controladoria", icon: Scale }] },
  { label: "Manutenção e Documentos", items: [{ path: "/indicadores", label: "Indicadores e Integrações", icon: Gauge }, { path: "/manutencao", label: "Manutenção", icon: Wrench }, { path: "/documentos", label: "Documentos e Qualificação", icon: BookOpen }] },
  { label: "Pessoas, Segurança e Projetos", items: [{ path: "/corporativo", label: "RH, EHS e Projetos", icon: Building2 }] },
  { label: "SAC", items: [{ path: "/sac", label: "Atendimento", icon: Headset }] },
  {
    label: "Relatórios",
    items: [
      { path: "/prioridades", label: "Prioridades", icon: Flag },
      { path: "/criticos", label: "Pedidos Críticos", icon: AlertOctagon },
      { path: "/fluxo", label: "Fluxo de Produção", icon: Route },
      { path: "/performance", label: "Performance", icon: LineChart },
      { path: "/perdas", label: "Perdas de Produção", icon: TrendingDown },
      { path: "/historico", label: "Histórico", icon: History },
      { path: "/sobral-ia", label: "Assistente Operacional", icon: Activity },
    ],
  },
  { label: "Administração", items: [{ path: "/seguranca", label: "Segurança e Aprovações", icon: ShieldAlert }, { path: "/plataforma", label: "Painel, Notificações e Campos", icon: Bell }, { path: "/pessoas", label: "Pessoas, EHS e Cronograma", icon: Users }, { path: "/acessos", label: "Usuários e Unidades", icon: Users }, { path: "/configuracoes", label: "Configurações", icon: SlidersHorizontal }] },
];

const HOME: Record<string, string> = { LIDER: "/lideres", APONTADOR: "/lideres", QUALIDADE: "/inspecao-pallets", COMERCIAL: "/comercial", LOGISTICA: "/gestao-pedidos", LIDER_ENTREGAS: "/apontamento-entregas", SAC: "/sac" };

function Inner({ children }: { children: React.ReactNode }) {
  const { me, pg, selectedProgramacaoId, selectProgramacao, lastSync, realtimeStatus, refresh, toast, loading,recorteQuery } = useOps();
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceTabs, setWorkspaceTabs] = useState<{path:string;label:string}[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  useEffect(() => {
    let vivo = true;
    const carregar = () => fetch("/api/plataforma?visao=contador", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo && j) setNaoLidas(Number(j.naoLidas) || 0); }).catch(() => {});
    void carregar();
    const t = setInterval(carregar, 120000);
    return () => { vivo = false; clearInterval(t); };
  }, [path]);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [gruposAbertos, setGruposAbertos] = useState<string[]>([]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("erp:nav") || "[]"); if (Array.isArray(v)) setGruposAbertos(v.filter((x) => typeof x === "string")); } catch { /* sem armazenamento */ } }, []);
  const alternarGrupo = (rotulo: string) => setGruposAbertos((a) => {
    const n = a.includes(rotulo) ? a.filter((x) => x !== rotulo) : [...a, rotulo];
    try { localStorage.setItem("erp:nav", JSON.stringify(n)); } catch { /* ignora */ }
    return n;
  });
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

  if (loading) return <div className="boot"><DoorLoader label="Famossul" sub="Preparando ambiente" /></div>;
  if (!me) return null;

  const live = realtimeStatus === "tempo_real";
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${mobileNav ? "mobileOpen" : ""}`}>
      <ResponsiveTables />
      <aside className="sidenav">
        <div className="mobile-module-search search" role="search">
          <Search />
          <input aria-label="Buscar módulo" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchModule(); }} placeholder="Buscar módulo..." />
        </div>
        <nav aria-label="Navegação principal">
          {visible.map((g) => (
            <section key={g.label} className={`navgroup ${(collapsed || gruposAbertos.includes(g.label) || g.items.some((i) => i.path === path)) ? "open" : ""}`}>
              <button type="button" className="navgroup-head" aria-expanded={gruposAbertos.includes(g.label) || g.items.some((i) => i.path === path)} onClick={() => alternarGrupo(g.label)}>
                <span>{g.label}</span><ChevronDown size={14} />
              </button>
              {(collapsed || gruposAbertos.includes(g.label) || g.items.some((i) => i.path === path)) && g.items.map((item) => {
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
          {pg ? `Turno ${pg.turno} · ${new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}` : "Aguardando programação"}
        </div>
      </aside>

      {mobileNav && <button className="backdrop" onClick={() => setMobileNav(false)} aria-label="Fechar menu" />}

      <header className="topbar2">
        <Link href="/dashboard" className="shellbar-brand" aria-label="Famossul, ir para o início"><BrandLogo size={30} /><span><b>Famossul</b><small>Sobral PCP · Gestão industrial</small></span></Link>
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
        <div className="ctxmeta ctxmeta-global" aria-label="Programação em exibição">
          <span className="ctx-chip" title="Programação ativa">
            {pg ? `Turno ${pg.turno || "-"} · ${pg.data ? new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR") : "sem data"}` : "Sem programação"}
          </span>
        </div>
        <span className={`livedot ${live ? "on" : ""}`} title={live ? "Tempo real ativo" : "Sincronizando"} />
        <button className="ghost iconBtn" onClick={() => void refresh()} aria-label="Atualizar" title="Atualizar"><RefreshCw /></button>
        <Link className="ghost iconBtn" aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ""}`} title="Notificações" href="/plataforma" style={{ position: "relative" }}><Bell />{naoLidas > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#c0392b", color: "#fff", borderRadius: 9, fontSize: 10, padding: "0 5px", lineHeight: "16px" }}>{naoLidas > 99 ? "99+" : naoLidas}</span>}</Link>
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
