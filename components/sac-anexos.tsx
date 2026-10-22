'use client';
import {useCallback,useEffect,useState} from 'react';
type Anexo={id:string;nome:string;mime:string;tamanho:number;criado_por:string;criado_em:string};
const kb=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
/** Fotos e PDF do atendimento (até 10 por atendimento, 3 MB cada). Abertos em nova aba, nunca incorporados à página. */
export default function SacAnexos({atendimentoId,podeEditar,podeApagar}:{atendimentoId:string;podeEditar:boolean;podeApagar:boolean}){
 const [lista,setLista]=useState<Anexo[]>([]),[erro,setErro]=useState(''),[busy,setBusy]=useState(false);
 const carregar=useCallback(async()=>{try{const r=await fetch('/api/sac/anexos?id='+atendimentoId,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error);setLista(j.anexos);setErro('');}catch(e){setErro(e instanceof Error?e.message:'Falha ao carregar anexos.');}},[atendimentoId]);
 useEffect(()=>{void carregar();},[carregar]);
 async function enviar(f:File|undefined){
  if(!f)return;if(f.size>3*1024*1024){setErro('Arquivo acima de 3 MB.');return;}
  setBusy(true);setErro('');try{const fd=new FormData();fd.set('atendimentoId',atendimentoId);fd.set('arquivo',f);const r=await fetch('/api/sac/anexos',{method:'POST',body:fd});const j=await r.json();if(!r.ok)throw new Error(j.error);await carregar();}catch(e){setErro(e instanceof Error?e.message:'Falha ao anexar.');}finally{setBusy(false);}
 }
 async function apagar(id:string){setBusy(true);try{const r=await fetch('/api/sac/anexos?id='+id,{method:'DELETE'});const j=await r.json();if(!r.ok)throw new Error(j.error);await carregar();}catch(e){setErro(e instanceof Error?e.message:'Falha.');}finally{setBusy(false);}}
 return <section className="sacTimeline"><h3>Fotos e documentos</h3>
  {erro&&<p className="sacAudit" role="alert">{erro}</p>}
  {podeEditar&&<label>Anexar foto (JPG, PNG, WebP) ou PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy||lista.length>=10} onChange={e=>{void enviar(e.target.files?.[0]);e.target.value='';}}/></label>}
  {lista.length?lista.map(a=><article key={a.id}><small>{new Date(a.criado_em).toLocaleString('pt-BR')} · {a.criado_por} · {kb(a.tamanho)}</small><p><a href={'/api/sac/anexos?arquivo='+a.id} target="_blank" rel="noopener noreferrer">{a.nome}</a>{podeApagar&&<> <button type="button" disabled={busy} onClick={()=>void apagar(a.id)}>Remover</button></>}</p></article>):<p className="sacAudit">Nenhum anexo.</p>}
 </section>;
}
