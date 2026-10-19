"use client";
import {useEffect,useMemo,useState} from "react";
import {RefreshCw,PanelLeftClose,PanelLeftOpen,FileSpreadsheet,Upload,Download} from "lucide-react";
import {exportarExcel} from "@/lib/export";
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
 const [ocultarMenu,setOcultarMenu]=useState(false),[importando,setImportando]=useState(false);
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
 async function exportar(){
  const linhas=visiveis.flatMap(p=>setoresVisiveis.map(([id,n])=>{const row=mapa.get(p.pedido+"|"+id);return {Pedido:p.pedido,Cliente:p.entrega?.cliente||"",Setor:n,Etapa:id,"Data de início":row?.data_inicio||"","Data de conclusão":row?.data_conclusao||"",Situação:row?.status||"PENDENTE",Observação:row?.observacao||""};}));
  try{await exportarExcel([{nome:"Apontamentos",linhas}],`Apontamentos_Filtro_${programacoes.find(x=>x.id===programacaoId)?.filtro||"selecionado"}`)}catch{setErro("Não foi possível exportar o Excel.")}
 }
 function normalizarData(v:any):string{
  if(v===null||v===undefined||v==="")return "";
  if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
  if(typeof v==="number"){const d=new Date(Date.UTC(1899,11,30)+v*86400000);return d.toISOString().slice(0,10)}
  const s=String(v).trim();if(!s)return "";
  if(/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return s;
  const m=s.match(/^(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return "";
 }
 async function importarArquivo(file:File){
  setImportando(true);setErro("");setMsg("");
  try{
   const XLSX=await import("xlsx");const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
   const nome=wb.SheetNames.find(n=>n.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase()==="APONTAMENTO PRODUCAO")||wb.SheetNames[0];
   if(!nome)throw new Error("A planilha não possui abas.");
   const ws=wb.Sheets[nome];const matriz:any[][]=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
   if(matriz.length<2)throw new Error("A aba selecionada não possui linhas de dados.");
   const norm=(v:any)=>String(v??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
   const headers=(matriz[0]||[]).map(norm);
   const find=(rx:RegExp)=>headers.findIndex(h=>rx.test(h));
   const iPedido=find(/^(pedido|numero pedido|n pedido|pedido cliente)$/),iSetor=find(/^(setor|etapa|processo)$/),iInicio=find(/^(data inicio|inicio|inicio etapa|data de inicio)$/),iFim=find(/^(data conclusao|conclusao|fim|data fim|data de conclusao|termino)$/);
   const aliases:[string,string[]][]=[["PREPARACAO",["preparacao"]],["COLAGEM_PORTAS",["colagem portas","colagem de portas"]],["ESQUADRIAS_BORDAS",["esquadrias bordas","esquadrias e bordas"]],["RECOBRIDORA_PERFIL",["recobridora","recobridora perfil"]],["USINAGEM_2",["usinagem 2"]],["LUSTRACAO",["lustracao"]],["CNC",["cnc"]],["USINAGEM",["usinagem"]],["PLASTIFICADORA",["plastificadora perfil","plastificadora de perfil"]],["PLASTIFICADORA_PORTAS",["plastificadora portas","plastificadora de portas"]],["EMBALAGEM",["embalagem"]],["EXPEDICAO",["expedicao"]]];
   const rows:{pedido:string;etapa:string;dataInicio:string;dataConclusao:string;observacao:string}[]=[];
   if(iPedido>=0&&iSetor>=0&&(iInicio>=0||iFim>=0)){
    for(const r of matriz.slice(1)){const pedido=String(r[iPedido]??"").trim(),raw=norm(r[iSetor]);if(!pedido)continue;const a=aliases.find(([id,names])=>id===raw.toUpperCase()||names.includes(raw)||raw===norm(id));if(!a)continue;rows.push({pedido,etapa:a[0],dataInicio:iInicio>=0?normalizarData(r[iInicio]):"",dataConclusao:iFim>=0?normalizarData(r[iFim]):"",observacao:""});}
   }else if(iPedido>=0){
    const cols= headers.map((h,i)=>({h,i}));
    for(const r of matriz.slice(1)){const pedido=String(r[iPedido]??"").trim();if(!pedido)continue;
     for(const [id,names] of aliases){const tokens=names.map(norm);const start=cols.find(c=>tokens.some(t=>c.h.includes(t))&&/(inicio|data inicial|inicio etapa)/.test(c.h));const end=cols.find(c=>tokens.some(t=>c.h.includes(t))&&/(conclusao|concluida|data fim|fim|termino)/.test(c.h));if(!start&&!end)continue;const dataInicio=start?normalizarData(r[start.i]):"",dataConclusao=end?normalizarData(r[end.i]):"";if(dataInicio||dataConclusao)rows.push({pedido,etapa:id,dataInicio,dataConclusao,observacao:""});}
    }
   }
   if(!rows.length)throw new Error("Não encontrei linhas reconhecíveis. A aba precisa ter Pedido e colunas de setor/etapa + datas, ou colunas de datas identificadas por setor.");
   const resp=await fetch("/api/controle-entregas/etapas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({programacaoId,rows})});const result=await resp.json();if(!resp.ok)throw new Error(result.error||"Falha ao importar.");
   setMsg(`Importação concluída: ${result.atualizados||0} registro(s) atualizado(s), ${result.ignorados||0} ignorado(s). Apenas campos vazios foram preenchidos.`);await carregar(programacaoId);
  }catch(e){setErro(e instanceof Error?e.message:"Não foi possível ler a planilha.")}finally{setImportando(false)}
 }
 async function salvar(){
  if(!editando)return;setSalvando(true);setErro("");setMsg("");
  try{const r=await fetch("/api/controle-entregas/etapas",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({programacaoId,pedido:editando.pedido,area:"PRODUCAO",etapa:editando.etapa,dataInicio:inicio,dataConclusao:fim,observacao:obs,status:fim?"CONCLUIDA":inicio?"EM_ANDAMENTO":"PENDENTE"})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível salvar");
  setMsg("Datas do setor atualizadas.");setEditando(null);await carregar(programacaoId);
  }catch(e){setErro(e instanceof Error?e.message:"Erro ao salvar")}finally{setSalvando(false)}
 }
 return <div className="apontamento-area">
 <header className="apontamento-heading"><div><small>GESTÃO DE ENTREGAS / PRODUÇÃO</small><h1>Apontamento por setor</h1><p>Registro de início e conclusão de cada etapa. Todos visualizam; a edição pertence ao setor autorizado.</p></div>
 <div className="apontamento-actions">{me?.perfil==="PCP"&&<a className="access-config-link" href="/configuracoes">Configurar acessos</a>}<button type="button" onClick={()=>void exportar()}><Download/>Exportar Excel</button><label className="apontamento-import-button"><Upload/>{importando?"Importando…":"Importar Excel"}<input type="file" accept=".xlsx,.xls,.csv" disabled={importando||!programacaoId} onChange={e=>{const f=e.target.files?.[0];if(f)void importarArquivo(f);e.currentTarget.value="";}} /></label><button onClick={()=>{setOcultarMenu(v=>!v);document.documentElement.classList.toggle("apontamento-focus",!ocultarMenu)}}>{ocultarMenu?<PanelLeftOpen/>:<PanelLeftClose/>}{ocultarMenu?"Mostrar menu":"Ampliar área"}</button><button onClick={()=>void carregar()}><RefreshCw/>Atualizar</button></div></header>
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
