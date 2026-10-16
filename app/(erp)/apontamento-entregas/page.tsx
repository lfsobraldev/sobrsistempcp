"use client";
import {useEffect,useMemo,useState} from "react";
import {RefreshCw,PanelLeftClose,PanelLeftOpen} from "lucide-react";
import {useOps} from "@/components/operational-provider";
type Pedido={pedido:string;entrega?:{cliente?:string;local_montagem?:string}|null;ofs:number;pecas:number;percentual:number};
type Etapa={pedido:string;area:string;etapa:string;data_inicio:string|null;data_conclusao:string|null;status:string;observacao:string;usuario:string};
const SETORES:[string,string][]=[["PREPARACAO","Preparação"],["COLAGEM_PORTAS","Colagem portas"],["ESQUADRIAS_BORDAS","Esquadrias e bordas"],["RECOBRIDORA_PERFIL","Recobridora"],["USINAGEM_2","Usinagem 2"],["LUSTRACAO","Lustração"],["CNC","CNC"],["USINAGEM","Usinagem"],["PLASTIFICADORA","Plastificadora"],["EMBALAGEM","Embalagem"],["EXPEDICAO","Expedição"]];
export default function ApontamentoEntregas(){
 const {me}=useOps();const [pedidos,setPedidos]=useState<Pedido[]>([]),[etapas,setEtapas]=useState<Etapa[]>([]),[permitidas,setPermitidas]=useState<string[]>([]);
 const [busca,setBusca]=useState(""),[setor,setSetor]=useState("TODOS"),[loading,setLoading]=useState(true),[erro,setErro]=useState(""),[msg,setMsg]=useState("");
 const [editando,setEditando]=useState<{pedido:string;etapa:string}|null>(null),[inicio,setInicio]=useState(""),[fim,setFim]=useState(""),[obs,setObs]=useState(""),[salvando,setSalvando]=useState(false);
 const [ocultarMenu,setOcultarMenu]=useState(false);
 const [cadastros,setCadastros]=useState(Array.from({length:11},(_,i)=>({usuario:"",nome:"",senha:"",etapa:SETORES[i]?.[0]||"EMBALAGEM"})));
 const [mostrarCadastro,setMostrarCadastro]=useState(false),[criando,setCriando]=useState(false);
 async function carregar(){
  setLoading(true);setErro("");
  try{const [a,b]=await Promise.all([fetch("/api/controle-entregas",{cache:"no-store"}),fetch("/api/controle-entregas/etapas",{cache:"no-store"})]);const [x,y]=await Promise.all([a.json(),b.json()]);
  if(!a.ok||!b.ok)throw new Error(x.error||y.error||"Falha ao carregar");
  setPedidos(x.pedidos||[]);setEtapas((y.etapas||[]).filter((v:Etapa)=>v.area==="PRODUCAO"));setPermitidas(y.permitidas||[]);
  }catch(e){setErro(e instanceof Error?e.message:"Falha ao carregar")}finally{setLoading(false)}
 }
 useEffect(()=>{void carregar()},[]);
 const mapa=useMemo(()=>new Map(etapas.map(e=>[e.pedido+"|"+e.etapa,e])),[etapas]);
 const visiveis=pedidos.filter(p=>(!busca||[p.pedido,p.entrega?.cliente].join(" ").toLowerCase().includes(busca.toLowerCase())));
 const abertura=(p:Pedido,etapa:string)=>{
  const row=mapa.get(p.pedido+"|"+etapa);
  setEditando({pedido:p.pedido,etapa});setInicio(row?.data_inicio||"");setFim(row?.data_conclusao||"");setObs(row?.observacao||"");setMsg("");setErro("");
 };
 async function cadastrar(){
 const dados=cadastros.filter(c=>c.usuario.trim()&&c.nome.trim()&&c.senha);
 if(!dados.length){setErro("Preencha os usuários, nomes, senhas e setores.");return;}
 setCriando(true);setErro("");setMsg("");
 try{const r=await fetch("/api/controle-entregas/usuarios",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({usuarios:dados})});const j=await r.json();if(!r.ok)throw Error(j.error||"Falha ao criar contas");setMsg(j.criados+" usuários criados com permissões restritas.");setMostrarCadastro(false)}
 catch(e){setErro(e instanceof Error?e.message:"Falha ao cadastrar")}finally{setCriando(false)}
 }
 async function salvar(){
  if(!editando)return;setSalvando(true);setErro("");setMsg("");
  try{const r=await fetch("/api/controle-entregas/etapas",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({pedido:editando.pedido,area:"PRODUCAO",etapa:editando.etapa,dataInicio:inicio,dataConclusao:fim,observacao:obs,status:fim?"CONCLUIDA":inicio?"EM_ANDAMENTO":"PENDENTE"})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível salvar");
  setMsg("Datas do setor atualizadas.");setEditando(null);await carregar();
  }catch(e){setErro(e instanceof Error?e.message:"Erro ao salvar")}finally{setSalvando(false)}
 }
 return <div className="apontamento-area">
 <header className="apontamento-heading"><div><small>GESTÃO DE ENTREGAS / PRODUÇÃO</small><h1>Apontamento por setor</h1><p>Registro de início e conclusão de cada etapa. Todos visualizam; a edição pertence ao setor autorizado.</p></div>
 <div className="apontamento-actions">{me?.perfil==="PCP"&&<button onClick={()=>setMostrarCadastro(v=>!v)}>{mostrarCadastro?"Fechar cadastro":"Gerenciar 11 acessos"}</button>}<button onClick={()=>{setOcultarMenu(v=>!v);document.documentElement.classList.toggle("apontamento-focus",!ocultarMenu)}}>{ocultarMenu?<PanelLeftOpen/>:<PanelLeftClose/>}{ocultarMenu?"Mostrar menu":"Ampliar área"}</button><button onClick={()=>void carregar()}><RefreshCw/>Atualizar</button></div></header>
 {mostrarCadastro&&me?.perfil==="PCP"&&<section className="apontamento-editor"><h2>Configurar até 11 líderes por setor</h2><p>Informe usuário, nome e senha individual (mínimo 12 caracteres). Cada conta terá permissão de edição apenas para o setor selecionado. Não compartilhe senhas.</p><div className="apontamento-users">{cadastros.map((c,i)=><div key={i}><b>{i+1}</b><input placeholder="Usuário" autoComplete="off" value={c.usuario} onChange={e=>setCadastros(a=>a.map((x,j)=>j===i?{...x,usuario:e.target.value}:x))}/><input placeholder="Nome do líder" value={c.nome} onChange={e=>setCadastros(a=>a.map((x,j)=>j===i?{...x,nome:e.target.value}:x))}/><input type="password" placeholder="Senha individual 12+ caracteres" autoComplete="new-password" value={c.senha} onChange={e=>setCadastros(a=>a.map((x,j)=>j===i?{...x,senha:e.target.value}:x))}/><select value={c.etapa} onChange={e=>setCadastros(a=>a.map((x,j)=>j===i?{...x,etapa:e.target.value}:x))}>{SETORES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>)}</div><button className="primary" disabled={criando} onClick={()=>void cadastrar()}>{criando?"Criando…":"Cadastrar usuários preenchidos"}</button></section>}
 <div className="apontamento-toolbar"><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Pesquisar pedido ou cliente"/><select value={setor} onChange={e=>setSetor(e.target.value)}><option value="TODOS">Todos os setores</option>{SETORES.map(([id,n])=><option key={id} value={id}>{n}</option>)}</select><span>{visiveis.length} pedidos</span><span>{me?.perfil==="LIDER_ENTREGAS"?"Edição restrita ao seu setor":"Visão gerencial"}</span></div>
 {erro&&<p className="apontamento-error" role="alert">{erro}</p>}{msg&&<p role="status">{msg}</p>}
 <div className="apontamento-table-wrap"><table className="apontamento-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>OFs</th><th>Peças</th><th>Avanço PCP</th>{SETORES.filter(([id])=>setor==="TODOS"||id===setor).map(([id,n])=><th key={id}>{n}<small>Início · Fim</small></th>)}</tr></thead><tbody>
 {visiveis.map(p=><tr key={p.pedido}><td><strong>{p.pedido}</strong></td><td>{p.entrega?.cliente||"—"}</td><td>{p.ofs}</td><td>{p.pecas.toLocaleString("pt-BR")}</td><td>{p.percentual.toFixed(0)}%</td>
 {SETORES.filter(([id])=>setor==="TODOS"||id===setor).map(([id])=>{const row=mapa.get(p.pedido+"|"+id);const pode=permitidas.includes(id);return <td key={id}><div className="apontamento-dates"><span><b>I:</b> {row?.data_inicio||"—"}</span><span><b>F:</b> {row?.data_conclusao||"—"}</span>{pode&&<button onClick={()=>abertura(p,id)} type="button">Editar datas</button>}</div></td>})}
 </tr>)}{!visiveis.length&&<tr><td colSpan={16}>{loading?"Carregando…":"Nenhum pedido encontrado."}</td></tr>}</tbody></table></div>
 {editando&&<section className="apontamento-editor"><div><h2>Pedido {editando.pedido} · {SETORES.find(([id])=>id===editando.etapa)?.[1]}</h2><button onClick={()=>setEditando(null)}>Fechar</button></div><div className="apontamento-fields"><label>Data de início<input type="date" value={inicio} onChange={e=>setInicio(e.target.value)} disabled={Boolean(mapa.get(editando.pedido+"|"+editando.etapa)?.data_inicio)&&me?.perfil==="LIDER_ENTREGAS"}/></label><label>Data de conclusão<input type="date" value={fim} onChange={e=>setFim(e.target.value)} disabled={Boolean(mapa.get(editando.pedido+"|"+editando.etapa)?.data_conclusao)&&me?.perfil==="LIDER_ENTREGAS"}/></label><label>Observação<input value={obs} onChange={e=>setObs(e.target.value)}/></label><button className="primary" disabled={salvando} onClick={()=>void salvar()}>{salvando?"Salvando…":"Salvar etapa"}</button></div></section>}
 </div>;
}
