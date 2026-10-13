"use client";

import { useState } from "react";
import { ArrowRight, Gauge, ShieldCheck, Boxes } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

export default function Login() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usuario, senha }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Falha ao entrar.");
      router.replace("/dashboard");
    } catch (err: any) {
      setErro(err?.message || "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand">
          <BrandLogo size={42} />
          <span className="brand-copy"><b>Sobral PCP</b><small>PCP Industrial</small></span>
        </div>
        <h1>Produção, qualidade e expedição em uma única plataforma.</h1>
        <p>Programação, apontamentos, romaneios e um assistente de IA que responde e executa tarefas.</p>
        <ul>
          <li><Gauge size={16} /> Indicadores e filas em tempo real</li>
          <li><Boxes size={16} /> Romaneios gerados com IA</li>
          <li><ShieldCheck size={16} /> Controle de qualidade e rastreabilidade</li>
        </ul>
      </section>
      <section className="login-form">
        <div className="login-card">
          <div>
            <h2>Entrar</h2>
            <p className="na">Use seu usuário corporativo.</p>
          </div>
          {erro && <div className="messageStrip error">{erro}</div>}
          <form onSubmit={entrar}>
            <div><label htmlFor="u">Usuário</label><input id="u" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required /></div>
            <div><label htmlFor="s">Senha</label><input id="s" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required /></div>
            <button className="primary" disabled={busy}>{busy ? "Entrando..." : "Entrar"} <ArrowRight /></button>
          </form>
        </div>
      </section>
    </main>
  );
}
