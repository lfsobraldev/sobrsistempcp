'use client';
import {useCallback,useEffect,useState} from 'react';
import StockProductPicker,{type ProdutoEscolha} from '@/components/stock-product-picker';
import {Badge,DataTable,Empty,Field,Panel} from '@/components/ui';
type Row=Record<string,any>;
const n=(v:unknown)=>Number(v??0).toLocaleString('pt-BR',{maximumFractionDigits:6});
async function api(b?:object){const r=await fetch('/api/engenharia/substitutos',b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Falha na operação.');return j;}
/** Componentes alternativos autorizados: o apontamento pode consumir o substituto (com o fator de conversão) no lugar do original. */
export default function SubstitutosPanel({editar}:{editar:boolean}){
 const [d,setD]=useState<Row|null>(null),[erro,setErro]=useState(''),[busy,setBusy]=useState(false);
 const [comp,setComp]=useState<ProdutoEscolha|null>(null),[sub,setSub]=useState<ProdutoEscolha|null>(null),[fator,setFator]=useState('1'),[prio,setPrio]=useState('1'),[motivo,setMotivo]=useState('');
 const carregar=useCallback(async()=>{try{setD(await api());setErro('');}catch(e){setErro(e instanceof Error?e.message:'Falha.');}},[]);
 useEffect(()=>{void carregar();},[carregar]);
 const run=async(b:object)=>{setBusy(true);setErro('');try{await api(b);await carregar();}catch(e){setErro(e instanceof Error?e.message:'Falha.');}finally{setBusy(false);}};
 return <Panel title="Componentes substitutos" subtitle="Fator = quantidade do substituto para cada 1 do componente original. O consumo é lançado no substituto e a reserva do original é liberada.">
  {erro&&<div className="alert danger" role="alert">{erro}</div>}
  {editar&&<div className="formGrid">
   <StockProductPicker label="Componente original" onSelect={setComp}/>
   <StockProductPicker label="Substituto autorizado" onSelect={setSub}/>
   <Field label="Fator"><input inputMode="decimal" value={fator} onChange={e=>setFator(e.target.value)}/></Field>
   <Field label="Prioridade"><input inputMode="numeric" value={prio} onChange={e=>setPrio(e.target.value)}/></Field>
   <Field label="Motivo"><input value={motivo} onChange={e=>setMotivo(e.target.value)}/></Field>
   <button className="primary" disabled={busy||!comp||!sub} onClick={()=>run({acao:'SALVAR',componenteId:comp!.id,substitutoId:sub!.id,fator,prioridade:prio,motivo})}>Salvar substituto</button>
  </div>}
  <DataTable head={['Componente','Substituto','Fator','Prior.','Motivo','Situação','']} empty={<Empty title="Nenhum substituto cadastrado"/>}>
   {(d?.substitutos??[]).map((s:Row)=><tr key={s.id}><td data-label="Componente">{s.componente} · {s.componente_desc}</td><td data-label="Substituto">{s.substituto} · {s.substituto_desc}</td><td data-label="Fator">{n(s.fator)}</td><td data-label="Prior.">{s.prioridade}</td><td data-label="Motivo">{s.motivo||'—'}</td><td data-label="Situação"><Badge tone={s.ativo?'success':'neutral'}>{s.ativo?'ativo':'inativo'}</Badge></td>
    <td className="actions">{editar&&<button className="crm-secondary" disabled={busy} onClick={()=>run({acao:'ATIVO',id:s.id,ativo:!s.ativo})}>{s.ativo?'Desativar':'Reativar'}</button>}</td></tr>)}
  </DataTable>
  {(d?.usos??[]).length>0&&<><h4>Últimos usos em produção</h4><DataTable head={['OF','Componente','Substituto','Qtd original','Qtd consumida','Por']}>
   {d!.usos.map((u:Row,i:number)=><tr key={i}><td data-label="OF">{u.numero}</td><td data-label="Componente">{u.componente}</td><td data-label="Substituto">{u.substituto}</td><td data-label="Qtd original">{n(u.quantidade_original)}</td><td data-label="Qtd consumida">{n(u.quantidade_substituto)}</td><td data-label="Por">{u.criado_por}</td></tr>)}
  </DataTable></>}
 </Panel>;
}
