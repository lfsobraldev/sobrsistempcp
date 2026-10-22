"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export type Etiqueta = { titulo: string; linhas: string[]; qr: string; naoUsar?: boolean };

/** Renderiza etiquetas com QR e dispara a impressão do navegador (A4 ou impressora de etiquetas). */
export function useImpressaoEtiquetas() {
  const [itens, setItens] = useState<Array<Etiqueta & { img: string }>>([]);
  const [pendente, setPendente] = useState(false);
  useEffect(() => {
    if (!pendente || !itens.length) return;
    const t = setTimeout(() => { window.print(); setPendente(false); }, 150);
    return () => clearTimeout(t);
  }, [pendente, itens]);
  async function imprimir(lista: Etiqueta[]) {
    const comImg = await Promise.all(lista.map(async (e) => ({ ...e, img: await QRCode.toDataURL(e.qr, { margin: 0, width: 160 }) })));
    setItens(comImg); setPendente(true);
  }
  const area = (
    <div className="print-area" aria-hidden>
      {itens.map((e, i) => (
        <div key={i} className={`etq ${e.naoUsar ? "nao-usar" : ""}`}>
          {e.naoUsar && <div className="faixa">NÃO USAR · REVISÃO ANTIGA</div>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.img} alt="" />
          <h4>{e.titulo}</h4>
          {e.linhas.map((l, j) => <div key={j}>{l}</div>)}
        </div>
      ))}
    </div>
  );
  return { imprimir, area };
}
