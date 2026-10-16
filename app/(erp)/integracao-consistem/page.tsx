"use client";
import {useState} from "react";
import {useOps} from "@/components/operational-provider";
export default function IntegracaoConsistem(){
 const {refresh}=useOps();
 const [file,setFile]=useState<File|null>(null);const [result,setResult]=useState<any>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function send(aplicar:boolean){
 if(!file)return;setBusy(true);setError("");
 try{const fd=new FormData();fd.append("arquivo",file);fd.append("aplicar",String(aplicar));
 const r=await fetch("/api/integracao-consistem",{method:"POST",body:fd});const j=await r.json();
 if(!r.ok)throw new Error(j.error||"Erro ao importar");setResult(j);if(aplicar)await refresh();
 }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 return <main style={{padding:24,maxWidth:1080,margin:"auto"}}>
 <h1>Integração Consistem</h1>
 <p>Importe o CSV de Programação de Produção → Detalhada (filtro 54). A prévia confere as OFs com a programação ativa antes de alterar o andamento.</p>
 <section style={{background:"white",padding:24,border:"1px solid #d9e1e8",borderRadius:12,display:"grid",gap:14}}>
 <label>CSV exportado do Consistem <input type="file" accept=".csv,text/csv" onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null)}}/></label>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
 <button disabled={!file||busy} onClick={()=>send(false)} style={{padding:"10px 18px"}}>1. Conferir CSV</button>
 <button disabled={!file||busy||!result?.previsao||result.correspondencias===0} onClick={()=>send(true)} style={{padding:"10px 18px"}}>2. Confirmar atualização</button>
 </div>
 <small>A integração não altera quantidades planejadas, romaneios, prioridades ou locais de montagem. N/A é ignorado. Operações ambíguas não são alteradas automaticamente.</small>
 {busy&&<p>Conferindo informações...</p>}{error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}
 {result&&<div><h2>{result.ok?"Atualização concluída":"Prévia da sincronização"}</h2>
 <p>Linhas: <b>{result.linhas}</b> | OFs correspondentes: <b>{result.correspondencias}</b> | Alterações: <b>{result.alteracoes}</b></p>
 {result.divergencias?.length>0&&<details><summary>{result.divergencias.length} divergência(s) — revisar</summary><ul>{result.divergencias.map((x:string,i:number)=><li key={i}>{x}</li>)}</ul></details>}
 {result.amostra?.length>0&&<details><summary>Prévia das alterações</summary><ul>{result.amostra.map((x:any,i:number)=><li key={i}>OF {x.of} — {x.processo||"Produto"}: {x.from}% → {x.to}%</li>)}</ul></details>}
 </div>}
 </section>
 <p style={{marginTop:16}}>Automação periódica da exportação pelo navegador: pendente de configuração no computador autorizado. Esta primeira versão permite validar a sincronização com segurança.</p>
 </main>
}
