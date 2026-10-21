'use client';
import {useCallback,useEffect,useMemo,useSyncExternalStore} from 'react';
import {lerFiltrosPCP,parametrosPCP,type FiltrosPCP} from '@/lib/pcp-filters';
const evento='pcp:filtros';
function subscribe(fn:()=>void){window.addEventListener('popstate',fn);window.addEventListener(evento,fn);return()=>{window.removeEventListener('popstate',fn);window.removeEventListener(evento,fn);};}
export function usePCPFilters(programacaoId:string){
 useEffect(()=>{if(!programacaoId)return;const q=new URLSearchParams(window.location.search);if((q.get('mes')||'SELECAO')!=='SELECAO'||q.get('programacaoId')===programacaoId)return;q.set('programacaoId',programacaoId);window.history.replaceState(null,'',window.location.pathname+'?'+q.toString());window.dispatchEvent(new Event(evento));},[programacaoId]);
 const search=useSyncExternalStore(subscribe,()=>window.location.search,()=> '');
 const filtros=useMemo(()=>{const q=new URLSearchParams(search);if(!q.has('programacaoId')&&programacaoId)q.set('programacaoId',programacaoId);try{return lerFiltrosPCP(q);}catch{return lerFiltrosPCP(new URLSearchParams());}},[search,programacaoId]);
 const setFiltros=useCallback((patch:Partial<FiltrosPCP>)=>{
  const next={...filtros,...patch};const q=new URLSearchParams(window.location.search);for(const k of ['mes','filtro','pedido','programacaoId','page'])q.delete(k);
  new URLSearchParams(parametrosPCP(next)).forEach((value,key)=>q.append(key,value));
  window.history.replaceState(null,'',window.location.pathname+'?'+q.toString());window.dispatchEvent(new Event(evento));
 },[filtros]);
 return {filtros,setFiltros,query:parametrosPCP(filtros),limpar:()=>setFiltros({mes:'ATIVO',filtros:[],pedidos:[],programacaoId:null})};
}
