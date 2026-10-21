"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

type Pallet = {
  codigo: string;
  pedido: string;
  pallet: string;
  quantidade: number;
  status: string;
  qualidade_status: string;
  msac_status: string;
  atualizado_em: string;
};

export default function RastreioPallet() {
  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setMessage({ title: "Link inválido", text: "Este código de rastreio não é válido. Solicite uma nova etiqueta à Sobral." });
      return;
    }

    const controller = new AbortController();
    void fetch("/api/pallets/public-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Rastreio indisponível.");
      setPallet(result.pallet);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setMessage({
        title: "Pallet indisponível",
        text: error instanceof Error && error.message === "Registro indisponível."
          ? "O registro não existe ou não está liberado para consulta externa."
          : "Não foi possível consultar este pallet agora. Tente novamente mais tarde.",
      });
    });
    return () => controller.abort();
  }, []);

  return <main className={styles.page}>
    <header className={styles.header}><span>SOBRAL · RASTREABILIDADE</span><b>LOGÍSTICA</b></header>
    {pallet ? <>
      <section className={styles.intro}><p>CONSULTA DE CARGA</p><h1>Pallet {pallet.pallet}</h1><span className={styles.code}>Identificação {pallet.codigo}</span></section>
      <section className={styles.statusBand} aria-label="Situação do pallet"><span className={styles.statusDot} /><div><small>SITUAÇÃO ATUAL</small><strong>Liberado</strong></div><span className={styles.updated}>Atualizado em {new Date(pallet.atualizado_em).toLocaleString("pt-BR")}</span></section>
      <dl className={styles.details}>
        <div><dt>Pedido</dt><dd>{pallet.pedido}</dd></div>
        <div><dt>Quantidade registrada</dt><dd>{pallet.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} peças</dd></div>
        <div><dt>Qualidade</dt><dd>{pallet.qualidade_status.replaceAll("_", " ")}</dd></div>
        <div><dt>Conferência MSAC</dt><dd>{pallet.msac_status.replaceAll("_", " ")}</dd></div>
      </dl>
      <footer className={styles.footer}>Consulta de leitura. Os registros de produção e expedição não são alterados por este acesso.</footer>
    </> : message ? <section className={styles.message}><span className={styles.mark}>!</span><h1>{message.title}</h1><p>{message.text}</p></section>
      : <section className={styles.message} role="status"><h1>Consultando pallet</h1><p>Carregando o status de rastreio...</p></section>}
  </main>;
}