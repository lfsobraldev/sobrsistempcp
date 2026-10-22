'use client';
import type {FiltrosPCP} from '@/lib/pcp-filters';
import MultiSelect from './multi-select';
export type OpcoesPCP={filtros:string[];meses:string[];mesAtual?:string;mesProximo?:string;pedidos:string[];clientes?:{id:string;codigo:string;nome:string}[];representantes?:{id:string;codigo:string;nome:string}[]};
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function rotuloMes(m:string){const [a,n]=m.split('-');return `${MESES[Number(n)-1]||n}/${a}`;}
export default function PCPFilterBar({filtros,opcoes,onChange,onClear}:{filtros:FiltrosPCP;opcoes:OpcoesPCP;onChange:(v:Partial<FiltrosPCP>)=>void;onClear:()=>void}){
 const cs=(campo:'clientes'|'representantes')=>(opcoes[campo]||[]).map(c=>({value:c.id,label:`${c.nome} · ${c.codigo||'sem código'}`}));
 const ativos=filtros.filtros.length+filtros.pedidos.length+filtros.clientes.length+filtros.representantes.length;
 return <section className="cart-filters" aria-label="Filtros do PCP">
  <label className="fb-field">Mês<select value={filtros.mes} onChange={e=>onChange({mes:e.target.value,filtros:[],pedidos:[],programacaoId:null})}>
  <option value="SELECAO">Programação ativa</option><option value="ATIVO">Ativo</option>
  {opcoes.mesProximo&&<option value={opcoes.mesProximo}>Próximo mês · {rotuloMes(opcoes.mesProximo)}</option>}
  {opcoes.mesAtual&&<option value={opcoes.mesAtual}>Mês atual · {rotuloMes(opcoes.mesAtual)}</option>}
  <option value="TODOS">Todos os meses</option>
  {opcoes.meses.filter(m=>m!==opcoes.mesAtual&&m!==opcoes.mesProximo).map(m=><option key={m} value={m}>{rotuloMes(m)}</option>)}</select></label>
 <MultiSelect label="Filtros" opcoes={opcoes.filtros.map(f=>({value:f,label:f}))} valores={filtros.filtros} onChange={v=>onChange({filtros:v})}/>
  <MultiSelect label="Pedidos" opcoes={opcoes.pedidos.map(p=>({value:p,label:p}))} valores={filtros.pedidos} onChange={v=>onChange({pedidos:v})}/>
  <MultiSelect label="Clientes" opcoes={cs('clientes')} valores={filtros.clientes} onChange={v=>onChange({clientes:v})}/>
  <MultiSelect label="Representantes" opcoes={cs('representantes')} valores={filtros.representantes} onChange={v=>onChange({representantes:v})}/>
  <button className="cart-btn fb-clear" type="button" onClick={onClear} disabled={!ativos}>Limpar{ativos?` (${ativos})`:''}</button>
 </section>;
}
