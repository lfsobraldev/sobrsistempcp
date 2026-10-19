"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ClipboardList,RefreshCw,Truck,Search,CalendarClock,PackageCheck,UploadCloud,FileSpreadsheet,Download} from "lucide-react";
import {exportarExcel} from "@/lib/export";
import ComercialEspecificacoes from "@/components/comercial-especificacoes";
import ApontamentoProducaoResumo from "@/components/apontamento-producao-resumo";
import {useOps} from "@/components/operational-provider";
type Entrega={transportadora:string;nota_fiscal:string;data_saida:string|null;previsao_entrega:string|null;data_entrega:string|null;status:string;local_montagem:string;observacao:string;cliente:string;representante:string;tipo_pedido:string;colecao:string;status_ferragens:string;uf:string;cidade:string;tipo_frete:string;origem_unidade:string;destino_unidade:string;pedido_sul:string;status_montagem:string;data_montagem:string|null;previsao_saida:string|null;volume_m3:string|number|null;peso_kg:string|number|null;previsao_informada:string|null};
type Etapa={pedido:string;area:string;etapa:string;data_inicio:string|null;data_conclusao:string|null;status:string;observacao:string};
type Carga={id:string;pedido:string;romaneio:string;quantidade:number;volume_m3:number|null;nota_fiscal:string;transportadora:string;data_saida:string|null;data_entrega:string|null;status:string};
type RegraPrazo={id:number;uf:string;cidade:string;faixa_ate_10:number;faixa_10_20:number;faixa_acima_20:number};
type Importacao={previa?:boolean;ok?:boolean;repetido?:boolean;totalNaPlanilha:number;correspondentes:number;foraDaProgramacao:number;linhasPorAba:Record<string,number>;amostra?:{pedido:string;cliente:string}[];naoEncontrados?:string[];atualizados?:number;datasDetectadas?:number;datasAtualizadas?:number;datasIgnoradas?:number};
type Evento={pedido:string;tipo:string;usuario:string;criado_em:string};
type Pedido={pedido:string;linhas:number;ofs:number;pecas:number;percentual:number;entrega:Entrega|null};
const PROCESSOS:Record<string,{area:string;campos:[string,string][]}>={
 SUL:{area:"PRODUCAO_SUL",campos:[["LIBERACAO","Liberação Sul"],["APONTAMENTO_SUL","Apontamento Sul"],["DISPONIVEL_EXPEDICAO","Disponível na expedição"],["CARREGAMENTO_SUL","Carregamento Sul"],["SAIDA_SUL","Saída do Sul"],["CHEGADA_NORDESTE","Chegada ao Nordeste"]]},
 APONTAMENTO:{area:"PRODUCAO",campos:[["PREPARACAO","Preparação"],["COLAGEM_PORTAS","Colagem de portas"],["ESQUADRIAS_BORDAS","Esquadrias de bordas"],["RECOBRIDORA_PERFIL","Recobridora de perfil"],["USINAGEM_2","Usinagem 2"],["LUSTRACAO","Lustração"],["CNC","CNC"],["USINAGEM","Usinagem"],["PLASTIFICADORA","Plastificadora de perfil"],["EMBALAGEM","Embalagem"],["EXPEDICAO","Expedição"]]},
 MONTAGEM:{area:"MONTAGEM",campos:[["FINALIZACAO","Finalização da produção"],["TRANSPORTE_REDESPACHO","Transporte / redespacho"],["INICIO_MONTAGEM","Início da montagem"],["FIM_MONTAGEM","Conclusão da montagem"]]},
 LOGISTICA:{area:"LOGISTICA",campos:[["DISPONIVEL_EXPEDICAO","Disponível na expedição"],["FATURAMENTO","Faturamento"],["CARREGAMENTO","Carregamento"],["SAIDA_EXPEDICAO","Saída da expedição"],["ENTREGA_CLIENTE","Entrega ao cliente"]]}
};
const ABAS=[["PAINEL","Painel de Entregas"],["COMERCIAL","Comercial"],["PCP","PCP"],["SUL","Produção Sul"],["APONTAMENTO","Apontamento Produção"],["MONTAGEM","Montagem e Redespacho"],["LOGISTICA","Logística"],["FICHA","Ficha do Pedido"],["HISTORICO","Histórico"],["CLASSIFICACAO","Classificação e Prazos"]] as const;
const statuses=[["PLANEJADO","Planejado"],["EM_PRODUCAO","Em produção"],["AGUARDANDO_MONTAGEM","Aguardando montagem"],["PRONTO_EXPEDICAO","Pronto para expedição"],["EM_TRANSITO","Em trânsito"],["ENTREGA_PARCIAL","Entrega parcial"],["ENTREGUE","Entregue"],["PENDENCIA","Pendência"]];
const vazio:Entrega={transportadora:"",nota_fiscal:"",data_saida:null,previsao_entrega:null,data_entrega:null,status:"PLANEJADO",local_montagem:"",observacao:"",cliente:"",representante:"",tipo_pedido:"",colecao:"",status_ferragens:"",uf:"",cidade:"",tipo_frete:"",origem_unidade:"",destino_unidade:"",pedido_sul:"",status_montagem:"",data_montagem:null,previsao_saida:null,volume_m3:null,peso_kg:null,previsao_informada:null};
export default function GestaoPedidos(){
 const {me}=useOps();
 const [etapas,setEtapas]=useState<Etapa[]>([]),[pedidoEtapa,setPedidoEtapa]=useState(""),[tipoEtapa,setTipoEtapa]=useState(""),[inicioEtapa,setInicioEtapa]=useState(""),[fimEtapa,setFimEtapa]=useState(""),[statusEtapa,setStatusEtapa]=useState("PENDENTE"),[obsEtapa,setObsEtapa]=useState(""),[salvandoEtapa,setSalvandoEtapa]=useState(false);
 const [cargas,setCargas]=useState<Carga[]>([]),[novaCarga,setNovaCarga]=useState({pedido:"",romaneio:"",quantidade:"",volumeM3:"",notaFiscal:"",transportadora:"",dataSaida:"",dataEntrega:"",status:"PROGRAMADO",observacao:""}),[salvandoCarga,setSalvandoCarga]=useState(false);
 const [arquivo,setArquivo]=useState<File|null>(null),[googleSheetUrl,setGoogleSheetUrl]=useState(""),[programacaoId,setProgramacaoId]=useState(""),[preImport,setPreImport]=useState<Importacao|null>(null),[importando,setImportando]=useState(false);
 const [regras,setRegras]=useState<RegraPrazo[]>([]),[regra,setRegra]=useState({uf:"",cidade:"",ate10:"",de10a20:"",acima20:""}),[salvandoPrazo,setSalvandoPrazo]=useState(false);
 const [aba,setAba]=useState<string>("PAINEL");const [novo,setNovo]=useState(false);const [numeroNovo,setNumeroNovo]=useState(""); const [setor,setSetor]=useState("TODOS");const [eventos,setEventos]=useState<Evento[]>([]);const [rows,setRows]=useState<Pedido[]>([]),[filtro,setFiltro]=useState(""),[query,setQuery]=useState(""),[statusFiltro,setStatusFiltro]=useState("TODOS"),[selected,setSelected]=useState<Pedido|null>(null),[form,setForm]=useState<Entrega>(vazio),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[erro,setErro]=useState(""),[ok,setOk]=useState("");
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch("/api/controle-entregas",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Falha ao carregar");setRows(j.pedidos||[]);setEventos(j.eventos||[]);setFiltro(j.filtro||"");setProgramacaoId(String(j.programacaoId||""));}catch(e){setErro(e instanceof Error?e.message:"Falha ao carregar")}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(aba==="CLASSIFICACAO")void fetch("/api/controle-entregas/prazos").then(r=>r.json()).then(j=>{if(j.regras)setRegras(j.regras)}).catch(()=>{})},[aba]);
 useEffect(()=>{if(aba==="LOGISTICA")void fetch("/api/controle-entregas/carregamentos").then(r=>r.json()).then(j=>{if(j.cargas)setCargas(j.cargas)}).catch(()=>{})},[aba]);
 useEffect(()=>{if(PROCESSOS[aba])void fetch("/api/controle-entregas/etapas").then(r=>r.json()).then(j=>{if(j.etapas)setEtapas(j.etapas)}).catch(()=>{})},[aba]);
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
 async function save(){if(!selected)return;setBusy(true);setErro("");setOk("");try{const response=await fetch("/api/controle-entregas",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(Object.entries({...form,pedido:selected.pedido}).filter(([k])=>!["COMERCIAL","LOGISTICA"].includes(me?.perfil||"")||k==="pedido"||(me?.perfil==="COMERCIAL"?["cliente","representante","tipo_pedido","colecao","status_ferragens","uf","cidade","previsao_informada"]:["transportadora","nota_fiscal","tipo_frete","data_saida","previsao_entrega","data_entrega","previsao_saida","peso_kg","volume_m3","status"]).includes(k))))});const j=await response.json();if(!response.ok)throw Error(j.error||"Não foi possível salvar");setOk("Dados de entrega atualizados.");setSelected(null);await load();}catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar")}finally{setBusy(false)}}
 async function exportarGeral(){
  setErro("");setOk("");
  try{
   const [pedidosResp,etapasResp,cargasResp,prazosResp]=await Promise.all([
    fetch("/api/controle-entregas",{cache:"no-store"}),fetch("/api/controle-entregas/etapas",{cache:"no-store"}),fetch("/api/controle-entregas/carregamentos",{cache:"no-store"}),fetch("/api/controle-entregas/prazos",{cache:"no-store"})
   ]);
   const [pj,ej,cj,rj]=await Promise.all([pedidosResp.json(),etapasResp.json(),cargasResp.json(),prazosResp.json()]);
   if(!pedidosResp.ok||!etapasResp.ok)throw new Error(pj.error||ej.error||"Não foi possível ler todos os dados.");
   const lista=(pj.pedidos||[]) as Pedido[], etapasTodas=(ej.etapas||[]) as Etapa[], cargasTodas=(cj.cargas||[]) as Carga[], regrasTodas=(rj.regras||[]) as RegraPrazo[];
   const data=(v:any)=>v||"";
   await exportarExcel([
    {nome:"Pedidos e Clientes",linhas:lista.map(p=>({Pedido:p.pedido,Cliente:p.entrega?.cliente||"",Representante:p.entrega?.representante||"",Tipo:p.entrega?.tipo_pedido||"",Colecao:p.entrega?.colecao||"",Ferragens:p.entrega?.status_ferragens||"",UF:p.entrega?.uf||"",Cidade:p.entrega?.cidade||"",TipoFrete:p.entrega?.tipo_frete||"",Origem:p.entrega?.origem_unidade||"",Destino:p.entrega?.destino_unidade||"",PedidoSul:p.entrega?.pedido_sul||"",LocalMontagem:p.entrega?.local_montagem||"",Transportadora:p.entrega?.transportadora||"",NotaFiscal:p.entrega?.nota_fiscal||"",DataSaida:data(p.entrega?.data_saida),PrevisaoEntrega:data(p.entrega?.previsao_entrega),DataEntrega:data(p.entrega?.data_entrega),Status:p.entrega?.status||"PLANEJADO",OFs:p.ofs,Pecas:p.pecas,AvancoPCP:p.percentual,VolumeM3:p.entrega?.volume_m3??"",PesoKg:p.entrega?.peso_kg??"",Observacoes:p.entrega?.observacao||""}))},
    {nome:"Apontamentos",linhas:etapasTodas.map(e=>({Pedido:e.pedido,Area:e.area,Etapa:e.etapa,"Data de início":data(e.data_inicio),"Data de conclusão":data(e.data_conclusao),Situacao:e.status,Observacao:e.observacao||"",Responsavel:(e as any).usuario||""}))},
    {nome:"Logistica",linhas:cargasTodas.map(c=>({Pedido:c.pedido,Romaneio:c.romaneio||"",Quantidade:c.quantidade,VolumeM3:c.volume_m3??"",NotaFiscal:c.nota_fiscal||"",Transportadora:c.transportadora||"",DataSaida:data(c.data_saida),DataEntrega:data(c.data_entrega),Situacao:c.status}))},
    {nome:"Classificacao Prazos",linhas:regrasTodas.map(r=>({UF:r.uf,Cidade:r.cidade,Ate10m3Dias:r.faixa_ate_10,De10a20m3Dias:r.faixa_10_20,Acima20m3Dias:r.faixa_acima_20}))},
    {nome:"Historico",linhas:eventos.map(e=>({Pedido:e.pedido,Movimentacao:e.tipo,Responsavel:e.usuario,DataHora:e.criado_em}))}
   ],"Sobrsistem_Gestao_Pedidos_Entregas");
   setOk("Exportação geral concluída. A planilha inclui pedidos, clientes, apontamentos, logística, prazos e histórico.");
  }catch(e){setErro(e instanceof Error?e.message:"Falha ao exportar a planilha geral.")}
 }
 async function importar(aplicar:boolean){
 if(!arquivo)return;setImportando(true);setErro("");setOk("");
 try{const fd=new FormData();if(arquivo)fd.append("arquivo",arquivo);fd.append("url",googleSheetUrl.trim());fd.append("programacaoId",programacaoId);fd.append("aplicar",String(aplicar));const response=await fetch("/api/controle-entregas/importar",{method:"POST",body:fd});const j=await response.json();if(!response.ok)throw Error(j.error||"Falha ao importar");setPreImport(j);if(aplicar){setOk(j.repetido?"Esta planilha já havia sido importada. Nenhuma alteração foi repetida.":`Importação concluída: ${j.atualizados||0} cadastro(s) enriquecido(s), ${j.datasAtualizadas||0} data(s) preenchida(s) e ${j.datasIgnoradas||0} data(s) ignorada(s). Datas já lançadas pelos líderes foram preservadas.`);await load();}}
 catch(e){setErro(e instanceof Error?e.message:"Erro ao importar")}finally{setImportando(false)}
 }
  async function salvarEtapa(){
  const cfg=PROCESSOS[aba];if(!cfg||!pedidoEtapa||!tipoEtapa)return;
  setSalvandoEtapa(true);setErro("");setOk("");
  try{
   const r=await fetch("/api/controle-entregas/etapas",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({pedido:pedidoEtapa,area:cfg.area,etapa:tipoEtapa,dataInicio:inicioEtapa,dataConclusao:fimEtapa,status:statusEtapa,observacao:obsEtapa})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Falha ao salvar etapa");
   setOk("Etapa operacional atualizada.");const x=await fetch("/api/controle-entregas/etapas").then(t=>t.json());setEtapas(x.etapas||[]);
  }catch(e){setErro(e instanceof Error?e.message:"Falha ao registrar etapa")}finally{setSalvandoEtapa(false)}
 }
 async function salvarCarga(){
  setSalvandoCarga(true);setErro("");setOk("");
  try{
   const r=await fetch("/api/controle-entregas/carregamentos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(novaCarga)});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Não foi possível salvar carregamento");
   setOk("Carregamento salvo e vinculado ao pedido.");
   setNovaCarga({pedido:"",romaneio:"",quantidade:"",volumeM3:"",notaFiscal:"",transportadora:"",dataSaida:"",dataEntrega:"",status:"PROGRAMADO",observacao:""});
   const x=await fetch("/api/controle-entregas/carregamentos").then(v=>v.json());setCargas(x.cargas||[]);
   await load();
  }catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar carregamento")}finally{setSalvandoCarga(false)}
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
 <div className="industrial-panel-title"><h2>Importar / Exportar planilha geral</h2><button type="button" className="industrial-btn" onClick={()=>void exportarGeral()}><Download size={16}/> Exportar Excel completo</button></div><span style={{display:"block",fontSize:12,color:"#5f6d74",marginBottom:10}}>Exporta os dados atuais do sistema em várias abas, incluindo pedidos, clientes, apontamentos, logística, prazos e histórico.</span>
 <p style={{fontSize:13,color:"#5f6d74",marginBottom:14}}>Importe diretamente o link do Google Sheets ou selecione um arquivo Excel. A prévia lê as abas da planilha; na confirmação, os campos cadastrais vazios são completados e as datas de etapas são vinculadas ao pedido e à programação selecionada. Datas já lançadas pelos líderes nunca são substituídas.</p>
 <div className="file-upload-layout file-upload-layout-compact">
   <div className="file-upload-control">
    <label style={{display:"grid",gap:6,marginBottom:12,fontSize:12,fontWeight:700}}>Link do Google Sheets<input type="url" value={googleSheetUrl} onChange={e=>{setGoogleSheetUrl(e.target.value);setPreImport(null)}} placeholder="https://docs.google.com/spreadsheets/d/..." disabled={importando} style={{width:"100%",minWidth:0}}/><small style={{fontWeight:400,color:"#5f6d74"}}>A planilha precisa permitir leitura pelo link para o sistema exportar todas as abas.</small></label>
    <input id="entregas-file-input" className="file-upload-input" type="file" accept=".xlsx" disabled={importando} onChange={e=>{setArquivo(e.target.files?.[0]||null);setPreImport(null)}} aria-label="Planilha antiga de controle de entregas"/>
    <label htmlFor="entregas-file-input" className={`file-upload-dropzone ${importando ? "is-disabled" : ""}`}>
     <span className="file-upload-icon"><UploadCloud size={21}/></span>
     <span className="file-upload-copy"><strong>{arquivo ? "Arquivo selecionado" : "Selecione a planilha de entregas"}</strong><small>{arquivo ? arquivo.name : "Clique para procurar o arquivo Excel no computador"}</small></span>
     <span className="file-upload-action">{arquivo ? "Trocar arquivo" : "Escolher arquivo"}</span>
    </label>
    <div className="file-upload-meta"><FileSpreadsheet size={14}/> Formato aceito: Excel (.xlsx) · confira a prévia antes de gravar</div>
   </div>
   <div className="file-upload-submit file-upload-submit-inline">
    <button disabled={(!arquivo&&!googleSheetUrl.trim())||importando} className="industrial-btn primary" onClick={()=>void importar(false)}>{importando?"Conferindo…":"Conferir planilha"}</button>
    <button disabled={!preImport?.previa||(!preImport.correspondentes&&!preImport.datasDetectadas)||importando} className="industrial-btn" onClick={()=>void importar(true)}>Confirmar importação</button>
   </div>
  </div>
 {preImport&&<div className="industrial-stats" style={{marginTop:14}}><div><small>Pedidos lidos</small><strong>{preImport.totalNaPlanilha}</strong></div><div><small>Datas detectadas</small><strong>{preImport.datasDetectadas??0}</strong></div><div><small>Cadastro(s) enriquecido(s)</small><strong>{preImport.atualizados??"—"}</strong></div><div><small>Datas preenchidas</small><strong>{preImport.datasAtualizadas??"—"}</strong></div></div>}{preImport&&Object.entries(preImport.linhasPorAba||{}).length>0&&<p style={{fontSize:12,color:"#5f6d74",marginTop:8}}>Abas lidas: {Object.entries(preImport.linhasPorAba).map(([aba,total])=>aba+": "+total).join(" · ")}</p>}
 </section>
  <div className="industrial-toolbar"><button className="industrial-btn primary" disabled={me?.perfil==="LIDER_ENTREGAS"} onClick={()=>{setNovo(true);setNumeroNovo("");setSelected(null)}}>+ Novo pedido comercial</button><Search size={19}/><input style={{flex:"2",minWidth:200}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar pedido, transportadora ou NF"/><select value={setor} onChange={e=>setSetor(e.target.value)}>{[["TODOS","Todas as áreas"],["COMERCIAL","Comercial"],["PCP","PCP / Produção"],["MONTAGEM","Montagem"],["LOGISTICA","Logística"],["ENTREGUE","Entregues"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><select value={statusFiltro} onChange={e=>setStatusFiltro(e.target.value)}><option value="TODOS">Todas as situações</option>{statuses.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><button className="industrial-btn" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Atualizar</button></div>
 {erro&&<p role="alert" className="industrial-error">{erro}</p>}{ok&&<p>{ok}</p>}
 {PROCESSOS[aba]&&aba!=="APONTAMENTO"&&<section className="industrial-panel">
 <div className="industrial-panel-title"><h2>Etapas de {ABAS.find(([id])=>id===aba)?.[1]}</h2><span>Datas e acompanhamento por pedido</span></div>
 {aba==="APONTAMENTO"&&<p style={{fontSize:13,marginBottom:13,color:"#62717a"}}>Marcos de acompanhamento desta área. Os percentuais oficiais continuam vindo dos apontamentos do Consistem; este cadastro não altera as OFs.</p>}
 <div className="industrial-toolbar">
 <label style={{display:"grid",gap:5}}><small>Pedido</small><select value={pedidoEtapa} onChange={e=>setPedidoEtapa(e.target.value)}><option value="">Selecionar pedido</option>{rows.map(p=><option key={p.pedido} value={p.pedido}>{p.pedido} — {p.entrega?.cliente||"Cliente não informado"}</option>)}</select></label>
 <label style={{display:"grid",gap:5}}><small>Etapa</small><select value={tipoEtapa} onChange={e=>setTipoEtapa(e.target.value)}><option value="">Selecionar etapa</option>{PROCESSOS[aba].campos.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label style={{display:"grid",gap:5}}><small>Início</small><input type="date" value={inicioEtapa} onChange={e=>setInicioEtapa(e.target.value)}/></label>
 <label style={{display:"grid",gap:5}}><small>Conclusão</small><input type="date" value={fimEtapa} onChange={e=>setFimEtapa(e.target.value)}/></label>
 <label style={{display:"grid",gap:5}}><small>Situação</small><select value={statusEtapa} onChange={e=>setStatusEtapa(e.target.value)}>{[["PENDENTE","Pendente"],["EM_ANDAMENTO","Em andamento"],["CONCLUIDA","Concluída"],["BLOQUEADA","Bloqueada"],["NAO_APLICAVEL","Não se aplica"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label style={{display:"grid",gap:5}}><small>Observações</small><input value={obsEtapa} onChange={e=>setObsEtapa(e.target.value)} placeholder="Ocorrência ou justificativa"/></label>
 <button className="industrial-btn primary" disabled={!pedidoEtapa||!tipoEtapa||salvandoEtapa} onClick={()=>void salvarEtapa()}>{salvandoEtapa?"Salvando…":"Registrar etapa"}</button>
 </div>
 <div className="industrial-table-wrap" style={{marginTop:12}}><table className="industrial-table"><thead><tr>{["Pedido","Etapa","Início","Conclusão","Situação","Observações","Editar"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{etapas.filter(e=>e.area===PROCESSOS[aba].area).map(e=><tr key={e.pedido+e.etapa}><td>{e.pedido}</td><td>{PROCESSOS[aba].campos.find(x=>x[0]===e.etapa)?.[1]||e.etapa}</td><td>{e.data_inicio||"—"}</td><td>{e.data_conclusao||"—"}</td><td>{e.status}</td><td>{e.observacao||"—"}</td><td><button className="industrial-btn" onClick={()=>{setPedidoEtapa(e.pedido);setTipoEtapa(e.etapa);setInicioEtapa(e.data_inicio||"");setFimEtapa(e.data_conclusao||"");setStatusEtapa(e.status);setObsEtapa(e.observacao||"")}}>Editar</button></td></tr>)}{!etapas.some(e=>e.area===PROCESSOS[aba].area)&&<tr><td colSpan={7}>Nenhuma etapa registrada nesta área.</td></tr>}</tbody></table></div>
 </section>}
  {aba==="LOGISTICA"&&<section className="industrial-panel">
 <div className="industrial-panel-title"><h2>Carregamentos e entregas parciais</h2><span>Registro independente por remessa</span></div>
 <p style={{marginBottom:12,color:"#60717b",fontSize:13}}>Cada carregamento pode ter quantidade, romaneio, transportadora, nota fiscal e datas diferentes. O histórico fica vinculado ao pedido e não é apagado quando outro filtro é importado.</p>
 <div className="industrial-toolbar">{([
 ["pedido","Pedido"],["romaneio","Romaneio / identificação"],["quantidade","Peças expedidas"],["volumeM3","Volume m³"],["notaFiscal","Nota fiscal"],["transportadora","Transportadora"],["dataSaida","Saída"],["dataEntrega","Entrega"]
 ] as const).map(([k,label])=><label key={k} style={{display:"grid",gap:5}}><small>{label}</small><input type={k==="quantidade"||k==="volumeM3"?"number":k.startsWith("data")?"date":"text"} value={novaCarga[k]} min={0} onChange={e=>setNovaCarga(v=>({...v,[k]:e.target.value}))} style={{width:k==="transportadora"?180:150}}/></label>)}
 <label style={{display:"grid",gap:5}}><small>Situação</small><select value={novaCarga.status} onChange={e=>setNovaCarga(v=>({...v,status:e.target.value}))}>{[["PROGRAMADO","Programado"],["EM_TRANSITO","Em trânsito"],["ENTREGUE","Entregue"],["CANCELADO","Cancelado"]].map(([k,t])=><option key={k} value={k}>{t}</option>)}</select></label>
 <button className="industrial-btn primary" disabled={salvandoCarga||!novaCarga.pedido||!novaCarga.quantidade} onClick={()=>void salvarCarga()}>{salvandoCarga?"Registrando…":"Registrar carregamento"}</button>
 </div>
 <div className="industrial-table-wrap" style={{marginTop:14}}><table className="industrial-table"><thead><tr>{["Pedido","Romaneio","Peças","Volume m³","Nota fiscal","Transportadora","Saída","Entrega","Situação"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{cargas.map(c=><tr key={c.id}><td>{c.pedido}</td><td>{c.romaneio||"—"}</td><td>{c.quantidade}</td><td>{c.volume_m3??"—"}</td><td>{c.nota_fiscal||"—"}</td><td>{c.transportadora||"—"}</td><td>{c.data_saida||"—"}</td><td>{c.data_entrega||"—"}</td><td>{c.status.replaceAll("_"," ")}</td></tr>)}{!cargas.length&&<tr><td colSpan={9}>Nenhum carregamento registrado ainda.</td></tr>}</tbody></table></div></section>}
  {aba==="COMERCIAL"&&<ComercialEspecificacoes pedidos={rows.map(p=>p.pedido)}/>}
 {aba==="CLASSIFICACAO"&&<section className="industrial-panel"><div className="industrial-panel-title"><h2>Classificação de destinos e prazos</h2><span>Cadastro persistente por UF, cidade e m³</span></div>
 <div className="industrial-toolbar">
 {(["uf","cidade","ate10","de10a20","acima20"] as const).map((k,i)=><label key={k} style={{display:"grid",gap:4}}><small>{["UF","Cidade","Até 10 m³ (dias)","De 10 a 20 m³ (dias)","Acima de 20 m³ (dias)"][i]}</small><input type={i<2?"text":"number"} min={0} max={365} value={regra[k]} onChange={e=>setRegra(v=>({...v,[k]:e.target.value}))} style={{width:i===1?195:140}}/></label>)}
 <button className="industrial-btn primary" onClick={()=>void salvarPrazo()} disabled={salvandoPrazo}>Salvar prazo</button>
 </div><div className="industrial-table-wrap" style={{marginTop:13}}><table className="industrial-table"><thead><tr><th>UF</th><th>Cidade</th><th>Até 10 m³</th><th>10 a 20 m³</th><th>Acima 20 m³</th><th>Ação</th></tr></thead><tbody>{regras.map(x=><tr key={x.id}><td>{x.uf}</td><td>{x.cidade}</td><td>{x.faixa_ate_10} dias</td><td>{x.faixa_10_20} dias</td><td>{x.faixa_acima_20} dias</td><td><button className="industrial-btn" onClick={()=>setRegra({uf:x.uf,cidade:x.cidade,ate10:String(x.faixa_ate_10),de10a20:String(x.faixa_10_20),acima20:String(x.faixa_acima_20)})}>Editar</button></td></tr>)}{!regras.length&&<tr><td colSpan={6}>Nenhum prazo cadastrado. Informe os valores confirmados pela logística.</td></tr>}</tbody></table></div></section>}
 {aba==="FICHA"&&<section className="industrial-panel"><div className="industrial-panel-title"><h2>Ficha do Pedido</h2></div><p>Selecione “Detalhes” em um pedido para abrir todas as informações comerciais, produtivas e logísticas na ficha.</p></section>}
 {aba==="APONTAMENTO"&&<ApontamentoProducaoResumo pedidos={visiveis}/>}
 {aba!=="APONTAMENTO"&&<section className="industrial-panel"><div className="industrial-panel-title"><h2>{ABAS.find(([id])=>id===aba)?.[1]||"Pedidos"}</h2><span>{visiveis.length} pedido(s) • clique em editar para atualizar</span></div>
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
 <td><button className="industrial-btn" onClick={()=>escolher(p)}>{me?.perfil==="LIDER_ENTREGAS"?"Visualizar":"Editar"}</button></td>
 </tr>)}{!visiveis.length&&<tr><td colSpan={9}>{loading?"Carregando pedidos…":"Nenhum pedido nesta área."}</td></tr>}</tbody>
 </table></div></section>}

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
 </div><label style={{display:"grid",gap:6,marginTop:14,fontWeight:700,fontSize:12}}>Observações<textarea rows={3} value={form.observacao} onChange={e=>setForm(x=>({...x,observacao:e.target.value}))}/></label><div className="industrial-actions"><button className="industrial-btn primary" onClick={save} disabled={busy||me?.perfil==="LIDER_ENTREGAS"}>{busy?"Salvando…":"Salvar controle"}</button><button className="industrial-btn" onClick={()=>setSelected(null)}>Cancelar</button></div><p className="industrial-helper">Este registro logístico não altera apontamentos, quantidade de peças, OFs ou romaneios.</p></section>}
 </div>
}