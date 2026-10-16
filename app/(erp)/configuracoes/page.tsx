"use client";
import {useEffect,useState} from "react";
import {useOps} from "@/components/operational-provider";
type Conta={usuario:string;nome:string;ativo:boolean;turno:string;setores:string[];senha?:string};
const SECTORS:[string,string][]=[
 ["PREPARACAO","Preparação"],["COLAGEM_PORTAS","Colagem de portas"],["ESQUADRIAS_BORDAS","Esquadrias e bordas"],
 ["RECOBRIDORA_PERFIL","Recobridora de perfil"],["USINAGEM_2","Usinagem 2"],["LUSTRACAO","Lustração"],
 ["CNC","CNC"],["USINAGEM","Usinagem"],["PLASTIFICADORA","Plastificadora de perfil"],
 ["PLASTIFICADORA_PORTAS","Plastificadora de portas"],["EMBALAGEM","Embalagem"],["EXPEDICAO","Expedição"]
];
const empty:Conta={usuario:"",nome:"",ativo:true,turno:"A",setores:[],senha:""};
export default function Configuracoes(){
 const {me}=useOps();
 const [usuarios,setUsuarios]=useState<Conta[]>([]),[form,setForm]=useState<Conta>({...empty}),[editing,setEditing]=useState(false);
 const [busy,setBusy]=useState(false),[erro,setErro]=useState(""),[sucesso,setSucesso]=useState(""),[loading,setLoading]=useState(true);
 async function carregar(){setLoading(true);try{const r=await fetch("/api/controle-entregas/usuarios",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Falha ao carregar");setUsuarios(j.usuarios||[])}catch(e){setErro(e instanceof Error?e.message:"Erro de conexão")}finally{setLoading(false)}}
 useEffect(()=>{if(me?.perfil==="PCP")void carregar()},[me?.perfil]);
 function editar(c:Conta){setEditing(true);setForm({...c,senha:""});setErro("");setSucesso("");window.scrollTo({top:0,behavior:"smooth"})}
 function novo(){setEditing(false);setForm({...empty,setores:[]});setErro("");setSucesso("")}
 async function salvar(){setErro("");setSucesso("");setBusy(true);try{
  const r=await fetch("/api/controle-entregas/usuarios",{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
  const j=await r.json();if(!r.ok)throw Error(j.error||"Não foi possível salvar");setSucesso(editing?"Conta atualizada.":"Conta criada.");novo();await carregar();
 }catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar")}finally{setBusy(false)}}
 if(me?.perfil!=="PCP")return <main className="access-config"><h1>Configurações de acesso</h1><p>Somente o administrador PCP pode gerenciar usuários.</p></main>;
 return <main className="access-config">
  <header className="access-config-header"><div><small>ADMINISTRAÇÃO / SEGURANÇA</small><h1>Configurações de acesso</h1><p>Gerencie logins, responsáveis, turnos e setores autorizados sem alterar a programação industrial.</p></div><button type="button" onClick={novo}>Novo funcionário</button></header>
  {erro&&<p role="alert" className="apontamento-error">{erro}</p>}{sucesso&&<p role="status" className="access-success">{sucesso}</p>}
  <section className="access-panel"><h2>{editing?"Editar funcionário":"Cadastrar funcionário"}</h2>
   <div className="access-fields"><label>Usuário para login<input value={form.usuario} disabled={editing} autoComplete="off" placeholder="ex.: samuel" onChange={e=>setForm(v=>({...v,usuario:e.target.value}))}/></label>
   <label>Nome do funcionário<input value={form.nome} placeholder="Nome completo" onChange={e=>setForm(v=>({...v,nome:e.target.value}))}/></label>
   <label>Turno<select value={form.turno} onChange={e=>setForm(v=>({...v,turno:e.target.value}))}><option value="A">Turno A — manhã</option><option value="B">Turno B — noite</option></select></label>
   <label>{editing?"Nova senha (deixe vazio para manter)":"Senha individual (mínimo 12 caracteres)"}<input type="password" autoComplete="new-password" value={form.senha||""} onChange={e=>setForm(v=>({...v,senha:e.target.value}))}/></label></div>
   <fieldset className="access-sectors"><legend>Setores que este funcionário pode editar</legend><div className="access-sector-grid">{SECTORS.map(([id,n])=><label key={id}><input type="checkbox" checked={form.setores.includes(id)} onChange={e=>setForm(v=>({...v,setores:e.target.checked?[...v.setores,id]:v.setores.filter(s=>s!==id)}))}/>{n}</label>)}</div></fieldset>
   {editing&&<label className="access-status"><input type="checkbox" checked={form.ativo} onChange={e=>setForm(v=>({...v,ativo:e.target.checked}))}/> Conta ativa — permitir login</label>}
   <div className="access-buttons"><button className="primary" type="button" disabled={busy||!form.nome.trim()||!form.usuario.trim()||!form.setores.length||(!editing&&(form.senha||"").length<12)} onClick={()=>void salvar()}>{busy?"Salvando…":editing?"Salvar alterações":"Criar acesso"}</button>{editing&&<button type="button" onClick={novo}>Cancelar edição</button>}</div>
  </section>
  <section className="access-panel"><div className="access-list-head"><h2>Funcionários cadastrados</h2><span>{usuarios.length} contas</span></div>
   <div className="access-user-list">{usuarios.map(u=><article key={u.usuario} className="access-user"><div><b>{u.nome}</b><p>@{u.usuario} · Turno {u.turno==="B"?"B — noite":"A — manhã"}</p><small>{u.setores.map(s=>SECTORS.find(x=>x[0]===s)?.[1]||s).join(" · ")||"Sem setor"}</small></div><div className="access-user-actions"><span className={u.ativo?"access-active":"access-inactive"}>{u.ativo?"Ativo":"Inativo"}</span><button type="button" onClick={()=>editar(u)}>Gerenciar</button></div></article>)}{!usuarios.length&&<p>{loading?"Carregando usuários…":"Nenhum líder cadastrado."}</p>}</div>
  </section><p className="access-help">Os líderes podem consultar os outros setores, mas o servidor permite atualizar somente os setores vinculados ao seu login. Turno é uma identificação do responsável; os registros continuam compartilhados por pedido e setor.</p>
 </main>;
}