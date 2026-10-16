"use client";
import {useEffect,useState} from "react";
type Especificacao={
 id?:string;pedido:string;item:string;familia:string;descricao:string;tipo_porta:string;material:string;
 comprimento_mm:string|number;largura_mm:string|number;espessura_mm:string|number;quantidade:string|number;
 lado:string;rebaixo:string;tipo_usinagem:string;fechadura:string;dobradica:string;contratesta:string;
 batente:string;alizar:string;acabamento:string;cor:string;observacao:string;status:string;
};
const vazio:Especificacao={pedido:"",item:"",familia:"PORTA",descricao:"",tipo_porta:"",material:"",
 comprimento_mm:"",largura_mm:"",espessura_mm:"",quantidade:1,lado:"",rebaixo:"",tipo_usinagem:"",
 fechadura:"",dobradica:"",contratesta:"",batente:"",alizar:"",acabamento:"",cor:"",observacao:"",status:"RASCUNHO"};
const FAMILIAS=["PORTA","BATENTE","TRAVESSA BATENTE","ALIZAR","TRAVESSA ALIZAR","KIT CORRER","BAGUETE","FERRAGEM","OUTROS"];
const CAMPOS:[keyof Especificacao,string,string?][]=[
 ["item","Nº do item"],["descricao","Descrição completa"],["tipo_porta","Modelo / estrutura da porta"],["material","Material STD / ULTRA / MDF"],
 ["comprimento_mm","Comprimento (mm)","number"],["largura_mm","Largura (mm)","number"],["espessura_mm","Espessura (mm)","number"],
 ["quantidade","Quantidade","number"],["lado","Lado de abertura"],["rebaixo","Rebaixo / RB42 / S"],
 ["tipo_usinagem","Tipo de usinagem / furação"],["fechadura","Modelo de fechadura"],["dobradica","Dobradiças"],
 ["contratesta","Contratesta"],["batente","Especificação do batente"],["alizar","Especificação do alizar"],
 ["acabamento","Acabamento / PET / TXT"],["cor","Cor"],["observacao","Observações técnicas"]
];
export default function ComercialEspecificacoes({pedidos}:{pedidos:string[]}){
 const [filtro,setFiltro]=useState(""),[itens,setItens]=useState<Especificacao[]>([]),[form,setForm]=useState<Especificacao>(vazio);
 const [loading,setLoading]=useState(false),[salvando,setSalvando]=useState(false),[msg,setMsg]=useState(""),[erro,setErro]=useState("");
 async function carregar(){setLoading(true);setErro("");try{const x=await fetch("/api/comercial/usinagem",{cache:"no-store"});const j=await x.json();if(!x.ok)throw Error(j.error);setItens(j.itens||[])}catch(e){setErro(e instanceof Error?e.message:"Falha ao carregar")}finally{setLoading(false)}}
 useEffect(()=>{void carregar()},[]);
 const editar=(p:Especificacao)=>{setForm({...vazio,...p});setMsg("");};
 async function salvar(){setSalvando(true);setMsg("");setErro("");try{
  const r=await fetch("/api/comercial/usinagem",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
  const j=await r.json();if(!r.ok)throw Error(j.error||"Falha ao salvar");
  setMsg("Especificação técnica salva para o pedido "+form.pedido+".");await carregar();
 }catch(e){setErro(e instanceof Error?e.message:"Falha inesperada")}finally{setSalvando(false)}}
 return <section className="industrial-panel">
 <div className="industrial-panel-title"><h2>Comercial · especificação técnica / usinagem</h2><span>Cadastro real no banco de dados</span></div>
 <p style={{color:"#67736e",fontSize:13,marginBottom:12}}>Cadastre diretamente o projeto do cliente: portas, batentes, medidas, usinagens e ferragens. Não precisa criar planilha de usinagem no Excel. Cada item fica vinculado ao pedido, com revisão e histórico.</p>
 {erro&&<p className="industrial-error" role="alert">{erro}</p>}{msg&&<p role="status">{msg}</p>}
 <div className="industrial-toolbar" style={{marginBottom:14}}>
 <label>Filtrar pedido <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Nº do pedido"/></label>
 <button className="industrial-btn" onClick={()=>void carregar()} disabled={loading}>{loading?"Atualizando…":"Atualizar itens"}</button>
 <button className="industrial-btn primary" onClick={()=>setForm({...vazio,pedido:filtro||form.pedido,item:String(itens.filter(p=>p.pedido===(filtro||form.pedido)).length+1)})}>+ Novo item técnico</button>
 </div>
 <div className="industrial-table-wrap"><table className="industrial-table"><thead><tr>{["Pedido","Item","Família","Descrição","Medidas (mm)","Qtd","Usinagem","Fechadura","Situação","Editar"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>
 {itens.filter(i=>!filtro||i.pedido.includes(filtro)).map(i=><tr key={i.id||i.pedido+i.item}><td>{i.pedido}</td><td>{i.item}</td><td>{i.familia}</td><td>{i.descricao}</td><td>{[i.comprimento_mm,i.largura_mm,i.espessura_mm].filter(Boolean).join(" × ")||"—"}</td><td>{i.quantidade}</td><td>{i.tipo_usinagem||"—"}</td><td>{i.fechadura||"—"}</td><td>{i.status}</td><td><button className="industrial-btn" onClick={()=>editar(i)}>Editar</button></td></tr>)}
 {!itens.length&&<tr><td colSpan={10}>Nenhum item técnico cadastrado.</td></tr>}</tbody></table></div>
 <div className="industrial-panel-title" style={{marginTop:24}}><h2>Ficha técnica do item {form.item||"novo"}</h2></div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14}}>
 <label style={{display:"grid",gap:5}}>Pedido<select value={form.pedido} onChange={e=>setForm(x=>({...x,pedido:e.target.value}))}><option value="">Selecionar</option>{pedidos.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
 <label style={{display:"grid",gap:5}}>Família<select value={form.familia} onChange={e=>setForm(x=>({...x,familia:e.target.value}))}>{FAMILIAS.map(f=><option key={f}>{f}</option>)}</select></label>
 {CAMPOS.map(([key,label,type])=><label key={key} style={{display:"grid",gap:5,fontSize:12,fontWeight:650}}>{label}<input type={type||"text"} min={type==="number"?0:undefined} value={form[key]??""} onChange={e=>setForm(x=>({...x,[key]:e.target.value}))} placeholder={label}/></label>)}
 <label style={{display:"grid",gap:5}}>Situação<select value={form.status} onChange={e=>setForm(x=>({...x,status:e.target.value}))}><option value="RASCUNHO">Rascunho</option><option value="EM_REVISAO">Em revisão</option><option value="APROVADO">Aprovado</option></select></label>
 </div>
 <div className="industrial-actions"><button className="industrial-btn primary" onClick={()=>void salvar()} disabled={salvando||!form.pedido||!form.descricao||!form.item}>{salvando?"Salvando…":"Salvar ficha técnica"}</button><button className="industrial-btn" onClick={()=>setForm(vazio)}>Limpar</button></div>
 </section>;
}