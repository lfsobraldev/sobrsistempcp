"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Empty, Field, PageHeader, Segmented } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { ORIGENS_CONTATO, STATUS_OPORTUNIDADE, STATUS_PROPOSTA } from "@/lib/comercial-crm";
import { AlertCircle, ArrowRightLeft, Building2, Check, CirclePlus, Clock3, FileText, Handshake, Pencil, Plus, RefreshCw, Search, UserRound, Users, X } from "lucide-react";

type Row = Record<string, any>;
type Editor = { kind: string; id?: string; clienteId?: string; oportunidadeId?: string; title: string; values: Record<string, any> };
type CrmData = { clientes: Row[]; contatos: Row[]; enderecos: Row[]; representantes: Row[]; vinculos: Row[]; oportunidades: Row[]; propostas: Row[]; interacoes: Row[]; historico: Row[] };
type ItemDraft = { descricao: string; quantidade: string; valorUnitario: string };

const ORIGENS_LABEL: Record<string, string> = { INDICACAO: "Indicação", CAMPANHA: "Campanha", SITE: "Site", PROSPECCAO: "Prospecção", EVENTO: "Evento", REPRESENTANTE: "Representante", OUTRO: "Outro" };
const OPORTUNIDADE_LABEL: Record<string, string> = { NOVA: "Nova", QUALIFICADA: "Qualificada", PROPOSTA: "Proposta", NEGOCIACAO: "Negociação", GANHA: "Ganha", PERDIDA: "Perdida", CONVERTIDA: "Convertida" };
const PROPOSTA_LABEL: Record<string, string> = { RASCUNHO: "Rascunho", ENVIADA: "Enviada", NEGOCIACAO: "Em negociação", ACEITA: "Aceita", RECUSADA: "Recusada", EXPIRADA: "Expirada" };
const OPORTUNIDADE_TRANSICOES: Record<string, string[]> = { NOVA: ["QUALIFICADA", "PERDIDA"], QUALIFICADA: ["PROPOSTA", "PERDIDA"], PROPOSTA: ["NEGOCIACAO", "PERDIDA"], NEGOCIACAO: ["PERDIDA"], GANHA: [], PERDIDA: ["NOVA"], CONVERTIDA: [] };
const PROPOSTA_TRANSICOES: Record<string, string[]> = { RASCUNHO: ["ENVIADA", "RECUSADA"], ENVIADA: ["NEGOCIACAO", "ACEITA", "RECUSADA", "EXPIRADA"], NEGOCIACAO: ["ACEITA", "RECUSADA", "EXPIRADA"], ACEITA: [], RECUSADA: [], EXPIRADA: [] };
const ORIGENS = ORIGENS_CONTATO.map((value) => ({ value, label: ORIGENS_LABEL[value] }));
const STATUS_OPPS = STATUS_OPORTUNIDADE.map((value) => ({ value, label: OPORTUNIDADE_LABEL[value] }));

const vazio: CrmData = { clientes: [], contatos: [], enderecos: [], representantes: [], vinculos: [], oportunidades: [], propostas: [], interacoes: [], historico: [] };
const dinheiro = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPt = (value: unknown) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export default function ComercialPage() {
  const { me } = useOps();
  const podeEditar = ["PCP", "GERENTE", "COMERCIAL"].includes(me?.perfil || "");
  const [dados, setDados] = useState<CrmData>(vazio);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [pedidoCriado, setPedidoCriado] = useState("");
  const [aba, setAba] = useState("OPORTUNIDADES");
  const [busca, setBusca] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [proposalItems, setProposalItems] = useState<ItemDraft[]>([{ descricao: "", quantidade: "1", valorUnitario: "" }]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const response = await fetch("/api/comercial/crm", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o CRM.");
      setDados({ ...vazio, ...result });
      setClienteSelecionado((current) => current || result.clientes?.[0]?.id || "");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao carregar o CRM.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const buscaNormalizada = busca.trim().toLocaleLowerCase("pt-BR");
  const oportunidades = useMemo(() => dados.oportunidades.filter((item) => [item.titulo, item.cliente_nome, item.representante_nome, item.origem, item.pedido].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(buscaNormalizada))), [dados.oportunidades, buscaNormalizada]);
  const clientes = useMemo(() => dados.clientes.filter((item) => [item.razao_social, item.nome_fantasia, item.documento, item.email, item.telefone].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(buscaNormalizada))), [dados.clientes, buscaNormalizada]);
  const representantes = useMemo(() => dados.representantes.filter((item) => [item.nome, item.documento, item.email, item.regiao].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(buscaNormalizada))), [dados.representantes, buscaNormalizada]);
  const propostas = useMemo(() => dados.propostas.filter((item) => [item.numero, item.oportunidade_titulo, item.cliente_nome, item.status].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(buscaNormalizada))), [dados.propostas, buscaNormalizada]);
  const cliente = dados.clientes.find((item) => item.id === clienteSelecionado);
  const contatosDoCliente = dados.contatos.filter((item) => item.cliente_id === clienteSelecionado);
  const enderecosDoCliente = dados.enderecos.filter((item) => item.cliente_id === clienteSelecionado);
  const vinculosDoCliente = dados.vinculos.filter((item) => item.cliente_id === clienteSelecionado);
  const historicoCliente = dados.historico.filter((item) => item.entidade === "CLIENTE" && item.entidade_id === clienteSelecionado).slice(0, 12);
  const resultado = aba === "CLIENTES" ? clientes.length : aba === "REPRESENTANTES" ? representantes.length : aba === "PROPOSTAS" ? propostas.length : oportunidades.length;
  const metricas = {
    abertas: dados.oportunidades.filter((item) => !["GANHA", "PERDIDA", "CONVERTIDA"].includes(item.status)).length,
    negociacao: dados.oportunidades.filter((item) => item.status === "NEGOCIACAO").length,
    valor: dados.oportunidades.filter((item) => !["GANHA", "PERDIDA", "CONVERTIDA"].includes(item.status)).reduce((total, item) => total + Number(item.valor_estimado || 0), 0),
  };

  function abrirEditor(kind: string, title: string, values: Record<string, any> = {}, id?: string, extra: Partial<Editor> = {}) {
    setErro(""); setOk("");
    setEditor({ kind, title, values, id, ...extra });
    if (kind === "PROPOSTA" && !id) setProposalItems([{ descricao: "", quantidade: "1", valorUnitario: "" }]);
  }

  async function requisicao(method: "POST" | "PATCH", body: Record<string, any>) {
    const response = await fetch("/api/comercial/crm", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
    return result;
  }

  async function salvarEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true); setErro(""); setOk("");
    try {
      const body: Record<string, any> = { tipo: editor.kind, ...editor.values };
      if (editor.clienteId) body.clienteId = editor.clienteId;
      if (editor.oportunidadeId) body.oportunidadeId = editor.oportunidadeId;
      if (editor.kind === "PROPOSTA") body.itens = proposalItems;
      if (editor.id) body.id = editor.id;
      const result = await requisicao(editor.id ? "PATCH" : "POST", body);
      if (result.item?.id && editor.kind === "CLIENTE") setClienteSelecionado(result.item.id);
      setEditor(null);
      setOk("Registro salvo com histórico.");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function mudarStatus(tipo: string, id: string, payload: Record<string, unknown>) {
    setErro(""); setOk("");
    try { await requisicao("PATCH", { tipo, id, ...payload }); setOk("Etapa comercial atualizada."); await carregar(); }
    catch (error) { setErro(error instanceof Error ? error.message : "Falha ao atualizar."); }
  }

  async function converter(op: Row) {
    const pedido = String(editor?.values.pedido || "").trim();
    setSaving(true); setErro("");
    try {
      const result = await requisicao("POST", { tipo: "CONVERTER", oportunidadeId: op.id, pedido });
      setEditor(null); setPedidoCriado(String(result.pedido)); setOk(`Pedido ${result.pedido} criado na Carteira existente.`); await carregar();
    } catch (error) { setErro(error instanceof Error ? error.message : "Falha ao converter oportunidade."); }
    finally { setSaving(false); }
  }

  async function vincularPedido(event: React.FormEvent) {
    event.preventDefault();
    if (!editor?.clienteId) return;
    setSaving(true); setErro(""); setOk("");
    try {
      const result = await requisicao("POST", { tipo: "VINCULAR_PEDIDO", clienteId: editor.clienteId, pedido: editor.values.pedido });
      setPedidoCriado(String(result.pedido)); setEditor(null); setOk(`Pedido ${result.pedido} vinculado ao cadastro central.`); await carregar();
    } catch (error) { setErro(error instanceof Error ? error.message : "Falha ao vincular pedido."); }
    finally { setSaving(false); }
  }

  function campo(name: string, label: string, type = "text", required = false, value?: unknown) {
    const current = value === undefined ? editor?.values[name] ?? "" : value;
    return <label className="crm-field" key={name}>{label}<input type={type} value={current} required={required} maxLength={type === "text" ? 240 : undefined}
      onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, [name]: event.target.value } } : previous)} /></label>;
  }

  function selectCampo(name: string, label: string, options: Array<{ value: string; label: string }>, required = false, value?: unknown) {
    const current = value === undefined ? editor?.values[name] ?? "" : value;
    return <label className="crm-field" key={name}>{label}<select value={current} required={required}
      onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, [name]: event.target.value, ...(name === "clienteId" ? { contatoId: "" } : {}) } } : previous)}>
      <option value="">Selecione...</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>;
  }

  function camposEditor() {
    if (!editor) return null;
    const v = editor.values;
    if (editor.kind === "CLIENTE") return <div className="crm-form-grid">
      {campo("razaoSocial", "Razão social / nome *", "text", true)}{campo("nomeFantasia", "Nome fantasia")}{campo("documento", "CPF / CNPJ")}
      {campo("email", "E-mail", "email")}{campo("telefone", "Telefone", "tel")}{selectCampo("origem", "Origem do contato", ORIGENS)}
      <label className="crm-field crm-field-wide">Observações<textarea value={v.observacoes || ""} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, observacoes: event.target.value } } : previous)} /></label>
      {editor.id && <label className="crm-check"><input type="checkbox" checked={v.ativo !== false} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, ativo: event.target.checked } } : previous)} /> Cadastro ativo</label>}
    </div>;
    if (editor.kind === "CONTATO") return <div className="crm-form-grid">
      {campo("nome", "Nome do contato *", "text", true)}{campo("cargo", "Cargo / área")}{campo("email", "E-mail", "email")}{campo("telefone", "Telefone", "tel")}
      <label className="crm-check"><input type="checkbox" checked={Boolean(v.principal)} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, principal: event.target.checked } } : previous)} /> Contato principal</label>
    </div>;
    if (editor.kind === "ENDERECO") return <div className="crm-form-grid">
      {selectCampo("tipo", "Tipo", ["COMERCIAL", "COBRANCA", "ENTREGA", "OUTRO"].map((value) => ({ value, label: value })))}
      {campo("logradouro", "Logradouro")}{campo("numero", "Número")}{campo("complemento", "Complemento")}{campo("bairro", "Bairro")}
      {campo("cidade", "Cidade")}{campo("uf", "UF")}{campo("cep", "CEP")}
      <label className="crm-check"><input type="checkbox" checked={Boolean(v.principal)} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, principal: event.target.checked } } : previous)} /> Endereço principal</label>
    </div>;
    if (editor.kind === "REPRESENTANTE") return <div className="crm-form-grid">
      {campo("nome", "Nome *", "text", true)}{campo("documento", "CPF / CNPJ")}{campo("email", "E-mail", "email")}{campo("telefone", "Telefone", "tel")}
      {campo("regiao", "Região")}{campo("comissaoPercentual", "Comissão (%)", "number")}
      <label className="crm-field crm-field-wide">Observações<textarea value={v.observacoes || ""} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, observacoes: event.target.value } } : previous)} /></label>
      {editor.id && <label className="crm-check"><input type="checkbox" checked={v.ativo !== false} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, ativo: event.target.checked } } : previous)} /> Cadastro ativo</label>}
    </div>;
    if (editor.kind === "VINCULO_REPRESENTANTE") return <div className="crm-form-grid">
      {selectCampo("clienteId", "Cliente *", dados.clientes.filter((item) => item.ativo).map((item) => ({ value: item.id, label: item.nome_fantasia || item.razao_social })), true)}
      {selectCampo("representanteId", "Representante *", dados.representantes.filter((item) => item.ativo).map((item) => ({ value: item.id, label: item.nome })), true)}
    </div>;
    if (editor.kind === "OPORTUNIDADE") {
      const clienteId = String(editor.values.clienteId || editor.clienteId || clienteSelecionado);
      const contatosOportunidade = dados.contatos.filter((item) => item.cliente_id === clienteId);
      return <div className="crm-form-grid">
      {!editor.id && selectCampo("clienteId", "Cliente *", dados.clientes.filter((item) => item.ativo).map((item) => ({ value: item.id, label: item.nome_fantasia ? `${item.nome_fantasia} · ${item.razao_social}` : item.razao_social })), true)}
      {selectCampo("contatoId", "Contato", contatosOportunidade.map((item) => ({ value: item.id, label: item.nome })))}
      {selectCampo("representanteId", "Responsável / representante", dados.representantes.filter((item) => item.ativo).map((item) => ({ value: item.id, label: item.nome })))}
      {campo("titulo", "Oportunidade *", "text", true)}{selectCampo("origem", "Origem *", ORIGENS, true)}
      {campo("valorEstimado", "Valor estimado (R$)", "number")}{campo("fechamentoPrevisto", "Fechamento previsto", "date")}
      {campo("proximaAcao", "Próxima ação")}{campo("proximaAcaoEm", "Data da próxima ação", "date")}
      <label className="crm-field crm-field-wide">Descrição<textarea value={v.descricao || ""} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, descricao: event.target.value } } : previous)} /></label>
    </div>;
    }
    if (editor.kind === "INTERACAO") return <div className="crm-form-grid">
      {selectCampo("interacaoTipo", "Tipo", ["LIGACAO", "EMAIL", "REUNIAO", "VISITA", "WHATSAPP", "OUTRO"].map((value) => ({ value, label: value.replaceAll("_", " ") })))}
      {campo("proximaAcao", "Próxima ação")}{campo("proximaAcaoEm", "Data da próxima ação", "date")}
      <label className="crm-field crm-field-wide">Registro do contato *<textarea required value={v.descricao || ""} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, descricao: event.target.value } } : previous)} /></label>
    </div>;
    if (editor.kind === "PROPOSTA") return <div className="crm-form-grid">
      {!editor.oportunidadeId && selectCampo("oportunidadeId", "Oportunidade *", dados.oportunidades.filter((item) => !["GANHA", "PERDIDA", "CONVERTIDA"].includes(item.status)).map((item) => ({ value: item.id, label: `${item.titulo} · ${item.cliente_nome}` })), true)}
      {campo("validade", "Validade", "date")}{campo("condicoes", "Condições comerciais")}
      <div className="crm-field crm-field-wide"><span>Itens da proposta</span>
        <div className="crm-proposal-items">{proposalItems.map((item, index) => <div className="crm-proposal-item" key={index}>
          <input aria-label="Descrição do item" placeholder="Produto / serviço" value={item.descricao} onChange={(event) => setProposalItems((previous) => previous.map((row, i) => i === index ? { ...row, descricao: event.target.value } : row))} />
          <input aria-label="Quantidade" type="number" min="0.001" step="0.001" placeholder="Qtd." value={item.quantidade} onChange={(event) => setProposalItems((previous) => previous.map((row, i) => i === index ? { ...row, quantidade: event.target.value } : row))} />
          <input aria-label="Valor unitário" type="number" min="0" step="0.01" placeholder="Valor unitário" value={item.valorUnitario} onChange={(event) => setProposalItems((previous) => previous.map((row, i) => i === index ? { ...row, valorUnitario: event.target.value } : row))} />
          {proposalItems.length > 1 && <button type="button" className="crm-icon-action" title="Remover item" onClick={() => setProposalItems((previous) => previous.filter((_, i) => i !== index))}><X size={16} /></button>}
        </div>)}
          <button type="button" className="crm-secondary" onClick={() => setProposalItems((previous) => [...previous, { descricao: "", quantidade: "1", valorUnitario: "" }])}><Plus size={15} /> Adicionar item</button>
        </div>
      </div>
      <label className="crm-field crm-field-wide">Observações<textarea value={v.observacoes || ""} onChange={(event) => setEditor((previous) => previous ? { ...previous, values: { ...previous.values, observacoes: event.target.value } } : previous)} /></label>
    </div>;
    return <div className="crm-form-grid">{campo("pedido", "Número do pedido (4 a 10 dígitos) *", "text", true)}</div>;
  }

  return <div className="crm-page">
    <PageHeader eyebrow="Comercial" title="CRM e carteira comercial" description="Contatos, responsáveis, negociações e propostas conectados à Carteira de Pedidos." actions={<button onClick={() => void carregar()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} /> Atualizar</button>} />
    <div className="crm-metrics">
      <div><span>Oportunidades abertas</span><b>{metricas.abertas}</b></div>
      <div><span>Em negociação</span><b>{metricas.negociacao}</b></div>
      <div><span>Valor estimado aberto</span><b>{dinheiro(metricas.valor)}</b></div>
      <div><span>Clientes ativos</span><b>{dados.clientes.filter((item) => item.ativo).length}</b></div>
    </div>
    <div className="crm-toolbar">
      <label className="crm-search"><Search size={17} /><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar clientes, oportunidades ou representantes" /></label>
      {podeEditar && <button className="primary" onClick={() => {
        if (aba === "CLIENTES") abrirEditor("CLIENTE", "Novo cliente", { origem: "" });
        else if (aba === "REPRESENTANTES") abrirEditor("REPRESENTANTE", "Novo representante", { comissaoPercentual: "0" });
        else if (aba === "OPORTUNIDADES") abrirEditor("OPORTUNIDADE", "Nova oportunidade", { origem: "INDICACAO", valorEstimado: "0" });
        else abrirEditor("PROPOSTA", "Nova proposta", { oportunidadeId: "" });
      }}><Plus size={16} />{aba === "CLIENTES" ? "Novo cliente" : aba === "REPRESENTANTES" ? "Novo representante" : aba === "PROPOSTAS" ? "Nova proposta" : "Nova oportunidade"}</button>}
    </div>
    {erro && <p className="crm-message error" role="alert"><AlertCircle size={16} />{erro}</p>}
    {ok && <p className="crm-message success" role="status"><Check size={16} />{ok}{pedidoCriado && <Link href="/carteira" className="crm-open-order">Abrir Carteira</Link>}</p>}
    <Segmented value={aba} onChange={setAba} options={[
      { value: "OPORTUNIDADES", label: <>Oportunidades <b>{dados.oportunidades.length}</b></> },
      { value: "CLIENTES", label: <>Clientes <b>{dados.clientes.length}</b></> },
      { value: "REPRESENTANTES", label: <>Representantes <b>{dados.representantes.length}</b></> },
      { value: "PROPOSTAS", label: <>Propostas <b>{dados.propostas.length}</b></> },
    ]} />

    {loading && !dados.clientes.length && <p className="crm-loading"><span className="login-spinner" /> Carregando cadastros comerciais...</p>}

    {aba === "CLIENTES" && <section className="crm-panel">
      <header className="crm-panel-heading"><div><span>CADASTRO CENTRAL</span><h2>Clientes</h2></div><b>{resultado} registros</b></header>
      <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Cliente</th><th>Documento</th><th>Contato principal</th><th>Origem</th><th>Vínculos</th><th /></tr></thead><tbody>
        {clientes.map((item) => <tr key={item.id} className={clienteSelecionado === item.id ? "selected" : ""}>
          <td><button type="button" className="crm-row-link" onClick={() => setClienteSelecionado(item.id)}><b>{item.nome_fantasia || item.razao_social}</b><small>{item.razao_social}</small></button></td>
          <td>{item.documento || "—"}</td><td>{item.email || item.telefone || "—"}</td><td>{ORIGENS_LABEL[item.origem] || item.origem || "—"}</td>
          <td>{Number(item.contatos_count || 0)} contatos · {Number(item.enderecos_count || 0)} endereços</td>
          <td>{podeEditar && <button type="button" className="crm-icon-action" title="Editar cliente" onClick={() => abrirEditor("CLIENTE", "Editar cliente", { razaoSocial: item.razao_social, nomeFantasia: item.nome_fantasia, documento: item.documento, email: item.email, telefone: item.telefone, origem: item.origem, observacoes: item.observacoes, ativo: item.ativo }, item.id)}><Pencil size={15} /></button>}</td>
        </tr>)}
      </tbody></table>{!clientes.length && !loading && <Empty title="Nenhum cliente cadastrado" sub="Cadastre um cliente para iniciar contatos e oportunidades." />}</div>
      {cliente && <div className="crm-client-detail">
        <header><div><span>FICHA DO CLIENTE</span><h3>{cliente.nome_fantasia || cliente.razao_social}</h3><p>{cliente.razao_social} · {cliente.documento || "Documento não informado"}</p></div>
          {podeEditar && <div className="crm-actions"><button className="crm-secondary" onClick={() => abrirEditor("INTERACAO", "Registrar contato", { interacaoTipo: "LIGACAO", proximaAcao: "", proximaAcaoEm: "" }, undefined, { clienteId: cliente.id })}><Clock3 size={15} />Registrar contato</button>
            <button className="crm-secondary" onClick={() => abrirEditor("VINCULAR_PEDIDO", "Vincular pedido existente", { pedido: "" }, undefined, { clienteId: cliente.id })}><ArrowRightLeft size={15} />Vincular pedido</button>
            <button className="crm-secondary" onClick={() => abrirEditor("CONTATO", "Novo contato", { principal: false }, undefined, { clienteId: cliente.id })}><Plus size={15} />Contato</button>
            <button className="crm-secondary" onClick={() => abrirEditor("ENDERECO", "Novo endereço", { tipo: "COMERCIAL", principal: false }, undefined, { clienteId: cliente.id })}><Plus size={15} />Endereço</button>
            <button className="crm-secondary" onClick={() => abrirEditor("VINCULO_REPRESENTANTE", "Vincular representante", { clienteId: cliente.id }, undefined, { clienteId: cliente.id })}><Users size={15} />Vincular representante</button></div>}
        </header>
        <div className="crm-detail-grid">
          <section><h4>Contatos</h4>{contatosDoCliente.length ? contatosDoCliente.map((item) => <article className="crm-detail-row" key={item.id}><UserRound size={16} /><div><b>{item.nome}{item.principal ? " · Principal" : ""}</b><small>{[item.cargo,item.email,item.telefone].filter(Boolean).join(" · ") || "Sem detalhes"}</small></div>{podeEditar && <button className="crm-icon-action" title="Editar contato" onClick={() => abrirEditor("CONTATO", "Editar contato", { nome: item.nome, cargo: item.cargo, email: item.email, telefone: item.telefone, principal: item.principal }, item.id, { clienteId: cliente.id })}><Pencil size={14} /></button>}</article>) : <p className="crm-muted">Nenhum contato registrado.</p>}</section>
          <section><h4>Endereços</h4>{enderecosDoCliente.length ? enderecosDoCliente.map((item) => <article className="crm-detail-row" key={item.id}><Building2 size={16} /><div><b>{item.tipo}{item.principal ? " · Principal" : ""}</b><small>{[item.logradouro,item.numero,item.complemento,item.bairro,item.cidade,item.uf,item.cep].filter(Boolean).join(", ") || "Endereço sem detalhes"}</small></div>{podeEditar && <button className="crm-icon-action" title="Editar endereço" onClick={() => abrirEditor("ENDERECO", "Editar endereço", { tipo: item.tipo, logradouro: item.logradouro, numero: item.numero, complemento: item.complemento, bairro: item.bairro, cidade: item.cidade, uf: item.uf, cep: item.cep, principal: item.principal }, item.id, { clienteId: cliente.id })}><Pencil size={14} /></button>}</article>) : <p className="crm-muted">Nenhum endereço registrado.</p>}</section>
          <section><h4>Representantes vinculados</h4>{vinculosDoCliente.filter((item) => item.ativo).length ? vinculosDoCliente.filter((item) => item.ativo).map((item) => <article className="crm-detail-row" key={item.representante_id}><Handshake size={16} /><div><b>{item.representante_nome}</b></div>{podeEditar && <button className="crm-secondary" onClick={() => void mudarStatus("VINCULO_REPRESENTANTE", item.representante_id, { clienteId: cliente.id, representanteId: item.representante_id, ativo: false })}>Desvincular</button>}</article>) : <p className="crm-muted">Nenhum representante ativo vinculado.</p>}</section>
          <section><h4>Histórico</h4>{[...dados.interacoes.filter((item) => item.cliente_id === cliente.id), ...historicoCliente].sort((a,b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()).slice(0,12).map((item) => <article className="crm-history-row" key={`${item.id}-${item.tipo}`}><small>{new Date(item.criado_em).toLocaleString("pt-BR")} · {item.criado_por || item.usuario}</small><b>{item.descricao || item.tipo}</b>{item.proxima_acao && <small>Próxima ação: {item.proxima_acao} · {dataPt(item.proxima_acao_em)}</small>}</article>)}{!historicoCliente.length && !dados.interacoes.some((item) => item.cliente_id === cliente.id) && <p className="crm-muted">O histórico será registrado conforme o cadastro evoluir.</p>}</section>
        </div>
      </div>}
    </section>}

    {aba === "REPRESENTANTES" && <section className="crm-panel"><header className="crm-panel-heading"><div><span>FORÇA DE VENDAS</span><h2>Representantes</h2></div><b>{resultado} registros</b></header>
      <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Representante</th><th>Região</th><th>Contato</th><th>Comissão cadastrada</th><th>Clientes vinculados</th><th>Status</th><th /></tr></thead><tbody>
        {representantes.map((item) => <tr key={item.id}><td><b>{item.nome}</b><small>{item.documento || "Documento não informado"}</small></td><td>{item.regiao || "—"}</td><td>{item.email || item.telefone || "—"}</td><td>{Number(item.comissao_percentual || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td><td>{dados.vinculos.filter((link) => link.representante_id === item.id && link.ativo).length}</td><td><Badge tone={item.ativo ? "success" : "neutral"}>{item.ativo ? "Ativo" : "Inativo"}</Badge></td><td>{podeEditar && <button className="crm-icon-action" title="Editar representante" onClick={() => abrirEditor("REPRESENTANTE", "Editar representante", { nome: item.nome, documento: item.documento, email: item.email, telefone: item.telefone, regiao: item.regiao, comissaoPercentual: String(item.comissao_percentual || 0), observacoes: item.observacoes, ativo: item.ativo }, item.id)}><Pencil size={15} /></button>}</td></tr>)}
      </tbody></table>{!representantes.length && !loading && <Empty title="Nenhum representante cadastrado" sub="Cadastre representantes antes de atribuí-los às oportunidades." />}</div>
    </section>}

    {aba === "OPORTUNIDADES" && <section className="crm-panel"><header className="crm-panel-heading"><div><span>PIPELINE COMERCIAL</span><h2>Oportunidades</h2></div><b>{resultado} registros</b></header>
      <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Oportunidade / cliente</th><th>Origem</th><th>Responsável</th><th>Valor estimado</th><th>Próxima ação</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {oportunidades.map((item) => <tr key={item.id}>
          <td><b>{item.titulo}</b><small>{item.cliente_fantasia || item.cliente_nome}{item.contato_nome ? ` · ${item.contato_nome}` : ""}</small>{item.pedido && <small>Pedido {item.pedido}</small>}</td>
          <td>{ORIGENS_LABEL[item.origem] || item.origem}</td><td>{item.representante_nome || "Não atribuído"}</td><td>{dinheiro(item.valor_estimado)}</td>
          <td>{item.proxima_acao || "—"}<small>{dataPt(item.proxima_acao_em)}</small></td>
          <td>{podeEditar && OPORTUNIDADE_TRANSICOES[item.status]?.length ? <select aria-label={`Etapa da oportunidade ${item.titulo}`} value={item.status} onChange={(event) => void mudarStatus("OPORTUNIDADE", item.id, { status: event.target.value })}>
            <option value={item.status}>{OPORTUNIDADE_LABEL[item.status] || item.status}</option>{(OPORTUNIDADE_TRANSICOES[item.status] || []).map((status) => <option key={status} value={status}>{OPORTUNIDADE_LABEL[status]}</option>)}
          </select> : <Badge tone={item.status === "GANHA" || item.status === "CONVERTIDA" ? "success" : item.status === "PERDIDA" ? "danger" : "info"}>{OPORTUNIDADE_LABEL[item.status] || item.status}</Badge>}</td>
          <td><div className="crm-actions">
            {podeEditar && !["CONVERTIDA", "PERDIDA"].includes(item.status) && <>
              <button className="crm-icon-action" title="Editar oportunidade" onClick={() => abrirEditor("OPORTUNIDADE", "Editar oportunidade", { titulo: item.titulo, descricao: item.descricao, contatoId: item.contato_id || "", representanteId: item.representante_id || "", valorEstimado: String(item.valor_estimado || 0), fechamentoPrevisto: item.fechamento_previsto?.slice(0,10) || "", proximaAcao: item.proxima_acao, proximaAcaoEm: item.proxima_acao_em?.slice(0,10) || "" }, item.id, { clienteId: item.cliente_id })}><Pencil size={14} /></button>
              <button className="crm-secondary" onClick={() => abrirEditor("INTERACAO", "Registrar interação", { interacaoTipo: "LIGACAO", proximaAcao: "", proximaAcaoEm: "" }, undefined, { oportunidadeId: item.id })}><Clock3 size={14} />Interação</button>
              {!['GANHA', 'PERDIDA', 'CONVERTIDA'].includes(item.status) && <button className="crm-icon-action" title="Criar proposta" onClick={() => { setAba("PROPOSTAS"); abrirEditor("PROPOSTA", `Proposta · ${item.titulo}`, { oportunidadeId: item.id }, undefined, { oportunidadeId: item.id }); }}><FileText size={14} /></button>}
              {item.status === "GANHA" && <button className="crm-secondary" onClick={() => abrirEditor("CONVERTER", "Converter para pedido", { pedido: "" }, undefined, { oportunidadeId: item.id })}><ArrowRightLeft size={14} />Converter</button>}
            </>}
          </div></td>
        </tr>)}
      </tbody></table>{!oportunidades.length && !loading && <Empty title="Nenhuma oportunidade encontrada" sub="Registre origem, contato e próxima ação para iniciar o acompanhamento." />}</div>
      {dados.oportunidades.map((item) => {
        const events: Row[] = [
          ...dados.interacoes.filter((interaction) => interaction.oportunidade_id === item.id).map((entry) => ({ id: entry.id, criado_em: entry.criado_em, descricao: entry.descricao, evento: entry.tipo, autor: entry.criado_por })),
          ...dados.historico.filter((entry) => entry.entidade === "OPORTUNIDADE" && entry.entidade_id === item.id).map((entry) => ({ id: entry.id, criado_em: entry.criado_em, descricao: entry.descricao, evento: entry.tipo, autor: entry.usuario })),
        ].sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()).slice(0, 5);
        if (!events.length) return null;
        return <details className="crm-interaction-details" key={`history-${item.id}`}><summary>Atividades e alterações · {item.titulo} ({events.length})</summary>{events.map((event) => <p key={`${event.id}-${event.evento}`}><small>{new Date(event.criado_em).toLocaleString("pt-BR")} · {event.autor} · {event.evento}</small><br />{event.descricao}</p>)}</details>;
      })}
    </section>}

    {aba === "PROPOSTAS" && <section className="crm-panel"><header className="crm-panel-heading"><div><span>NEGOCIAÇÃO</span><h2>Propostas</h2></div><b>{resultado} registros</b></header>
      <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Número</th><th>Oportunidade / cliente</th><th>Itens</th><th>Total</th><th>Validade</th><th>Status</th><th>Próxima etapa</th></tr></thead><tbody>
        {propostas.map((item) => {
          const next = PROPOSTA_TRANSICOES[item.status] || [];
          return <tr key={item.id}><td><b>#{item.numero}</b></td><td>{item.oportunidade_titulo}<small>{item.cliente_nome}</small></td><td>{Array.isArray(item.itens) ? item.itens.length : 0}</td><td>{dinheiro(item.total)}</td><td>{dataPt(item.validade)}</td><td><Badge tone={item.status === "ACEITA" ? "success" : item.status === "RECUSADA" || item.status === "EXPIRADA" ? "danger" : "info"}>{PROPOSTA_LABEL[item.status] || item.status}</Badge></td>
            <td><div className="crm-actions">{podeEditar && item.status === "RASCUNHO" && <button className="crm-icon-action" title="Editar proposta" onClick={() => { setProposalItems((Array.isArray(item.itens) ? item.itens : []).map((row: Row) => ({ descricao: row.descricao || "", quantidade: String(row.quantidade ?? "1"), valorUnitario: String(row.valorUnitario ?? "") }))); abrirEditor("PROPOSTA", `Editar proposta #${item.numero}`, { validade: item.validade?.slice(0,10) || "", condicoes: item.condicoes, observacoes: item.observacoes, status: item.status }, item.id, { oportunidadeId: item.oportunidade_id }); }}><Pencil size={14} /></button>}
              {podeEditar && next.length > 0 && <select aria-label={`Próxima etapa da proposta ${item.numero}`} value="" onChange={(event) => { if (event.target.value) void mudarStatus("PROPOSTA", item.id, { status: event.target.value }); }}><option value="">Atualizar...</option>{next.map((status) => <option key={status} value={status}>{PROPOSTA_LABEL[status]}</option>)}</select>}{!next.length && item.status !== "RASCUNHO" ? "—" : null}</div></td></tr>;
        })}
      </tbody></table>{!propostas.length && !loading && <Empty title="Nenhuma proposta cadastrada" sub="Crie uma proposta a partir de uma oportunidade qualificada." />}</div>
      {propostas.map((proposal) => {
        const events = dados.historico.filter((item) => item.entidade === "PROPOSTA" && item.entidade_id === proposal.id).slice(0, 5);
        if (!events.length) return null;
        return <details className="crm-interaction-details" key={`proposal-history-${proposal.id}`}><summary>Histórico · proposta #{proposal.numero}</summary>{events.map((event) => <p key={event.id}><small>{new Date(event.criado_em).toLocaleString("pt-BR")} · {event.usuario} · {event.tipo}</small><br />{event.descricao}</p>)}</details>;
      })}
    </section>}

    {editor && <div className="crm-modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
      <section className="crm-modal" role="dialog" aria-modal="true" aria-labelledby="crm-modal-title">
        <header><div><span>COMERCIAL</span><h2 id="crm-modal-title">{editor.title}</h2></div><button className="crm-icon-action" aria-label="Fechar" onClick={() => setEditor(null)}><X size={18} /></button></header>
        {editor.kind === "VINCULAR_PEDIDO" ? <form onSubmit={(event) => void vincularPedido(event)}>
          <p className="crm-convert-note">Vincula um pedido já existente na Carteira ou na programação. Nomes semelhantes nunca são associados automaticamente.</p>
          {camposEditor()}<footer><button type="button" className="crm-secondary" onClick={() => setEditor(null)}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Vinculando..." : "Vincular pedido"}</button></footer>
        </form> : editor.kind === "CONVERTER" ? <form onSubmit={(event) => { event.preventDefault(); const op = dados.oportunidades.find((item) => item.id === editor.oportunidadeId); if (op) void converter(op); }}>
          <p className="crm-convert-note">A conversão criará o registro de controle na mesma Carteira de Pedidos. Não cria itens, OFs nem programação; eles continuam vinculados somente quando forem importados pelo fluxo atual.</p>
          {camposEditor()}<footer><button type="button" className="crm-secondary" onClick={() => setEditor(null)}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Convertendo..." : "Criar na Carteira"}</button></footer>
        </form> : <form onSubmit={(event) => void salvarEditor(event)}>
          {editor.kind === "OPORTUNIDADE" && !editor.id && !dados.clientes.filter((item) => item.ativo).length && <p className="crm-message error"><AlertCircle size={16} />Cadastre um cliente ativo antes de criar oportunidades.</p>}
          {editor.kind === "PROPOSTA" && !dados.oportunidades.filter((item) => !["GANHA", "PERDIDA", "CONVERTIDA"].includes(item.status)).length && <p className="crm-message error"><AlertCircle size={16} />Não há oportunidade aberta para receber uma proposta.</p>}
          {camposEditor()}
          <footer><button type="button" className="crm-secondary" onClick={() => setEditor(null)}>Cancelar</button><button className="primary" disabled={saving || (editor.kind === "OPORTUNIDADE" && !editor.id && !dados.clientes.filter((item) => item.ativo).length)}>{saving ? "Salvando..." : "Salvar"}</button></footer>
        </form>}
      </section>
    </div>}
  </div>;
}