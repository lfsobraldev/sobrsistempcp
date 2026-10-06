"use client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useRef } from "react";

/** Área de tabela com cabeçalho fixo, rolagem própria e botões topo/fim. */
export function TableScroll({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = (top: number) => ref.current?.scrollTo({ top, behavior: "smooth" });
  return (
    <div className={`tableScroll ${className}`}>
      <div className="tableWrap" ref={ref}>{children}</div>
      <div className="scrollBtns">
        <button type="button" aria-label="Ir ao topo" onClick={() => go(0)}><ChevronUp /></button>
        <button type="button" aria-label="Ir ao fim" onClick={() => go(ref.current?.scrollHeight || 0)}><ChevronDown /></button>
      </div>
    </div>
  );
}

export function FamiliaTabs({ value, onChange, familias }: { value: string; onChange: (v: string) => void; familias: readonly string[] }) {
  return (
    <div className="familyTabs">
      {["TODAS", ...familias].map((f) => (
        <button type="button" key={f} className={value === f ? "active" : ""} onClick={() => onChange(f)}>{f}</button>
      ))}
    </div>
  );
}
