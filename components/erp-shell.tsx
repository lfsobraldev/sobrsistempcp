"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Boxes, BrainCircuit, ChevronDown, Flag, History, LayoutDashboard, LogOut, Menu,
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
  { label: "Início", items: [{ path: "/dashboard", label: "Central de Produção", icon: LayoutDashboard }] },
  {
    label: "Produção",
    items: [
      { path: "/programacao", label: "Programação", icon: UploadCloud },
      { path: "/integracao-consistem", label: "Integração Consistem", icon: RefreshCw },
      { path: "/programacao-gerente", label: "Programação Gerente", icon: Route },
      { path: "/gestao-pedidos", label: "Gestão de Pedidos e Entregas", icon: Truck },
      { path: "/apontamento-entregas", label: "Apontamento de Produção", icon: ClipboardCheck },
      { path: "/lideres", label: "Líderes / Setores", icon: UsersRound },
      { path: "/excecoes", label: "Faltas e Retrabalho", icon: PackageSearch },
    ],
  },
  { label: "Inteligência", items: [{ path: "/sobral-ia", label: "Sobral IA", icon: BrainCircuit }] },
  { label: "Qualidade", items: [{ path: "/inspecao-pallets", label: "Qualidade", icon: ShieldCheck }] },
  { label: "Expedição", items: [{ path: "/romaneios", label: "Romaneios", icon: Boxes }] },
  {
    label: "Relatórios",
    items: [
      { path: "/prioridades", label: "Prioridades", icon: Flag },
      { path: "/historico", label: "Histórico", icon: History },
    ],
  },

];

const HOME: Record<string, string> = { LIDER: "/lideres", APONTADOR: "/lideres", QUALIDADE: "/inspecao-pallets", COMERCIAL: "/gestao-pedidos", LOGISTICA: "/gestao-pedidos", LIDER_ENTREGAS: "/apontamento-entregas" };

function Inner({ children }: { children: React.ReactNode }) {
  const { me, pg, lastSync, realtimeStatus, refresh, loading } = useOps();
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceTabs,setWorkspaceTabs]=useState<{path:string;label:string}[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const visible = useMemo(
    () => menus.map((g) => ({ ...g, items: g.items.filter((i) => me && allowedPath(me.perfil, i.path)) })).filter((g) => g.items.length),
    [me]
  );
  const allVisible = useMemo(() => visible.flatMap((g) => g.items), [visible]);
  const current = allVisible.find((i) => i.path === path)?.label || "Central de Produção";
  useEffect(()=>{
    if(!me||!allowedPath(me.perfil,path))return;
    const label=allVisible.find(i=>i.path===path)?.label||path;
    setWorkspaceTabs(prev=>prev.some(x=>x.path===path)?prev:[...prev,{path,label}].slice(-12));
  },[path,me,allVisible]);

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
    if (found) { router.push(found.path); setQuery(""); }
  }

  if (loading) return <div className="boot"><BrandLogo size={42} /><b>Sobral PCP</b><span>Preparando ambiente...</span></div>;
  if (!me) return null;

  const live = realtimeStatus === "tempo_real";
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${mobileNav ? "mobileOpen" : ""}`}>
      <aside className="sidenav">
        <div className="brand"><BrandLogo size={34} /><span className="brand-copy"><b>Sobral PCP</b><small>PCP Industrial</small></span></div>
        <nav>
          {visible.map((g) => (
            <section key={g.label} className="navgroup">
              <label>{g.label}</label>
              {g.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} href={item.path} className={`navlink ${path === item.path ? "active" : ""}`} title={collapsed ? item.label : undefined}>
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
        <div className="search" role="search">
          <Search />
          <input aria-label="Buscar módulo" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchModule(); }} placeholder="Ir para módulo…" />
        </div>
        <div className="spacer" />
        {pg && (
          <div className="ctxmeta">
            <span>Filtro<b>{pg.filtro || "-"}</b></span>
            <span>Turno<b>{pg.turno || "-"}</b></span>
            <span>Data<b>{new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}</b></span>
          </div>
        )}
        <span className={`livedot ${live ? "on" : ""}`} title={live ? "Tempo real ativo" : "Sincronizando"} />
        <button className="ghost iconBtn" onClick={() => void refresh()} aria-label="Atualizar" title="Atualizar"><RefreshCw /></button>
        <button className="ghost iconBtn" aria-label="Notificações" title="Notificações"><Bell /></button>
        <div style={{ position: "relative" }}>
          <button className="userchip" onClick={() => setProfileOpen((v) => !v)} aria-expanded={profileOpen}>
            <span className="avatar">{me.usuario.slice(0, 2).toUpperCase()}</span>
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
        <nav className="erp-workspace-tabs" aria-label="Guias abertas no sistema">
          {workspaceTabs.map(tab=><div key={tab.path} className={tab.path===path?"erp-workspace-tab active":"erp-workspace-tab"}>
            <button type="button" onClick={()=>router.push(tab.path)} title={tab.label}>{tab.label}</button>
            <button type="button" className="erp-workspace-close" title={"Fechar "+tab.label} aria-label={"Fechar "+tab.label}
              onClick={()=>{setWorkspaceTabs(prev=>prev.filter(x=>x.path!==tab.path));if(tab.path===path)router.push(workspaceTabs.find(x=>x.path!==tab.path)?.path||"/dashboard")}}>×</button>
          </div>)}
        </nav>
        <div className={`page ${["/programacao", "/programacao-gerente"].includes(path) ? "industrial-page-area" : ""}`}>{children}</div>
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
