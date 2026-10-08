"use client";

import { Factory, Flag, PackageCheck } from "lucide-react";
import { useMemo } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, resumoMaquinas } from "@/lib/metrics";
import { fmt, fmtPct, pct } from "@/lib/format";

export default function Dashboard(){
  const {pg}=useOps();

  const produtos=pg?.produtos||[];
  const maquinas=resumoMaquinas(produtos);
  const operacoes=produtos.flatMap(p=>p.operacoes);

  const planejado=operacoes.reduce(
    (s,o)=>s+Number(o.quantidadePlanejada||0),
    0
  );

  const produzido=operacoes.reduce(
    (s,o)=>s+Number(o.quantidadeProduzida||0),
    0
  );

  const saldo=Math.max(0,planejado-produzido);

  const pedidosAtivos=useMemo(
    ()=>new Set(
      produtos
        .filter(p=>p.operacoes.some(o=>o.status!=="CONCLUIDA"))
        .map(p=>p.pedido)
    ).size,
    [produtos]
  );

  const prioridades=useMemo(
    ()=>new Set(
      produtos
        .filter(p=>["ALTA","URGENTE"].includes(p.prioridade))
        .map(p=>p.pedido)
    ).size,
    [produtos]
  );

  const andamento=pct(produzido,planejado);

  return <>
    <section className="pcpDashHead">
      <div>
        <span>CONTROLE DO TURNO</span>
        <h1>Central de Produção</h1>
        <p>Somente o necessário para programar, imprimir, executar e acompanhar.</p>
      </div>
      <div className="pcpDashProgress">
        <div><span>EXECUÇÃO GERAL</span><b>{fmtPct(andamento)}</b></div>
        <i><em style={{width:`${Math.min(100,andamento)}%`}}/></i>
        <small>{fmt(produzido)} produzidas de {fmt(planejado)} planejadas</small>
      </div>
    </section>

    <section className="pcpMetricStrip">
      <article><span>PEDIDOS ATIVOS</span><b>{pedidosAtivos}</b><small>na programação</small></article>
      <article><span>PLANEJADO</span><b>{fmt(planejado)}</b><small>peças nos processos</small></article>
      <article><span>PRODUZIDO</span><b>{fmt(produzido)}</b><small>{fmtPct(andamento)} executado</small></article>
      <article><span>SALDO</span><b>{fmt(saldo)}</b><small>restante</small></article>
      <article className={prioridades?"attention":""}><span>PRIORIDADES</span><b>{prioridades}</b><small>pedidos destacados</small></article>
    </section>

    <section className="pcpDashGrid">
      <div className="pcpBoard pcpBoardWide">
        <header>
          <div><span>PROCESSOS</span><h2>Andamento por máquina</h2></div>
          <small>{maquinas.length} setor(es)</small>
        </header>

        <div className="pcpProcessList">
          {maquinas.map((x:any)=><div key={x.processo}>
            <div>
              <b>{LABELS[x.processo]||x.processo}</b>
              <span>{fmt(x.produzidas)} / {fmt(x.pecasPlanejadas)}</span>
            </div>
            <i><em style={{width:`${Math.min(100,x.progresso)}%`}}/></i>
            <strong>{x.progresso.toFixed(1)}%</strong>
          </div>)}
        </div>
      </div>

      <div className="pcpBoard">
        <header>
          <div><span>ROTINA</span><h2>Ordem de trabalho</h2></div>
        </header>

        <div className="pcpQualityStack">
          <article><Factory/><div><span>1. PROGRAMAR</span><b>Importar e conferir filtro</b></div></article>
          <article><PackageCheck/><div><span>2. IMPRIMIR</span><b>Plano do Turno por setor</b></div></article>
          <article><Flag/><div><span>3. PRIORIZAR</span><b>Somente exceções reais</b></div></article>
        </div>
      </div>
    </section>
  </>;
}
