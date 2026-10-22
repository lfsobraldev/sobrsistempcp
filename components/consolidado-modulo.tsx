'use client';
import {useEffect,useState} from 'react';
import PCPFilterBar,{type OpcoesPCP} from './pcp-filter-bar';
import {usePCPFilters} from '@/hooks/use-pcp-filters';
type Dados={opcoes:OpcoesPCP;colunas:string[];rows:Record<string,unknown>[];total:number;comparativo:{unidade:string;total:number}[]};
export default function ConsolidadoModulo({modulo}:{modulo:'pcp'|'apontamento'|'estoque'|'programacao'}){
 const f=usePCPFilters('');const {query}=f;const [page,setPage]=useState(1),[d,setD]=useState<Dados|null>(null),[erro,setErro]=useState('');
 useEffect(()=>setPage(1),[query]);
 useEffect(()=>{const c=new AbortController();setD(null);setErro('');fetch('/api/unidades/consolidado?modulo='+modulo+'&page='+page+'&'+query,{signal:c.signal,cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}).then(b=>{if(!c.signal.aborted)setD(b);}).catch(e=>{if(!c.signal.aborted)setErro(e.message);});return()=>c.abort();},[modulo,page,query]);
 return <section><h1>{modulo} — consolidado</h1><PCPFilterBar filtros={f.filtros} opcoes={d?.opcoes||{filtros:[],meses:[],pedidos:[]}} onChange={f.setFiltros} onClear={f.limpar}/><p>Fontes separadas, acesso às duas unidades validado no servidor. Estoque mostra posição atual; o recorte de produção seleciona os produtos relacionados. Quantidades de unidades de medida diferentes não são somadas.</p>{erro&&<p role="alert">{erro}</p>}{!d&&!erro&&<p role="status">Carregando…</p>}{d&&<><div className="stats">{d.comparativo.map(c=><div className="stat" key={c.unidade}>{c.unidade}: <strong>{c.total}</strong> registros</div>)}<div>Total: {d.total} registros</div></div><div style={{overflow:'auto'}}><table><thead><tr>{d.colunas.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{d.rows.map((r,i)=><tr key={String(r.unidade)+String(r.id)+i}>{d.colunas.map(c=><td key={c}>{String(r[c]??'—')}</td>)}</tr>)}</tbody></table>{!d.rows.length&&<p>Nenhum registro no recorte.</p>}</div><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button> Página {page} <button disabled={page*50>=d.total} onClick={()=>setPage(p=>p+1)}>Próxima</button></>}</section>;
}
