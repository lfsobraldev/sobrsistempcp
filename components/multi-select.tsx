"use client";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type Opcao = { value: string; label: string };

/** Seleção múltipla em lista suspensa (padrão filtro de ERP). Vazio = "Todos". */
export default function MultiSelect({ label, opcoes, valores, onChange, todos = "Todos" }: {
  label: string; opcoes: Opcao[]; valores: string[]; onChange: (v: string[]) => void; todos?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const resumo = valores.length === 0 ? todos : valores.length === 1 ? (opcoes.find((o) => o.value === valores[0])?.label ?? valores[0]) : `${valores.length} selecionados`;
  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return (q ? opcoes.filter((o) => o.label.toLocaleLowerCase("pt-BR").includes(q)) : opcoes).slice(0, 300);
  }, [opcoes, busca]);
  const alternar = (v: string) => onChange(valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v]);

  return (
    <div className="ms" ref={raiz}>
      <span className="ms-label" id={`${id}-l`}>{label}</span>
      <button type="button" className="ms-trigger" aria-haspopup="listbox" aria-expanded={aberto} aria-labelledby={`${id}-l`} onClick={() => setAberto((v) => !v)}>
        <span className={valores.length ? "ms-value on" : "ms-value"}>{resumo}</span><ChevronDown size={15} />
      </button>
      {aberto && (
        <div className="ms-pop" role="listbox" aria-multiselectable="true" aria-labelledby={`${id}-l`}>
          {opcoes.length > 8 && <input className="ms-search" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />}
          <button type="button" className="ms-opt" role="option" aria-selected={valores.length === 0} onClick={() => onChange([])}>
            <i className={valores.length === 0 ? "ms-box on" : "ms-box"}>{valores.length === 0 && <Check size={12} />}</i>{todos}
          </button>
          {visiveis.map((o) => {
            const on = valores.includes(o.value);
            return <button type="button" key={o.value} className="ms-opt" role="option" aria-selected={on} onClick={() => alternar(o.value)}><i className={on ? "ms-box on" : "ms-box"}>{on && <Check size={12} />}</i>{o.label}</button>;
          })}
          {!visiveis.length && <div className="ms-empty">Nada encontrado</div>}
        </div>
      )}
    </div>
  );
}
