"use client";
import { AlertTriangle,CheckCircle2 } from "lucide-react";
import { useEffect,useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";
import { Empty } from "@/components/ui";

function elapsed(from:string,now:number){
  const sec=Math.max(0,Math.floor((now-new Date(from).getTime())/1000));
  const h=String(Math.floor(sec/3600)).padStart(2,"0");
  const m=String(Math.floor((sec%3600)/60)).padStart(2,"0");
  const s=String(sec%60).padStart(2,"0");
  return `${h}:${m}:${s}`;
}

export default function Andon(){
  const{andon,me,refresh,toast}=useOps();
  const[now,setNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
  async function resolve(id:string){
    const r=await fetch("/api/andon",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id})});
    const j=await r.json();if(!r.ok){toast("error",j.error||"Falha ao resolver Andon.");return}toast("success","Andon resolvido.");await refresh();
  }
  const canResolve=me?.perfil==="PCP"||me?.perfil==="ENCARREGADO";
  return <><div className="pageTitle"><div><span>GESTÃO À VISTA</span><h1>Andon / Ocorrências</h1><p>Paradas e desvios visíveis imediatamente para gestão.</p></div></div><div className="andonGrid">{andon.map(a=><article key={a.id}><div className="andonHead"><span><AlertTriangle/>PARADA</span><b>{LABELS[a.processo]||a.processo}</b></div><div className="andonClock">{elapsed(a.criado_em,now)}</div><h3>{a.motivo}</h3><p>{a.observacao||"Sem observação adicional."}</p><dl><div><dt>Pedido</dt><dd>{a.pedido||"-"}</dd></div><div><dt>OF</dt><dd>{a.of||"-"}</dd></div><div><dt>Responsável</dt><dd>{a.usuario_abertura||"-"}</dd></div></dl>{canResolve&&<button className="resolveBtn" onClick={()=>resolve(a.id)}><CheckCircle2/>RESOLVER ANDON</button>}</article>)}{!andon.length&&<Empty title="Nenhum Andon aberto." sub="A operação está sem paradas registradas."/>}</div></>;
}
