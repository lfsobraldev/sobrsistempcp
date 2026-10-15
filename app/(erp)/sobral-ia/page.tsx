"use client";
import { Fragment, useEffect,useMemo,useRef,useState, type ReactNode } from "react";
import { Activity, BarChart3, BrainCircuit, Check, Clock3, Database, FileSpreadsheet, Gauge, GraduationCap, Save, Send, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { PageHeader,Badge } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { baixarPlanilhaProducao } from "@/lib/planilha";
import { abrirRomaneioIA } from "@/components/romaneio-ai";
import { BrandLogo } from "@/components/brand-logo";

type Msg={role:"user"|"assistant";content:string;anexos?:any[]};
type Regra={id:string;titulo:string;area:string;situacao:string;regra:string;exemplo:string;observacao:string;ativo:boolean;prioridade:number};
const AREAS=["GERAL","USINAGEM","ROMANEIO","PCP","ATRASOS","EMBALAGEM","QUALIDADE","EXPEDICAO","RECOBRIDORA","PRODUTO","CLIENTE"];
const ATALHOS=["Quais pedidos estão em risco de atraso hoje?","Onde estão os gargalos da fábrica?","Audite as usinagens da programação ativa.","Gere a planilha de usinagem.","Faça a programação sugerida da fábrica."];


function inlineMarkdown(text:string):ReactNode[]{
 const parts=text.split(/(\*\*[^*]+\*\*)/g);
 return parts.map((part,i)=>{
  const m=part.match(/^\*\*(.+)\*\*$/);
  return m?<strong key={i}>{m[1]}</strong>:<Fragment key={i}>{part}</Fragment>;
 });
}

function AiMessage({text}:{text:string}){
 const lines=String(text||"").split("\n");
 return <div className="ai-message-rendered">
  {lines.map((raw,i)=>{
   const line=raw.trimEnd();
   if(!line.trim()) return <div className="ai-message-space" key={i}/>;
   const heading=line.match(/^#{1,3}\s+(.+)$/);
   if(heading) return <div className="ai-message-heading" key={i}>{inlineMarkdown(heading[1])}</div>;
   const bullet=line.match(/^\s*[-•]\s+(.+)$/);
   if(bullet) return <div className="ai-message-bullet" key={i}><span>•</span><div>{inlineMarkdown(bullet[1])}</div></div>;
   return <div className="ai-message-line" key={i}>{inlineMarkdown(line)}</div>;
  })}
 </div>;
}

export default function SobralIAPage(){
 const {pg,toast,refresh}=useOps();
 const [tab,setTab]=useState<"usar"|"centro"|"treinar">("usar");
 const [msgs,setMsgs]=useState<Msg[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [centro,setCentro]=useState<any>(null);
 const [centroBusy,setCentroBusy]=useState(false);
 const [centroErro,setCentroErro]=useState("");
 const [aps,setAps]=useState<any>(null);
 const [apsBusy,setApsBusy]=useState(false);
 const [apsErro,setApsErro]=useState("");
 const [corrigindo,setCorrigindo]=useState<number|null>(null);
 const [textoCorrecao,setTextoCorrecao]=useState("");
 const [feedbackItens,setFeedbackItens]=useState<any[]>([]);
 const [historico,setHistorico]=useState<any[]>([]);
 const [mostraHistorico,setMostraHistorico]=useState(false);
 const [regras,setRegras]=useState<Regra[]>([]);
 const [canTrain,setCanTrain]=useState(false);
 const [area,setArea]=useState("TODAS");
 const [edit,setEdit]=useState<Partial<Regra>>({titulo:"",area:"GERAL",situacao:"",regra:"",exemplo:"",observacao:"",ativo:true,prioridade:50});
 const end=useRef<HTMLDivElement>(null);

 useEffect(()=>{try{const s=sessionStorage.getItem("sobral-ia-workspace");if(s)setMsgs(JSON.parse(s))}catch{}},[]);
 useEffect(()=>{try{sessionStorage.setItem("sobral-ia-workspace",JSON.stringify(msgs.slice(-40)))}catch{} end.current?.scrollIntoView({behavior:"smooth"})},[msgs]);

 async function carregar(){
  const r=await fetch("/api/ia/conhecimento",{cache:"no-store"});const j=await r.json();
  if(r.ok){setRegras(j.itens||[]);setCanTrain(Boolean(j.canTrain))}
 }
 useEffect(()=>{void carregar()},[]);

 async function enviar(texto:string){
  const t=texto.trim();if(!t||busy)return;
  const next=[...msgs,{role:"user" as const,content:t}];setMsgs(next);setInput("");setBusy(true);
  try{
   const r=await fetch("/api/ia/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:"/sobral-ia",messages:next.map(({role,content})=>({role,content}))})});
   const raw=await r.text();let j:any={};try{j=raw?JSON.parse(raw):{}}catch{throw new Error("Resposta inválida da IA.")}
   if(!r.ok)throw new Error(j.error||"Falha na IA.");
   setMsgs([...next,{role:"assistant",content:String(j.reply||"Não foi possível concluir uma resposta fundamentada."),anexos:Array.isArray(j.attachments)?j.attachments:[]}]);
  }catch(e:any){setMsgs([...next,{role:"assistant",content:`⚠ ${e.message}`}])}finally{setBusy(false)}
 }

 async function carregarAPS(){
  setApsBusy(true);setApsErro("");
  try{
   const r=await fetch("/api/ia/aps",{cache:"no-store"});
   const j=await r.json();
   if(!r.ok)throw new Error(j.error||"Falha ao simular máquinas.");
   setAps(j);
  }catch(e:any){setApsErro(e.message||"Falha na simulação.");}
  finally{setApsBusy(false);}
 }

 async function carregarCentro(){
  setCentroBusy(true);setCentroErro("");
  try{
   const r=await fetch("/api/ia/centro",{cache:"no-store"});
   const j=await r.json();
   if(!r.ok)throw new Error(j.error||"Falha no diagnóstico.");
   setCentro(j.analise);
  }catch(e:any){setCentroErro(e.message||"Falha na análise.");}
  finally{setCentroBusy(false);}
 }

 async function enviarCorrecao(index:number){
   const resposta=msgs[index]?.content||"";
   const pergunta=[...msgs.slice(0,index)].reverse().find(m=>m.role==="user")?.content||"";
   const r=await fetch("/api/ia/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pergunta,resposta,correcao:textoCorrecao})});
   const j=await r.json();
   if(!r.ok)return toast("error",j.error||"Falha ao enviar correção.");
   toast("success","Correção registrada para revisão da equipe.");
   setCorrigindo(null);setTextoCorrecao("");
 }
 async function carregarHistorico(id:string){
   const r=await fetch("/api/ia/conhecimento/historico?id="+encodeURIComponent(id),{cache:"no-store"});
   const j=await r.json();
   if(!r.ok)return toast("error",j.error||"Falha ao carregar histórico.");
   setHistorico(j.historico||[]);setMostraHistorico(true);
 }
 async function carregarFeedback(){
   const r=await fetch("/api/ia/feedback",{cache:"no-store"});
   if(r.ok){const j=await r.json();setFeedbackItens(j.itens||[]);}
 }
 async function revisarFeedback(id:string,status:"ANALISADO"|"DESCARTADO"){
   const r=await fetch("/api/ia/feedback",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status})});
   const j=await r.json();
   if(!r.ok)return toast("error",j.error||"Falha ao revisar.");
   await carregarFeedback();
   toast("success",j.mensagem||"Revisão registrada.");
 }

 async function confirmar(token:string){
  const r=await fetch("/api/ia/acao",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
  const j=await r.json();if(!r.ok)return toast("error",j.error||"Falha.");
  toast("success",j.mensagem||"Ação executada.");void refresh();
 }

 async function salvar(){
  if(!canTrain)return;
  const r=await fetch("/api/ia/conhecimento",{method:edit.id?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(edit)});
  const j=await r.json();if(!r.ok)return toast("error",j.error||"Falha ao salvar.");
  toast("success",edit.id?"Regra atualizada.":"Regra ensinada à IA.");
  setEdit({titulo:"",area:"GERAL",situacao:"",regra:"",exemplo:"",observacao:"",ativo:true,prioridade:50});await carregar();
 }

 const filtradas=useMemo(()=>regras.filter(r=>area==="TODAS"||r.area===area),[regras,area]);

 return <div className="sobral-ai-page sobral-ai-v2">
  <section className="sobral-ai-hero">
   <div className="sobral-ai-hero-main">
    <div className="sobral-ai-hero-brand"><BrandLogo size={52}/></div>
    <div>
     <span className="sobral-ai-kicker">INTELIGÊNCIA INDUSTRIAL</span>
     <h1>Sobral IA</h1>
     <p>Copiloto operacional conectado à programação, usinagem, romaneios, qualidade e regras reais da fábrica.</p>
    </div>
   </div>
   <div className="sobral-ai-hero-status"><span className="sobral-ai-live-dot"/><div><b>IA operacional ativa</b><small>GPT-5.4 via Vercel AI Gateway</small></div></div>
  </section>

  <section className="sobral-ai-metrics">
   <div className="sobral-ai-metric"><span className="metric-icon"><Database/></span><div><small>Programação</small><b>{pg?.filtro ? `Filtro ${pg.filtro}` : "Sem filtro ativo"}</b><span>{pg ? `Turno ${pg.turno}` : "Aguardando programação"}</span></div></div>
   <div className="sobral-ai-metric"><span className="metric-icon"><GraduationCap/></span><div><small>Conhecimento</small><b>{regras.filter(r=>r.ativo).length} regras ativas</b><span>{regras.length} cadastradas no total</span></div></div>
   <div className="sobral-ai-metric"><span className="metric-icon"><ShieldCheck/></span><div><small>Modo</small><b>Dados reais + regras</b><span>Sem inventar produção</span></div></div>
   <div className="sobral-ai-metric"><span className="metric-icon"><Activity/></span><div><small>Escopo</small><b>PCP completo</b><span>Produção, risco e expedição</span></div></div>
  </section>

  <div className="sobral-ai-tabs sobral-ai-tabs-v2">
   <button className={tab==="usar"?"active":""} onClick={()=>setTab("usar")}><BrainCircuit/> Central da IA</button>
   <button className={tab==="centro"?"active":""} onClick={()=>{setTab("centro");if(!centro)void carregarCentro()}}><Gauge/> Centro operacional</button>
   <button className={tab==="treinar"?"active":""} onClick={()=>setTab("treinar")}><GraduationCap/> Base de conhecimento</button>
  </div>

  {tab==="usar"?<div className="sobral-ai-workspace sobral-ai-workspace-v2">
   <aside className="sobral-ai-context sobral-ai-context-v2">
    <div className="ai-context-card ai-context-primary">
     <div className="ai-context-title"><Gauge/><span>Contexto atual</span></div>
     <b>{pg?.filtro?`Filtro ${pg.filtro}`:"Sem programação ativa"}</b>
     <small>{pg?`Turno ${pg.turno} conectado à análise`:"Libere uma programação para análises completas."}</small>
     <div className="ai-context-state"><span/> Dados do PCP disponíveis</div>
    </div>
    <div className="ai-context-card">
     <div className="ai-context-title"><WandSparkles/><span>Ações rápidas</span></div>
     <div className="ai-command-grid">
      <button onClick={()=>void enviar("Quais pedidos estão em risco de atraso hoje?")}><Clock3/><span><b>Risco de atraso</b><small>Pedidos críticos e causas</small></span></button>
      <button onClick={()=>void enviar("Onde estão os gargalos da fábrica?")}><BarChart3/><span><b>Gargalos</b><small>Capacidade por processo</small></span></button>
      <button onClick={()=>void enviar("Audite as usinagens da programação ativa.")}><ShieldCheck/><span><b>Auditar usinagem</b><small>Rotas faltantes ou indevidas</small></span></button>
      <button onClick={()=>void enviar("Gere a planilha de usinagem.")}><FileSpreadsheet/><span><b>Planilha</b><small>Gerar usinagem em Excel</small></span></button>
     </div>
    </div>
    <div className="ai-context-card ai-context-help"><div className="ai-context-title"><Sparkles/><span>Também posso</span></div><ul><li>analisar pedido específico</li><li>montar programação sugerida</li><li>identificar problemas futuros</li><li>gerar e revisar romaneios</li><li>consultar qualidade e Andons</li></ul></div>
   </aside>

   <section className="sobral-ai-chat-large sobral-ai-chat-v2">
    <header>
     <div className="sobral-ai-chat-head"><BrandLogo size={36}/><div><b>Assistente Sobral</b><small>Inteligência industrial em tempo real</small></div></div>
     <div className="sobral-ai-chat-head-actions"><span className="ai-online"><i/> Online</span><button className="ghost" onClick={()=>setMsgs([])}>Limpar conversa</button></div>
    </header>
    <div className="sobral-ai-thread">
     {!msgs.length&&<div className="ai-welcome ai-welcome-v2">
      <div className="ai-welcome-icon"><BrainCircuit/></div><span className="ai-welcome-tag">SOBRAL IA</span>
      <h2>O que você quer analisar na fábrica?</h2>
      <p>Pergunte em linguagem normal. Eu cruzo programação, pedidos, capacidade, usinagem, romaneios, qualidade e regras ensinadas pela equipe.</p>
      <div className="ai-welcome-suggestions">{ATALHOS.slice(0,4).map(a=><button key={a} onClick={()=>void enviar(a)}>{a}</button>)}</div>
     </div>}
     {msgs.map((m,i)=><article key={i} className={`ai-bubble ${m.role}`}><div className="ai-bubble-label">{m.role==="user"?"Você":"Sobral IA"}</div><div className="ai-bubble-content"><AiMessage text={m.content}/></div>
      {m.role==="assistant"&&<div style={{padding:"0 10px 10px"}}>
       <button className="ghost" onClick={()=>{setCorrigindo(corrigindo===i?null:i);setTextoCorrecao("")}}>Corrigir resposta da IA</button>
       {corrigindo===i&&<div className="card" style={{padding:12}}>
        <label className="field"><span>Como deveria ser a resposta?</span>
         <textarea value={textoCorrecao} onChange={e=>setTextoCorrecao(e.target.value)} placeholder="Escreva a correção e os dados/procedimentos corretos."/>
        </label>
        <button className="primary" disabled={textoCorrecao.trim().length<10} onClick={()=>void enviarCorrecao(i)}>Enviar para revisão</button>
       </div>}
      </div>}
      {m.anexos?.map((a,k)=><div className="ai-action-row" key={k}>
       {a.type==="confirm"&&<button className="primary" onClick={()=>void confirmar(a.token)}><Check/> Confirmar: {a.label}</button>}
       {a.type==="arquivo"&&<a className="primary" href={a.url} target="_blank" rel="noopener noreferrer" download><FileSpreadsheet/> {a.label}</a>}
       {a.type==="romaneio"&&<button className="primary" onClick={()=>abrirRomaneioIA({romaneio:a.data})}><FileSpreadsheet/> Revisar romaneio</button>}
       {a.type==="planilha_programacao"&&<button className="primary" onClick={async()=>{if(pg?.produtos?.length)await baixarPlanilhaProducao(pg.produtos,{setores:a.setores,arquivo:a.arquivo})}}><FileSpreadsheet/> {a.label}</button>}
       {a.type==="planilha_usinagem"&&<button className="primary" onClick={async()=>{if(!pg?.produtos?.length)return;const ps=a.pedido?pg.produtos.filter(p=>String(p.pedido)===String(a.pedido)):pg.produtos;await baixarPlanilhaProducao(ps,{setores:a.setores,arquivo:a.arquivo})}}><FileSpreadsheet/> {a.label}</button>}
      </div>)}
     </article>)}
     {busy&&<article className="ai-bubble assistant ai-processing"><div className="ai-bubble-label">Sobral IA</div><div className="ai-processing-line"><span/><span/><span/></div><small>Analisando dados e regras da fábrica…</small></article>}
     <div ref={end}/>
    </div>
    <form className="sobral-ai-composer sobral-ai-composer-v2" onSubmit={e=>{e.preventDefault();void enviar(input)}}>
     <div className="ai-composer-box">
      <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Ex.: quais pedidos podem atrasar amanhã e por quê?" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void enviar(input)}}}/>
      <div className="ai-composer-footer"><span>Enter para enviar · Shift+Enter para quebrar linha</span><button className="primary" disabled={busy||!input.trim()}><Send/> Enviar</button></div>
     </div>
    </form>
   </section>
  </div>:tab==="centro"?<section className="sobral-training-v2">
   <div className="training-overview">
    <div><span className="sobral-ai-kicker">CENTRO DE INTELIGÊNCIA OPERACIONAL</span>
     <h2>Diagnóstico da programação e capacidade</h2>
     <p>Análise de dados reais do PCP, sem modificar filas, prioridades ou OFs. A avaliação depende da atualização dos apontamentos.</p>
    </div>
    <button className="primary" disabled={centroBusy} onClick={()=>void carregarCentro()}><Activity/> {centroBusy?"Analisando…":"Atualizar diagnóstico"}</button>
   </div>
   {centroErro&&<div className="notice warning">{centroErro}</div>}
   {centroBusy&&!centro&&<div className="card"><div className="card-body">Consultando pedidos, operações, capacidades e riscos…</div></div>}
   {centro&&<>
    <section className="sobral-ai-metrics">
     <div className="sobral-ai-metric"><span className="metric-icon"><Database/></span><div><small>Fonte</small><b>Filtro {centro.filtro||"—"}</b><span>Programação ativa</span></div></div>
     <div className="sobral-ai-metric"><span className="metric-icon"><Activity/></span><div><small>Processos</small><b>{Array.isArray(centro.capacidade)?centro.capacidade.length:0}</b><span>Com carga produtiva</span></div></div>
     <div className="sobral-ai-metric"><span className="metric-icon"><ShieldCheck/></span><div><small>Pedidos em risco</small><b>{Array.isArray(centro.riscos)?centro.riscos.filter((r:any)=>["CRITICO","ALTO"].includes(r.risco)).length:0}</b><span>Crítico ou alto</span></div></div>
     <div className="sobral-ai-metric"><span className="metric-icon"><Gauge/></span><div><small>Gargalos</small><b>{Array.isArray(centro.capacidade)?centro.capacidade.filter((c:any)=>c.gargalo===true).length:0}</b><span>Capacidade cadastrada</span></div></div>
    </section>
    <div className="sobral-training-grid sobral-training-grid-v2">
     <section className="card">
      <div className="card-head"><div><h3>Carga por processo</h3><p>Saldo de operações e capacidade estimada do turno</p></div></div>
      <div className="card-body">
       {(Array.isArray(centro.capacidade)?centro.capacidade:[]).map((c:any,i:number)=><div key={i} style={{padding:"12px 0",borderBottom:"1px solid var(--border,#ddd)"}}>
        <b>{c.processo}</b><div>Saldo: {Number(c.saldo||0).toLocaleString("pt-BR")} peças · Capacidade: {c.capacidadeTurno==null?"Não cadastrada":Number(c.capacidadeTurno).toLocaleString("pt-BR")+" peças/turno"}</div>
        <small>{c.cargaPct==null?"Não é possível calcular ocupação sem capacidade":c.cargaPct+"% de carga"}{c.gargalo===true?" · Gargalo identificado":""}</small>
       </div>)}
      </div>
     </section>
     <section className="card">
      <div className="card-head"><div><h3>Pedidos que exigem atenção</h3><p>Classificação baseada em prazos, pendências e sinais reais</p></div></div>
      <div className="card-body">
       {(Array.isArray(centro.riscos)?centro.riscos.slice(0,15):[]).map((r:any,i:number)=><div key={i} style={{padding:"12px 0",borderBottom:"1px solid var(--border,#ddd)"}}>
        <b>Pedido {r.pedido} · Risco {r.risco}</b><div>Prioridade: {r.prioridade} · Progresso: {r.progresso}%</div>
        <small>{Array.isArray(r.sinais)?r.sinais.join(" · "):"Sem sinais adicionais"}</small>
       </div>)}
       {!centro.riscos?.length&&<p>Sem pedidos em risco identificados nesta programação.</p>}
      </div>
     </section>
    </div>
    <section className="card">
     <div className="card-head"><div><h3>Sequenciamento sugerido</h3><p>Leitura consultiva: alterações reais de fila exigem confirmação operacional.</p></div></div>
     <div className="card-body">
      {(centro.plano?.sequencias||[]).map((s:any,i:number)=><div key={i} style={{padding:"12px 0",borderBottom:"1px solid var(--border,#ddd)"}}>
       <b>{s.processo}</b><div>{(s.filaSugerida||[]).slice(0,8).map((p:any)=>"Pedido "+p.pedido+" ("+p.prioridade+")").join(" → ")||"Sem saldo pendente"}</div>
      </div>)}
     </div>
    </section>
    <section className="card">
     <div className="card-head">
      <div><h3>APS — Simulação de máquinas</h3><p>Distribuição por capacidade, eficiência, tempo de preparação e compatibilidades cadastradas.</p></div>
      <button className="primary" disabled={apsBusy} onClick={()=>void carregarAPS()}><Gauge/> {apsBusy?"Simulando…":"Simular máquinas"}</button>
     </div>
     <div className="card-body">
      {apsErro&&<div className="notice warning">{apsErro}</div>}
      {!aps&&!apsErro&&<p>Execute uma simulação para avaliar a carga por máquina, sem modificar a programação liberada.</p>}
      {aps&&<>
       <p><b>{aps.totalAlocacoes}</b> operações alocadas · <b>{aps.totalPendentes}</b> sem máquina compatível · Turno: {aps.programacao?.turno}</p>
       {(aps.porMaquina||[]).map((m:any,i:number)=><div key={i} style={{padding:"10px 0",borderBottom:"1px solid var(--border,#ddd)"}}>
        <b>{m.processo} — {m.maquina}</b>
        <div>{m.pecas} peças · {m.tarefas} operações · {m.turnosEstimados} turnos relativos estimados</div>
        <small>{m.ocupacaoMinutos} min de carga / {m.minutosDisponiveisPorTurno} min disponíveis por turno</small>
       </div>)}
       {!!aps.pendentes?.length&&<div className="notice warning">Pendências sem capacidade/compatibilidade: {aps.pendentes.slice(0,12).map((p:any)=>p.processo+" / "+p.pedido).join(", ")}</div>}
       <p style={{opacity:.75}}>Simulação condicional. Não considera dependências entre setores, paradas, manutenção ou calendário; sem alterar filas e OFs.</p>
       {aps.incompleto&&<div className="notice warning">Há mais de 10 mil operações; a simulação está incompleta.</div>}
      </>}
     </div>
    </section>
    <p style={{opacity:.75}}>Consulta: {centro.consultadoEm?new Date(centro.consultadoEm).toLocaleString("pt-BR"):"—"}. Os indicadores não representam produção em tempo real sem apontamentos atualizados.</p>
   </>}
  </section>:<div className="sobral-training-v2">
   {canTrain&&<section className="card" style={{marginBottom:16}}>
    <div className="card-head"><div><h3>Correções enviadas pela equipe</h3><p>Revise o feedback e, se correto, registre o aprendizado na Base de Conhecimento.</p></div><button onClick={()=>void carregarFeedback()}>Carregar correções</button></div>
    <div className="card-body">
     {feedbackItens.filter(f=>f.status==="PENDENTE").slice(0,20).map(f=><div key={f.id} style={{padding:"12px 0",borderBottom:"1px solid var(--border,#ddd)"}}>
      <b>{f.usuario}</b><p><strong>Pergunta:</strong> {f.pergunta}</p><p><strong>Correção proposta:</strong> {f.correcao}</p>
      <button onClick={()=>{setEdit({titulo:"Correção validada: "+f.pergunta.slice(0,90),area:"GERAL",situacao:f.pergunta,regra:f.correcao,exemplo:"",observacao:"Fonte: feedback de "+f.usuario,ativo:true,prioridade:50});toast("success","Confira e salve no editor para homologar.");}}>Preparar conhecimento</button>
      <button onClick={()=>void revisarFeedback(f.id,"ANALISADO")}>Marcar analisada</button>
      <button onClick={()=>void revisarFeedback(f.id,"DESCARTADO")}>Descartar</button>
     </div>)}
     {!feedbackItens.length&&<p>Carregue as correções recebidas para revisar.</p>}
    </div>
   </section>}
   <section className="training-overview">
    <div><span className="sobral-ai-kicker">TREINAMENTO OPERACIONAL</span><h2>Ensine a Sobral IA como a fábrica realmente trabalha</h2><p>Cadastre regras específicas sem alterar código. Elas entram no contexto das próximas análises da IA.</p></div>
    <div className="training-overview-stats"><div><b>{regras.filter(r=>r.ativo).length}</b><span>ativas</span></div><div><b>{regras.length}</b><span>total</span></div><div><b>{AREAS.length}</b><span>áreas</span></div></div>
   </section>

   <div className="sobral-training-grid sobral-training-grid-v2">
    <section className="card sobral-training-form training-editor">
     <div className="card-head"><div><span className="eyebrow">EDITOR DE CONHECIMENTO</span><h3>{edit.id?"Editar regra existente":"Ensinar nova regra"}</h3><p>Descreva quando a regra se aplica e o comportamento correto.</p></div><span className="training-editor-icon"><GraduationCap/></span></div>
     <div className="card-body">
      {canTrain&&edit.id&&<button onClick={()=>void carregarHistorico(edit.id!)}>Ver histórico e versões deste conhecimento</button>}
      {mostraHistorico&&edit.id&&<div className="card" style={{padding:12,marginBottom:12}}>
       <b>Histórico de alterações</b>
       <button className="ghost" onClick={()=>setMostraHistorico(false)}>Ocultar</button>
       {!historico.length&&<p>Não há versões registradas para este conhecimento.</p>}
       {historico.map((h:any)=><div key={h.id} style={{borderBottom:"1px solid var(--border,#ddd)",padding:"8px 0"}}>
        <b>{h.evento} · {h.autor}</b>
        <small> · {new Date(h.criado_em).toLocaleString("pt-BR")}</small>
        <div><strong>Anterior:</strong> {h.anterior?.regra||"Não havia registro"}</div>
        <div><strong>Posterior:</strong> {h.posterior?.regra||"Não disponível"}</div>
       </div>)}
      </div>}
      {!canTrain&&<div className="notice warning">Somente PCP e Gerente podem cadastrar ou editar regras.</div>}
      <div className="form-grid two"><label className="field"><span>Título da regra</span><input disabled={!canTrain} value={edit.titulo||""} onChange={e=>setEdit({...edit,titulo:e.target.value})} placeholder="Ex.: Batente RB42 usa Tupia"/></label><label className="field"><span>Área</span><select disabled={!canTrain} value={edit.area||"GERAL"} onChange={e=>setEdit({...edit,area:e.target.value})}>{AREAS.map(a=><option key={a}>{a}</option>)}</select></label></div>
      <label className="field"><span>Quando se aplica?</span><textarea disabled={!canTrain} value={edit.situacao||""} onChange={e=>setEdit({...edit,situacao:e.target.value})} placeholder="Ex.: batente perna com rebaixo RB42..."/></label>
      <label className="field training-main-rule"><span>Regra correta *</span><textarea className="training-rule" disabled={!canTrain} value={edit.regra||""} onChange={e=>setEdit({...edit,regra:e.target.value})} placeholder="Explique exatamente o comportamento correto que a IA deve considerar."/></label>
      <label className="field"><span>Exemplo real</span><textarea disabled={!canTrain} value={edit.exemplo||""} onChange={e=>setEdit({...edit,exemplo:e.target.value})} placeholder="Ex.: Pedido 123, batente RB42 → Contratesta + Dobradiças + Tupia."/></label>
      <label className="field"><span>Observação / exceções</span><textarea disabled={!canTrain} value={edit.observacao||""} onChange={e=>setEdit({...edit,observacao:e.target.value})} placeholder="Exceções ou cuidados importantes."/></label>
      <div className="training-footer"><label className="field compact"><span>Prioridade</span><input type="number" min={1} max={100} disabled={!canTrain} value={edit.prioridade||50} onChange={e=>setEdit({...edit,prioridade:Number(e.target.value)})}/></label><label className="training-active"><input type="checkbox" disabled={!canTrain} checked={edit.ativo!==false} onChange={e=>setEdit({...edit,ativo:e.target.checked})}/><span>Regra ativa</span></label><div className="training-footer-spacer"/>{edit.id&&<button onClick={()=>setEdit({titulo:"",area:"GERAL",situacao:"",regra:"",exemplo:"",observacao:"",ativo:true,prioridade:50})}>Cancelar</button>}<button className="primary" disabled={!canTrain} onClick={()=>void salvar()}><Save/> {edit.id?"Atualizar conhecimento":"Ensinar à IA"}</button></div>
     </div>
    </section>

    <section className="card sobral-training-list training-library">
     <div className="card-head"><div><span className="eyebrow">BIBLIOTECA DE REGRAS</span><h3>Conhecimento da fábrica</h3><p>Clique em uma regra para revisar ou editar.</p></div><select value={area} onChange={e=>setArea(e.target.value)}><option>TODAS</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select></div>
     <div className="training-rule-list training-rule-list-v2">
      {filtradas.map(r=><button key={r.id} className="training-rule-card training-rule-card-v2" onClick={()=>{if(canTrain){setEdit(r);setMostraHistorico(false)}}}><div className="training-rule-topline"><Badge tone={r.ativo?"success":"neutral"}>{r.ativo?"ATIVA":"INATIVA"}</Badge><span className="training-area">{r.area}</span><span className="training-priority">P{r.prioridade}</span></div><b>{r.titulo}</b><p>{r.regra}</p>{r.exemplo&&<small>Ex.: {r.exemplo}</small>}</button>)}
      {!filtradas.length&&<div className="empty training-empty"><GraduationCap/><b>Nenhuma regra cadastrada</b><span>Cadastre a primeira regra para começar a construir a inteligência específica da fábrica.</span></div>}
     </div>
    </section>
   </div>
  </div>}
 </div>

}
