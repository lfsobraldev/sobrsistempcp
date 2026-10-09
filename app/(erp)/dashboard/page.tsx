"use client";

import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Factory,
  Gauge,
  Layers3,
  PackageSearch,
  RefreshCw,
  Route,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, resumoMaquinas } from "@/lib/metrics";
import { fmt, fmtPct, pct } from "@/lib/format";

type Controle = {
  pedido: string;
  cliente: string;
  dataEntrega: string | null;
  statusEntrega: string;
  observacao: string;
};

type Excecao = {
  id: string;
  pedido: string;
  of: string;
  tipo: "FALTA_PECA" | "REPOSICAO" | "RETRABALHO";
  quantidade: number;
  motivo: string;
  processoRetorno: string;
  status: string;
  descricao: string;
  medida: string;
  material: string;
};

function tone(status: string) {
  const s = String(status || "").toUpperCase();
  if (s.includes("ATRAS")) return "danger";
  if (s.includes("URGENTE")) return "warn";
  if (s.includes("CONCL")) return "ok";
  if (s.includes("ANDAMENTO")) return "info";
  return "";
}

function diasAte(data?: string | null) {
  if (!data) return null;
  const d = new Date(`${data}T12:00:00`);
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12);
  return Math.ceil((d.getTime() - inicioHoje.getTime()) / 86400000);
}

function tipoExcecao(tipo: string) {
  if (tipo === "FALTA_PECA") return "Falta de peça";
  if (tipo === "REPOSICAO") return "Reposição";
  if (tipo === "RETRABALHO") return "Retrabalho";
  return tipo;
}

export default function Dashboard() {
  const { pg, lastSync, refresh } = useOps();
  const produtos = pg?.produtos || [];
  const maquinas = useMemo(() => resumoMaquinas(produtos), [produtos]);
  const operacoes = produtos.flatMap((p) => p.operacoes);

  const [gestao, setGestao] = useState<{ controles: Controle[]; excecoes: Excecao[] }>({
    controles: [],
    excecoes: [],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/gestao-producao", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { controles: [], excecoes: [] }))
      .then((j) => {
        if (alive) setGestao({ controles: j.controles || [], excecoes: j.excecoes || [] });
      });
    return () => {
      alive = false;
    };
  }, [pg?.id, lastSync?.getTime()]);

  const planejado = operacoes.reduce((s, o) => s + Number(o.quantidadePlanejada || 0), 0);
  const produzido = operacoes.reduce((s, o) => s + Number(o.quantidadeProduzida || 0), 0);
  const refugo = operacoes.reduce((s, o) => s + Number(o.quantidadeRefugo || 0), 0);
  const saldo = Math.max(0, planejado - produzido);
  const andamento = pct(produzido, planejado);

  const pedidos = useMemo(() => {
    const map = new Map<string, typeof produtos>();
    for (const p of produtos) {
      const arr = map.get(p.pedido) || [];
      arr.push(p);
      map.set(p.pedido, arr);
    }
    return [...map.entries()].map(([pedido, itens]) => {
      const ops = itens.flatMap((p) => p.operacoes);
      const total = ops.reduce((s, o) => s + Number(o.quantidadePlanejada || 0), 0);
      const prod = ops.reduce((s, o) => s + Number(o.quantidadeProduzida || 0), 0);
      const controle = gestao.controles.find((c) => c.pedido === pedido);
      const excecoes = gestao.excecoes.filter((e) => e.pedido === pedido && e.status === "ABERTA");
      const atual = itens
        .flatMap((p) => p.operacoes.map((o) => ({ p, o })))
        .find((x) => x.o.status !== "CONCLUIDA");

      return {
        pedido,
        progresso: total ? (prod / total) * 100 : 0,
        saldo: Math.max(0, total - prod),
        dataEntrega: controle?.dataEntrega || null,
        statusEntrega: controle?.statusEntrega || "SEM_DATA",
        excecoes,
        atual: atual ? LABELS[atual.o.processo] || atual.o.processo : "Concluído",
        prioridade: itens.some((p) => p.prioridade === "URGENTE")
          ? "URGENTE"
          : itens.some((p) => p.prioridade === "ALTA")
          ? "ALTA"
          : "NORMAL",
      };
    });
  }, [produtos, gestao]);

  const pedidosAtivos = pedidos.filter((p) => p.progresso < 100).length;
  const excecoesAbertas = gestao.excecoes.filter((x) => x.status === "ABERTA");
  const atrasados = pedidos.filter((p) => p.statusEntrega === "ATRASADO").length;
  const proximos = pedidos.filter((p) => {
    const d = diasAte(p.dataEntrega);
    return d !== null && d >= 0 && d <= 2 && p.progresso < 100;
  }).length;

  const criticos = [...pedidos]
    .filter(
      (p) =>
        p.progresso < 100 &&
        (p.statusEntrega === "ATRASADO" ||
          p.statusEntrega === "URGENTE" ||
          p.excecoes.length > 0 ||
          p.prioridade !== "NORMAL")
    )
    .sort((a, b) => {
      const wa =
        (a.statusEntrega === "ATRASADO" ? 100 : 0) +
        (a.statusEntrega === "URGENTE" ? 50 : 0) +
        a.excecoes.length * 20 +
        (a.prioridade === "URGENTE" ? 15 : a.prioridade === "ALTA" ? 5 : 0);
      const wb =
        (b.statusEntrega === "ATRASADO" ? 100 : 0) +
        (b.statusEntrega === "URGENTE" ? 50 : 0) +
        b.excecoes.length * 20 +
        (b.prioridade === "URGENTE" ? 15 : b.prioridade === "ALTA" ? 5 : 0);
      return wb - wa;
    })
    .slice(0, 8);

  const topMaquinas = [...maquinas].sort((a: any, b: any) => b.filaPecas - a.filaPecas).slice(0, 8);
  const maxFila = Math.max(1, ...topMaquinas.map((m: any) => Number(m.filaPecas || 0)));

  async function atualizar() {
    setBusy(true);
    try {
      await refresh();
      const r = await fetch("/api/gestao-producao", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setGestao({ controles: j.controles || [], excecoes: j.excecoes || [] });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="v12DashHeader">
        <div>
          <span>CENTRAL INDUSTRIAL</span>
          <h1>Produção em tempo real</h1>
          <p>
            Prioridades, prazo, faltas, gargalos e execução da programação ativa em uma única tela.
          </p>
        </div>
        <div className="v12DashHeaderActions">
          <div>
            <span>FILTRO ATIVO</span>
            <b>{pg?.filtro || "-"}</b>
            <small>{pg ? `Turno ${pg.turno}` : "Sem programação"}</small>
          </div>
          <button className="secondary" onClick={atualizar} disabled={busy}>
            <RefreshCw /> {busy ? "ATUALIZANDO" : "ATUALIZAR"}
          </button>
        </div>
      </section>

      <section className="v12Kpis">
        <article>
          <div className="v12KpiIcon"><Boxes /></div>
          <div><span>PEDIDOS ATIVOS</span><b>{pedidosAtivos}</b><small>{pedidos.length} no filtro</small></div>
        </article>
        <article>
          <div className="v12KpiIcon"><Gauge /></div>
          <div><span>EXECUÇÃO</span><b>{fmtPct(andamento)}</b><small>{fmt(produzido)} / {fmt(planejado)} peças</small></div>
        </article>
        <article className={atrasados ? "danger" : ""}>
          <div className="v12KpiIcon"><CalendarClock /></div>
          <div><span>ATRASADOS</span><b>{atrasados}</b><small>{proximos} próximos do prazo</small></div>
        </article>
        <article className={excecoesAbertas.length ? "warn" : ""}>
          <div className="v12KpiIcon"><PackageSearch /></div>
          <div><span>FALTAS / EXCEÇÕES</span><b>{excecoesAbertas.length}</b><small>abertas na produção</small></div>
        </article>
        <article>
          <div className="v12KpiIcon"><Factory /></div>
          <div><span>SETORES ATIVOS</span><b>{maquinas.length}</b><small>com carga programada</small></div>
        </article>
        <article className={refugo ? "warn" : ""}>
          <div className="v12KpiIcon"><Wrench /></div>
          <div><span>REFUGO</span><b>{fmt(refugo)}</b><small>{fmt(saldo)} peças restantes</small></div>
        </article>
      </section>

      <section className="v12DashGrid">
        <article className="v12Card v12Wide">
          <header>
            <div><span>FLUXO DA FÁBRICA</span><h2>Carga por setor / máquina</h2></div>
            <small>fila restante por processo</small>
          </header>
          <div className="v12MachineChart">
            {topMaquinas.map((m: any) => (
              <div key={m.processo}>
                <div className="v12MachineLabel">
                  <b>{LABELS[m.processo] || m.processo}</b>
                  <span>{fmt(m.filaPecas)} em fila</span>
                </div>
                <i>
                  <em style={{ width: `${Math.max(2, (Number(m.filaPecas || 0) / maxFila) * 100)}%` }} />
                </i>
                <strong>{Number(m.progresso || 0).toFixed(0)}%</strong>
              </div>
            ))}
            {!topMaquinas.length && <div className="empty"><span>Sem carga programada.</span></div>}
          </div>
        </article>

        <article className="v12Card">
          <header>
            <div><span>EXECUÇÃO GERAL</span><h2>Progresso do turno</h2></div>
          </header>
          <div className="v12Execution">
            <div
              className="v12Donut"
              style={{
                background: `conic-gradient(var(--green2) ${Math.min(100, andamento)}%, #e8ece9 0)`,
              }}
            >
              <div><b>{fmtPct(andamento)}</b><span>executado</span></div>
            </div>
            <dl>
              <div><dt>Planejado</dt><dd>{fmt(planejado)}</dd></div>
              <div><dt>Produzido</dt><dd>{fmt(produzido)}</dd></div>
              <div><dt>Saldo</dt><dd>{fmt(saldo)}</dd></div>
              <div><dt>Refugo</dt><dd>{fmt(refugo)}</dd></div>
            </dl>
          </div>
        </article>

        <article className="v12Card v12Wide">
          <header>
            <div><span>ATENÇÃO DO GERENTE</span><h2>Pedidos que podem comprometer entrega</h2></div>
            <small>{criticos.length} prioridade(s)</small>
          </header>
          <div className="v12RiskTable">
            <div className="v12RiskHead">
              <span>Pedido</span><span>Prazo</span><span>Etapa atual</span><span>Exceções</span><span>Execução</span>
            </div>
            {criticos.map((p) => {
              const dias = diasAte(p.dataEntrega);
              return (
                <div key={p.pedido}>
                  <b>{p.pedido}</b>
                  <span className={tone(p.statusEntrega)}>
                    {p.dataEntrega
                      ? `${new Date(`${p.dataEntrega}T12:00:00`).toLocaleDateString("pt-BR")}${dias !== null ? ` • ${dias < 0 ? Math.abs(dias) + "d atraso" : dias + "d"}` : ""}`
                      : "Sem data"}
                  </span>
                  <span>{p.atual}</span>
                  <span>{p.excecoes.length ? `${p.excecoes.length} aberta(s)` : "-"}</span>
                  <div className="v12OrderProgress">
                    <i><em style={{ width: `${Math.min(100, p.progresso)}%` }} /></i>
                    <b>{p.progresso.toFixed(0)}%</b>
                  </div>
                </div>
              );
            })}
            {!criticos.length && (
              <div className="v12NoRisk">
                <CheckCircle2 />
                <span>Nenhum pedido crítico identificado com os dados atuais.</span>
              </div>
            )}
          </div>
        </article>

        <article className="v12Card">
          <header>
            <div><span>EXCEÇÕES</span><h2>Faltas, reposições e retrabalho</h2></div>
          </header>
          <div className="v12ExceptionList">
            {excecoesAbertas.slice(0, 7).map((x) => (
              <div key={x.id}>
                <span className={`v12ExceptionType ${x.tipo.toLowerCase()}`}>
                  {x.tipo === "FALTA_PECA" ? <AlertTriangle /> : x.tipo === "REPOSICAO" ? <Layers3 /> : <Wrench />}
                </span>
                <div>
                  <b>{tipoExcecao(x.tipo)} • Pedido {x.pedido}</b>
                  <span>{x.descricao || x.of || "Peça não identificada"}{x.medida ? ` • ${x.medida}` : ""}</span>
                  <small>{fmt(x.quantidade)} peça(s){x.motivo ? ` • ${x.motivo}` : ""}</small>
                </div>
              </div>
            ))}
            {!excecoesAbertas.length && (
              <div className="v12NoRisk">
                <CheckCircle2 />
                <span>Sem exceções abertas.</span>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
