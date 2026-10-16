"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ClipboardList,RefreshCw,Truck,Search,CalendarClock,PackageCheck} from "lucide-react";
type Entrega={transportadora:string;nota_fiscal:string;data_saida:string|null;previsao_entrega:string|null;data_entrega:string|null;status:string;local_montagem:string;observacao:string;cliente:string;representante:string;tipo_pedido:string;colecao:string;status_ferragens:string;uf:string;cidade:string;tipo_frete:string;origem_unidade:string;destino_unidade:string;pedido_sul:string;status_montagem:string;data_montagem:string|null;previsao_saida:string|null;volume_m3:string|number|null;peso_kg:string|number|null;previsao_informada:string|null};
type RegraPrazo={id:number;uf:string;cidade:string;faixa_ate_10:number;faixa_10_20:number;faixa_acima_20:number};
type Importacao={previa?:boolean;ok?:boolean;repetido?:boolean;totalNaPlanilha:number;correspondentes:number;foraDaProgramacao:number;linhasPorAba:Record<string,number>;amostra?:{pedido:string;cliente:string}[];naoEncontrados?:string[];atualizados?:number};
type Evento={pedido:string;tipo:string;usuario:string;criado_em:string};
type Pedido={pedido:string;linhas:number;ofs:number;pecas:number;percentual:number;entrega:Entrega|null};
const ABAS=[["PAINEL","Painel de Entregas"],["COMERCIAL","Comercial"],["PCP","PCP"],["SUL","Produção Sul"],["APONTAMENTO","Apontamento Produção"],["MONTAGEM","Montagem e Redespacho"],["LOGISTICA","Logística"],["FICHA","Ficha do Pedido"],["HISTORICO","Histórico"],["CLASSIFICACAO","Classificação e Prazos"]] as const;
const statuses=[["PLANEJADO","Planejado"],["EM_PRODUCAO","Em produção"],["AGUARDANDO_MONTAGEM","Aguardando montagem"],["PRONTO_EXPEDICAO","Pronto para expedição"],["EM_TRANSITO","Em trânsito"],["ENTREGA_PARCIAL","Entrega parcial"],["ENTREGUE","Entregue"],["PENDENCIA","Pendência"]];
const vazio:Entrega={transportadora:"",nota_fiscal:"",data_saida:null,previsao_entrega:null,data_entrega:null,status:"PLANEJADO",local_montagem:"",observacao:"",cliente:"",representante:"",tipo_pedido:"",colecao:"",status_ferragens:"",uf:"",cidade:"",tipo_frete:"",origem_unidade:"",destino_unidade:"",pedido_sul:"",status_montagem:"",data_montagem:null,previsao_saida:null,volume_m3:null,peso_kg:null,previsao_informada:null};
export default function GestaoPedidos(){
 const [arquivo,setArquivo]=useState<File|null>(null),[preImport,setPreImport]=useState<Importacao|null>(null),[importando,setImportando]=useState(false);
 const [regras,setRegras]=useState<RegraPrazo[]>([]),[regra,setRegra]=useState({uf:"",cidade:"",ate10:"",de10a20:"",acima20:""}),[salvandoPrazo,setSalvandoPrazo]=useState(false);
 const [aba,setAba]=useState<string>("PAINEL");const [novo,setNovo]=useState(false);const [numeroNovo,setNumeroNovo]=useState(""); const [setor,setSetor]=useState("TODOS");const [eventos,setEventos]=useState<Evento[]>([]);const [rows,setRows]=useState<Pedido[]>([]),[filtro,setFiltro]=useState(""),[query,setQuery]=useState(""),[statusFiltro,setStatusFiltro]=useState("TODOS"),[selected,setSelected]=useState<Pedido|null>(null),[form,setForm]=useState<Entrega>(vazio),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[erro,setErro]=useState(""),[ok,setOk]=useState("");
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch("/api/controle-entregas",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Falha ao carregar");setRows(j.pedidos||[]);setEventos(j.eventos||[]);setFiltro(j.filtro||"");}catch(e){setErro(e instanceof Error?e.message:"Falha ao carregar")}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(aba==="CLASSIFICACAO")void fetch("/api/controle-entregas/prazos").then(r=>r.json()).then(j=>{if(j.regras)setRegras(j.regras)}).catch(()=>{})},[aba]);
 const filtered=useMemo(()=>rows.filter(p=>(!query||[p.pedido,p.entrega?.transportadora,p.entrega?.nota_fiscal].join(" ").toLowerCase().includes(query.toLowerCase()))&&(statusFiltro==="TODOS"||(p.entrega?.status||"PLANEJADO")===statusFiltro)&& (setor==="TODOS" || (setor==="COMERCIAL"&&!p.entrega?.status)|| (setor==="PCP"&&p.ofs>0)||(setor==="MONTAGEM"&&["AGUARDANDO_MONTAGEM"].includes(p.entrega?.status||""))||(setor==="LOGISTICA"&&["PRONTO_EXPEDICAO","EM_TRANSITO","ENTREGA_PARCIAL"].includes(p.entrega?.status||""))||(setor==="ENTREGUE"&&p.entrega?.status==="ENTREGUE"))),[rows,query,statusFiltro,setor]);
 const visiveis=useMemo(()=>filtered.filter(p=>{
   const e=p.entrega;
   if(aba==="COMERCIAL")return true;
   if(aba==="PCP")return p.ofs>0;
   if(aba==="SUL")return Boolean(e?.pedido_sul||e?.origem_unidade==="SUL");
   if(aba==="APONTAMENTO")return p.ofs>0;
   if(aba==="MONTAGEM")return Boolean(e?.local_montagem||e?.status_montagem||e?.status==="AGUARDANDO_MONTAGEM");
   if(aba==="LOGISTICA")return Boolean(e?.transportadora||e?.nota_fiscal||e?.status==="EM_TRANSITO"||e?.status==="ENTREGUE");
   return true;
 }),[filtered,aba]);
 const atraso=rows.filter(p=>p.entrega?.previsao_entrega&&new Date(p.entrega.previsao_entrega+"T12:00:00").getTime()<Date.now()&&!["ENTREGUE"].includes(p.entrega.status)).length;
 function escolher(p:Pedido){setNovo(false);setSelected(p);setForm({...vazio,...p.entrega});setErro("");setOk("")}
 async function save(){if(!selected)return;setBusy(true);setErro("");setOk("");try{const response=await fetch("/api/controle-entregas",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,pedido:selected.pedido})});const j=await response.json();if(!response.ok)throw Error(j.error||"Não foi possível salvar");setOk("Dados de entrega atualizados.");setSelected(null);await load();}catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar")}finally{setBusy(false)}}
 async function importar(aplicar:boolean){
 if(!arquivo)return;setImportando(true);setErro("");setOk("");
 try{const fd=new FormData();fd.append("arquivo",arquivo);fd.append("aplicar",String(aplicar));const response=await fetch("/api/gestao-entregas",{method:"POST",body:fd});const j=await response.json();if(!response.ok)throw Error(j.error||"Falha ao importar");setPreImport(j);if(aplicar){setOk(j.repetido?"Este arquivo já havia sido importado. Nenhuma alteração foi repetida.":"Dados compatíveis integrados aos pedidos ativos, sem substituir campos preenchidos.");await load();}}
 catch(e){setErro(e instanceof Error?e.message:"Erro ao importar")}finally{setImportando(false)}
 }
  async function salvarPrazo(){
  setSalvandoPrazo(true);setErro("");
  try{const r=await fetch("/api/controle-entregas/prazos",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(regra)});const j=await r.json();if(!r.ok)throw Error(j.error||"Não foi possível salvar prazo");setOk("Prazo salvo.");setRegra({uf:"",cidade:"",ate10:"",de10a20:"",acima20:""});const x=await fetch("/api/controle-entregas/prazos").then(v=>v.json());setRegras(x.regras||[]);}
  catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar prazo")}finally{setSalvandoPrazo(false)}
 }
 const field=(name:keyof Entrega,label:string,type="text")=><label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>{label}<input type={type} value={form[name]||""} onChange={e=>setForm(x=>({...x,[name]:e.target.value||null}))}/></label>;
 return <div className="industrial-workspace">
 <header className="industrial-hero"><div className="industrial-eyebrow">SOBRAL PCP / GESTÃO OPERACIONAL</div><h1>Gestão de Pedidos e Entregas</h1><p>Sistema operacional que substitui o Controle de Entregas online. Comercial, PCP, montagem e logística utilizam o mesmo cadastro permanente.</p><div className="industrial-tags"><span>Programação: {filtro||"—"}</span><span>Origem: PCP</span><span>Controle logístico</span></div></header>
 <nav className="industrial-subtabs" aria-label="Áreas do Controle de Entregas">{ABAS.map(([id,label])=><button key={id} type="button" className={aba===id?"active":""} onClick={()=>{setAba(id);setSelected(null)}}>{label}</button>)}</nav>
  <section className="industrial-stat-row"><div><ClipboardList size={20}/><span>Pedidos ativos</span><strong>{rows.length}</strong></div><div><PackageCheck size={20}/><span>Em produção / planejados</span><strong>{rows.filter(p=>!["ENTREGUE","EM_TRANSITO"].includes(p.entrega?.status||"PLANEJADO")).length}</strong></div><div><Truck size={20}/><span>Em transporte</span><strong>{rows.filter(p=>p.entrega?.status==="EM_TRANSITO").length}</strong></div><div><CalendarClock size={20}/><span>Previsões vencidas</span><strong>{atraso}</strong></div></section>
 <section className="industrial-panel">
 <div className="industrial-panel-title"><h2>Importar Controle de Entregas</h2><span>Excel .xlsx • prévia antes da gravação</span></div>
 <p style={{fontSize:13,color:"#5f6d74",marginBottom:14}}>Importação inicial de dados legados, não necessária para o funcionamento diário. A planilha anterior permanece apenas como referência histórica. Não sobrescreve campos já preenchidos nem importa datas ou status antigos.</p>
 <div className="industrial-toolbar"><input type="file" accept=".xlsx" onChange={e=>{setArquivo(e.target.files?.[0]||null);setPreImport(null)}}/><button disabled={!arquivo||importando} className="industrial-btn primary" onClick={()=>void importar(false)}>{importando?"Conferindo…":"Conferir Excel"}</button><button disabled={!preImport?.previa||!preImport.correspondentes||importando} className="industrial-btn" onClick={()=>void importar(true)}>Confirmar importação</button></div>
 {preImport&&<div className="industrial-stats" style={{marginTop:14}}><div><small>Pedidos na planilha</small><strong>{preImport.totalNaPlanilha}</strong></div><div><small>Pedidos correspondentes</small><strong>{preImport.correspondentes}</strong></div><div><small>Não presentes no filtro</small><strong>{preImport.foraDaProgramacao}</strong></div><div><small>Atualizados</small><strong>{preImport.atualizados??"—"}</strong></div></div>}
 </section>
  <div className="industrial-toolbar"><button className="industrial-btn primary" onClick={()=>{setNovo(true);setNumeroNovo("");setSelected(null)}}>+ Novo pedido comercial</button><Search size={19}/><input style={{flex:"2",minWidth:200}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar pedido, transportadora ou NF"/><select value={setor} onChange={e=>setSetor(e.target.value)}>{[["TODOS","Todas as áreas"],["COMERCIAL","Comercial"],["PCP","PCP / Produção"],["MONTAGEM","Montagem"],["LOGISTICA","Logística"],["ENTREGUE","Entregues"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><select value={statusFiltro} onChange={e=>setStatusFiltro(e.target.value)}><option value="TODOS">Todas as situações</option>{statuses.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><button className="industrial-btn" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Atualizar</button></div>
 {erro&&<p role="alert" className="industrial-error">{erro}</p>}{ok&&<p>{ok}</p>}
 {aba==="CLASSIFICACAO"&&<section className="industrial-panel"><div className="industrial-panel-title"><h2>Classificação de destinos e prazos</h2><span>Cadastro persistente por UF, cidade e m³</span></div>
 <div className="industrial-toolbar">
 {(["uf","cidade","ate10","de10a20","acima20"] as const).map((k,i)=><label key={k} style={{display:"grid",gap:4}}><small>{["UF","Cidade","Até 10 m³ (dias)","De 10 a 20 m³ (dias)","Acima de 20 m³ (dias)"][i]}</small><input type={i<2?"text":"number"} min={0} max={365} value={regra[k]} onChange={e=>setRegra(v=>({...v,[k]:e.target.value}))} style={{width:i===1?195:140}}/></label>)}
 <button className="industrial-btn primary" onClick={()=>void salvarPrazo()} disabled={salvandoPrazo}>Salvar prazo</button>
 </div><div className="industrial-table-wrap" style={{marginTop:13}}><table className="industrial-table"><thead><tr><th>UF</th><th>Cidade</th><th>Até 10 m³</th><th>10 a 20 m³</th><th>Acima 20 m³</th><th>Ação</th></tr></thead><tbody>{regras.map(x=><tr key={x.id}><td>{x.uf}</td><td>{x.cidade}</td><td>{x.faixa_ate_10} dias</td><td>{x.faixa_10_20} dias</td><td>{x.faixa_acima_20} dias</td><td><button className="industrial-btn" onClick={()=>setRegra({uf:x.uf,cidade:x.cidade,ate10:String(x.faixa_ate_10),de10a20:String(x.faixa_10_20),acima20:String(x.faixa_acima_20)})}>Editar</button></td></tr>)}{!regras.length&&<tr><td colSpan={6}>Nenhum prazo cadastrado. Informe os valores confirmados pela logística.</td></tr>}</tbody></table></div></section>}
 {aba==="FICHA"&&<section className="industrial-panel"><div className="industrial-panel-title"><h2>Ficha do Pedido</h2></div><p>Selecione “Detalhes” em um pedido para abrir todas as informações comerciais, produtivas e logísticas na ficha.</p></section>}
 <section className="industrial-panel"><div className="industrial-panel-title"><h2>{ABAS.find(([id])=>id===aba)?.[1]||"Pedidos"}</h2><span>{visiveis.length} pedido(s) • clique em editar para atualizar</span></div>
 <div className="industrial-table-wrap"><table className="industrial-table">
 <thead><tr>{(aba==="COMERCIAL"?["Pedido","Cliente","Representante","Tipo de pedido","Coleção","Ferragens","Destino","Editar"]:
 aba==="PCP"?["Pedido","OFs","Peças programadas","Andamento","Montagem","Previsão saída","Editar"]:
 aba==="SUL"?["Pedido NE","Pedido Sul","Origem","Destino","Montagem","Status","Editar"]:
 aba==="APONTAMENTO"?["Pedido","OFs","Peças","Avanço oficial","Situação entrega","Editar"]:
 aba==="MONTAGEM"?["Pedido","Local montagem","Situação montagem","Data montagem","Previsão saída","Editar"]:
 aba==="LOGISTICA"?["Pedido","Transportadora","Nota fiscal","Frete","Saída","Previsão entrega","Entregue em","Editar"]:
 ["Pedido","Cliente","Peças","OFs","Avanço PCP","Situação","Previsão entrega","Editar"]).map(h=><th key={h}>{h}</th>)}</tr></thead>
 <tbody>{visiveis.map(p=><tr key={p.pedido}>
 {(aba==="COMERCIAL"?[p.pedido,p.entrega?.cliente||"—",p.entrega?.representante||"—",p.entrega?.tipo_pedido||"—",p.entrega?.colecao||"—",p.entrega?.status_ferragens||"—",[p.entrega?.cidade,p.entrega?.uf].filter(Boolean).join(" / ")||"—"]:
 aba==="PCP"?[p.pedido,p.ofs,p.pecas.toLocaleString("pt-BR"),p.percentual.toFixed(1)+"%",p.entrega?.local_montagem||"—",p.entrega?.previsao_saida||"—"]:
 aba==="SUL"?[p.pedido,p.entrega?.pedido_sul||"—",p.entrega?.origem_unidade||"—",p.entrega?.destino_unidade||"—",p.entrega?.local_montagem||"—",p.entrega?.status_montagem||"—"]:
 aba==="APONTAMENTO"?[p.pedido,p.ofs,p.pecas.toLocaleString("pt-BR"),p.percentual.toFixed(1)+"%",p.entrega?.status||"PLANEJADO"]:
 aba==="MONTAGEM"?[p.pedido,p.entrega?.local_montagem||"—",p.entrega?.status_montagem||"—",p.entrega?.data_montagem||"—",p.entrega?.previsao_saida||"—"]:
 aba==="LOGISTICA"?[p.pedido,p.entrega?.transportadora||"—",p.entrega?.nota_fiscal||"—",p.entrega?.tipo_frete||"—",p.entrega?.data_saida||"—",p.entrega?.previsao_entrega||"—",p.entrega?.data_entrega||"—"]:
 [p.pedido,p.entrega?.cliente||"—",p.pecas.toLocaleString("pt-BR"),p.ofs,p.percentual.toFixed(1)+"%",p.entrega?.status||"PLANEJADO",p.entrega?.previsao_entrega||"—"]).map((value,index)=><td key={index}>{value}</td>)}
 <td><button className="industrial-btn" onClick={()=>escolher(p)}>Editar</button></td>
 </tr>)}{!visiveis.length&&<tr><td colSpan={9}>{loading?"Carregando pedidos…":"Nenhum pedido nesta área."}</td></tr>}</tbody>
 </table></div></section>

 {aba==="HISTORICO"&&<section className="industrial-panel"><div className="industrial-panel-title"><h2>Histórico operacional</h2><span>Últimas 300 alterações</span></div><div className="industrial-table-wrap"><table className="industrial-table"><thead><tr><th>Pedido</th><th>Movimentação</th><th>Responsável</th><th>Data / Hora</th></tr></thead><tbody>{eventos.slice(0,50).map((e,i)=><tr key={i}><td>{e.pedido}</td><td>{e.tipo.replaceAll("_"," ")}</td><td>{e.usuario}</td><td>{new Date(e.criado_em).toLocaleString("pt-BR")}</td></tr>)}{eventos.length===0&&<tr><td colSpan={4}>Ainda não existem alterações registradas neste módulo.</td></tr>}</tbody></table></div></section>}
 {selected&&<section className="industrial-panel" aria-label="Editar controle de entrega"><div className="industrial-panel-title"><h2>Pedido {selected.pedido} · controle de entrega</h2><button className="industrial-btn" onClick={()=>setSelected(null)}>Fechar</button></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14}}>
 <label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>Situação<select value={form.status} onChange={e=>setForm(x=>({...x,status:e.target.value}))}>{statuses.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 {field("cliente","Cliente")}{field("representante","Representante")}{field("tipo_pedido","Tipo de pedido")}{field("colecao","Linha / coleção")}
 {field("status_ferragens","Situação das ferragens")}
 {field("uf","UF de entrega")}{field("cidade","Cidade de entrega")}
 <label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>Tipo de frete<select value={form.tipo_frete} onChange={e=>setForm(x=>({...x,tipo_frete:e.target.value}))}><option value="">Não informado</option><option value="CIF">CIF</option><option value="FOB">FOB</option></select></label>
 {field("pedido_sul","Pedido vinculado no Sul")}
 <label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>Origem<select value={form.origem_unidade} onChange={e=>setForm(x=>({...x,origem_unidade:e.target.value}))}><option value="">Não informada</option><option value="SUL">Sul</option><option value="NORDESTE">Nordeste</option></select></label>
 <label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>Destino<select value={form.destino_unidade} onChange={e=>setForm(x=>({...x,destino_unidade:e.target.value}))}><option value="">Não informado</option><option value="SUL">Sul</option><option value="NORDESTE">Nordeste</option></select></label>
 <label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>Situação da montagem<select value={form.status_montagem} onChange={e=>setForm(x=>({...x,status_montagem:e.target.value}))}>{[["","Não informada"],["PENDENTE","Pendente"],["AGUARDANDO","Aguardando"],["EM_ANDAMENTO","Em andamento"],["CONCLUIDA","Concluída"],["NAO_APLICAVEL","Não aplicável"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 {field("data_montagem","Data da montagem","date")}{field("previsao_saida","Previsão de saída","date")}{field("previsao_informada","Previsão informada ao cliente","date")}
 {field("volume_m3","Volume (m³)","number")}{field("peso_kg","Peso (kg)","number")}
 {field("transportadora","Transportadora")}{field("nota_fiscal","Nota fiscal")}{field("local_montagem","Local de montagem")}{field("data_saida","Data de saída","date")}{field("previsao_entrega","Previsão de entrega","date")}{field("data_entrega","Data efetiva da entrega","date")}
 </div><label style={{display:"grid",gap:6,marginTop:14,fontWeight:700,fontSize:12}}>Observações<textarea rows={3} value={form.observacao} onChange={e=>setForm(x=>({...x,observacao:e.target.value}))}/></label><div className="industrial-actions"><button className="industrial-btn primary" onClick={save} disabled={busy}>{busy?"Salvando…":"Salvar controle"}</button><button className="industrial-btn" onClick={()=>setSelected(null)}>Cancelar</button></div><p className="industrial-helper">Este registro logístico não altera apontamentos, quantidade de peças, OFs ou romaneios.</p></section>}
 </div>
}