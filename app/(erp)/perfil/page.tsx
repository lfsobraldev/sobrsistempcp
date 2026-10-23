"use client";

import { useEffect, useState } from "react";
import { Badge, Field, PageHeader, Panel } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Estado = { ativo: boolean; selecionada: string | null; permitidas: string[]; consolidado: boolean };
const NOME: Record<string, string> = { SUL: "Sul", NORDESTE: "Nordeste", MADEIRAS: "Madeiras" };
const DESCRICAO: Record<string, string> = { SUL: "Fábrica Sul", NORDESTE: "Fábrica Nordeste", MADEIRAS: "Ciclo da madeira (da árvore ao material)" };

export default function PerfilPage() {
  const { me } = useOps();
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/unidades", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setE).catch(() => setErro("Não foi possível carregar as filiais.")); }, []);

  async function escolher(unidade: string) {
    setBusy(true); setErro("");
    try {
      const r = await fetch("/api/unidades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unidade }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha ao selecionar a filial.");
      window.location.assign("/inicio"); // nova navegação limpa o estado da filial anterior
    } catch (x: any) { setErro(x.message); setBusy(false); }
  }
  if (!me) return null;
  return (
    <>
      <PageHeader eyebrow="Conta" title="Perfil e filial" description="Quem você é no sistema e em qual filial está trabalhando." />
      {erro && <p className="error">{erro}</p>}
      <div className="grid2">
        <Panel title="Seu perfil">
          <Field label="Usuário"><input value={me.usuario} readOnly /></Field>
          <Field label="Cargo"><input value={me.perfil} readOnly /></Field>
        </Panel>
        <Panel title="Filial" subtitle={e?.ativo ? "Tudo o que você vê e lança vale só para a filial escolhida." : undefined}>
          {!e ? <p className="muted">Carregando…</p> : !e.ativo ? <p className="muted">Este ambiente usa um único banco; não há troca de filial.</p> : (
            <div className="lp-tiles">
              {e.permitidas.map((u) => (
                <button key={u} type="button" className={`lp-tile ${e.selecionada === u ? "active" : ""}`} disabled={busy || e.selecionada === u} onClick={() => void escolher(u)} aria-pressed={e.selecionada === u}>
                  <span><b>{NOME[u] || u}</b><br /><small>{DESCRICAO[u] || ""}</small></span>
                  {e.selecionada === u && <Badge tone="success">Atual</Badge>}
                </button>
              ))}
              {!e.permitidas.length && <p className="muted">Nenhuma filial liberada para o seu usuário. Peça ao administrador.</p>}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
