"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type Doc = { documento_id: string; codigo: string; titulo: string; tipo: string; versao_id: string; versao: number; conteudo: string; anexo_url: string; lido?: boolean };

/** Gaveta do operador: instrução do roteiro + documentos aprovados vinculados ao setor/produto da operação. */
export function InstrucaoOperacao({ operacaoId, titulo, onClose }: { operacaoId: string; titulo: string; onClose: () => void }) {
  const [d, setD] = useState<{ documentos: Doc[]; instrucaoRoteiro: { texto: string; revisao: string } | null } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    fetch(`/api/documentos/operacao?operacaoId=${operacaoId}`, { cache: "no-store" }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!vivo) return; if (!r.ok) setErro(j.error || "Falha ao carregar."); else setD(j); }).catch(() => vivo && setErro("Falha ao carregar."));
    return () => { vivo = false; };
  }, [operacaoId]);
  const ciente = async (v: Doc) => {
    await fetch("/api/documentos/operacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versaoId: v.versao_id }) });
    setD((x) => (x ? { ...x, documentos: x.documentos.map((y) => (y.versao_id === v.versao_id ? { ...y, lido: true } : y)) } : x));
  };
  return (
    <div className="cart-drawer-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="cart-drawer" role="dialog" aria-label="Instruções da operação">
        <header><div><h2>Instruções · {titulo}</h2></div><button className="cart-btn sm" onClick={onClose} aria-label="Fechar"><X size={16} /></button></header>
        {erro && <p className="cart-msg err">{erro}</p>}
        {!d && !erro && <p className="cart-note">Carregando…</p>}
        {d && !d.documentos.length && !d.instrucaoRoteiro && <p className="cart-note">Nenhuma instrução vinculada a esta operação.</p>}
        {d?.instrucaoRoteiro && <div><h3>Instrução do roteiro (rev. {d.instrucaoRoteiro.revisao || "—"})</h3><p style={{ whiteSpace: "pre-wrap" }}>{d.instrucaoRoteiro.texto}</p></div>}
        {d?.documentos.map((x) => (
          <div key={x.versao_id}>
            <h3>{x.codigo} · {x.titulo} <small>(versão {x.versao})</small></h3>
            {x.conteudo && <p style={{ whiteSpace: "pre-wrap" }}>{x.conteudo}</p>}
            {x.anexo_url && /^https?:\/\//.test(x.anexo_url) && <p><a href={x.anexo_url} target="_blank" rel="noopener noreferrer">Abrir anexo / desenho</a></p>}
            <button className="cart-btn sm" disabled={!!x.lido} onClick={() => void ciente(x)}>{x.lido ? "Ciente registrado" : "Estou ciente"}</button>
          </div>
        ))}
      </aside>
    </div>
  );
}
