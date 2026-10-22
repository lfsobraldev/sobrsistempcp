'use client';
import {useEffect,useState} from 'react';
import type {Unidade} from '@/lib/unidades/core';
export default function ModuleUnitEntry({unidade,selecionada,children}:{unidade:Unidade;selecionada:Unidade|null;children:React.ReactNode}){
 const [erro,setErro]=useState('');
 useEffect(()=>{if(unidade===selecionada)return;let alive=true;fetch('/api/unidades',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({unidade})}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'Unidade indisponível.');if(alive)window.location.replace(window.location.pathname);}).catch(e=>{if(alive)setErro(e.message);});return()=>{alive=false;};},[unidade,selecionada]);
 if(unidade!==selecionada)return <p role={erro?'alert':'status'}>{erro||'Selecionando a unidade autorizada…'}</p>;
 return <>{children}</>;
}
