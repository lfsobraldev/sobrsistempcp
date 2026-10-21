'use client';
import {useEffect,useId,useState} from 'react';
export type ProdutoEscolha={id:string;codigo:string;descricao:string;unidade_base:string;classificacao:string};
export default function StockProductPicker({label,onSelect}:{label:string;onSelect:(p:ProdutoEscolha|null)=>void}){
 const [q,setQ]=useState(''),[lista,setLista]=useState<ProdutoEscolha[]>([]),[erro,setErro]=useState('');const id=useId();
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>{fetch('/api/engenharia?q='+encodeURIComponent(q),{signal:c.signal,cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}).then(b=>{setLista(b.produtos);setErro('');}).catch(e=>{if(e.name!=='AbortError')setErro(e.message);});},250);return()=>{clearTimeout(timer);c.abort();};},[q]);
 return <label style={{display:'grid',gap:6}}>{label}<input list={id} value={q} placeholder="Buscar código do estoque" onChange={e=>{const value=e.target.value;setQ(value);onSelect(lista.find(p=>p.codigo===value)||null);}}/><button type="button" disabled={!lista.some(p=>p.codigo===q)} onClick={()=>onSelect(lista.find(p=>p.codigo===q)||null)}>Selecionar produto</button><datalist id={id}>{lista.map(p=><option key={p.id} value={p.codigo}>{p.descricao} · {p.unidade_base}</option>)}</datalist>{erro&&<small role="alert">{erro}</small>}<small>Digite o código e selecione um produto cadastrado.</small></label>;
}
