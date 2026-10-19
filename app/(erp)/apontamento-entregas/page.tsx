"use client";
import {useEffect,useMemo,useState} from "react";
import {RefreshCw,PanelLeftClose,PanelLeftOpen} from "lucide-react";
import {useOps} from "@/components/operational-provider";
type Pedido={pedido:string;entrega?:{cliente?:string;local_montagem?:string;[key:string]:any}|null;ofs:number;pecas:number;percentual:number};
type Programacao={id:string;filtro:string;data:string;turno:string;status:string;origem?:string};
type Etapa={pedido:string;area:string;etapa:string;data_inicio:string|null;data_conclusao:string|null;status:string;observacao:string;usuario:string};
const SETORES:[string,string][]=[["PREPARACAO","Preparação"],["COLAGEM_PORTAS","Colagem portas"],["ESQUADRIAS_BORDAS","Esquadrias e bordas"],["RECOBRIDORA_PERFIL","Recobridora"],["USINAGEM_2","Usinagem 2"],["LUSTRACAO","Lustração"],["CNC","CNC"],["USINAGEM","Usinagem"],["PLASTIFICADORA","Plastificadora de perfil"],["PLASTIFICADORA_PORTAS","Plastificadora de portas"],["EMBALAGEM","Embalagem"],["EXPEDICAO","Expedição"]];
export default function ApontamentoEntregas(){
 const {me,pg}=useOps();const [pedidos,setPedidos]=useState<Pedido[]>([]),[etapas,setEtapas]=useState<Etapa[]>([]),[permitidas,setPermitidas]=useState<string[]>([]);
 const [programacoes,setProgramacoes]=useState<Programacao[]>([]),[programacaoId,setProgramacaoId]=useState("");
 const [busca,setBusca]=useState(""),[setor,setSetor]=useState("TODOS"),[loading,setLoading]=useState(true),[erro,setErro]=useState(""),[msg,setMsg]=useState("");
 const [editando,setEditando]=useState<{pedido:string;etapa:string}|null>(null),[inicio,setInicio]=useState(""),[fim,setFim]=useState(""),[obs,setObs]=useState(""),[salvando,setSalvando]=useState(false);
 const [ocultarMenu,setOcultarMenu]=useState(false);
 async function carregar(id=programacaoId){
  if(!id){setPedidos([]);setEtapas([]);setLoading(false);return;}
  setLoading(true);setErro("");
  try{const query="?programacaoId="+encodeURIComponent(id);const [a,b]=await Promise.all([fetch("/api/controle-entregas"+query,{cache:"no-store"}),fetch("/api/controle-entregas/etapas"+query,{cache:"no-store"})]);const [x,y]=await Promise.all([a.json(),b.json()]);
  if(!a.ok||!b.ok)throw new Error(x.error||y.error||"Falha ao carregar");
  setPedidos(x.pedidos||[]);setEtapas((y.etapas||[]).filter((v:Etapa)=>v.area==="PRODUCAO"));setPermitidas(y.permitidas||[]);
  }catch(e){setErro(e instanceof Error?e.message:"Falha ao carregar")}finally{setLoading(false)}
 }
 useEffect(()=>{let cancelado=false;(async()=>{try{const r=await fetch("/api/programacoes/historico",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Falha ao carregar filtros");const lista=(j.itens||[]) as Programacao[];if(cancelado)return;setProgramacoes(lista);const inicial=lista.find(x=>x.id===pg?.id)||lista.find(x=>x.status==="ATIVA")||lista[0];if(inicial)setProgramacaoId(inicial.id);else setLoading(false);}catch(e){if(!cancelado){setErro(e instanceof Error?e.message:"Falha ao carregar filtros");setLoading(false)}}})();return()=>{cancelado=true};},[]);
 useEffect(()=>{if(programacaoId)void carregar(programacaoId);},[programacaoId]);
 const mapa=useMemo(()=>new Map(etapas.map(e=>[e.pedido+"|"+e.etapa,e])),[etapas]);
 const setoresVisiveis=SETORES.filter(([id])=>setor==="TODOS"||id===setor);
 const visiveis=pedidos.filter(p=>(!busca||[p.pedido,p.entrega?.cliente].join(" ").toLowerCase().includes(busca.toLowerCase())));
 const abertura=(p:Pedido,etapa:string)=>{
  const row=mapa.get(p.pedido+"|"+etapa);
  setEditando({pedido:p.pedido,etapa});setInicio(row?.data_inicio||"");setFim(row?.data_conclusao||"");setObs(row?.observacao||"");setMsg("");setErro("");
 };
 async function salvar(){
  if(!editando)return;setSalvando(true);setErro("");setMsg("");
  try{const r=await fetch("/api/controle-entregas/etapas",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({programacaoId,pedido:editando.pedido,area:"PRODUCAO",etapa:editando.etapa,dataInicio:inicio,dataConclusao:fim,observacao:obs,status:fim?"CONCLUIDA":inicio?"EM_ANDAMENTO":"PENDENTE"})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível salvar");
  setMsg("Datas do setor atualizadas.");setEditando(null);await carregar(programacaoId);
  }catch(e){setErro(e instanceof Error?e.message:"Erro ao salvar")}finally{setSalvando(false)}
 }
 return <div className="apontamento-area">
 <header className="apontamento-heading"><div><small>GESTÃO DE ENTREGAS / PRODUÇÃO</small><h1>Apontamento por setor</h1><p>Registro de início e conclusão de cada etapa. Todos visualizam; a edição pertence ao setor autorizado.</p></div>
 <div className="apontamento-actions">{me?.perfil==="PCP"&&<a className="access-config-link" href="/configuracoes">Configurar acessos</a>}<button onClick={()=>{setOcultarMenu(v=>!v);document.documentElement.classList.toggle("apontamento-focus",!ocultarMenu)}}>{ocultarMenu?<PanelLeftOpen/>:<PanelLeftClose/>}{ocultarMenu?"Mostrar menu":"Ampliar área"}</button><button onClick={()=>void carregar()}><RefreshCw/>Atualizar</button></div></header>
 <div className="apontamento-toolbar"><label className="apontamento-filter-programacao"><span>Filtro / programação</span><select value={programacaoId} onChange={e=>{setProgramacaoId(e.target.value);setBusca("");}}><option value="">Selecione um filtro</option>{programacoes.map(x=><option key={x.id} value={x.id}>Filtro {x.filtro} · {x.data} · Turno {x.turno||"—"}{x.status==="ATIVA"?" · ATUAL":""}</option>)}</select></label><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Pesquisar pedido ou cliente"/><select value={setor} onChange={e=>setSetor(e.target.value)}><option value="TODOS">Todos os setores</option>{SETORES.map(([id,n])=><option key={id} value={id}>{n}</option>)}</select><span>{visiveis.length} pedidos</span><span>{me?.perfil==="LIDER_ENTREGAS"?"Edição restrita ao seu setor":"Visão gerencial"}</span></div>
 {erro&&<p className="apontamento-error" role="alert">{erro}</p>}{msg&&<p role="status">{msg}</p>}
 <p className="apontamento-scroll-hint">Filtro selecionado: <b>{programacoes.find(x=>x.id===programacaoId)?.filtro||"—"}</b>. Os pedidos e clientes abaixo pertencem somente a esta programação.</p><div className="apontamento-table-wrap" role="region" aria-label="Tabela de apontamento de produção por pedido e setor" tabIndex={0}><table className="apontamento-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>OFs</th><th>Peças</th><th>Avanço PCP</th>{setoresVisiveis.map(([id,n])=><th key={id}>{n}<small>Início · Fim</small></th>)}</tr></thead><tbody>
 {visiveis.map(p=><tr key={p.pedido}><td><strong>{p.pedido}</strong></td><td>{p.entrega?.cliente||"—"}</td><td>{p.ofs}</td><td>{p.pecas.toLocaleString("pt-BR")}</td><td>{p.percentual.toFixed(0)}%</td>
 {setoresVisiveis.map(([id])=>{const row=mapa.get(p.pedido+"|"+id);const pode=permitidas.includes(id);return <td key={id}><div className="apontamento-dates"><span><b>Início:</b> {row?.data_inicio||"—"}</span><span><b>Fim:</b> {row?.data_conclusao||"—"}</span>{pode&&<button onClick={()=>abertura(p,id)} type="button">Editar datas</button>}</div></td>})}
 </tr>)}{!visiveis.length&&<tr><td colSpan={5+setoresVisiveis.length}>{loading?"Carregando…":"Nenhum pedido encontrado."}</td></tr>}</tbody></table></div>
 <section className="apontamento-mobile-cards" aria-label="Apontamentos por pedido no celular">
 {visiveis.map(p=><article className="apontamento-mobile-card" key={p.pedido}>
  <header><div><small>PEDIDO</small><strong>{p.pedido}</strong></div><span className="apontamento-mobile-progress">{p.percentual.toFixed(0)}% PCP</span></header>
  <div className="apontamento-mobile-client"><small>CLIENTE</small><strong>{p.entrega?.cliente?.trim()||"Cliente não cadastrado"}</strong></div>
  <div className="apontamento-mobile-stats"><div><small>OFs</small><strong>{p.ofs}</strong></div><div><small>Peças</small><strong>{p.pecas.toLocaleString("pt-BR")}</strong></div><div><small>Avanço</small><strong>{p.percentual.toFixed(0)}%</strong></div></div>
  <div className="apontamento-mobile-sectors">{setoresVisiveis.map(([id,n])=>{const row=mapa.get(p.pedido+"|"+id);const pode=permitidas.includes(id);return <section key={id}><b>{n}</b><div><span><small>Início</small>{row?.data_inicio||"—"}</span><span><small>Conclusão</small>{row?.data_conclusao||"—"}</span></div>{pode&&<button onClick={()=>abertura(p,id)} type="button">Editar datas</button>}</section>})}</div>
 </article>)}
 {!visiveis.length&&<p className="apontamento-mobile-empty">{loading?"Carregando pedidos…":"Nenhum pedido neste filtro."}</p>}
 </section>
 {editando&&<div className="apontamento-modal-backdrop" role="presentation" onClick={()=>{if(!salvando)setEditando(null)}}><section className="apontamento-editor apontamento-modal" role="dialog" aria-modal="true" aria-labelledby="apontamento-editor-titulo" onClick={e=>e.stopPropagation()}><div className="apontamento-modal-heading"><div><small>REGISTRO DE PRODUÇÃO</small><h2 id="apontamento-editor-titulo">Pedido {editando.pedido} · {SETORES.find(([id])=>id===editando.etapa)?.[1]}</h2></div><button type="button" onClick={()=>{if(!salvando)setEditando(null)}} disabled={salvando}>Fechar</button></div><p>Informe as datas deste setor e salve o apontamento.</p><div className="apontamento-fields"><label>Data de início<input type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/></label><label>Data de conclusão<input type="date" value={fim} onChange={e=>setFim(e.target.value)}/></label><label>Observação<input value={obs} onChange={e=>setObs(e.target.value)}/></label><button type="button" className="primary" disabled={salvando} onClick={()=>void salvar()}>{salvando?"Salvando…":"Salvar etapa"}</button></div></section></div>}
 </div>;
}
