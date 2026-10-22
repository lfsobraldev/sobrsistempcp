"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Trash2, Plus } from "lucide-react";
import { Modal } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import type { Alerta, RomaneioIA } from "@/lib/ia/romaneio";

export const OPEN_EVENT = "romaneio-ia-open";
export function abrirRomaneioIA(detail?: { romaneio?: RomaneioIA }) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail }));
}

const CAMPOS: Array<[keyof RomaneioIA, string]> = [["pedido", "Pedido"], ["cliente", "Cliente"], ["transportadora", "Transportadora"], ["rota", "Rota"], ["motorista", "Motorista"], ["placa", "Placa"], ["notaFiscal", "Nota fiscal"], ["dataEntrega", "Entrega"]];

function validar(r: RomaneioIA): Alerta[] {
  const a: Alerta[] = [];
  if (!r.itens.length) a.push({ nivel: "erro", campo: "itens", mensagem: "Nenhum item." });
  const vistos = new Map<string, number>();
  r.itens.forEach((it, i) => {
    if (!(it.quantidade > 0)) a.push({ nivel: "erro", campo: `itens[${i + 1}]`, mensagem: `Item ${i + 1}: quantidade zerada.` });
    if (!it.descricao.trim()) a.push({ nivel: "erro", campo: `itens[${i + 1}]`, mensagem: `Item ${i + 1}: descrição vazia.` });
    const k = `${it.codigo}|${it.descricao}`.toLowerCase().trim();
    if (vistos.has(k)) a.push({ nivel: "aviso", campo: `itens[${i + 1}]`, mensagem: `Item ${i + 1} duplicado (igual ao ${vistos.get(k)}).` });
    else vistos.set(k, i + 1);
  });
  (["cliente", "transportadora", "rota"] as const).forEach((c) => { if (!r[c]) a.push({ nivel: "aviso", campo: c, mensagem: `${c} não informado.` }); });
  return a;
}

export default function RomaneioAIModal() {
  const { toast } = useOps();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [r, setR] = useState<RomaneioIA | null>(null);
  const [busy, setBusy] = useState<"" | "ia" | "pdf" | "xlsx">("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setErro("");
      if (d?.romaneio) setR(d.romaneio);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, h);
    return () => window.removeEventListener(OPEN_EVENT, h);
  }, []);

  async function processar() {
    setErro(""); setBusy("ia");
    try {
      const fd = new FormData();
      fd.set("texto", texto);
      if (arquivo) fd.set("arquivo", arquivo);
      const res = await fetch("/api/ia/romaneio", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao processar.");
      setR(j.romaneio);
    } catch (e: any) { setErro(e.message); } finally { setBusy(""); }
  }

  async function exportar(formato: "pdf" | "xlsx") {
    if (!r) return;
    setErro(""); setBusy(formato);
    try {
      const res = await fetch("/api/ia/romaneio/exportar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ romaneio: r, formato }) });
      if (!res.ok) throw new Error((await res.json()).error || "Falha ao exportar.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Romaneio_${r.pedido || "novo"}.${formato}`; a.click();
      URL.revokeObjectURL(url);
      toast("success", `Romaneio exportado (${formato.toUpperCase()}).`);
    } catch (e: any) { setErro(e.message); } finally { setBusy(""); }
  }

  const alertas = r ? validar(r) : [];
  const temErro = alertas.some((a) => a.nivel === "erro");
  const set = (k: keyof RomaneioIA, v: string) => r && setR({ ...r, [k]: v });
  const setItem = (i: number, patch: Partial<RomaneioIA["itens"][number]>) => r && setR({ ...r, itens: r.itens.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><FileSpreadsheet size={18} /> Gerar romaneio com IA</span>}
      footer={r ? (
        <>
          <button onClick={() => { setR(null); setErro(""); }}>Novo</button>
          <button disabled={!!busy || temErro} onClick={() => exportar("xlsx")}><FileSpreadsheet /> Excel</button>
          <button className="primary" disabled={!!busy || temErro} onClick={() => exportar("pdf")}><Download /> PDF</button>
        </>
      ) : (
        <>
          <button onClick={() => setOpen(false)}>Cancelar</button>
          <button className="primary" disabled={!!busy || (!texto.trim() && !arquivo)} onClick={processar}><FileSpreadsheet /> {busy === "ia" ? "Processando..." : "Processar com IA"}</button>
        </>
      )}
    >
      {erro && <div className="messageStrip error">{erro}</div>}
      {!r ? (
        <>
          <p className="modalText">Envie um PDF, planilha (Excel/CSV) ou cole o texto do pedido. A IA extrai e valida os dados antes de emitir.</p>
          <div><label>Arquivo (PDF, XLSX, CSV, TXT)</label><input type="file" accept=".pdf,.xlsx,.xls,.csv,.txt" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /></div>
          <div><label>Ou cole o texto</label><textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Pedido 123 - Cliente X - 40 portas 2,10x0,80 ..." /></div>
        </>
      ) : (
        <>
          {alertas.length > 0 && (
            <div className={temErro ? "messageStrip error" : "warningBox"} style={{ flexDirection: "column" }}>
              {alertas.map((a, i) => <span key={i}>{a.nivel === "erro" ? "Erro: " : "Atenção: "}{a.mensagem}</span>)}
            </div>
          )}
          <div className="formRow" style={{ padding: 0, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            {CAMPOS.map(([k, l]) => <label key={k}>{l}<input value={String(r[k] ?? "")} onChange={(e) => set(k, e.target.value)} /></label>)}
          </div>
          <div className="tableScroll"><div className="tableWrap" style={{ maxHeight: 300 }}>
            <table>
              <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th className="num">Qtd</th><th className="num">Peso</th><th className="num">Vol.</th><th /></tr></thead>
              <tbody>
                {r.itens.map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input value={it.codigo} onChange={(e) => setItem(i, { codigo: e.target.value })} style={{ minWidth: 90 }} /></td>
                    <td><input value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} style={{ minWidth: 220 }} /></td>
                    <td className="num"><input type="number" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: Number(e.target.value) })} style={{ width: 80 }} /></td>
                    <td className="num"><input type="number" value={it.pesoKg ?? ""} onChange={(e) => setItem(i, { pesoKg: e.target.value === "" ? null : Number(e.target.value) })} style={{ width: 80 }} /></td>
                    <td className="num"><input type="number" value={it.volumes ?? ""} onChange={(e) => setItem(i, { volumes: e.target.value === "" ? null : Number(e.target.value) })} style={{ width: 70 }} /></td>
                    <td><button className="ghost iconBtn" aria-label="Remover" onClick={() => setR({ ...r, itens: r.itens.filter((_, k) => k !== i) })}><Trash2 /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
          <div><button onClick={() => setR({ ...r, itens: [...r.itens, { codigo: "", descricao: "", quantidade: 1, unidade: "UN", pesoKg: null, volumes: null, observacao: "" }] })}><Plus /> Adicionar item</button></div>
          {r.observacoes && <p className="na">{r.observacoes}</p>}
        </>
      )}
    </Modal>
  );
}

export function GerarComIABotao() {
  return <button className="primary" onClick={() => abrirRomaneioIA()}><FileSpreadsheet /> Gerar romaneio</button>;
}
