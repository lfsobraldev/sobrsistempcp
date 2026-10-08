"use client";

import { FileSpreadsheet, PackageCheck, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { MountType, ProcessingResult } from "@/lib/romaneio/types";
import { MOUNT_LABELS } from "@/lib/romaneio/settings";
import { validateProcessing } from "@/lib/romaneio/validation";

const mounts:MountType[]=["MONTADO_HS","MONTADO_TIMADEL","REVENDA","MONTADO_ESTANCIA"];

export default function RomaneiosPage(){
  const [pedido,setPedido]=useState<File|null>(null);
  const [usinagem,setUsinagem]=useState<File|null>(null);
  const [mountType,setMountType]=useState<MountType>("MONTADO_HS");
  const [mixedOrder,setMixedOrder]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [data,setData]=useState<ProcessingResult|null>(null);
  const [form,setForm]=useState({
    filtro:"",motorista:"",transportadora:"",placa:"",notaFiscal:"",
    pagina:"",conferente:"",separador:"",romaneioExtraText:"",
    etiquetaExtraText:"",complementoObra:false
  });

  const issues=useMemo(()=>data?validateProcessing(data):[],[data]);
  const erros=issues.filter(x=>x.severity==="ERROR");

  async function processar(){
    if(!pedido)return;
    setBusy(true);setError("");
    try{
      const fd=new FormData();
      fd.append("pedido",pedido);
      if(usinagem)fd.append("usinagem",usinagem);
      fd.append("mountType",mountType);
      fd.append("mixedOrder",String(mixedOrder));
      fd.append("orderOptions",JSON.stringify(form));
      const r=await fetch("/api/romaneios/process",{method:"POST",body:fd});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Falha ao processar pedido.");
      setData(j);
    }catch(e:any){setError(e.message)}
    finally{setBusy(false)}
  }

  async function gerar(action:"ROMANEIO"|"ETIQUETAS"){
    if(!data)return;
    setBusy(true);setError("");
    try{
      const r=await fetch("/api/romaneios/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,data})});
      if(!r.ok)throw new Error(await r.text());
      const blob=await r.blob();
      const cd=r.headers.get("content-disposition")||"";
      const name=cd.match(/filename="([^"]+)"/)?.[1]||`${action}.xlsx`;
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=name;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e:any){setError(e.message)}
    finally{setBusy(false)}
  }

  async function gerarTudo(){
    await gerar("ROMANEIO");
    await gerar("ETIQUETAS");
  }

  const totalLinhas=data?.packages.reduce((s,p)=>s+p.rows.length,0)||0;

  return <>
    <div className="pageTitle">
      <div>
        <span>EXPEDIÇÃO</span>
        <h1>Romaneios</h1>
        <p>Pedido, revisão e geração de romaneio e etiquetas em uma única tela.</p>
      </div>
    </div>

    <section className="pcpBoard">
      <header><div><span>NOVO ROMANEIO</span><h2>Arquivos e dados do carregamento</h2></div></header>

      <div className="palletForm">
        <label>Pedido desmembrado
          <input type="file" accept=".pdf" onChange={e=>{setPedido(e.target.files?.[0]||null);setData(null)}}/>
          <small>{pedido?.name||"PDF obrigatório"}</small>
        </label>
        <label>Usinagem
          <input type="file" accept=".xls,.xlsx" onChange={e=>{setUsinagem(e.target.files?.[0]||null);setData(null)}}/>
          <small>{usinagem?.name||"Opcional"}</small>
        </label>
        <label>Tipo de montagem
          <select value={mountType} onChange={e=>{setMountType(e.target.value as MountType);setData(null)}}>
            {mounts.map(m=><option key={m} value={m}>{MOUNT_LABELS[m]}</option>)}
          </select>
        </label>
        <label>Filtro<input value={form.filtro} onChange={e=>setForm({...form,filtro:e.target.value})}/></label>
        <label>Motorista<input value={form.motorista} onChange={e=>setForm({...form,motorista:e.target.value})}/></label>
        <label>Transportadora<input value={form.transportadora} onChange={e=>setForm({...form,transportadora:e.target.value})}/></label>
        <label>Placa<input value={form.placa} onChange={e=>setForm({...form,placa:e.target.value})}/></label>
        <label>Nota fiscal<input value={form.notaFiscal} onChange={e=>setForm({...form,notaFiscal:e.target.value})}/></label>
        <label>Conferente<input value={form.conferente} onChange={e=>setForm({...form,conferente:e.target.value})}/></label>
        <label>Separado por<input value={form.separador} onChange={e=>setForm({...form,separador:e.target.value})}/></label>
        <label><span>Pedido misto</span><input type="checkbox" checked={mixedOrder} onChange={e=>{setMixedOrder(e.target.checked);setData(null)}}/></label>
        <label><span>Complemento de obra</span><input type="checkbox" checked={form.complementoObra} onChange={e=>setForm({...form,complementoObra:e.target.checked})}/></label>
      </div>

      <div className="drawerActions big" style={{marginTop:16}}>
        <button className="primary" disabled={busy||!pedido} onClick={processar}><Upload/>{busy?"Processando...":"Processar pedido"}</button>
      </div>
      {error&&<div className="palletBlockAlert"><div><b>ERRO</b><span>{error}</span></div></div>}
    </section>

    {data&&<>
      <section className="pcpMetricStrip" style={{marginTop:14}}>
        <article><span>PEDIDO</span><b>{data.orderNumber}</b><small>{data.client}</small></article>
        <article><span>PALLETS</span><b>{data.packages.length}</b><small>gerados</small></article>
        <article><span>LINHAS</span><b>{totalLinhas}</b><small>no romaneio</small></article>
        <article className={erros.length?"attention":""}><span>CONFERÊNCIA</span><b>{erros.length}</b><small>erro(s)</small></article>
      </section>

      {issues.length>0&&<section className="pcpBoard" style={{marginTop:14}}>
        <header><div><span>CONFERÊNCIA</span><h2>Antes de gerar</h2></div></header>
        <div className="historyList">{issues.slice(0,20).map((x,i)=><article key={i}><b>{x.severity==="ERROR"?"Erro":"Aviso"}</b><span>{x.message}</span></article>)}</div>
      </section>}

      <section className="pcpBoard" style={{marginTop:14}}>
        <header>
          <div><span>REVISÃO</span><h2>{data.client} • {data.destination||"-"}</h2></div>
          <div className="palletTopActions">
            <button className="secondary" disabled={busy||!!erros.length} onClick={()=>gerar("ROMANEIO")}><FileSpreadsheet/>Romaneio</button>
            <button className="secondary" disabled={busy||!!erros.length} onClick={()=>gerar("ETIQUETAS")}><PackageCheck/>Etiquetas</button>
            <button className="primary" disabled={busy||!!erros.length} onClick={gerarTudo}>Gerar tudo</button>
          </div>
        </header>

        <div className="tableWrap">
          <table>
            <thead><tr><th>Pallet</th><th>Produto</th><th>Jogos</th><th>Qtd</th><th>Comp.</th><th>Larg.</th><th>Esp.</th><th>Observação</th></tr></thead>
            <tbody>
              {data.packages.flatMap(pkg=>pkg.rows.map((row,i)=><tr key={`${pkg.number}-${i}`}>
                <td><b>{pkg.number}</b></td><td>{row.product}</td><td>{row.games||"-"}</td><td>{row.quantity}</td>
                <td>{row.lengthMm||"-"}</td><td>{row.widthMm||"-"}</td><td>{row.thicknessMm||"-"}</td><td>{row.observation||row.itemText||"-"}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </section>
    </>}
  </>;
}
