"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Boxes, Gauge, ShieldCheck, UserRound } from "lucide-react";
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
    <main className="login-page">
      <header className="login-header">
        <div className="login-system">
          <BrandLogo size={40} />
          <span><b>Sobral PCP</b><small>ERP Industrial</small></span>
        </div>
        <span className="login-environment">ACESSO CORPORATIVO</span>
      </header>

      <div className="login-content">
        <section className="login-intro" aria-labelledby="login-welcome">
          <span className="login-kicker">OPERAÇÃO INTEGRADA</span>
          <h1 id="login-welcome">Gestão industrial, do pedido à expedição.</h1>
          <p>Entre para acompanhar programação, produção, qualidade e entregas em um único ambiente.</p>
          <ul>
            <li><Gauge size={18} /><span><b>Visão operacional</b><small>Indicadores e filas da programação</small></span></li>
            <li><Boxes size={18} /><span><b>Fluxo de produção</b><small>Pedidos, operações e expedição</small></span></li>
            <li><ShieldCheck size={18} /><span><b>Rastreabilidade</b><small>Controle de qualidade e histórico</small></span></li>
          </ul>
        </section>

        <section className="login-form" aria-labelledby="login-heading">
          <div className="login-card">
            <div className="login-card-heading">
              <span>ACESSO AO SISTEMA</span>
              <h2 id="login-heading">Entrar</h2>
              <p>Use suas credenciais corporativas.</p>
            </div>
            {erro && <div className="login-error" role="alert"><AlertCircle size={17} />{erro}</div>}
            <form onSubmit={entrar} aria-busy={busy}>
              <label className="login-field" htmlFor="u">Usuário
                <span className="login-input-wrap"><UserRound size={17} /><input id="u" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" aria-invalid={!!erro} required /></span>
              </label>
              <label className="login-field" htmlFor="s">Senha
                <span className="login-input-wrap"><ShieldCheck size={17} /><input id="s" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" aria-invalid={!!erro} required /></span>
              </label>
              <button className="primary login-submit" disabled={busy}>
                {busy ? <><span className="login-spinner" aria-hidden="true" /> Verificando acesso...</> : <>Acessar sistema <ArrowRight size={17} /></>}
              </button>
            </form>
            <p className="login-card-foot">Acesso restrito a usuários autorizados.</p>
          </div>
        </section>
      </div>
      <footer className="login-footer">Sobral PCP <span>·</span> Planejamento e controle industrial</footer>
    </main>
  );
}
