"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Factory, LayoutDashboard, UploadCloud, ClipboardCheck, History, Settings,
  Flag, ShieldCheck, LogOut, RefreshCw, UsersRound, AlertTriangle, Boxes, Route, PackageSearch,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { OperationalProvider, useOps } from "@/components/operational-provider";

type MenuItem={path:string;label:string;icon:LucideIcon};
type MenuGroup={label:string;items:MenuItem[]};

const menus:MenuGroup[]=[
  {label:"VISÃO",items:[
    {path:"/dashboard",label:"Central de Produção",icon:LayoutDashboard},
  ]},
  {label:"PLANEJAMENTO",items:[
    {path:"/programacao",label:"Programação",icon:UploadCloud},
    {path:"/programacao-gerente",label:"Programação Gerente",icon:Route},
  ]},
  {label:"OPERAÇÃO",items:[
    {path:"/lideres",label:"Líderes / Setores",icon:UsersRound},
    {path:"/apontamentos",label:"Apontamento",icon:ClipboardCheck},
    {path:"/excecoes",label:"Faltas e Retrabalho",icon:PackageSearch},
  ]},
  {label:"QUALIDADE / EXPEDIÇÃO",items:[
    {path:"/inspecao-pallets",label:"Qualidade",icon:ShieldCheck},
    {path:"/romaneios",label:"Romaneios",icon:Boxes},
  ]},
  {label:"GESTÃO",items:[
    {path:"/prioridades",label:"Prioridades",icon:Flag},
    {path:"/historico",label:"Histórico",icon:History},
  ]},
  {label:"SISTEMA",items:[
    {path:"/configuracoes",label:"Configurações",icon:Settings},
  ]},
];

function allowed(role:string,path:string){
  const pcp=[
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

  if(role==="PCP")return pcp.includes(path);
  if(role==="GERENTE")return ["/dashboard","/programacao-gerente","/prioridades","/lideres","/excecoes","/inspecao-pallets","/romaneios","/historico"].includes(path);
  if(role==="ENCARREGADO")return ["/dashboard","/programacao-gerente","/prioridades","/lideres","/excecoes","/inspecao-pallets","/romaneios"].includes(path);
  if(role==="LIDER")return ["/lideres","/excecoes"].includes(path);
  if(role==="APONTADOR")return ["/apontamentos"].includes(path);
  if(role==="QUALIDADE")return ["/dashboard","/inspecao-pallets"].includes(path);
  return false;
}

function Inner({children}:{children:React.ReactNode}){
  const{me,pg,lastSync,realtimeStatus,refresh,loading}=useOps();
  const path=usePathname();
  const router=useRouter();

  const visible=useMemo(()=>menus.map(g=>({...g,items:g.items.filter(i=>me&&allowed(me.perfil,i.path))})).filter(g=>g.items.length),[me]);
  const current=useMemo(()=>{
    for(const g of menus){const i=g.items.find(x=>x.path===path);if(i)return i.label}
    return "Central";
  },[path]);

  useEffect(()=>{
    if(loading)return;
    if(!me){router.replace("/login");return}
    if(allowed(me.perfil,path))return;
    if(me.perfil==="LIDER"){router.replace("/lideres");return}
    if(me.perfil==="APONTADOR"){router.replace("/apontamentos");return}
    if(me.perfil==="QUALIDADE"){router.replace("/inspecao-pallets");return}
    router.replace("/dashboard");
  },[me,path,router,loading]);

  async function logout(){await fetch("/api/auth/logout",{method:"POST"});window.location.href="/login"}

  if(loading)return <div className="boot"><Factory/><b>SOBRAL PCP</b><span>Preparando operação...</span></div>;
  if(!me)return null;

  return <div className="pcpShell">
    <header className="pcpTop">
      <div className="pcpBrand">
        <div className="pcpLogo"><Factory/></div>
        <div><strong>SOBRAL PCP</strong><span>PCP INDUSTRIAL • V12</span></div>
      </div>

      <div className="pcpTitleBlock">
        <span>MÓDULO</span>
        <b>{current}</b>
      </div>

      <div className="pcpTopRight">
        {pg&&<div className="pcpRunInfo">
          <div><span>FILTRO</span><b>{pg.filtro}</b></div>
          <div><span>TURNO</span><b>{pg.turno}</b></div>
          <div><span>DATA</span><b>{new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}</b></div>
        </div>}
        <div className={`pcpLive rt-${realtimeStatus}`}><i/><div><span>{realtimeStatus==="tempo_real"?"TEMPO REAL":realtimeStatus==="reconectando"?"RECONECTANDO":"ATUALIZAÇÃO"}</span><b>{lastSync?lastSync.toLocaleTimeString("pt-BR"):"--:--:--"}</b></div></div>
        <button className="pcpRefresh" onClick={refresh} title="Atualizar"><RefreshCw/></button>
        <div className="pcpProfile"><div>{me.usuario.slice(0,2).toUpperCase()}</div><span><b>{me.usuario}</b><small>{me.perfil}</small></span></div>
        <button className="pcpExit" onClick={logout} title="Sair"><LogOut/></button>
      </div>
    </header>

    <aside className="pcpNavigation">
      <nav>
        {visible.map((group)=>(
          <section key={group.label} className="pcpNavGroup">
            <label>{group.label}</label>
            {group.items.map((item)=>{
              const Icon=item.icon;
              return (
                <Link key={item.path} href={item.path} className={path===item.path?"active":""}>
                  <Icon/>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        ))}
      </nav>
      <div className="pcpNavFoot">
        <span>PROGRAMAÇÃO ATIVA</span>
        <b>{pg?.filtro || "SEM FILTRO"}</b>
        <small>{pg ? `Turno ${pg.turno} • ${new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR")}` : "Aguardando programação"}</small>
      </div>
    </aside>

    <main className="pcpMain"><div className="page">{children}</div></main>
  </div>
}

export default function ErpShell({children}:{children:React.ReactNode}){
  return <OperationalProvider><Inner>{children}</Inner></OperationalProvider>
}
