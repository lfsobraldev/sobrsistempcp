"use client";

import { useEffect } from "react";

/** Preenche data-label nas células a partir do cabeçalho, para que qualquer tabela vire cartões no celular (ver erp-responsive.css). */
export function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;
    const aplicar = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>("table").forEach((t) => {
        const heads = Array.from(t.querySelectorAll<HTMLTableCellElement>("thead th")).map((h) => (h.textContent || "").trim());
        if (!heads.length) return;
        t.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((tr) => {
          let i = 0;
          Array.from(tr.children).forEach((c) => {
            const td = c as HTMLTableCellElement;
            const span = td.colSpan || 1;
            if (span === 1 && !td.hasAttribute("data-label") && heads[i]) td.setAttribute("data-label", heads[i]);
            i += span;
          });
        });
      });
    };
    const agendar = () => { if (!frame) frame = requestAnimationFrame(aplicar); };
    agendar();
    const obs = new MutationObserver(agendar);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}
