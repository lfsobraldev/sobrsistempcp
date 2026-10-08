"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Plus, RefreshCw, Search, XCircle } from "lucide-react";
import { Modal } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Foto={id:string;dataUrl:string;legenda:string;area:string;usuario:string;criadoEm:string};
type Inspecao={id:string;area:string;resultado:string;checklist:Record<string,boolean>;observacao:string;usuario:string;criadoEm:string};
type Pallet={
  id:string;codigo:string;pedido:string;cliente:string;filtro:string;pallet:string;tipo_produto:string;
  quantidade:number;turno:string;status:string;fotos_count:number;atualizado_em:string;
  fotos?:Foto[];inspecoes?:Inspecao[];
};

const CHECKS=[
  ["alinhamento","Alinhamento"],
  ["amarracao","Amarração"],
  ["calcos","Calços e proteção"],
  ["avarias","Sem avarias"],
  ["quantidade","Quantidade"],
  ["identificacao","Identificação"],
] as const;

const statusLabel=(v:string)=>String(v||"").replaceAll("_"," ");
const date=(v?:string|null)=>v?new Date(v).toLocaleString("pt-BR"):"-";

async function compressImage(file:File){
  const data=await new Promise<string>((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result));
    r.onerror=()=>reject(new Error("Falha ao ler foto."));
    r.readAsDataURL(file);
  });
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("Imagem inválida."));i.src=data;
  });
  const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  canvas.getContext("2d")?.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.76);
}

export default function InspecaoPallets(){
  const {toast,me}=useOps();
  const [itens,setItens]=useState<Pallet[]>([]);
  const [selected,setSelected]=useState<Pallet|null>(null);
  const [q,setQ]=useState("");
  const [busy,setBusy]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [inspectionOpen,setInspectionOpen]=useState(false);
  const [checklist,setChecklist]=useState<Record<string,boolean>>({});
  const [inspectionObs,setInspectionObs]=useState("");
  const [form,setForm]=useState({pedido:"",cliente:"",filtro:"",pallet:"",tipoProduto:"",quantidade:"",jogos:"",turno:"A",destino:"",montador:"",conferente:"",observacao:""});
  const photoRef=useRef<HTMLInputElement|null>(null);

  async function load(){
    setBusy(true);
    try{
      const params=new URLSearchParams();
      if(q.trim())params.set("q",q.trim());
      const r=await fetch(`/api/pallets?${params}`,{cache:"no-store"});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error);
      setItens(j.itens||[]);
    }catch(e:any){toast("error",e.message)}
    finally{setBusy(false)}
  }

  async function openPallet(id:string){
    try{
      const r=await fetch(`/api/pallets?id=${encodeURIComponent(id)}`,{cache:"no-store"});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error);
      setSelected(j.item);
    }catch(e:any){toast("error",e.message)}
  }

  useEffect(()=>{const t=setTimeout(load,160);return()=>clearTimeout(t)},[q]);

  async function create(){
    setBusy(true);
    try{
      const r=await fetch("/api/pallets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error);
      toast("success","Pallet cadastrado.");
      setCreateOpen(false);
      setForm({pedido:"",cliente:"",filtro:"",pallet:"",tipoProduto:"",quantidade:"",jogos:"",turno:"A",destino:"",montador:"",conferente:"",observacao:""});
      await load();
    }catch(e:any){toast("error",e.message)}
    finally{setBusy(false)}
  }

  async function saveInspection(){
    if(!selected)return;
    setBusy(true);
    try{
      const resultado=CHECKS.every(([key])=>!!checklist[key])?"CONFORME":"PENDENCIA";
      const r=await fetch("/api/pallets",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
        id:selected.id,action:"INSPECIONAR",area:"QUALIDADE",resultado,checklist,observacao:inspectionObs
      })});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error);
      toast("success","Inspeção salva.");
      setInspectionOpen(false);setChecklist({});setInspectionObs("");
      await load();await openPallet(selected.id);
    }catch(e:any){toast("error",e.message)}
    finally{setBusy(false)}
  }

  async function addPhoto(file?:File){
    if(!selected||!file)return;
    setBusy(true);
    try{
      const dataUrl=await compressImage(file);
      const r=await fetch("/api/pallets/fotos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        palletId:selected.id,dataUrl,area:"QUALIDADE",legenda:"Foto da inspeção"
      })});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error);
      toast("success","Foto adicionada.");
      await load();await openPallet(selected.id);
    }catch(e:any){toast("error",e.message)}
    finally{setBusy(false);if(photoRef.current)photoRef.current.value=""}
  }

  return <>
    <div className="pageTitle">
      <div><span>QUALIDADE</span><h1>Inspeção de Pallets</h1><p>Inspecionar, registrar fotos e concluir.</p></div>
      <div className="palletTopActions">
        <button className="secondary" onClick={load} disabled={busy}><RefreshCw/>Atualizar</button>
        {me?.perfil!=="QUALIDADE"&&<button className="primary" onClick={()=>setCreateOpen(true)}><Plus/>Novo pallet</button>}
      </div>
    </div>

    <section className="operatorBar">
      <div><b>{itens.length} pallet(s)</b><span>controle de inspeção</span></div>
      <label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar pedido, pallet, filtro ou cliente"/></label>
    </section>

    <div className="tableWrap palletTable">
      <table>
        <thead><tr><th>Pallet</th><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Fotos</th><th>Atualizado</th></tr></thead>
        <tbody>
          {itens.map(p=><tr key={p.id} className="clickRow" onClick={()=>openPallet(p.id)}>
            <td><b>{p.pallet}</b></td><td>{p.pedido}</td><td>{p.cliente||"-"}</td><td>{p.tipo_produto||"-"}</td>
            <td><span className={`palletGlobal g-${String(p.status).toLowerCase()}`}>{statusLabel(p.status)}</span></td>
            <td>{p.fotos_count||0}</td><td>{date(p.atualizado_em)}</td>
          </tr>)}
          {!itens.length&&!busy&&<tr><td colSpan={7}><div className="empty"><b>Nenhum pallet encontrado.</b></div></td></tr>}
        </tbody>
      </table>
    </div>

    {selected&&<div className="palletDetail">
      <div className="palletDetailHead">
        <div><span>{selected.codigo}</span><h2>Pallet {selected.pallet} • Pedido {selected.pedido}</h2><p>{selected.cliente||"-"} • {statusLabel(selected.status)}</p></div>
        <button onClick={()=>setSelected(null)}><XCircle/></button>
      </div>

      <div className="palletActionGrid">
        <button onClick={()=>setInspectionOpen(true)}><CheckCircle2/>Nova inspeção</button>
        <button onClick={()=>photoRef.current?.click()}><ImagePlus/>Adicionar foto</button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={e=>addPhoto(e.target.files?.[0])}/>

      <div className="photoSection">
        <div className="sectionTitle"><Camera/><b>Fotos</b><span>{selected.fotos?.length||0}</span></div>
        {selected.fotos?.length?<div className="photoGrid">{selected.fotos.map(f=><figure key={f.id}>
          <img src={f.dataUrl} alt="Foto do pallet"/>
          <figcaption><span>{f.usuario} • {date(f.criadoEm)}</span></figcaption>
        </figure>)}</div>:<div className="empty"><span>Nenhuma foto registrada.</span></div>}
      </div>

      <div className="palletHistory">
        <div>
          <div className="sectionTitle"><CheckCircle2/><b>Inspeções</b><span>{selected.inspecoes?.length||0}</span></div>
          {selected.inspecoes?.length?<div className="historyList">{selected.inspecoes.map(i=><article key={i.id}>
            <b>{i.resultado}</b><span>{i.usuario} • {date(i.criadoEm)}</span>{i.observacao&&<p>{i.observacao}</p>}
          </article>)}</div>:<div className="empty"><span>Nenhuma inspeção registrada.</span></div>}
        </div>
      </div>
    </div>}

    <Modal open={inspectionOpen} title="Inspeção do pallet" onClose={()=>setInspectionOpen(false)}
      footer={<><button className="secondary" onClick={()=>setInspectionOpen(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={saveInspection}>Salvar inspeção</button></>}>
      <div className="inspectionChecks">
        {CHECKS.map(([key,label])=><label key={key} className={checklist[key]?"ok":""}>
          <input type="checkbox" checked={!!checklist[key]} onChange={e=>setChecklist({...checklist,[key]:e.target.checked})}/>
          <span><CheckCircle2/>{label}</span>
        </label>)}
      </div>
      <label className="modalText">Observação<textarea value={inspectionObs} onChange={e=>setInspectionObs(e.target.value)} placeholder="Observação da inspeção"/></label>
    </Modal>

    <Modal open={createOpen} title="Novo pallet" onClose={()=>setCreateOpen(false)}
      footer={<><button className="secondary" onClick={()=>setCreateOpen(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={create}>Cadastrar</button></>}>
      <div className="palletForm">
        {[["Pedido","pedido"],["Cliente","cliente"],["Filtro","filtro"],["Pallet","pallet"],["Tipo","tipoProduto"],["Quantidade","quantidade"],["Turno","turno"]].map(([label,key])=><label key={key}>{label}<input value={(form as any)[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
      </div>
    </Modal>
  </>;
}
