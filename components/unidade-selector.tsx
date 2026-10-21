'use client';
import { useEffect,useState } from 'react';
import type { Unidade } from '@/lib/unidades/core';
type Estado={ativo:boolean;selecionada:Unidade|null;permitidas:Unidade[];consolidado:boolean};
export default function UnidadeSelector({bloquear=false,children}:{bloquear?:boolean;children?:React.ReactNode}){
 const [estado,setEstado]=useState<Estado|null>(null),[erro,setErro]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let ativo=true;fetch('/api/unidades',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Não foi possível carregar as unidades.');return r.json();}).then(s=>{if(ativo)setEstado(s);}).catch(e=>{if(ativo)setErro(e.message);});return()=>{ativo=false;};},[]);
 async function escolher(unidade:string){
 if(unidade==='CONSOLIDADO'){window.location.assign('/consolidado');return;}
 setBusy(true);setErro('');try{
 const r=await fetch('/api/unidades',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({unidade})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Falha ao selecionar a unidade.');
 // Nova navegação elimina estado, IDs, filtros e requisições da unidade anterior.
 window.location.assign(window.location.pathname==='/consolidado'?'/dashboard':window.location.pathname+window.location.search);
 }catch(e){setErro(e instanceof Error?e.message:'Falha na seleção.');setBusy(false);}
 }
 const seletor=<label style={{display:'flex',gap:8,alignItems:'center',fontSize:13}}>Unidade<select aria-label="Unidade de todo o ERP" disabled={busy} value={typeof window!=='undefined'&&window.location.pathname==='/consolidado'?'CONSOLIDADO':estado?.selecionada||''} onChange={e=>escolher(e.target.value)} style={{padding:'8px 12px',border:'1px solid #cad7e2',borderRadius:8}}><option value="" disabled>Selecionar unidade</option>{estado?.permitidas.map(u=><option key={u} value={u}>{u==='SUL'?'Sul':'Nordeste'}</option>)}{estado?.consolidado&&<option value="CONSOLIDADO">Consolidado</option>}</select>{erro&&<span role="alert">{erro}</span>}</label>;
 if(!estado){return bloquear?<>{erro?<p role="alert">{erro}</p>:<p>Verificando acesso às unidades…</p>}</>:null;}
 if(!estado.ativo)return bloquear?<>{children}</>:null;
 if(bloquear){if(!estado.selecionada&&!(typeof window!=='undefined'&&window.location.pathname==='/consolidado'))return <section style={{padding:32,maxWidth:650,margin:'40px auto'}}><h1>Escolha sua unidade</h1><p>Produtos, pedidos, estoque e operação serão carregados somente da unidade selecionada.</p>{seletor}{!estado.permitidas.length&&<p role="alert">Seu login ainda não possui unidade autorizada. Solicite o vínculo ao administrador.</p>}</section>;return <>{children}</>;}
 return seletor;
}
