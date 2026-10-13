"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import { BrainCircuit,GraduationCap,Send,Save,FileSpreadsheet,Check } from "lucide-react";
import { PageHeader,Badge } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { baixarPlanilhaProducao } from "@/lib/planilha";
import { abrirRomaneioIA } from "@/components/romaneio-ai";

type Msg={role:"user"|"assistant";content:string;anexos?:any[]};
type Regra={id:string;titulo:string;area:string;situacao:string;regra:string;exemplo:string;observacao:string;ativo:boolean;prioridade:number};
const AREAS=["GERAL","USINAGEM","ROMANEIO","PCP","ATRASOS","EMBALAGEM","QUALIDADE","EXPEDICAO","RECOBRIDORA","PRODUTO","CLIENTE"];
const ATALHOS=["Quais pedidos estão em risco de atraso hoje?","Onde estão os gargalos da fábrica?","Audite as usinagens da programação ativa.","Gere a planilha de usinagem.","Faça a programação sugerida da fábrica."];

export default function SobralIAPage(){
 const {pg,toast,refresh}=useOps();
 const [tab,setTab]=useState<"usar"|"treinar">("usar");
 const [msgs,setMsgs]=useState<Msg[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
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
   setMsgs([...next,{role:"assistant",content:String(j.reply||"Pronto."),anexos:Array.isArray(j.attachments)?j.attachments:[]}]);
  }catch(e:any){setMsgs([...next,{role:"assistant",content:`⚠ ${e.message}`}])}finally{setBusy(false)}
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

 return <div className="sobral-ai-page">
  <PageHeader eyebrow="INTELIGÊNCIA INDUSTRIAL" title="Sobral IA" description="Assistente da fábrica e área de conhecimento treinável."/>
  <div className="sobral-ai-tabs">
   <button className={tab==="usar"?"active":""} onClick={()=>setTab("usar")}><BrainCircuit/> Usar Sobral IA</button>
   <button className={tab==="treinar"?"active":""} onClick={()=>setTab("treinar")}><GraduationCap/> Treinamento</button>
  </div>

  {tab==="usar"?<div className="sobral-ai-workspace">
   <aside className="sobral-ai-context">
    <div className="ai-context-card"><span className="eyebrow">CONTEXTO</span><b>{pg?.filtro?`Filtro ${pg.filtro}`:"Sem programação ativa"}</b><small>{pg?`Turno ${pg.turno}`:"Libere uma programação para análises completas."}</small></div>
    <div className="ai-context-card"><span className="eyebrow">ATALHOS</span><div className="ai-shortcuts">{ATALHOS.map(a=><button key={a} onClick={()=>void enviar(a)}>{a}</button>)}</div></div>
   </aside>
   <section className="sobral-ai-chat-large">
    <header><div><b>Assistente Sobral</b><small>GPT-5.4 + PCP + regras da fábrica</small></div><button className="ghost" onClick={()=>setMsgs([])}>Limpar</button></header>
    <div className="sobral-ai-thread">
     {!msgs.length&&<div className="ai-welcome"><BrainCircuit/><h2>O que você quer analisar?</h2><p>Pergunte sobre produção, atrasos, pedidos, usinagens, romaneios, capacidade ou qualidade.</p></div>}
     {msgs.map((m,i)=><article key={i} className={`ai-bubble ${m.role}`}><div className="ai-bubble-label">{m.role==="user"?"Você":"Sobral IA"}</div><div>{m.content}</div>
      {m.anexos?.map((a,k)=><div className="ai-action-row" key={k}>
       {a.type==="confirm"&&<button className="primary" onClick={()=>void confirmar(a.token)}><Check/> Confirmar: {a.label}</button>}
       {a.type==="romaneio"&&<button className="primary" onClick={()=>abrirRomaneioIA({romaneio:a.data})}><FileSpreadsheet/> Revisar romaneio</button>}
       {a.type==="planilha_programacao"&&<button className="primary" onClick={async()=>{if(pg?.produtos?.length)await baixarPlanilhaProducao(pg.produtos,{setores:a.setores,arquivo:a.arquivo})}}><FileSpreadsheet/> {a.label}</button>}
       {a.type==="planilha_usinagem"&&<button className="primary" onClick={async()=>{if(!pg?.produtos?.length)return;const ps=a.pedido?pg.produtos.filter(p=>String(p.pedido)===String(a.pedido)):pg.produtos;await baixarPlanilhaProducao(ps,{setores:a.setores,arquivo:a.arquivo})}}><FileSpreadsheet/> {a.label}</button>}
      </div>)}
     </article>)}
     {busy&&<article className="ai-bubble assistant">Analisando dados e regras da fábrica…</article>}<div ref={end}/>
    </div>
    <form className="sobral-ai-composer" onSubmit={e=>{e.preventDefault();void enviar(input)}}><textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Pergunte ou peça algo para a Sobral IA..." onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void enviar(input)}}}/><button className="primary" disabled={busy||!input.trim()}><Send/> Enviar</button></form>
   </section>
  </div>:<div className="sobral-training-grid">
   <section className="card sobral-training-form"><div className="card-head"><div><span className="eyebrow">ENSINAR</span><h3>{edit.id?"Editar regra":"Nova regra da fábrica"}</h3><p>O que você cadastrar aqui entra no contexto da IA nas próximas conversas.</p></div></div><div className="card-body">
    {!canTrain&&<div className="notice warning">Somente PCP e Gerente podem cadastrar ou editar regras.</div>}
    <div className="form-grid two"><label className="field"><span>Título</span><input disabled={!canTrain} value={edit.titulo||""} onChange={e=>setEdit({...edit,titulo:e.target.value})}/></label><label className="field"><span>Área</span><select disabled={!canTrain} value={edit.area||"GERAL"} onChange={e=>setEdit({...edit,area:e.target.value})}>{AREAS.map(a=><option key={a}>{a}</option>)}</select></label></div>
    <label className="field"><span>Quando se aplica?</span><textarea disabled={!canTrain} value={edit.situacao||""} onChange={e=>setEdit({...edit,situacao:e.target.value})}/></label>
    <label className="field"><span>Regra correta *</span><textarea className="training-rule" disabled={!canTrain} value={edit.regra||""} onChange={e=>setEdit({...edit,regra:e.target.value})}/></label>
    <label className="field"><span>Exemplo</span><textarea disabled={!canTrain} value={edit.exemplo||""} onChange={e=>setEdit({...edit,exemplo:e.target.value})}/></label>
    <label className="field"><span>Observação</span><textarea disabled={!canTrain} value={edit.observacao||""} onChange={e=>setEdit({...edit,observacao:e.target.value})}/></label>
    <div className="training-footer"><label className="field compact"><span>Prioridade</span><input type="number" min={1} max={100} disabled={!canTrain} value={edit.prioridade||50} onChange={e=>setEdit({...edit,prioridade:Number(e.target.value)})}/></label><button className="primary" disabled={!canTrain} onClick={()=>void salvar()}><Save/> {edit.id?"Atualizar":"Ensinar à IA"}</button>{edit.id&&<button onClick={()=>setEdit({titulo:"",area:"GERAL",situacao:"",regra:"",exemplo:"",observacao:"",ativo:true,prioridade:50})}>Cancelar</button>}</div>
   </div></section>
   <section className="card sobral-training-list"><div className="card-head"><div><span className="eyebrow">BASE DE CONHECIMENTO</span><h3>Regras ensinadas</h3><p>{regras.filter(r=>r.ativo).length} ativas de {regras.length} cadastradas.</p></div><select value={area} onChange={e=>setArea(e.target.value)}><option>TODAS</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select></div><div className="training-rule-list">{filtradas.map(r=><button key={r.id} className="training-rule-card" onClick={()=>canTrain&&setEdit(r)}><div><Badge tone={r.ativo?"success":"neutral"}>{r.ativo?"ATIVA":"INATIVA"}</Badge> <span>{r.area}</span> <span>P{r.prioridade}</span></div><b>{r.titulo}</b><p>{r.regra}</p>{r.exemplo&&<small>Ex.: {r.exemplo}</small>}</button>)}{!filtradas.length&&<div className="empty"><GraduationCap/><b>Nenhuma regra cadastrada</b><span>Cadastre uma regra para começar a ensinar a IA.</span></div>}</div></section>
  </div>}
 </div>
}
