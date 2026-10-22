"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Activity,
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
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOpsVisao as useOps } from "@/components/operational-provider";
import { Badge, Card, DataTable, PageHeader, Progress, StatCard, type Tone } from "@/components/ui";
import { LABELS, resumoMaquinas } from "@/lib/metrics";
import { fmt, fmtPct, pct } from "@/lib/format";
import { diagnosticarSetores, resumoIndustrial } from "@/lib/industrial/opportunity";

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

function tone(status: string): Tone {
  const s = String(status || "").toUpperCase();
  if (s.includes("ATRAS")) return "danger";
  if (s.includes("URGENTE")) return "warning";
  if (s.includes("CONCL")) return "success";
  if (s.includes("ANDAMENTO")) return "info";
  return "neutral";
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
  const { pg, lastSync, refresh,recorteQuery } = useOps();
  const produtos = pg?.produtos || [];
  const maquinas = useMemo(() => resumoMaquinas(produtos), [produtos]);
  const operacoes = produtos.flatMap((p) => p.operacoes);
  const diagnosticoSetores = useMemo(() => diagnosticarSetores(produtos), [produtos]);
  const oportunidades = useMemo(() => resumoIndustrial(diagnosticoSetores), [diagnosticoSetores]);

  const [gestao, setGestao] = useState<{ controles: Controle[]; excecoes: Excecao[] }>({
    controles: [],
    excecoes: [],
  });
  const [busy, setBusy] = useState(false);
  const [inteligencia, setInteligencia] = useState<{
    acoes: Array<{ nivel: "critico" | "atencao" | "info"; titulo: string; detalhe: string }>;
    riscos: Array<{ pedido: string; risco: string; score: number; sinais: string[] }>;
    capacidade: Array<{ processo: string; saldo: number; capacidadeTurno: number | null; cargaPct: number | null; gargalo: boolean | null }>;
  }>({ acoes: [], riscos: [], capacidade: [] });

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/gestao-producao?recorte=1&"+recorteQuery, { cache: "no-store" }),
      fetch("/api/inteligencia/resumo?recorte=1&"+recorteQuery, { cache: "no-store" }),
    ])
      .then(async ([r, ri]) => {
        const j = r.ok ? await r.json() : { controles: [], excecoes: [] };
        const ji = ri.ok ? await ri.json() : { acoes: [], riscos: [], capacidade: [] };
        if (!alive) return;
        setGestao({ controles: j.controles || [], excecoes: j.excecoes || [] });
        setInteligencia({
          acoes: ji.acoes || [],
          riscos: ji.riscos || [],
          capacidade: ji.capacidade || [],
        });
      });
    return () => {
      alive = false;
    };
  }, [pg?.id, lastSync?.getTime(),recorteQuery]);

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
      const r = await fetch("/api/gestao-producao?recorte=1&"+recorteQuery, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setGestao({ controles: j.controles || [], excecoes: j.excecoes || [] });
      }
      const ri = await fetch("/api/inteligencia/resumo?recorte=1&"+recorteQuery, { cache: "no-store" });
      if (ri.ok) {
        const ji = await ri.json();
        setInteligencia({
          acoes: ji.acoes || [],
          riscos: ji.riscos || [],
          capacidade: ji.capacidade || [],
        });
      }
    } finally {
      setBusy(false);
    }
  }

  const atalhos = [
    { href: "/programacao", icon: <UploadCloud />, label: "Programação", value: pedidos.length, hint: "pedidos no filtro ativo" },
    { href: "/programacao-gerente", icon: <Route />, label: "Programação Gerente", value: atrasados + proximos, hint: "prazo exige atenção" },
    { href: "/lideres", icon: <Factory />, label: "Líderes / Setores", value: maquinas.length, hint: "setores com carga" },
    { href: "/excecoes", icon: <PackageSearch />, label: "Faltas e Retrabalho", value: excecoesAbertas.length, hint: "ocorrências abertas" },
    { href: "/inspecao-pallets", icon: <ShieldCheck />, label: "Qualidade", value: fmt(refugo), hint: "refugo registrado" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Central industrial"
        title="Produção em tempo real"
        description="Prioridades, prazo, faltas, gargalos e execução da programação ativa em uma única tela."
        actions={
          <>
            <span className="ctx-chip" title="Programação em exibição">
              {pg?.id ? `Turno ${pg.turno} · ${pg.data ? new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR") : "-"}` : pg?.filtro || "Recorte"}
            </span>
            <button onClick={atualizar} disabled={busy}>
              <RefreshCw className={busy ? "spin" : ""} /> {busy ? "Atualizando" : "Atualizar"}
            </button>
          </>
        }
      />

      <section className="launchpad" aria-label="Acessos rápidos">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href} className="tile">
            <span className="tileIcon">{a.icon}</span>
            <div><span>{a.label}</span><b>{a.value}</b><small>{a.hint}</small></div>
          </Link>
        ))}
      </section>

      <section className="stats">
        <StatCard icon={<Boxes />} label="Pedidos ativos" value={pedidosAtivos} hint={`${pedidos.length} no filtro`} />
        <StatCard icon={<Gauge />} label="Execução" value={fmtPct(andamento)} hint={`${fmt(produzido)} / ${fmt(planejado)} peças`} />
        <StatCard icon={<CalendarClock />} label="Atrasados" value={atrasados} hint={`${proximos} próximos do prazo`} tone={atrasados ? "danger" : "neutral"} />
        <StatCard icon={<PackageSearch />} label="Faltas / exceções" value={excecoesAbertas.length} hint="abertas na produção" tone={excecoesAbertas.length ? "warning" : "neutral"} />
        <StatCard icon={<Factory />} label="Setores ativos" value={maquinas.length} hint="com carga programada" />
        <StatCard icon={<Wrench />} label="Refugo" value={fmt(refugo)} hint={`${fmt(saldo)} peças restantes`} tone={refugo ? "warning" : "neutral"} />
      </section>

      <Card title="Gestão de gargalos e oportunidades" subtitle="Análise operacional inspirada nas práticas de PCP, MES e melhoria contínua. Fonte: filtro ativo, não telemetria em tempo real.">
        <p className="muted">Saldo por operação: {fmt(oportunidades.saldoOperacoes)} · Bloqueios/divergências: {fmt(oportunidades.pecasBloqueadasOuDivergentes)} · Setores com saldo: {oportunidades.setoresComPendencias}</p>
        <DataTable head={["Setor", "Saldo", "Bloqueadas / divergentes", "Urgências", "Ação sugerida"]}>
          {diagnosticoSetores.slice(0, 12).map((setor) => (
            <tr key={setor.processo}>
              <td><b>{LABELS[setor.processo] || setor.processo}</b></td>
              <td>{fmt(setor.saldo)}</td>
              <td>{setor.bloqueado + setor.divergencia ? <Badge tone="warning">{fmt(setor.bloqueado + setor.divergencia)}</Badge> : <span className="muted">-</span>}</td>
              <td>{setor.prioridades ? <Badge tone="danger">{setor.prioridades}</Badge> : <span className="muted">-</span>}</td>
              <td>{setor.recomendacao}</td>
            </tr>
          ))}
        </DataTable>
        <p className="muted">{oportunidades.ressalva}</p>
      </Card>

      <Card
        subtitle="Sinais da operação"
        title="O que merece atenção agora"
        className="smart-brief"
        actions={<Badge tone={inteligencia.acoes.some((a) => a.nivel === "critico") ? "danger" : inteligencia.acoes.some((a) => a.nivel === "atencao") ? "warning" : "success"}>{inteligencia.acoes.length} sinal(is)</Badge>}
      >
        <div className="smart-brief-grid">
          <div className="smart-brief-icon"><Activity /></div>
          <div className="smart-brief-list">
            {inteligencia.acoes.length ? inteligencia.acoes.slice(0, 6).map((a, i) => (
              <div className={`smart-signal smart-${a.nivel}`} key={`${a.titulo}-${i}`}>
                <span />
                <div><b>{a.titulo}</b><small>{a.detalhe}</small></div>
              </div>
            )) : <div className="empty"><span>Analisando a programação ativa…</span></div>}
          </div>
          <div className="smart-brief-actions">
            <Link href="/prioridades" className="btn">Ver prioridades</Link>
            <Link href="/programacao-gerente" className="btn">Abrir programação</Link>
          </div>
        </div>
      </Card>

      <div className="grid-main">
        <Card subtitle="Fluxo da fábrica" title="Carga por setor / máquina" actions={<small>fila restante por processo</small>}>
          <div className="bars">
            {topMaquinas.map((m: any) => (
              <div className="bar-row" key={m.processo}>
                <div><b>{LABELS[m.processo] || m.processo}</b><small>{fmt(m.filaPecas)} em fila</small></div>
                <Progress value={(Number(m.filaPecas || 0) / maxFila) * 100} label="" />
                <strong>{Number(m.progresso || 0).toFixed(0)}%</strong>
              </div>
            ))}
            {!topMaquinas.length && <div className="empty"><span>Sem carga programada.</span></div>}
          </div>
        </Card>

        <Card subtitle="Execução geral" title="Progresso do turno">
          <div className="row" style={{ gap: "var(--sp-5)", flexWrap: "wrap" }}>
            <div className="donut" style={{ background: `conic-gradient(var(--primary) ${Math.min(100, andamento)}%, var(--surface-3) 0)` }}>
              <div><b>{fmtPct(andamento)}</b><span>executado</span></div>
            </div>
            <dl className="kv" style={{ flex: 1, minWidth: 160 }}>
              <div><dt>Planejado</dt><dd>{fmt(planejado)}</dd></div>
              <div><dt>Produzido</dt><dd>{fmt(produzido)}</dd></div>
              <div><dt>Saldo</dt><dd>{fmt(saldo)}</dd></div>
              <div><dt>Refugo</dt><dd>{fmt(refugo)}</dd></div>
            </dl>
          </div>
        </Card>
      </div>

      <div className="grid-main">
        <Card subtitle="Atenção do gerente" title="Pedidos que podem comprometer entrega" actions={<Badge tone={criticos.length ? "warning" : "success"}>{criticos.length} prioridade(s)</Badge>}>
          {criticos.length ? (
            <DataTable head={["Pedido", "Prazo", "Etapa atual", "Exceções", "Execução"]}>
              {criticos.map((p) => {
                const dias = diasAte(p.dataEntrega);
                const t = tone(p.statusEntrega);
                return (
                  <tr key={p.pedido}>
                    <td><b>{p.pedido}</b></td>
                    <td>
                      {p.dataEntrega ? (
                        <Badge tone={t}>
                          {new Date(`${p.dataEntrega}T12:00:00`).toLocaleDateString("pt-BR")}
                          {dias !== null ? ` · ${dias < 0 ? Math.abs(dias) + "d atraso" : dias + "d"}` : ""}
                        </Badge>
                      ) : <span className="muted">Sem data</span>}
                    </td>
                    <td>{p.atual}</td>
                    <td>{p.excecoes.length ? <Badge tone="warning">{p.excecoes.length} aberta(s)</Badge> : <span className="muted">-</span>}</td>
                    <td style={{ minWidth: 160 }}><Progress value={p.progresso} tone={p.progresso >= 100 ? "success" : "info"} /></td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <div className="empty-ok"><CheckCircle2 /><span>Nenhum pedido crítico identificado com os dados atuais.</span></div>
          )}
        </Card>

        <Card subtitle="Exceções" title="Faltas, reposições e retrabalho">
          {excecoesAbertas.length ? excecoesAbertas.slice(0, 7).map((x) => (
            <div className="list-item" key={x.id}>
              <span className="tileIcon">{x.tipo === "FALTA_PECA" ? <AlertTriangle /> : x.tipo === "REPOSICAO" ? <Layers3 /> : <Wrench />}</span>
              <div>
                <b>{tipoExcecao(x.tipo)} · Pedido {x.pedido}</b>
                <span>{x.descricao || x.of || "Peça não identificada"}{x.medida ? ` · ${x.medida}` : ""}</span>
                <small>{fmt(x.quantidade)} peça(s){x.motivo ? ` · ${x.motivo}` : ""}</small>
              </div>
            </div>
          )) : <div className="empty-ok"><CheckCircle2 /><span>Sem exceções abertas.</span></div>}
        </Card>
      </div>
    </>
  );
}
