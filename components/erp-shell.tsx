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
  Settings, FileSpreadsheet, Flame, ShieldCheck,
  LogOut,
  Bell,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { exportarCompleto } from "@/lib/export";

import {
  OperationalProvider,
  useOps,
} from "@/components/operational-provider";

type MenuItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const menus: MenuGroup[] = [
  {
    label: "GESTÃO",
    items: [
      {
        path: "/dashboard",
        label: "Central Industrial",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "PLANEJAMENTO",
    items: [
      {
        path: "/programacao",
        label: "Programação",
        icon: UploadCloud,
      },
      {
        path: "/sequenciamento",
        label: "Sequenciamento",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    label: "OPERAÇÃO",
    items: [
      {
        path: "/lideres",
        label: "Líderes",
        icon: UsersRound,
      },
      {
        path: "/apontamentos",
        label: "Apontamentos",
        icon: ClipboardCheck,
      },
      {
        path: "/criticos",
        label: "Itens Críticos",
        icon: Flame,
      },
      {
        path: "/fluxo",
        label: "Fluxo de Produção",
        icon: Workflow,
      },
      {
        path: "/andon",
        label: "Andon",
        icon: AlertTriangle,
      },
    ],
  },
  {
    label: "QUALIDADE",
    items: [
      {
        path: "/inspecao-pallets",
        label: "Inspeção de Pallets",
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: "ANÁLISE",
    items: [
      {
        path: "/performance",
        label: "Performance",
        icon: Activity,
      },
      {
        path: "/historico",
        label: "Histórico",
        icon: History,
      },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      {
        path: "/configuracoes",
        label: "Configurações",
        icon: Settings,
      },
    ],
  },
];

function allowed(role: string, path: string) {
  if (role === "PCP") {
    return true;
  }

  if (role === "GERENTE") {
    return [
      "/dashboard",
      "/performance",
      "/lideres",
      "/criticos",
      "/fluxo",
      "/andon",
      "/historico",
      "/inspecao-pallets",
    ].includes(path);
  }

  if (role === "ENCARREGADO") {
    return [
      "/dashboard",
      "/lideres",
      "/criticos",
      "/fluxo",
      "/andon",
      "/inspecao-pallets",
    ].includes(path);
  }

  if (role === "LIDER") {
    return [
      "/lideres",
      "/criticos",
      "/fluxo",
      "/andon",
      "/inspecao-pallets",
    ].includes(path);
  }

  if (role === "APONTADOR") {
    return [
      "/apontamentos",
      "/fluxo",
      "/andon",
    ].includes(path);
  }

  return false;
}

function Inner({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    me,
    pg,
    andon,
    lastSync,
    refresh,
    loading,
  } = useOps();

  const path = usePathname();
  const router = useRouter();

  const currentPageLabel = useMemo(() => {
    for (const group of menus) {
      const item = group.items.find(
        (menuItem) =>
          menuItem.path === path
      );

      if (item) {
        return item.label;
      }
    }

    return "Sobral PCP";
  }, [path]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!me) {
      router.replace("/login");
      return;
    }

    if (
      allowed(
        me.perfil,
        path
      )
    ) {
      return;
    }

    if (
      me.perfil === "LIDER"
    ) {
      router.replace(
        "/lideres"
      );
      return;
    }

    if (
      me.perfil ===
      "APONTADOR"
    ) {
      router.replace(
        "/apontamentos"
      );
      return;
    }

    router.replace(
      "/dashboard"
    );
  }, [
    me,
    path,
    router,
    loading,
  ]);

  async function logout() {
    await fetch(
      "/api/auth/logout",
      {
        method: "POST",
      }
    );

    window.location.href =
      "/login";
  }

  if (loading) {
    return (
      <div className="boot">
        <Factory />

        <b>
          SOBRAL PCP
        </b>

        <span>
          Carregando operação...
        </span>
      </div>
    );
  }

  if (!me) {
    return null;
  }

  return (
    <div className="erp">
      <aside className="sidebar">
        <div className="brand">
          <span>
            <Factory />
          </span>

          <div>
            <b>
              SOBRAL PCP
            </b>

            <small>
              MANUFACTURING
              OPERATIONS
            </small>
          </div>
        </div>

        <div className="userBox">
          <div>
            {me.usuario
              .slice(
                0,
                2
              )
              .toUpperCase()}
          </div>

          <span>
            <b>
              {me.usuario}
            </b>

            <small>
              {me.perfil}
            </small>
          </span>
        </div>

        <nav>
          {menus.map(
            (group) => {
              const visibleItems =
                group.items.filter(
                  (item) =>
                    allowed(
                      me.perfil,
                      item.path
                    )
                );

              if (
                visibleItems.length ===
                0
              ) {
                return null;
              }

              return (
                <section
                  key={
                    group.label
                  }
                >
                  <label>
                    {
                      group.label
                    }
                  </label>

                  {visibleItems.map(
                    (item) => {
                      const Icon =
                        item.icon;

                      return (
                        <Link
                          key={
                            item.path
                          }
                          href={
                            item.path
                          }
                          className={
                            path ===
                            item.path
                              ? "active"
                              : ""
                          }
                        >
                          <Icon />

                          <span>
                            {
                              item.label
                            }
                          </span>
                        </Link>
                      );
                    }
                  )}
                </section>
              );
            }
          )}
        </nav>

        <button
          className="logout"
          onClick={
            logout
          }
          type="button"
        >
          <LogOut />

          Sair
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">
            <span>
              Operações
            </span>

            <i>
              /
            </i>

            <b>
              {
                currentPageLabel
              }
            </b>
          </div>

          <div className="topright">
            {pg && me.perfil !== "APONTADOR" && (
              <button className="exportAll" onClick={() => exportarCompleto(pg.produtos, andon, pg.turno || "")}>
                <FileSpreadsheet />
                Exportar Excel
              </button>
            )}
            {pg && (
              <>
                <div className="headMeta">
                  <small>
                    Filtro
                  </small>

                  <b>
                    {
                      pg.filtro
                    }
                  </b>
                </div>

                <div className="headMeta">
                  <small>
                    Turno
                  </small>

                  <b>
                    {
                      pg.turno
                    }
                  </b>
                </div>

                <div className="headMeta">
                  <small>
                    Data
                  </small>

                  <b>
                    {new Date(
                      `${pg.data}T12:00:00`
                    ).toLocaleDateString(
                      "pt-BR"
                    )}
                  </b>
                </div>
              </>
            )}

            <div className="live">
              <i />

              <span>
                <small>
                  AO VIVO
                </small>

                <b>
                  {lastSync
                    ? lastSync.toLocaleTimeString(
                        "pt-BR"
                      )
                    : "--:--:--"}
                </b>
              </span>
            </div>

            <button
              className="iconBtn"
              onClick={
                refresh
              }
              type="button"
              title="Atualizar"
            >
              <RefreshCw />
            </button>

            <button
              className="iconBtn"
              type="button"
              title="Notificações"
            >
              <Bell />
            </button>

            <div className="avatar">
              {me.usuario
                .slice(
                  0,
                  2
                )
                .toUpperCase()}
            </div>
          </div>
        </header>

        <div className="page">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function ErpShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OperationalProvider>
      <Inner>
        {children}
      </Inner>
    </OperationalProvider>
  );
}
