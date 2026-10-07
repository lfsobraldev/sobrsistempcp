"use client";
import { useState } from "react";
import { Factory, ArrowRight, Gauge, Workflow, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Login(){
  const r=useRouter(),[u,setU]=useState(""),[p,setP]=useState(""),[e,setE]=useState(""),[busy,setBusy]=useState(false);
  async function go(ev:React.FormEvent){
    ev.preventDefault();setE("");setBusy(true);
    try{
      const x=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({usuario:u,senha:p})});
      const j=await x.json();if(!x.ok)throw new Error(j.error);r.replace("/dashboard");
    }catch(err:any){setE(err.message)}finally{setBusy(false)}
  }
  return <main className="pcpLogin">
    <div className="pcpLoginTop">
      <div className="pcpLoginBrand"><span><Factory/></span><div><b>SOBRAL PCP</b><small>CONTROLE INDUSTRIAL DE PRODUÇÃO</small></div></div>
      <span>FAMOSSUL · UNIDADE NORDESTE</span>
    </div>

    <div className="pcpLoginStage">
      <section className="pcpLoginIntro">
        <span className="pcpEyebrow">PLANEJAMENTO E EXECUÇÃO</span>
        <h1>Produção organizada.<br/>Decisão mais rápida.</h1>
        <p>Programação, sequência, apontamento e acompanhamento da fábrica em uma única operação.</p>
        <div className="pcpLoginModules">
          <article><Gauge/><div><b>Visão do turno</b><span>Metas, saldo e andamento por processo.</span></div></article>
          <article><Workflow/><div><b>Fluxo produtivo</b><span>Fila e sequência conforme a rota real.</span></div></article>
          <article><ShieldCheck/><div><b>Qualidade integrada</b><span>Pallets, bloqueios e inspeções no mesmo fluxo.</span></div></article>
        </div>
      </section>

      <form className="pcpLoginCard" onSubmit={go}>
        <div className="pcpLoginCardHead">
          <span>ACESSO AO PCP</span>
          <h2>Bem-vindo</h2>
          <p>Entre com seu usuário operacional.</p>
        </div>
        <label>Usuário<input value={u} onChange={x=>setU(x.target.value)} autoComplete="username" placeholder="Digite seu usuário"/></label>
        <label>Senha<input type="password" value={p} onChange={x=>setP(x.target.value)} autoComplete="current-password" placeholder="Digite sua senha"/></label>
        {e&&<div className="loginErr">{e}</div>}
        <button disabled={busy}>{busy?"VALIDANDO...":<>ENTRAR NO PCP <ArrowRight/></>}</button>
        <small className="pcpLoginFoot">Acesso restrito à operação autorizada.</small>
      </form>
    </div>
  </main>
}
