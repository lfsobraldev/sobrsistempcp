"use client";

import Link from "next/link";
import { useOps } from "@/components/operational-provider";
import { menus } from "@/components/erp-shell";
import { allowedPath } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";

// Launchpad: cada cargo vê só os módulos e as telas que pode usar.
export default function Inicio() {
  const { me } = useOps();
  if (!me) return null;
  const modulos = menus
    .map((g) => ({ ...g, items: g.items.filter((i) => i.path !== "/inicio" && allowedPath(me.perfil, i.path)) }))
    .filter((g) => g.items.length);
  return (
    <>
      <PageHeader eyebrow="Famossul" title={`Olá, ${me.usuario}`} description="Escolha o módulo. Tudo o que você pode usar está aqui." />
      <div className="lp">
        {modulos.map((g) => {
          const [cod, ...resto] = g.label.split(" · ");
          const tem = resto.length > 0;
          return (
            <section key={g.label} className="lp-mod">
              <header><span className="lp-cod">{tem ? cod : g.label.slice(0, 2).toUpperCase()}</span><h2>{tem ? resto.join(" · ") : g.label}</h2></header>
              <div className="lp-tiles">
                {g.items.map((i) => { const Icon = i.icon; return <Link key={i.path} href={i.path} className="lp-tile"><Icon size={18} aria-hidden /><span>{i.label}</span></Link>; })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
