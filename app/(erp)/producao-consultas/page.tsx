"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, PageHeader, Segmented, type Tone } from "@/components/ui";

type Row = Record<string, any>;
const num = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
async function get(params: Record<string, string>) {
  const r = await fetch(`/api/producao/consultas?${new URLSearchParams(params)}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na consulta.");
  return j.rows as Row[];
}
const SIT: Record<string, Tone> = { OK: "success", GERA_OF_FILHA: "info", FALTA: "danger" };

function Busca({ tipo, placeholder, onPick, label }: { tipo: string; placeholder: string; onPick: (r: Row) => void; label: (r: Row) => string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Row[]>([]);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { get({ tipo, q }).then((r) => { setRes(r); setErro(""); }).catch((e) => setErro(e.message)); }, 250);
    return () => clearTimeout(t);
  }, [q, tipo]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Field label="Buscar"><input value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} /></Field>
      {erro && <div className="alert danger">{erro}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {res.map((r) => <button key={r.id} type="button" className="crm-secondary" onClick={() => onPick(r)}>{label(r)}</button>)}
      </div>
    </div>
  );
}

export default function ProducaoConsultasPage() {
  const [aba, setAba] = useState<"USADO" | "DISP" | "OF" | "LOTE">("USADO");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState("");
  const [disp, setDisp] = useState({ estrutura: "", qtd: "1", local: "" });

  const rodar = useCallback(async (params: Record<string, string>, t: string) => {
    try { setErro(""); setTitulo(t); setRows(await get(params)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); setRows(null); }
  }, []);
  useEffect(() => { setRows(null); setTitulo(""); setErro(""); }, [aba]);

  return (
    <div className="page">
      <PageHeader eyebrow="Produção" title="Consultas de engenharia e rastreio" description="Onde é usado, disponibilidade de componentes antes da OF e rastreabilidade para frente e para trás." />
      <Segmented value={aba} onChange={setAba} options={[{ value: "USADO", label: "Onde é usado" }, { value: "DISP", label: "Disponibilidade" }, { value: "OF", label: "Rastreio da OF" }, { value: "LOTE", label: "Rastreio do lote" }]} />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      <div style={{ margin: "12px 0" }}>
        {aba === "USADO" && <Busca tipo="busca-produto" placeholder="Código ou descrição do componente" label={(r) => `${r.codigo} · ${r.descricao || r.classificacao}`} onPick={(r) => rodar({ tipo: "onde-usado", id: r.id }, `Onde é usado: ${r.codigo}`)} />}
        {aba === "OF" && <Busca tipo="busca-of" placeholder="Nº da OF ou pedido" label={(r) => `OF ${r.numero} · ${r.produto} · ${r.pedido}`} onPick={(r) => rodar({ tipo: "rastreio-of", id: r.id }, `Rastreio da OF ${r.numero}`)} />}
        {aba === "LOTE" && <Busca tipo="busca-lote" placeholder="Código do lote" label={(r) => `${r.codigo} · ${r.produto}`} onPick={(r) => rodar({ tipo: "rastreio-lote", id: r.id }, `Destino do lote ${r.codigo}`)} />}
        {aba === "DISP" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
            <Field label="ID da estrutura (BOM) aprovada"><input value={disp.estrutura} onChange={(e) => setDisp({ ...disp, estrutura: e.target.value.trim() })} /></Field>
            <Field label="Quantidade a produzir"><input inputMode="decimal" value={disp.qtd} onChange={(e) => setDisp({ ...disp, qtd: e.target.value })} /></Field>
            <Field label="ID do depósito"><input value={disp.local} onChange={(e) => setDisp({ ...disp, local: e.target.value.trim() })} /></Field>
            <button className="primary" style={{ alignSelf: "end" }} onClick={() => rodar({ tipo: "disponibilidade", id: disp.estrutura, qtd: disp.qtd.replace(",", "."), local: disp.local }, "Disponibilidade dos componentes")}>Verificar</button>
          </div>
        )}
      </div>
      {rows && <b>{titulo}</b>}
      {rows && aba === "USADO" && (
        <DataTable head={["Nível", "Usado em", "Qtd por pai", "Qtd acumulada", "Caminho"]} empty={<Empty title="Não é usado em nenhuma estrutura aprovada" />}>
          {rows.map((r, i) => <tr key={i}><td data-label="Nível">{r.nivel}</td><td data-label="Usado em"><b>{r.pai_codigo}</b> {r.pai_descricao}</td><td data-label="Qtd por pai">{num(r.quantidade_por_pai)}</td><td data-label="Qtd acumulada">{num(r.quantidade_acumulada)}</td><td data-label="Caminho">{r.caminho}</td></tr>)}
        </DataTable>
      )}
      {rows && aba === "DISP" && (
        <DataTable head={["Componente", "Classe", "Necessário", "Livre", "Falta", "Situação"]} empty={<Empty title="Estrutura sem componentes" />}>
          {rows.map((r) => <tr key={r.componente_id}><td data-label="Componente"><b>{r.codigo}</b> {r.descricao}</td><td data-label="Classe">{r.classificacao}</td><td data-label="Necessário">{num(r.necessidade)}</td><td data-label="Livre">{num(r.livre)}</td><td data-label="Falta">{num(r.falta)}</td><td data-label="Situação"><Badge tone={SIT[r.situacao]}>{r.situacao === "GERA_OF_FILHA" ? "Gera OF filha" : r.situacao === "OK" ? "OK" : "Falta"}</Badge></td></tr>)}
        </DataTable>
      )}
      {rows && aba === "OF" && (
        <DataTable head={["Sentido", "Tipo", "Referência", "Descrição", "Qtd"]} empty={<Empty title="Sem movimentos rastreados nesta OF" />}>
          {rows.map((r, i) => <tr key={i}><td data-label="Sentido"><Badge tone={r.sentido === "ORIGEM" ? "info" : "success"}>{r.sentido === "ORIGEM" ? "Origem" : "Destino"}</Badge></td><td data-label="Tipo">{String(r.tipo).replaceAll("_", " ")}</td><td data-label="Referência">{r.referencia}</td><td data-label="Descrição">{r.descricao}{r.tipo === "PEDIDO_VENDA" && r.detalhe?.representante ? ` · Rep: ${r.detalhe.representante}` : ""}</td><td data-label="Qtd">{r.quantidade == null ? "—" : num(r.quantidade)}</td></tr>)}
        </DataTable>
      )}
      {rows && aba === "LOTE" && (
        <DataTable head={["OF", "Produto", "Consumido", "Pedido", "Cliente", "Representante"]} empty={<Empty title="Lote ainda não consumido por nenhuma OF" />}>
          {rows.map((r) => <tr key={r.of_id}><td data-label="OF">{r.of_numero} ({r.of_status})</td><td data-label="Produto">{r.produto}</td><td data-label="Consumido">{num(r.quantidade_consumida)}</td><td data-label="Pedido">{r.pedido}</td><td data-label="Cliente">{r.cliente || "—"}</td><td data-label="Representante">{r.representante || "—"}</td></tr>)}
        </DataTable>
      )}
    </div>
  );
}
