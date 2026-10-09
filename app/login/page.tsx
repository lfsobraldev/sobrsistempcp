"use client";

import { useState } from "react";
import {
  ArrowRight,
  Boxes,
  Factory,
  Gauge,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro("");
    setBusy(true);

    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usuario, senha }),
      });

      const json = await resposta.json();
      if (!resposta.ok) throw new Error(json.error || "Falha ao entrar.");

      router.replace("/dashboard");
    } catch (e: any) {
      setErro(e?.message || "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fioriLogin">
      <section className="fioriLoginBrandPanel">
        <div className="fioriLoginLogo">
          <span><Factory /></span>
          <div>
            <b>Sobral PCP</b>
            <small>ERP Industrial</small>
          </div>
        </div>

        <div className="fioriLoginIntro">
          <span>OPERAÇÃO INDUSTRIAL</span>
          <h1>Produção, programação e controle em uma única plataforma.</h1>
          <p>
            Acompanhe o fluxo produtivo, prioridades, apontamentos, qualidade,
            romaneios e exceções com atualização em tempo real.
          </p>

          <div className="fioriLoginFeatures">
            <article>
              <Gauge />
              <div>
                <b>Visão em tempo real</b>
                <span>Indicadores, filas, gargalos e progresso do turno.</span>
              </div>
            </article>
            <article>
              <Workflow />
              <div>
                <b>Sequenciamento industrial</b>
                <span>Pedidos e peças organizados por setor e máquina.</span>
              </div>
            </article>
            <article>
              <ShieldCheck />
              <div>
                <b>Qualidade integrada</b>
                <span>Inspeções, bloqueios e não conformidades no mesmo fluxo.</span>
              </div>
            </article>
            <article>
              <Boxes />
              <div>
                <b>Expedição conectada</b>
                <span>Romaneios e acompanhamento de pedidos sem retrabalho manual.</span>
              </div>
            </article>
          </div>
        </div>

        <footer>
          <span>Unidade Nordeste</span>
          <small>Ambiente corporativo · acesso autorizado</small>
        </footer>
      </section>

      <section className="fioriLoginFormPanel">
        <form className="fioriLoginCard" onSubmit={entrar}>
          <div className="fioriLoginCardHead">
            <span>Acesso ao sistema</span>
            <h2>Entrar</h2>
            <p>Use suas credenciais operacionais.</p>
          </div>

          <label>
            <span>Usuário</span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              placeholder="Digite seu usuário"
              aria-label="Usuário"
              required
            />
          </label>

          <label>
            <span>Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              placeholder="Digite sua senha"
              aria-label="Senha"
              required
            />
          </label>

          {erro && <div className="fioriMessageStrip error">{erro}</div>}

          <button className="fioriPrimaryButton" disabled={busy}>
            {busy ? "Validando..." : <>Entrar <ArrowRight /></>}
          </button>

          <small className="fioriLoginHelp">
            Em caso de bloqueio de acesso, procure o responsável pelo PCP.
          </small>
        </form>
      </section>
    </main>
  );
}
