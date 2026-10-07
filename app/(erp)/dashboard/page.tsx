"use client";

import { AlertTriangle, Clock3, Factory, ShieldAlert, Wrench, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, resumoMaquinas } from "@/lib/metrics";
import { bottlenecks, riskLevel } from "@/lib/domain/industrial";
import { fmt, fmtPct, pct } from "@/lib/format";

export default function Dashboard(){
  const {pg,andon}=useOps();
  const [ext,setExt]=useState<any>({capacidades:[],metas:[],perdas:[],pallets:[],ncAbertas:0});

  useEffect(()=>{
    let live=true;
    const load=async()=>{
      const r=await fetch("/api/industrial/overview",{cache:"no-store"});
      if(r.ok&&live)setExt(await r.json());
    };
    load();
    const id=setInterval(load,10000);
    return()=>{live=false;clearInterval(id)};
  },[]);

  const products=pg?.produtos||[];
  const machines=resumoMaquinas(products);
  const ops=products.flatMap(p=>p.operacoes);
  const plan=ops.reduce((s,o)=>s+o.quantidadePlanejada,0);
  const produced=ops.reduce((s,o)=>s+o.quantidadeProduzida,0);
  const balance=Math.max(0,plan-produced);
  const meta=ext.metas.reduce((s:any,x:any)=>s+Number(x.meta||0),0);
  const target=meta||plan;
  const progress=pct(produced,target);

  const queues=machines.map((m:any)=>({
    processo:m.processo,
    filaPecas:m.filaPecas,
    pedidos:new Set(products.filter(p=>p.operacoes.some(o=>o.processo===m.processo&&o.status!=="CONCLUIDA")).map(p=>p.pedido)).size
  }));
  const caps=ext.capacidades.map((c:any)=>({
    processo:c.processo,
    pecasHora:Number(c.pecas_hora||0),
    minutosDisponiveis:Number(c.minutos_disponiveis||0),
    eficiencia:Number(c.eficiencia||100)
  }));
  const bott=bottlenecks(queues,caps);
  const top=bott[0];
  const palletBlocked=ext.pallets.find((x:any)=>x.status==="BLOQUEADO")?.total||0;
  const perdasMin=ext.perdas.reduce((s:number,x:any)=>s+Number(x.minutos||0),0);
  const risks=useMemo(()=>products.map(p=>{
    const o=p.operacoes.find(o=>o.status!=="CONCLUIDA");
    const b=o?bott.find(x=>x.processo===o.processo):null;
    const r=riskLevel({
      priority:p.prioridade,
      blocked:!!palletBlocked,
      openAndon:andon.some(a=>a.of===p.of),
      remaining:o?Math.max(0,o.quantidadePlanejada-o.quantidadeProduzida):0,
      queueHours:b?.horasFila
    });
    return{p,r};
  }).filter(x=>["RISCO","CRITICO"].includes(x.r.level)).sort((a,b)=>b.r.score-a.r.score),[products,andon,palletBlocked,bott]);

  return <>
    <section className="pcpDashHead">
      <div>
        <span>CONTROLE DO TURNO</span>
        <h1>Central de Produção</h1>
        <p>Acompanhe execução, gargalos e prioridades sem sair da visão principal.</p>
      </div>
      <div className="pcpDashProgress">
        <div><span>EXECUÇÃO GERAL</span><b>{fmtPct(progress)}</b></div>
        <i><em style={{width:`${Math.min(100,progress)}%`}}/></i>
        <small>{fmt(produced)} produzidas de {fmt(target)} planejadas</small>
      </div>
    </section>

    <section className="pcpMetricStrip">
      <article><span>PLANEJADO</span><b>{fmt(target)}</b><small>peças do turno</small></article>
      <article><span>PRODUZIDO</span><b>{fmt(produced)}</b><small>{fmtPct(progress)} concluído</small></article>
      <article><span>SALDO</span><b>{fmt(balance)}</b><small>restante a produzir</small></article>
      <article className={risks.length?"attention":""}><span>PEDIDOS EM RISCO</span><b>{risks.length}</b><small>exigem acompanhamento</small></article>
      <article className={andon.length?"critical":""}><span>ANDON ABERTO</span><b>{andon.length}</b><small>ocorrências ativas</small></article>
    </section>

    <section className="pcpDashGrid">
      <div className="pcpBoard pcpBoardWide">
        <header>
          <div><span>PRIORIDADE OPERACIONAL</span><h2>O que precisa de atenção agora</h2></div>
          <small>{andon.length+risks.length} ponto(s) monitorados</small>
        </header>
        <div className="pcpAttentionList">
          {andon.slice(0,5).map(a=><article key={a.id}>
            <div className="pcpAttentionIcon critical"><AlertTriangle/></div>
            <div><small>{a.prioridade||"MÉDIA"} · {LABELS[a.processo]||a.processo}</small><b>{a.motivo}</b><span>Pedido {a.pedido||"-"} · OF {a.of||"-"}</span></div>
            <ArrowUpRight/>
          </article>)}
          {risks.slice(0,4).map(({p,r})=><article key={`r-${p.id}`}>
            <div className="pcpAttentionIcon"><Clock3/></div>
            <div><small>{r.level} · PEDIDO {p.pedido}</small><b>{r.reasons[0]||"Pedido exige atenção"}</b><span>{r.reasons.slice(1).join(" · ")||"Acompanhar fluxo produtivo"}</span></div>
            <ArrowUpRight/>
          </article>)}
          {!andon.length&&!risks.length&&<div className="pcpCalmState"><span>OPERAÇÃO ESTÁVEL</span><b>Nenhuma ação crítica neste momento.</b><p>Continue acompanhando o andamento dos processos.</p></div>}
        </div>
      </div>

      <div className="pcpBoard">
        <header><div><span>GARGALO</span><h2>Maior pressão da fila</h2></div></header>
        <div className="pcpBottleneck">
          <div className="pcpMachineIcon"><Factory/></div>
          <small>{top?.processo?LABELS[top.processo]||top.processo:"SEM DADOS"}</small>
          <b>{top?.capacidadeConfigurada&&top.horasFila!=null?`${top.horasFila.toFixed(1)} h`:"Capacidade não configurada"}</b>
          <span>{fmt(top?.filaPecas||0)} peças · {top?.pedidos||0} pedido(s)</span>
        </div>
        <div className="pcpMiniRows">
          {bott.slice(0,6).map(x=><div key={x.processo}><span>{LABELS[x.processo]||x.processo}</span><b>{fmt(x.filaPecas)} pç</b><small>{x.horasFila==null?"sem capacidade":`${x.horasFila.toFixed(1)} h`}</small></div>)}
        </div>
      </div>
    </section>

    <section className="pcpDashGrid pcpDashGridBottom">
      <div className="pcpBoard pcpBoardWide">
        <header><div><span>PROCESSOS</span><h2>Andamento por máquina</h2></div><small>{machines.length} processo(s)</small></header>
        <div className="pcpProcessList">
          {machines.map((x:any)=><div key={x.processo}>
            <div><b>{LABELS[x.processo]||x.processo}</b><span>{fmt(x.produzidas)} / {fmt(x.pecasPlanejadas)}</span></div>
            <i><em style={{width:`${Math.min(100,x.progresso)}%`}}/></i>
            <strong>{x.progresso.toFixed(1)}%</strong>
          </div>)}
        </div>
      </div>

      <div className="pcpBoard">
        <header><div><span>CONTROLE</span><h2>Perdas e qualidade</h2></div></header>
        <div className="pcpQualityStack">
          <article><Wrench/><div><span>TEMPO PERDIDO HOJE</span><b>{(perdasMin/60).toFixed(1)} h</b></div></article>
          <article><ShieldAlert/><div><span>PALLETS BLOQUEADOS</span><b>{palletBlocked}</b></div></article>
          <article><AlertTriangle/><div><span>NC ABERTAS</span><b>{ext.ncAbertas||0}</b></div></article>
        </div>
      </div>
    </section>
  </>;
}
