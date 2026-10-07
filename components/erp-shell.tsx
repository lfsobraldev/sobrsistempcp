"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Factory,
  LayoutDashboard,
  UploadCloud,
  SlidersHorizontal,
  UsersRound,
  ClipboardCheck,
  Workflow,
  AlertTriangle,
  Activity,
  History,
  Settings,
  FileSpreadsheet,
  Flame,
  ShieldCheck,
  TimerReset,
  LogOut,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { exportarCompleto } from "@/lib/export";
import { OperationalProvider, useOps } from "@/components/operational-provider";

type MenuItem = { path: string; label: string; icon: LucideIcon };
type MenuGroup = { label: string; items: MenuItem[] };

const menus: MenuGroup[] = [
  { label: "GESTÃO", items: [{ path: "/dashboard", label: "Central Industrial", icon: LayoutDashboard }] },
  { label: "PLANEJAMENTO", items: [
    { path: "/programacao", label: "Programação", icon: UploadCloud },
    { path: "/sequenciamento", label: "Sequenciamento", icon: SlidersHorizontal },
  ]},
  { label: "OPERAÇÃO", items: [
    { path: "/lideres", label: "Líderes", icon: UsersRound },
    { path: "/apontamentos", label: "Apontamentos", icon: ClipboardCheck },
    { path: "/criticos", label: "Itens Críticos", icon: Flame },
    { path: "/fluxo", label: "Fluxo", icon: Workflow },
    { path: "/andon", label: "Andon", icon: AlertTriangle },
    { path: "/perdas", label: "Perdas", icon: TimerReset },
  ]},
  { label: "QUALIDADE", items: [{ path: "/inspecao-pallets", label: "Pallets", icon: ShieldCheck }] },
  { label: "ANÁLISE", items: [
    { path: "/performance", label: "Performance", icon: Activity },
    { path: "/historico", label: "Histórico", icon: History },
  ]},
  { label: "SISTEMA", items: [{ path: "/configuracoes", label: "Configurações", icon: Settings }] },
];

function allowed(role: string, path: string) {
  if (role === "PCP") return true;
  if (role === "GERENTE") return ["/dashboard","/performance","/lideres","/criticos","/fluxo","/andon","/perdas","/historico","/inspecao-pallets"].includes(path);
  if (role === "ENCARREGADO") return ["/dashboard","/lideres","/criticos","/fluxo","/andon","/perdas","/inspecao-pallets"].includes(path);
  if (role === "LIDER") return ["/lideres","/criticos","/fluxo","/andon","/perdas","/inspecao-pallets"].includes(path);
  if (role === "APONTADOR") return ["/apontamentos","/fluxo","/andon"].includes(path);
  return false;
}

function Inner({ children }: { children: React.ReactNode }) {
  const { me, pg, andon, lastSync, refresh, loading } = useOps();
  const path = usePathname();
  const router = useRouter();

  const visibleGroups = useMemo(() => menus.map(group => ({
    ...group,
    items: group.items.filter(item => me ? allowed(me.perfil, item.path) : false),
  })).filter(group => group.items.length), [me]);

  const currentPageLabel = useMemo(() => {
    for (const group of menus) {
      const item = group.items.find(menuItem => menuItem.path === path);
      if (item) return item.label;
    }
    return "Sobral PCP";
  }, [path]);

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace("/login"); return; }
    if (allowed(me.perfil, path)) return;
    if (me.perfil === "LIDER") { router.replace("/lideres"); return; }
    if (me.perfil === "APONTADOR") { router.replace("/apontamentos"); return; }
    router.replace("/dashboard");
  }, [me, path, router, loading]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (loading) {
    return <div className="boot"><Factory /><b>SOBRAL PCP</b><span>Carregando operação...</span></div>;
  }
  if (!me) return null;

  return (
    <div className="pcpShell">
      <header className="pcpHeader">
        <div className="pcpBrand">
          <div className="pcpMark"><Factory /></div>
          <div>
            <strong>SOBRAL PCP</strong>
            <span>CONTROLE DE PRODUÇÃO</span>
          </div>
        </div>

        <div className="pcpPageIdentity">
          <small>MÓDULO ATUAL</small>
          <b>{currentPageLabel}</b>
        </div>

        <div className="pcpHeaderActions">
          {pg && me.perfil !== "APONTADOR" && (
            <button className="pcpActionBtn" onClick={() => exportarCompleto(pg.produtos, andon)}>
              <FileSpreadsheet /> Exportar
            </button>
          )}

          {pg && (
            <div className="pcpContext">
              <div><small>FILTRO</small><b>{pg.filtro}</b></div>
              <div><small>TURNO</small><b>{pg.turno}</b></div>
              <div><small>DATA</small><b>{new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}</b></div>
            </div>
          )}

          <div className="pcpSync">
            <span />
            <div><small>SINCRONIZADO</small><b>{lastSync ? lastSync.toLocaleTimeString("pt-BR") : "--:--:--"}</b></div>
          </div>

          <button className="pcpIconBtn" onClick={refresh} type="button" title="Atualizar"><RefreshCw /></button>

          <div className="pcpUser">
            <div className="pcpAvatar">{me.usuario.slice(0,2).toUpperCase()}</div>
            <div><b>{me.usuario}</b><span>{me.perfil}</span></div>
            <button onClick={logout} title="Sair"><LogOut /></button>
          </div>
        </div>
      </header>

      <nav className="pcpModuleBar">
        {visibleGroups.map(group => (
          <section key={group.label}>
            <label>{group.label}</label>
            <div>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} href={item.path} className={path === item.path ? "active" : ""}>
                    <Icon /><span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <main className="pcpMain">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

export default function ErpShell({ children }: { children: React.ReactNode }) {
  return <OperationalProvider><Inner>{children}</Inner></OperationalProvider>;
}
