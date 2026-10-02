"use client";
import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState } from "react";
import type { Andon,Programacao,Sessao } from "@/types/pcp";
type Toast={id:number;type:"success"|"error"|"info";text:string};
type Ctx={me:Sessao|null;pg:Programacao|null;andon:Andon[];lastSync:Date|null;loading:boolean;refresh:()=>Promise<void>;toast:(type:Toast["type"],text:string)=>void};
const C=createContext<Ctx|null>(null);
export function OperationalProvider({children}:{children:React.ReactNode}){const[me,setMe]=useState<Sessao|null>(null),[pg,setPg]=useState<Programacao|null>(null),[andon,setAndon]=useState<Andon[]>([]),[lastSync,setLastSync]=useState<Date|null>(null),[loading,setLoading]=useState(true),[toasts,setToasts]=useState<Toast[]>([]);const mounted=useRef(true);
 const loadSession=useCallback(async()=>{const r=await fetch("/api/me",{cache:"no-store"});if(r.ok&&mounted.current)setMe(await r.json())},[]);
 const refresh=useCallback(async()=>{const[a,c]=await Promise.all([fetch("/api/programacoes/ativa",{cache:"no-store"}),fetch("/api/andon",{cache:"no-store"})]);if(a.ok&&mounted.current)setPg((await a.json()).programacao);if(c.ok&&mounted.current)setAndon((await c.json()).itens||[]);if(mounted.current)setLastSync(new Date())},[]);
 useEffect(()=>{mounted.current=true;(async()=>{await loadSession();await refresh();if(mounted.current)setLoading(false)})();const id=setInterval(refresh,2500);return()=>{mounted.current=false;clearInterval(id)}},[loadSession,refresh]);
 const toast=useCallback((type:Toast["type"],text:string)=>{const id=Date.now()+Math.random();setToasts(t=>[...t,{id,type,text}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500)},[]);
 const value=useMemo(()=>({me,pg,andon,lastSync,loading,refresh,toast}),[me,pg,andon,lastSync,loading,refresh,toast]);return <C.Provider value={value}>{children}<div className="toastStack">{toasts.map(t=><div className={`toast ${t.type}`} key={t.id}>{t.text}</div>)}</div></C.Provider>}
export function useOps(){const v=useContext(C);if(!v)throw new Error("useOps fora do provider");return v}
