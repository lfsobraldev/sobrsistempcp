"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { DoorElevation, FactoryRoof } from "@/components/door-art";

export default function Login() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
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
    <main className="lg">
      <section className="lg-art" aria-hidden="true">
        <div className="lg-art-top"><BrandLogo size={38} /><span><b>Sobral PCP</b><small>Gestão industrial</small></span></div>
        <div className="lg-art-copy">
          <h1>Do pedido à porta entregue.</h1>
          <p>Programação, produção, qualidade, expedição e financeiro no mesmo sistema.</p>
        </div>
        <DoorElevation className="lg-doors" />
        <FactoryRoof className="lg-roof" />
      </section>

      <section className="lg-form-side" aria-labelledby="lg-title">
        <div className="lg-card">
          <div className="lg-brand-mobile"><BrandLogo size={34} /><b>Sobral PCP</b></div>
          <h2 id="lg-title">Acesso ao sistema</h2>
          <p className="lg-lead">Use suas credenciais corporativas.</p>
          {erro && <div className="lg-error" role="alert"><AlertCircle size={16} />{erro}</div>}
          <form onSubmit={entrar} aria-busy={busy}>
            <label htmlFor="u">Usuário
              <span className="lg-input"><UserRound size={16} /><input id="u" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoFocus aria-invalid={!!erro} required /></span>
            </label>
            <label htmlFor="s">Senha
              <span className="lg-input"><Lock size={16} /><input id="s" type={ver ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" aria-invalid={!!erro} required />
                <button type="button" className="lg-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}>{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
            </label>
            <button className="lg-submit" disabled={busy}>
              {busy ? <><span className="lg-spin" aria-hidden="true" />Verificando acesso</> : <>Entrar <ArrowRight size={16} /></>}
            </button>
          </form>
          <p className="lg-foot">Acesso restrito a usuários autorizados.</p>
        </div>
      </section>
    </main>
  );
}
