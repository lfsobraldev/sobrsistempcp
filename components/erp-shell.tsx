"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Factory, LayoutDashboard, UploadCloud, SlidersHorizontal, UsersRound,
  ClipboardCheck, Workflow, AlertTriangle, Activity, History, Settings,
  FileSpreadsheet, Flame, ShieldCheck, TimerReset, LogOut, RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { exportarCompleto } from "@/lib/export";
import { OperationalProvider, useOps } from "@/components/operational-provider";

type MenuItem={path:string;label:string;icon:LucideIcon};
type MenuGroup={label:string;items:MenuItem[]};

const menus:MenuGroup[]=[
  {label:"VISÃO",items:[{path:"/dashboard",label:"Central",icon:LayoutDashboard}]},
  {label:"PLANEJAR",items:[
    {path:"/programacao",label:"Programação",icon:UploadCloud},
    {path:"/sequenciamento",label:"Sequência",icon:SlidersHorizontal},
  ]},
  {label:"EXECUTAR",items:[
    {path:"/lideres",label:"Líderes",icon:UsersRound},
    {path:"/apontamentos",label:"Apontamentos",icon:ClipboardCheck},
    {path:"/criticos",label:"Críticos",icon:Flame},
    {path:"/fluxo",label:"Fluxo",icon:Workflow},
    {path:"/andon",label:"Andon",icon:AlertTriangle},
    {path:"/perdas",label:"Perdas",icon:TimerReset},
  ]},
  {label:"QUALIDADE",items:[{path:"/inspecao-pallets",label:"Pallets",icon:ShieldCheck}]},
  {label:"ANÁLISE",items:[
    {path:"/performance",label:"Performance",icon:Activity},
    {path:"/historico",label:"Histórico",icon:History},
  ]},
  {label:"AJUSTES",items:[{path:"/configuracoes",label:"Configurações",icon:Settings}]},
];

function allowed(role:string,path:string){
  if(role==="PCP")return true;
  if(role==="GERENTE")return ["/dashboard","/performance","/lideres","/criticos","/fluxo","/andon","/perdas","/historico","/inspecao-pallets"].includes(path);
  if(role==="ENCARREGADO")return ["/dashboard","/lideres","/criticos","/fluxo","/andon","/perdas","/inspecao-pallets"].includes(path);
  if(role==="LIDER")return ["/lideres","/criticos","/fluxo","/andon","/perdas","/inspecao-pallets"].includes(path);
  if(role==="APONTADOR")return ["/apontamentos","/fluxo","/andon"].includes(path);
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
    if(me.perfil==="LIDER"){router.replace("/lideres");return}
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
