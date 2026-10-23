"use client";
import {Fragment,useEffect,useMemo,useState} from "react";
import {RefreshCw} from "lucide-react";
type Pedido={pedido:string;ofs:number;pecas:number;percentual:number;entrega:{cliente?:string;previsao_saida?:string|null;previsao_entrega?:string|null;observacao?:string;colecao?:string}|null};
type Etapa={pedido:string;area:string;etapa:string;data_inicio:string|null;data_conclusao:string|null;observacao:string;status:string;usuario?:string};
const colunas:[string,string][]=[
 ["PREPARACAO","Preparação"],["COLAGEM_PORTAS","Colagem de Portas"],
 ["ESQUADRIAS_BORDAS","Esquadrias de Bordas"],["RECOBRIDORA_PERFIL","Rec. Perfil"],
 ["USINAGEM_2","Usinagem 2"],["LUSTRACAO","Lustração"],["CNC","CNC"],
 ["USINAGEM","Usinagem"],["PLASTIFICADORA","Plastificadora de Perfil"],
 ["PLASTIFICADORA_PORTAS","Plastificadora de Portas"],
 ["EMBALAGEM","Embalagem"],["EXPEDICAO","Expedição"]
];
function data(v:string|null|undefined){if(!v)return "—";const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v);return m?`${m[3]}/${m[2]}/${m[1].slice(2)}`:"—"}
const hojeBR=()=>new Date(Date.now()-3*3600_000).toISOString().slice(0,10);
function classe(e:Etapa|undefined){if(!e||(!e.data_inicio&&!e.data_conclusao))return "ap-vazio";if(e.data_conclusao)return "ap-ok";if(e.data_inicio&&e.data_inicio>hojeBR())return "ap-prog";return "ap-andamento"}
export default function ApontamentoProducaoResumo({pedidos}:{pedidos:Pedido[]}){
 const [etapas,setEtapas]=useState<Etapa[]>([]);
 const [erro,setErro]=useState(""),[busy,setBusy]=useState(false);
 const [busca,setBusca]=useState(""),[atualizado,setAtualizado]=useState("");
 async function carregar(){
  setBusy(true);setErro("");
  try{const r=await fetch("/api/controle-entregas/etapas",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Falha ao consultar datas");setEtapas((j.etapas||[]).filter((e:Etapa)=>e.area==="PRODUCAO"));setAtualizado(new Date().toLocaleTimeString("pt-BR"))}
  catch(e){setErro(e instanceof Error?e.message:"Falha ao consultar datas")}finally{setBusy(false)}
 }
 useEffect(()=>{
  void carregar();
  const t=setInterval(()=>{if(document.visibilityState==="visible")void carregar()},30000);
  const v=()=>{if(document.visibilityState==="visible")void carregar()};
  document.addEventListener("visibilitychange",v);window.addEventListener("focus",v);
  return()=>{clearInterval(t);document.removeEventListener("visibilitychange",v);window.removeEventListener("focus",v)};
 },[]);
 // mais recente vence quando o mesmo pedido/etapa existe em mais de uma programação
 const mapa=useMemo(()=>{const m=new Map<string,Etapa>();for(const e of [...etapas].sort((a:any,b:any)=>String(a.atualizado_em||"").localeCompare(String(b.atualizado_em||""))))m.set(e.pedido+"|"+e.etapa,e);return m},[etapas]);
 const rows=pedidos.filter(p=>!busca||[p.pedido,p.entrega?.cliente].join(" ").toLowerCase().includes(busca.toLowerCase()));
 return <section className="industrial-panel apontamento-resumo">
  <div className="industrial-panel-title"><div><h2>Apontamento Produção — acompanhamento por pedido</h2><p>Visualização da planilha operacional. Datas lançadas pelos líderes na área de apontamento, atualizadas automaticamente a cada 30 segundos.</p></div><button className="industrial-btn" onClick={()=>void carregar()} disabled={busy}><RefreshCw size={15}/>{busy?"Atualizando…":"Atualizar datas"}</button></div>
  <div className="apontamento-resumo-filtros"><input aria-label="Buscar pedido ou cliente" placeholder="Buscar pedido ou cliente" value={busca} onChange={e=>setBusca(e.target.value)}/><span>{rows.length} pedidos · somente leitura{atualizado&&` · atualizado às ${atualizado}`}</span><span className="ap-legenda"><i className="ap-ok"/>Concluído<i className="ap-andamento"/>Em andamento<i className="ap-prog"/>Programado<i className="ap-vazio"/>Sem data</span></div>
  {erro&&<p className="industrial-error" role="alert">{erro}</p>}
  <div className="apontamento-resumo-scroll"><table className="apontamento-resumo-tabela">
   <thead><tr><th rowSpan={2}>Pedido</th><th rowSpan={2}>Cliente / lote</th>{colunas.map(([id,n])=><th colSpan={2} key={id}>{n}</th>)}<th rowSpan={2}>Observações (Produção)</th><th rowSpan={2}>Grau</th><th rowSpan={2}>Previsão de Finalização</th></tr>
   <tr>{colunas.map(([id])=><Fragment key={id}><th>Início</th><th>Fim</th></Fragment>)}</tr></thead>
   <tbody>{rows.map(p=><tr key={p.pedido}><td className="apontamento-resumo-pedido">{p.pedido}</td><td className="apontamento-resumo-lote"><b>{p.entrega?.cliente?.trim()||"Cliente não informado"}</b>{p.entrega?.colecao&&<small>{p.entrega.colecao}</small>}</td>
    {colunas.map(([id])=>{const e=mapa.get(p.pedido+"|"+id);return <Fragment key={id}><td className={classe(e)} title={e?.data_inicio||"Sem data"}>{data(e?.data_inicio)}</td><td className={classe(e)} title={e?.data_conclusao?`Concluído por ${e.usuario||"—"}`:"Sem data"}>{data(e?.data_conclusao)}</td></Fragment>})}
    <td className="apontamento-resumo-obs">{etapas.filter(e=>e.pedido===p.pedido&&e.observacao).map(e=>e.observacao).filter(Boolean).join(" · ")||p.entrega?.observacao||"—"}</td><td>—</td><td>{p.entrega?.previsao_saida||"—"}</td>
   </tr>)}{!rows.length&&<tr><td colSpan={2+colunas.length*2+3}>Nenhum pedido encontrado.</td></tr>}</tbody>
  </table></div><p className="apontamento-resumo-nota">Campos sem registro aparecem como “—”. A coluna Cliente / lote mostra o cliente e, abaixo, a coleção/cor. Grau e lote de produção serão exibidos quando estiverem disponíveis em fonte estruturada; não são calculados ou inventados.</p>
 </section>;
}