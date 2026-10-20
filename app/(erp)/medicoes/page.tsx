"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ClipboardCheck, Clock3, FilePlus2, Plus, RefreshCw, Ruler, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useOps } from "@/components/operational-provider";
import { Badge, Empty, PageHeader } from "@/components/ui";

type Dimensao = { nome: string; valor: string | number; unidade: string };
type Item = { item: string; tipoProduto: string; descricao: string; quantidade: string | number; dimensoes: Dimensao[]; ferragens: string; restricoesInstalacao: string; observacoes: string };
type Pedido = { pedido: string; cliente: string; representante: string; medicao_obrigatoria: boolean; versao?: number; medicao_id?: string; status?: string; data_medicao?: string; itens?: Item[]; observacoes?: string; pendencias?: string; medido_por?: string; conferido_por?: string; conferido_em?: string; aprovado_por?: string; aprovado_em?: string };
type Evento = { id: number; medicao_id: string; pedido: string; tipo: string; descricao: string; usuario: string; criado_em: string; antes?: unknown; depois?: unknown };
type Historico = { id: string; pedido: string; versao: number; status: string; data_medicao: string; itens: Item[]; criado_por: string; criado_em: string; medido_por: string; aprovado_por: string; aprovado_em: string | null; pendencias: string };
type Draft = { pedido: string; dataMedicao: string; observacoes: string; itens: Item[] };

const labels: Record<string,string> = { AGUARDANDO_CONFERENCIA:"Aguardando conferência", COM_PENDENCIAS:"Com pendências", AGUARDANDO_APROVACAO:"Aguardando aprovação", APROVADA_PARA_PRODUCAO:"Aprovada para produção" };
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const statusTone = (status?: string) => status === "APROVADA_PARA_PRODUCAO" ? "success" : status === "COM_PENDENCIAS" ? "warning" : "info";
const itemVazio = (): Item => ({ item:"", tipoProduto:"", descricao:"", quantidade:"1", dimensoes:[{ nome:"", valor:"", unidade:"mm" }], ferragens:"", restricoesInstalacao:"", observacoes:"" });
const dataPt = (value?: string | null) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export default function MedicoesPage() {
  const { me } = useOps();
  const podeGravar = ["PCP","GERENTE","COMERCIAL"].includes(me?.perfil || "");
  const podeAprovar = ["PCP","GERENTE","ENCARREGADO"].includes(me?.perfil || "");
  const [pedidos,setPedidos] = useState<Pedido[]>([]);
  const [eventos,setEventos] = useState<Evento[]>([]);
  const [historico,setHistorico] = useState<Historico[]>([]);
  const [selecionado,setSelecionado] = useState("");
  const [busca,setBusca] = useState("");
  const [loading,setLoading] = useState(true);
  const [salvando,setSalvando] = useState(false);
  const [erro,setErro] = useState("");
  const [aviso,setAviso] = useState("");
  const [novo,setNovo] = useState(false);
  const [draft,setDraft] = useState<Draft>({ pedido:"", dataMedicao:hoje(), observacoes:"", itens:[itemVazio()] });
  const [pendencias,setPendencias] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const response = await fetch("/api/medicoes", { cache:"no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar medições.");
      setPedidos(result.pedidos || []); setEventos(result.eventos || []); setHistorico(result.historico || []);
      setSelecionado((current) => current || result.pedidos?.[0]?.pedido || "");
    } catch (error) { setErro(error instanceof Error ? error.message : "Falha ao carregar medições."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  const pedidoAtual = pedidos.find((item) => item.pedido === selecionado);
  const revisoesPedido = historico.filter((item) => item.pedido === selecionado).sort((a,b) => b.versao-a.versao);
  const eventosPedido = eventos.filter((item) => item.pedido === selecionado).sort((a,b) => new Date(b.criado_em).getTime()-new Date(a.criado_em).getTime());
  const filtrados = useMemo(() => pedidos.filter((item) => [item.pedido,item.cliente,item.representante,item.status]
    .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR")))), [pedidos,busca]);

  function criarRevisao() {
    if (!pedidoAtual) return;
    setErro(""); setAviso(""); setPendencias("");
    const itens = pedidoAtual.itens?.length ? pedidoAtual.itens.map((item) => ({ ...item, dimensoes:item.dimensoes.map((dimension) => ({ ...dimension })) })) : [itemVazio()];
    setDraft({ pedido:pedidoAtual.pedido, dataMedicao:hoje(), observacoes:pedidoAtual.observacoes || "", itens });
    setNovo(true);
  }

  function mudarItem(index: number, patch: Partial<Item>) {
    setDraft((current) => ({ ...current, itens:current.itens.map((item,i) => i===index ? { ...item, ...patch } : item) }));
  }
  function mudarDimensao(itemIndex: number, dimensionIndex: number, patch: Partial<Dimensao>) {
    setDraft((current) => ({ ...current, itens:current.itens.map((item,i) => i!==itemIndex ? item : { ...item, dimensoes:item.dimensoes.map((dimension,j) => j===dimensionIndex ? { ...dimension,...patch } : dimension) }) }));
  }

  async function salvar(event: React.FormEvent) {
    event.preventDefault(); setSalvando(true); setErro(""); setAviso("");
    try {
      const response = await fetch("/api/medicoes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...draft, versaoEsperada:pedidoAtual?.versao || 0 }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar a revisão.");
      setAviso(`Medição do pedido ${draft.pedido} registrada na revisão ${result.item.versao}.`); setNovo(false); await carregar();
    } catch (error) { setErro(error instanceof Error ? error.message : "Falha ao registrar medição."); }
    finally { setSalvando(false); }
  }

  async function acao(acao: string, extra: Record<string,unknown> = {}) {
    if (!pedidoAtual?.medicao_id) return;
    setSalvando(true); setErro(""); setAviso("");
    try {
      const response = await fetch("/api/medicoes", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:pedidoAtual.medicao_id, acao, ...extra }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "A etapa técnica não foi salva.");
      setAviso(`Pedido ${pedidoAtual.pedido}: ${labels[result.item.status] || result.item.status}.`); setPendencias(""); await carregar();
    } catch (error) { setErro(error instanceof Error ? error.message : "Falha ao atualizar etapa."); }
    finally { setSalvando(false); }
  }

  return <div className="med-page">
    <PageHeader eyebrow="Operação técnica" title="Medições industriais" description="Revisões dimensionais vinculadas ao cliente e pedido, com conferência e aprovação rastreáveis." actions={<button onClick={() => void carregar()} disabled={loading}><RefreshCw className={loading?"spin":""}/> Atualizar</button>} />
    {erro && <p className="med-message error" role="alert"><AlertCircle size={16}/>{erro}</p>}
    {aviso && <p className="med-message success" role="status"><Check size={16}/>{aviso}</p>}
    <div className="med-workspace">
      <aside className="med-order-list">
        <div className="med-list-head"><b>Pedidos vinculados</b><span>{filtrados.length}</span></div>
        <label className="med-search"><Search size={16}/><input value={busca} onChange={(event)=>setBusca(event.target.value)} placeholder="Pedido, cliente, responsável"/></label>
        <div className="med-orders">{filtrados.map((item)=><button type="button" key={item.pedido} className={selecionado===item.pedido?"active":""} onClick={()=>{setSelecionado(item.pedido);setNovo(false);setErro("");}}>
          <b>Pedido {item.pedido}</b><small>{item.cliente}</small><span>{item.medicao_obrigatoria?"Medição obrigatória":"Medição disponível"}</span>
          {item.status?<Badge tone={statusTone(item.status)}>{labels[item.status]||item.status}</Badge>:<small>Aguardando primeira medição</small>}
        </button>)}{!filtrados.length&&!loading&&<Empty title="Nenhum pedido vinculado" sub="Vincule o pedido a um cliente central no CRM para iniciar medições."/>}</div>
      </aside>

      <section className="med-detail">
        {!pedidoAtual ? <Empty title="Selecione um pedido" sub="As medições aparecem quando o pedido está vinculado ao cadastro central."/> : <>
          <header className="med-detail-head"><div><span>CLIENTE · {pedidoAtual.cliente}</span><h2>Pedido {pedidoAtual.pedido}</h2><p>Representante: {pedidoAtual.representante||"Não atribuído"} · {pedidoAtual.medicao_obrigatoria?"Requisito técnico obrigatório":"Medição facultativa"}</p></div>
            {podeGravar&&<button className="primary" onClick={criarRevisao}><FilePlus2 size={16}/>{pedidoAtual.versao?`Nova revisão v${pedidoAtual.versao+1}`:"Registrar medição"}</button>}
          </header>
          {pedidoAtual.medicao_id&&<section className="med-summary"><div><small>Revisão atual</small><b>v{pedidoAtual.versao}</b></div><div><small>Data da medição</small><b>{dataPt(pedidoAtual.data_medicao)}</b></div><div><small>Medido por</small><b>{pedidoAtual.medido_por}</b></div><div><small>Status técnico</small><Badge tone={statusTone(pedidoAtual.status)}>{labels[pedidoAtual.status||""]||pedidoAtual.status}</Badge></div></section>}
          {pedidoAtual.pendencias&&<p className="med-message warning"><AlertCircle size={16}/><span><b>Pendências:</b> {pedidoAtual.pendencias}</span></p>}
          {pedidoAtual.observacoes&&<p className="med-observations"><b>Observações da revisão</b><br/>{pedidoAtual.observacoes}</p>}
          {pedidoAtual.medicao_id&&<section className="med-actions">
            {pedidoAtual.status==="AGUARDANDO_CONFERENCIA"&&podeGravar&&<><label className="med-pendencia-field">Registrar pendências<textarea value={pendencias} onChange={(event)=>setPendencias(event.target.value)} placeholder="Descreva o que precisa ser corrigido ou confirmado"/></label><button className="med-secondary" disabled={salvando||!pendencias.trim()} onClick={()=>void acao("REGISTRAR_PENDENCIAS",{pendencias})}>Registrar pendências</button><button className="primary" disabled={salvando} onClick={()=>void acao("SOLICITAR_APROVACAO") }><ClipboardCheck size={15}/>Solicitar aprovação técnica</button></>}
            {pedidoAtual.status==="AGUARDANDO_APROVACAO"&&podeAprovar&&<button className="primary" disabled={salvando} onClick={()=>void acao("APROVAR")}><ShieldCheck size={15}/>Aprovar para produção</button>}
          </section>}
          {!!pedidoAtual.itens?.length&&<section className="med-items"><h3>Itens e dimensões · revisão v{pedidoAtual.versao}</h3><div className="med-items-grid">{pedidoAtual.itens.map((item,index)=><article key={`${item.item}-${index}`}><header><div><span>{item.tipoProduto||"Item medido"}</span><b>{item.descricao}</b></div><Badge>{item.quantidade} un.</Badge></header><dl>{item.dimensoes.map((dimension,dimensionIndex)=><div key={dimensionIndex}><dt>{dimension.nome}</dt><dd>{dimension.valor} {dimension.unidade}</dd></div>)}</dl>{item.ferragens&&<p><b>Ferragens:</b> {item.ferragens}</p>}{item.restricoesInstalacao&&<p><b>Instalação:</b> {item.restricoesInstalacao}</p>}{item.observacoes&&<p><b>Observações:</b> {item.observacoes}</p>}</article>)}</div></section>}
          <section className="med-history"><h3>Revisões e eventos</h3>{revisoesPedido.length?revisoesPedido.map((revision)=><article key={revision.id}><span>v{revision.versao}</span><div><b>{labels[revision.status]||revision.status}</b><small>{dataPt(revision.data_medicao)} · {revision.medido_por} · registrada {new Date(revision.criado_em).toLocaleString("pt-BR")}</small>{revision.aprovado_em&&<small>Aprovada por {revision.aprovado_por} em {new Date(revision.aprovado_em).toLocaleString("pt-BR")}</small>}{revision.pendencias&&<small>Pendências: {revision.pendencias}</small>}</div></article>):<p className="med-muted">Nenhuma revisão registrada.</p>}
            {eventosPedido.slice(0,20).map((event)=><article key={`event-${event.id}`}><Clock3 size={16}/><div><b>{event.tipo.replaceAll("_"," ")}</b><small>{event.descricao} · {event.usuario} · {new Date(event.criado_em).toLocaleString("pt-BR")}</small></div></article>)}
          </section>
        </>}
      </section>
    </div>

    {novo&&pedidoAtual&&<div className="med-shade" onMouseDown={(event)=>{if(event.target===event.currentTarget)setNovo(false);}}><form className="med-modal" onSubmit={(event)=>void salvar(event)}>
      <header><div><span>PEDIDO {draft.pedido} · NOVA VERSÃO</span><h2>{pedidoAtual.versao?`Medição v${pedidoAtual.versao+1}`:"Nova medição"}</h2><p>Dimensões configuráveis por item. Revisões existentes não são sobrescritas.</p></div><button type="button" className="med-icon" aria-label="Fechar" onClick={()=>setNovo(false)}><X size={18}/></button></header>
      <div className="med-modal-body"><label className="med-field">Data da medição<input type="date" required value={draft.dataMedicao} onChange={(event)=>setDraft((current)=>({...current,dataMedicao:event.target.value}))}/></label>
        {draft.itens.map((item,index)=><section className="med-item-editor" key={index}><header><b>Item {index+1}</b>{draft.itens.length>1&&<button type="button" className="med-icon" title="Remover item" onClick={()=>setDraft((current)=>({...current,itens:current.itens.filter((_,i)=>i!==index)}))}><Trash2 size={15}/></button>}</header>
          <div className="med-form-grid"><label className="med-field">Item / código<input value={item.item} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,item:event.target.value}:row)}))}/></label><label className="med-field">Tipo de produto<input value={item.tipoProduto} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,tipoProduto:event.target.value}:row)}))}/></label><label className="med-field med-wide">Descrição *<input required value={item.descricao} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,descricao:event.target.value}:row)}))}/></label><label className="med-field">Quantidade *<input required type="number" min="0.001" step="0.001" value={item.quantidade} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,quantidade:event.target.value}:row)}))}/></label></div>
          <div className="med-dimensions"><div className="med-section-title"><b>Dimensões e unidades</b><button type="button" className="med-secondary" onClick={()=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,dimensoes:[...row.dimensoes,{nome:"",valor:"",unidade:"mm"}]}:row)}))}><Plus size={14}/>Dimensão</button></div>
            {item.dimensoes.map((dimension,dimensionIndex)=><div className="med-dimension-row" key={dimensionIndex}><input aria-label="Nome da dimensão" required placeholder="Ex.: Altura, largura, profundidade" value={dimension.nome} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,dimensoes:row.dimensoes.map((d,j)=>j===dimensionIndex?{...d,nome:event.target.value}:d)}:row)}))}/><input aria-label="Valor da dimensão" required type="number" min="0.001" step="0.001" value={dimension.valor} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,dimensoes:row.dimensoes.map((d,j)=>j===dimensionIndex?{...d,valor:event.target.value}:d)}:row)}))}/><select aria-label="Unidade da dimensão" value={dimension.unidade} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,dimensoes:row.dimensoes.map((d,j)=>j===dimensionIndex?{...d,unidade:event.target.value}:d)}:row)}))}>{["mm","cm","m","pol","un","grau"].map((unit)=><option key={unit}>{unit}</option>)}</select>{item.dimensoes.length>1&&<button type="button" className="med-icon" title="Remover dimensão" onClick={()=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,dimensoes:row.dimensoes.filter((_,j)=>j!==dimensionIndex)}:row)}))}><X size={14}/></button>}</div>)}
          </div>
          <div className="med-form-grid"><label className="med-field med-wide">Ferragens<textarea value={item.ferragens} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,ferragens:event.target.value}:row)}))}/></label><label className="med-field med-wide">Restrições de instalação<textarea value={item.restricoesInstalacao} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,restricoesInstalacao:event.target.value}:row)}))}/></label><label className="med-field med-wide">Observações do item<textarea value={item.observacoes} onChange={(event)=>setDraft((current)=>({...current,itens:current.itens.map((row,i)=>i===index?{...row,observacoes:event.target.value}:row)}))}/></label></div>
        </section>)}
        <button type="button" className="med-secondary" onClick={()=>setDraft((current)=>({...current,itens:[...current.itens,itemVazio()]}))}><Plus size={15}/>Adicionar item</button>
        <label className="med-field">Observações gerais<textarea value={draft.observacoes} onChange={(event)=>setDraft((current)=>({...current,observacoes:event.target.value}))}/></label>
      </div>
      <footer><button type="button" className="med-secondary" onClick={()=>setNovo(false)}>Cancelar</button><button className="primary" disabled={salvando}>{salvando?"Salvando...":"Salvar revisão"}</button></footer>
    </form></div>}
  </div>;
}