"use client";
import {useState} from "react";
import {useOps} from "@/components/operational-provider";
import {FileSpreadsheet, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle, UploadCloud} from "lucide-react";

type Resultado={previsao?:boolean;ok?:boolean;linhas:number;correspondencias:number;alteracoes:number;ignoradas?:number;divergencias?:string[];amostra?:{of:string;processo?:string;from:number;to:number}[]};
export default function IntegracaoConsistem(){
 const {refresh}=useOps();
 const [file,setFile]=useState<File|null>(null);
 const [result,setResult]=useState<Resultado|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function send(aplicar:boolean){
  if(!file)return;
  setBusy(true);setError("");
  try{
   const fd=new FormData();fd.append("arquivo",file);fd.append("aplicar",String(aplicar));
   const response=await fetch("/api/integracao-consistem",{method:"POST",body:fd});
   const json=await response.json();
   if(!response.ok)throw new Error(json.error||"Falha ao conferir arquivo");
   setResult(json);if(aplicar)await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Falha inesperada")}finally{setBusy(false)}
 }
 return <main className="industrial-workspace">
  <header className="industrial-hero"><div className="industrial-eyebrow">SOBRAL PCP / INTEGRAÇÕES</div><h1>Integração Consistem</h1><p>Conferência e sincronização dos apontamentos oficiais, sem substituir a programação ou os romaneios.</p><div className="industrial-tags"><span>Fonte: CSV detalhado</span><span>Controle por pedido + OF</span><span>Atualização supervisionada</span></div></header>
  <div className="industrial-steps"><div><UploadCloud size={20}/><b>01. Selecionar</b><span>Arquivo completo exportado da tela Detalhada do Consistem.</span></div><div><FileSpreadsheet size={20}/><b>02. Conferir</b><span>Verificar correspondências, operações e divergências.</span></div><div><ShieldCheck size={20}/><b>03. Aplicar</b><span>Confirmar somente alterações compatíveis com a programação ativa.</span></div></div>
  <section className="industrial-panel"><div className="industrial-panel-title"><h2>Importação de apontamentos</h2><span>CSV • máximo 8 MB</span></div>
   <label className="industrial-upload"><UploadCloud size={24}/><strong>{file?file.name:"Selecione o arquivo CSV do Consistem"}</strong><small>{file?"Arquivo selecionado — execute a conferência":"Clique para escolher um arquivo no computador"}</small><input type="file" accept=".csv,text/csv" onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null);setError("")}}/></label>
   <div className="industrial-actions"><button className="industrial-btn primary" disabled={!file||busy} onClick={()=>send(false)}>{busy?<RefreshCw className="spin" size={17}/>:<FileSpreadsheet size={17}/>} Conferir arquivo</button><button className="industrial-btn" disabled={!file||busy||!result?.previsao||!result.correspondencias||result.correspondencias/result.linhas<0.75} onClick={()=>send(true)}><CheckCircle2 size={17}/> Confirmar atualização</button></div>
   {error&&<p className="industrial-error" role="alert"><AlertTriangle size={17}/>{error}</p>}
   {result&&<div className="industrial-results"><h3>{result.ok?"Sincronização concluída":"Prévia das alterações"}</h3><div className="industrial-stats"><div><small>Linhas importadas</small><strong>{result.linhas}</strong></div><div><small>OFs correspondentes</small><strong>{result.correspondencias}</strong></div><div><small>Alterações</small><strong>{result.alteracoes}</strong></div><div><small>Divergências exibidas</small><strong>{result.divergencias?.length||0}</strong></div></div>{result.divergencias?.length? <details><summary>Ver divergências e registros não associados</summary><div className="industrial-scroll-list">{result.divergencias.map((x,i)=><p key={i}>{x}</p>)}</div></details>:null}{result.amostra?.length?<details><summary>Prévia dos campos que serão alterados</summary><div className="industrial-scroll-list">{result.amostra.map((x,i)=><p key={i}>OF {x.of} · {x.processo||"Produto"} · {x.from}% → {x.to}%</p>)}</div></details>:null}</div>}
   <p className="industrial-helper"><ShieldCheck size={17}/> A importação não altera quantidades, prioridades, romaneios ou locais de montagem. N/A não representa 0% e não é aplicado como conclusão.</p>
  </section><aside className="industrial-note"><b>Automação pelo navegador</b><p>A exportação periódica no computador autorizado ainda depende da calibração dos controles do Consistem. Esta tela já recebe o CSV e permite validar a atualização.</p></aside>
 </main>
}