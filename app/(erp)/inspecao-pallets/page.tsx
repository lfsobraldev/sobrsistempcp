"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, CheckCircle2, ClipboardCheck, ImagePlus, LockKeyhole, PackageCheck, Plus,
  Printer, RefreshCw, Search, ShieldCheck, Truck, UnlockKeyhole, XCircle
} from "lucide-react";
import { Modal, Panel } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Foto = { id:string; dataUrl:string; legenda:string; area:string; usuario:string; criadoEm:string };
type Pallet = {
  id:string; codigo:string; pedido:string; cliente:string; filtro:string; pallet:string; tipo_produto:string;
  quantidade:number; jogos:number; turno:string; destino:string; montador:string; conferente:string; observacao:string;
  status:string; qualidade_status:string; msac_status:string; qualidade_usuario:string; qualidade_em:string|null;
  qualidade_observacao:string; msac_usuario:string; msac_em:string|null; msac_observacao:string;
  bloqueio_motivo:string; criado_em:string; atualizado_em:string; fotos_count:number; fotos?:Foto[];
  inspecoes?:{id:string;area:string;resultado:string;checklist:Record<string,boolean>;observacao:string;usuario:string;criadoEm:string}[];
  eventos?:{id:number;tipo:string;descricao:string;usuario:string;criadoEm:string}[];
};

type Resumo = { total?:number; liberados?:number; bloqueados?:number; em_liberacao?:number; aguardando?:number };

const CHECKS = [
  ["alinhamento","Alinhamento do pallet"],
  ["amarracao","Amarrações e cintas"],
  ["calcos","Calços e proteção"],
  ["avarias","Sem avarias aparentes"],
  ["quantidade","Quantidade conferida"],
  ["identificacao","Identificação / etiqueta"],
] as const;

function fmt(v:number){return Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:3});}
function date(v?:string|null){return v?new Date(v).toLocaleString("pt-BR"):"-";}
function statusLabel(v:string){return v.replaceAll("_"," ");}

async function compressImage(file:File){
  const data = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error("Falha ao ler foto."));r.readAsDataURL(file)});
  const img = await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("Imagem inválida."));i.src=data});
  const max=1280, scale=Math.min(1,max/Math.max(img.width,img.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  canvas.getContext("2d")?.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.76);
}

export default function InspecaoPallets(){
  const { toast, me } = useOps();
  const [itens,setItens]=useState<Pallet[]>([]),[resumo,setResumo]=useState<Resumo>({}),[busy,setBusy]=useState(false);
  const [q,setQ]=useState(""),[status,setStatus]=useState(""),[selected,setSelected]=useState<Pallet|null>(null);
  const [createOpen,setCreateOpen]=useState(false),[inspectionOpen,setInspectionOpen]=useState(false),[decisionOpen,setDecisionOpen]=useState(false);
  const [decision,setDecision]=useState<{action:string;title:string}|null>(null),[motivo,setMotivo]=useState(""),[obs,setObs]=useState("");
  const [area,setArea]=useState<"QUALIDADE"|"MSAC">("QUALIDADE"),[checklist,setChecklist]=useState<Record<string,boolean>>({}),[inspectionObs,setInspectionObs]=useState("");
  const [form,setForm]=useState({pedido:"",cliente:"",filtro:"",pallet:"",tipoProduto:"",quantidade:"",jogos:"",turno:"A",destino:"",montador:"",conferente:"",observacao:""});
  const photoRef=useRef<HTMLInputElement|null>(null);

  async function openPallet(id:string){try{const r=await fetch(`/api/pallets?id=${encodeURIComponent(id)}`,{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j.error);setSelected(j.item)}catch(e:any){toast("error",e.message)}}
  async function load(){setBusy(true);try{const p=new URLSearchParams();if(q.trim())p.set("q",q.trim());if(status)p.set("status",status);const r=await fetch(`/api/pallets?${p}`,{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j.error);setItens(j.itens||[]);setResumo(j.resumo||{})}catch(e:any){toast("error",e.message)}finally{setBusy(false)}}
  useEffect(()=>{const t=setTimeout(load,150);return()=>clearTimeout(t)},[q,status]);

  const cards=useMemo(()=>[
    ["Pallets (30 dias)",resumo.total||0,""],
    ["Aguardando",resumo.aguardando||0,"warn"],
    ["Em liberação",resumo.em_liberacao||0,"info"],
    ["Bloqueados",resumo.bloqueados||0,"danger"],
    ["Liberados",resumo.liberados||0,"success"],
  ],[resumo]);

  async function create(){setBusy(true);try{const r=await fetch("/api/pallets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)}),j=await r.json();if(!r.ok)throw new Error(j.error);toast("success","Pallet cadastrado.");setCreateOpen(false);setForm({pedido:"",cliente:"",filtro:"",pallet:"",tipoProduto:"",quantidade:"",jogos:"",turno:"A",destino:"",montador:"",conferente:"",observacao:""});await load()}catch(e:any){toast("error",e.message)}finally{setBusy(false)}}

  async function patch(body:any){setBusy(true);try{const r=await fetch("/api/pallets",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw new Error(j.error);toast("success","Registro atualizado.");await load();if(selected)await openPallet(selected.id);return true}catch(e:any){toast("error",e.message);return false}finally{setBusy(false)}}

  async function saveInspection(){if(!selected)return;const ok=await patch({id:selected.id,action:"INSPECIONAR",area,resultado:Object.values(checklist).every(Boolean)?"CONFORME":"PENDENCIA",checklist,observacao:inspectionObs});if(ok){setInspectionOpen(false);setChecklist({});setInspectionObs("")}}
  async function executeDecision(){if(!selected||!decision)return;const ok=await patch({id:selected.id,action:decision.action,motivo,observacao:obs});if(ok){setDecisionOpen(false);setDecision(null);setMotivo("");setObs("")}}
  function openDecision(action:string,title:string){setDecision({action,title});setDecisionOpen(true);setMotivo("");setObs("")}

  async function addPhoto(file?:File){if(!selected||!file)return;setBusy(true);try{const dataUrl=await compressImage(file);const r=await fetch("/api/pallets/fotos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({palletId:selected.id,dataUrl,area,legenda:`Inspeção ${area}`})}),j=await r.json();if(!r.ok)throw new Error(j.error);toast("success","Foto adicionada.");await load();await openPallet(selected.id)}catch(e:any){toast("error",e.message)}finally{setBusy(false);if(photoRef.current)photoRef.current.value=""}}

  function printLabel(p:Pallet){setSelected(p);setTimeout(()=>{document.body.classList.add("print-pallet-label");window.print();document.body.classList.remove("print-pallet-label")},80)}

  return <>
    <div className="pageTitle"><div><span>QUALIDADE / MSAC</span><h1>Inspeção e Liberação de Pallets</h1><p>Inspeção com fotos, bloqueio, dupla liberação e etiqueta rastreável.</p></div><div className="palletTopActions"><button className="secondary" onClick={load}><RefreshCw/>Atualizar</button><button className="primary" onClick={()=>setCreateOpen(true)}><Plus/>Novo pallet</button></div></div>

    <div className="palletKpis">{cards.map(([a,b,t])=><div key={String(a)} className={`palletKpi ${t}`}><span>{a}</span><b>{b}</b></div>)}</div>

    <Panel title="Controle de pallets" subtitle="Qualidade libera primeiro; MSAC confirma a liberação final.">
      <div className="palletFilters"><label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar pedido, pallet, filtro ou cliente..."/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option><option>AGUARDANDO_INSPECAO</option><option>EM_LIBERACAO</option><option>BLOQUEADO</option><option>LIBERADO</option></select></div>
      <div className="tableWrap palletTable"><table><thead><tr><th>Pallet</th><th>Pedido</th><th>Cliente</th><th>Filtro</th><th>Tipo</th><th className="num">Qtd</th><th className="num">Jogos</th><th>Qualidade</th><th>MSAC</th><th>Status</th><th>Fotos</th><th>Atualizado</th><th>Ações</th></tr></thead><tbody>
        {itens.map(p=><tr key={p.id} className={p.status==="BLOQUEADO"?"critRow":""} onClick={()=>openPallet(p.id)}><td><b>{p.pallet}</b><small className="palletCode">{p.codigo}</small></td><td>{p.pedido}</td><td>{p.cliente||"-"}</td><td>{p.filtro||"-"}</td><td>{p.tipo_produto||"-"}</td><td className="num">{fmt(p.quantidade)}</td><td className="num">{fmt(p.jogos)}</td><td><span className={`palletStage s-${p.qualidade_status.toLowerCase()}`}>{statusLabel(p.qualidade_status)}</span></td><td><span className={`palletStage s-${p.msac_status.toLowerCase()}`}>{statusLabel(p.msac_status)}</span></td><td><span className={`palletGlobal g-${p.status.toLowerCase()}`}>{statusLabel(p.status)}</span></td><td>{p.fotos_count||0}</td><td>{date(p.atualizado_em)}</td><td><div className="rowActions" onClick={e=>e.stopPropagation()}><button title="Abrir" onClick={()=>openPallet(p.id)}><ClipboardCheck/></button><button title="Etiqueta" onClick={()=>printLabel(p)}><Printer/></button></div></td></tr>)}
        {!itens.length&&!busy&&<tr><td colSpan={13}><div className="empty"><b>Nenhum pallet encontrado.</b><span>Cadastre o primeiro pallet ou altere os filtros.</span></div></td></tr>}
      </tbody></table></div>
    </Panel>

    {selected&&<div className="palletDetail"><div className="palletDetailHead"><div><span>{selected.codigo}</span><h2>Pallet {selected.pallet} • Pedido {selected.pedido}</h2><p>{selected.cliente||"Cliente não informado"} {selected.destino?`• ${selected.destino}`:""}</p></div><button onClick={()=>setSelected(null)}><XCircle/></button></div>
      <div className="releaseFlow"><div className={selected.qualidade_status==="LIBERADO"?"done":selected.qualidade_status==="BLOQUEADO"?"blocked":""}><ShieldCheck/><span>QUALIDADE</span><b>{statusLabel(selected.qualidade_status)}</b><small>{selected.qualidade_usuario||"Aguardando"}</small></div><i>→</i><div className={selected.msac_status==="LIBERADO"?"done":selected.msac_status==="BLOQUEADO"?"blocked":""}><Truck/><span>MSAC</span><b>{statusLabel(selected.msac_status)}</b><small>{selected.msac_usuario||"Aguardando"}</small></div><i>→</i><div className={selected.status==="LIBERADO"?"done":selected.status==="BLOQUEADO"?"blocked":""}><PackageCheck/><span>PALLET</span><b>{statusLabel(selected.status)}</b><small>{selected.status==="LIBERADO"?"Pronto para seguir":"Controle ativo"}</small></div></div>
      {selected.status==="BLOQUEADO"&&<div className="palletBlockAlert"><LockKeyhole/><div><b>PALLET BLOQUEADO</b><span>{selected.bloqueio_motivo||"Motivo não informado"}</span></div></div>}
      <div className="palletMeta"><div><small>Quantidade</small><b>{fmt(selected.quantidade)}</b></div><div><small>Jogos</small><b>{fmt(selected.jogos)}</b></div><div><small>Turno</small><b>{selected.turno||"-"}</b></div><div><small>Tipo</small><b>{selected.tipo_produto||"-"}</b></div><div><small>Montador</small><b>{selected.montador||"-"}</b></div><div><small>Conferente</small><b>{selected.conferente||"-"}</b></div></div>
      <div className="palletActionGrid"><button onClick={()=>{setArea("QUALIDADE");setInspectionOpen(true)}}><ClipboardCheck/>Inspecionar Qualidade</button><button onClick={()=>{setArea("MSAC");setInspectionOpen(true)}}><Truck/>Inspecionar MSAC</button><button onClick={()=>photoRef.current?.click()}><ImagePlus/>Adicionar foto</button><button onClick={()=>printLabel(selected)}><Printer/>Gerar etiqueta</button></div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={e=>addPhoto(e.target.files?.[0])}/>
      <div className="palletDecisionGrid"><button className="release" onClick={()=>openDecision("QUALIDADE_LIBERAR","Liberar pela Qualidade")}><CheckCircle2/>Liberar Qualidade</button><button className="block" onClick={()=>openDecision("QUALIDADE_BLOQUEAR","Bloquear pela Qualidade")}><LockKeyhole/>Bloquear Qualidade</button><button className="release" disabled={selected.qualidade_status!=="LIBERADO"} onClick={()=>openDecision("MSAC_LIBERAR","Liberar pelo MSAC")}><CheckCircle2/>Liberar MSAC</button><button className="block" onClick={()=>openDecision("MSAC_BLOQUEAR","Bloquear pelo MSAC")}><LockKeyhole/>Bloquear MSAC</button>{["PCP","GERENTE","ENCARREGADO"].includes(String(me?.perfil))&&<button className="reopen" onClick={()=>openDecision("REABRIR","Reabrir pallet")}><UnlockKeyhole/>Reabrir</button>}</div>
      <div className="photoSection"><div className="sectionTitle"><Camera/><b>Evidências fotográficas</b><span>{selected.fotos?.length||0} foto(s)</span></div>{selected.fotos?.length?<div className="photoGrid">{selected.fotos.map(f=><figure key={f.id}><img src={f.dataUrl} alt={f.legenda||"Foto do pallet"}/><figcaption><b>{f.area}</b><span>{f.usuario} • {date(f.criadoEm)}</span></figcaption></figure>)}</div>:<div className="empty"><b>Nenhuma foto adicionada.</b><span>Use “Adicionar foto” para registrar a condição do pallet.</span></div>}</div>
      <div className="palletHistory"><div><div className="sectionTitle"><ClipboardCheck/><b>Inspeções</b><span>{selected.inspecoes?.length||0}</span></div>{selected.inspecoes?.length?<div className="historyList">{selected.inspecoes.slice(0,8).map(i=><article key={i.id}><b>{i.area} • {i.resultado}</b><span>{i.usuario} • {date(i.criadoEm)}</span>{i.observacao&&<p>{i.observacao}</p>}</article>)}</div>:<div className="empty"><span>Sem inspeções registradas.</span></div>}</div><div><div className="sectionTitle"><RefreshCw/><b>Rastreabilidade</b><span>{selected.eventos?.length||0}</span></div>{selected.eventos?.length?<div className="historyList">{selected.eventos.slice(0,10).map(e=><article key={e.id}><b>{e.descricao}</b><span>{e.usuario} • {date(e.criadoEm)}</span></article>)}</div>:<div className="empty"><span>Sem eventos registrados.</span></div>}</div></div>
    </div>}

    <Modal open={createOpen} title="Cadastrar pallet" onClose={()=>setCreateOpen(false)} footer={<><button className="secondary" onClick={()=>setCreateOpen(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={create}>Cadastrar pallet</button></>}><div className="palletForm">{[["Pedido","pedido"],["Cliente","cliente"],["Filtro","filtro"],["Pallet","pallet"],["Tipo de produto","tipoProduto"],["Quantidade","quantidade"],["Jogos","jogos"],["Turno","turno"],["Destino","destino"],["Montador","montador"],["Conferente","conferente"]].map(([label,key])=><label key={key}>{label}<input value={(form as any)[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<label className="wide">Observação<textarea value={form.observacao} onChange={e=>setForm({...form,observacao:e.target.value})}/></label></div></Modal>

    <Modal open={inspectionOpen} title={`Inspeção • ${area}`} onClose={()=>setInspectionOpen(false)} footer={<><button className="secondary" onClick={()=>setInspectionOpen(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={saveInspection}>Salvar inspeção</button></>}><div className="inspectionChecks">{CHECKS.map(([key,label])=><label key={key} className={checklist[key]?"ok":""}><input type="checkbox" checked={!!checklist[key]} onChange={e=>setChecklist({...checklist,[key]:e.target.checked})}/><span><CheckCircle2/>{label}</span></label>)}</div><label className="modalText">Observação<textarea value={inspectionObs} onChange={e=>setInspectionObs(e.target.value)} placeholder="Descreva avarias, correções, reinspeção ou qualquer condição relevante."/></label></Modal>

    <Modal open={decisionOpen} title={decision?.title||"Decisão"} onClose={()=>setDecisionOpen(false)} footer={<><button className="secondary" onClick={()=>setDecisionOpen(false)}>Cancelar</button><button className={decision?.action.endsWith("BLOQUEAR")?"danger":"primary"} disabled={busy} onClick={executeDecision}>Confirmar</button></>}><div className="decisionForm">{decision?.action.endsWith("BLOQUEAR")&&<label>Motivo do bloqueio<textarea value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ex.: pallet desalinhado, amarração incorreta, avaria, quantidade divergente..."/></label>}<label>Observação<textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="Observação da decisão"/></label></div></Modal>

    {selected&&<section id="pallet-label-print" className="palletLabelPrint"><header><b>FAMOSSUL • CONTROLE DE PALLET</b><span>{selected.codigo}</span></header><main><div className="labelBig"><small>PALLET</small><b>{selected.pallet}</b></div><div className="labelBig"><small>PEDIDO</small><b>{selected.pedido}</b></div><dl><div><dt>Cliente</dt><dd>{selected.cliente||"-"}</dd></div><div><dt>Filtro</dt><dd>{selected.filtro||"-"}</dd></div><div><dt>Tipo</dt><dd>{selected.tipo_produto||"-"}</dd></div><div><dt>Quantidade</dt><dd>{fmt(selected.quantidade)}</dd></div><div><dt>Jogos</dt><dd>{fmt(selected.jogos)}</dd></div><div><dt>Destino</dt><dd>{selected.destino||"-"}</dd></div></dl><div className={`labelStatus ${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</div><div className="labelSign"><span>QUALIDADE: {statusLabel(selected.qualidade_status)} • {selected.qualidade_usuario||"-"}</span><span>MSAC: {statusLabel(selected.msac_status)} • {selected.msac_usuario||"-"}</span></div></main><footer>Gerado em {new Date().toLocaleString("pt-BR")}</footer></section>}
  </>;
}
