"use client";

import { ExternalLink, Maximize2 } from "lucide-react";
import { useState } from "react";

const ROMANEIO_URL =
  process.env.NEXT_PUBLIC_ROMANEIO_URL ||
  "https://romaneiosget.vercel.app";

export default function RomaneiosPage() {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <section
      style={{
        position: fullscreen ? "fixed" : "relative",
        inset: fullscreen ? 0 : undefined,
        zIndex: fullscreen ? 9999 : undefined,
        background: "#fff",
        minHeight: fullscreen ? "100vh" : undefined,
      }}
    >
      {!fullscreen && (
        <div className="pageTitle">
          <div>
            <span>EXPEDIÇÃO</span>
            <h1>Romaneios</h1>
            <p>Gerador de romaneios, revisão, container e etiquetas.</p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="secondary"
              onClick={() => setFullscreen(true)}
              type="button"
            >
              <Maximize2 />
              Tela cheia
            </button>

            <a
              className="secondary"
              href={ROMANEIO_URL}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              <ExternalLink />
              Abrir separado
            </a>
          </div>
        </div>
      )}

      {fullscreen && (
        <button
          type="button"
          className="secondary"
          onClick={() => setFullscreen(false)}
          style={{
            position: "fixed",
            right: 18,
            top: 14,
            zIndex: 10001,
          }}
        >
          Sair da tela cheia
        </button>
      )}

      <div
        style={{
          height: fullscreen ? "100vh" : "calc(100vh - 190px)",
          minHeight: 680,
          border: fullscreen ? 0 : "1px solid #dfe3e8",
          borderRadius: fullscreen ? 0 : 10,
          overflow: "hidden",
          background: "#f6f7f8",
        }}
      >
        <iframe
          src={ROMANEIO_URL}
          title="Gerador de Romaneios Famossul"
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            background: "#fff",
          }}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </section>
  );
}
