'use client';
export type FilaApontamento={requestId:string;usuario:string;unidade:string;operacaoId:string;body:object;criadoEm:number;erro?:string};
const nome='erp-chao-v1';
async function abrir(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(nome,1);r.onupgradeneeded=()=>{r.result.createObjectStore('fila',{keyPath:'requestId'});r.result.createObjectStore('contexto',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transacao<T>(store:string,modo:IDBTransactionMode,acao:(s:IDBObjectStore)=>IDBRequest<T>){const db=await abrir();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(store,modo),r=acao(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export function guardarApontamento(a:FilaApontamento){return transacao('fila','readwrite',s=>s.put(a));}
export function removerApontamento(id:string){return transacao('fila','readwrite',s=>s.delete(id));}
export async function listarFila(usuario:string,unidade:string){const rows=await transacao<FilaApontamento[]>('fila','readonly',s=>s.getAll());return rows.filter(r=>r.usuario===usuario&&r.unidade===unidade).sort((a,b)=>a.criadoEm-b.criadoEm);}
export function guardarContexto(usuario:string,unidade:string){return transacao('contexto','readwrite',s=>s.put({id:'atual',usuario,unidade}));}
/** Consulta é somente local. Nenhum token/cookie é persistido nesta fila. */
export function mesmaFila(item:Pick<FilaApontamento,'usuario'|'unidade'>,usuario:string,unidade:string){return item.usuario===usuario&&item.unidade===unidade;}
