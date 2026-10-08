"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Factory, LayoutDashboard, UploadCloud, ClipboardCheck, History, Settings,
  FileSpreadsheet, Flag, ShieldCheck, LogOut, RefreshCw, Printer,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { exportarCompleto } from "@/lib/export";
import { OperationalProvider, useOps } from "@/components/operational-provider";

type MenuItem={path:string;label:string;icon:LucideIcon};
type MenuGroup={label:string;items:MenuItem[]};

const menus:MenuGroup[]=[
  {label:"VISÃO",items:[
    {path:"/dashboard",label:"Central",icon:LayoutDashboard},
  ]},
  {label:"PLANEJAR",items:[
    {path:"/programacao",label:"Programação",icon:UploadCloud},
    {path:"/plano-turno",label:"Plano do Turno",icon:Printer},
    {path:"/prioridades",label:"Prioridades",icon:Flag},
  ]},
  {label:"EXECUTAR",items:[
    {path:"/apontamentos",label:"Apontamentos",icon:ClipboardCheck},
  ]},
  {label:"QUALIDADE",items:[
    {path:"/inspecao-pallets",label:"Pallets",icon:ShieldCheck},
  ]},
  {label:"CONTROLE",items:[
    {path:"/historico",label:"Histórico",icon:History},
  ]},
  {label:"AJUSTES",items:[
    {path:"/configuracoes",label:"Configurações",icon:Settings},
  ]},
];

function allowed(role:string,path:string){
  const pcp=[
    "/dashboard",
    "/programacao",
    "/plano-turno",
    "/prioridades",
    "/apontamentos",
    "/inspecao-pallets",
    "/historico",
    "/configuracoes",
  ];

  if(role==="PCP")return pcp.includes(path);
  if(role==="GERENTE")return ["/dashboard","/plano-turno","/prioridades","/inspecao-pallets","/historico"].includes(path);
  if(role==="ENCARREGADO")return ["/dashboard","/plano-turno","/prioridades","/inspecao-pallets"].includes(path);
  if(role==="LIDER")return ["/plano-turno"].includes(path);
  if(role==="APONTADOR")return ["/apontamentos"].includes(path);
  return false;
}

function Inner({children}:{children:React.ReactNode}){
  const{me,pg,andon,lastSync,refresh,loading}=useOps();
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
    if(me.perfil==="LIDER"){router.replace("/plano-turno");return}
    if(me.perfil==="APONTADOR"){router.replace("/apontamentos");return}
    router.replace("/dashboard");
  },[me,path,router,loading]);

  async function logout(){await fetch("/api/auth/logout",{method:"POST"});window.location.href="/login"}

  if(loading)return <div className="boot"><Factory/><b>SOBRAL PCP</b><span>Preparando operação...</span></div>;
  if(!me)return null;

  return <div className="pcpShell">
    <header className="pcpTop">
      <div className="pcpBrand">
        <div className="pcpLogo"><Factory/></div>
        <div><strong>SOBRAL PCP</strong><span>CONTROLE INDUSTRIAL</span></div>
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
        <div className="pcpLive"><i/><div><span>ATUALIZAÇÃO</span><b>{lastSync?lastSync.toLocaleTimeString("pt-BR"):"--:--:--"}</b></div></div>
        <button className="pcpRefresh" onClick={refresh} title="Atualizar"><RefreshCw/></button>
        <div className="pcpProfile"><div>{me.usuario.slice(0,2).toUpperCase()}</div><span><b>{me.usuario}</b><small>{me.perfil}</small></span></div>
        <button className="pcpExit" onClick={logout} title="Sair"><LogOut/></button>
      </div>
    </header>

    <div className="pcpNavigation">
      <nav>
        {visible.flatMap(g=>g.items).map(item=>{
          const Icon=item.icon;
          return <Link key={item.path} href={item.path} className={path===item.path?"active":""}><Icon/><span>{item.label}</span></Link>
        })}
      </nav>
      {pg&&me.perfil!=="APONTADOR"&&<button className="pcpExport" onClick={()=>exportarCompleto(pg.produtos,andon)}><FileSpreadsheet/>Exportar produção</button>}
    </div>

    <main className="pcpMain"><div className="page">{children}</div></main>
  </div>
}

export default function ErpShell({children}:{children:React.ReactNode}){
  return <OperationalProvider><Inner>{children}</Inner></OperationalProvider>
}
