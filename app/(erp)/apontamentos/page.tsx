"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Play, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, queueRows } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/processos";
import { FAMILIAS, familiaDe } from "@/lib/sort";
import { modeloProduto } from "@/lib/presentation";
import { fmt, fmtPct, pct } from "@/lib/format";
import { exportarExcel, linhaOp } from "@/lib/export";
import { calcularCriticos } from "@/lib/criticos";
import type { Produto, Operacao } from "@/types/pcp";
import { Badge, Drawer, Empty, Field, Modal, PageHeader, Progress, Segmented, Status, type Tone } from "@/components/ui";
import { FamiliaTabs, TableScroll } from "@/components/table-scroll";

const MOTIVOS = ["Falta material", "Quebra máquina", "Manutenção", "Setup", "Aguardando peça", "Aguardando OF", "Qualidade", "Falta operador", "Outro"];

export default function Apontamentos() {
  const { pg, me, andon: andons, refresh, toast } = useOps();
  const products = pg?.produtos || [];
  const procs: string[] = me?.processos?.length
    ? PROCESSOS.filter((x) => me.processos.includes(x))
    : [...PROCESSOS];

  const [proc, setProc] = useState("");
  const [fam, setFam] = useState("TODAS");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [andon, setAndon] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [acima, setAcima] = useState<number | null>(null);

  // lembra o último processo usado
  useEffect(() => {
    if (!procs.length) return;
    const salvo = (() => { try { return localStorage.getItem("pcp:proc") || ""; } catch { return ""; } })();
    if (!proc || !procs.includes(proc)) setProc(procs.includes(salvo) ? salvo : procs[0]);
  }, [procs.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const escolher = (p: string) => { setProc(p); try { localStorage.setItem("pcp:proc", p); } catch {} };

  const criticos = useMemo(() => new Map(calcularCriticos(products, andons).map((c) => [c.o.id, c])), [products, andons]);
  const todas = useMemo(() => queueRows(products, proc), [products, proc]);
  const rows = todas
    .filter((x) => fam === "TODAS" || familiaDe(x.p.categoria) === fam)
    .filter((x) => !q || [x.p.of, x.p.pedido, x.p.descricao, x.p.medida, x.p.cor].join(" ").toUpperCase().includes(q.toUpperCase()));

  // seleção sempre lida da lista viva (polling não desatualiza o drawer)
  const sel: { p: Produto; o: Operacao } | null = useMemo(() => {
    if (!selId) return null;
    for (const p of products) { const o = p.operacoes.find((x) => x.id === selId); if (o) return { p, o }; }
    return null;
  }, [selId, products]);

  const saldo = sel ? Math.max(0, sel.o.quantidadePlanejada - sel.o.quantidadeProduzida) : 0;

  async function call(url: string, method: string, body: unknown, ok: string) {
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { const e: any = new Error(j.error); e.codigo = j.codigo; throw e; }
      toast("success", ok);
      await refresh();
      return true;
    } catch (e: any) {
      if (e.codigo === "ACIMA_SALDO") setAcima(Number((body as any).value));
      else toast("error", e.message);
      return false;
    } finally { setBusy(false); }
  }

  const op = (action: string, value?: number, force = false) =>
    sel && call(`/api/operacoes/${sel.o.id}`, "PATCH", { action, value, force }, action === "FINALIZAR" ? "Operação finalizada; próxima etapa liberada." : "Apontamento registrado.");

  const somar = async (n: number) => { if (n > 0 && (await op("SOMAR", n))) setQty(""); };
  const refugo = async () => { const n = Number(qty); if (sel && n > 0 && (await op("REFUGO", sel.o.quantidadeRefugo + n))) setQty(""); };
  const tecla = (t: string) => setQty((v) => (t === "⌫" ? v.slice(0, -1) : (v + t).replace(/^0+(?=\d)/, "").slice(0, 7)));

  async function sendAndon() {
    if (!sel) return;
    if (await call("/api/andon", "POST", { operacaoId: sel.o.id, processo: sel.o.processo, motivo, observacao: obs }, "Andon aberto para gestão.")) { setAndon(false); setObs(""); }
  }

  function exportar() {
    exportarExcel([{ nome: LABELS[proc] || proc, linhas: rows.map((x) => linhaOp(x.p, x.o)) }], `Apontamentos_${LABELS[proc] || proc}`);
  }

  const emProd = todas.filter((x) => x.o.status === "EM_ANDAMENTO").length;
  const aguard = todas.filter((x) => x.o.status === "LIBERADA").length;

  const tomPrio = (v: string): Tone => (/URGENTE/i.test(v) ? "danger" : /ALTA/i.test(v) ? "warning" : "neutral");
  const podeApontar = sel && (sel.o.status === "LIBERADA" || sel.o.status === "EM_ANDAMENTO");

  return (
    <>
      <PageHeader
        eyebrow="Chão de fábrica"
        title="Apontamentos"
        description="Toque na linha para apontar. Fila da maior medida para a menor."
        actions={<button onClick={exportar}><FileSpreadsheet /> Exportar Excel</button>}
      />

      <div className="op-procs">
        <Segmented value={proc} onChange={escolher} options={procs.map((p) => ({ value: p, label: LABELS[p] || p }))} />
      </div>

      <section className="op-toolbar">
        <div>
          <b>{LABELS[proc] || proc}</b>
          <span className="muted">{aguard} aguardando · {emProd} em produção</span>
        </div>
        <div className="search">
          <Search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar OF, pedido, medida ou peça" autoFocus />
        </div>
      </section>

      <FamiliaTabs value={fam} onChange={setFam} familias={FAMILIAS} />

      <TableScroll>
        <table>
          <thead>
            <tr>
              <th>Seq.</th><th>Pedido</th><th>Item</th><th>OF</th><th>Produto</th><th>Família</th><th>Descrição</th>
              <th>Tipo</th><th>Rebaixo</th><th>Acabamento</th><th>Cor</th><th className="num">Qtd programada</th>
              <th className="num">Comp.</th><th className="num">Larg.</th><th className="num">Esp.</th>
              <th className="num">Qtd produzida</th><th className="num">Saldo</th><th className="num">% concluído</th><th>Status</th><th>Prioridade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, o }, i) => {
              const c = criticos.get(o.id);
              const m = modeloProduto(p, o, pg?.turno || "");
              return (
                <tr key={o.id} className={`clickRow ${c ? "critRow" : ""}`} onClick={() => { setSelId(o.id); setQty(""); }}>
                  <td className="mono">{String(i + 1).padStart(2, "0")}</td>
                  <td>{m.pedido}</td><td>{m.item}</td><td><b>{m.of}</b></td><td>{m.produto}</td>
                  <td><div className="row" style={{ gap: "var(--sp-1)" }}><Badge>{m.familia}</Badge>{c && <Badge tone="danger">Crítico</Badge>}</div></td>
                  <td className="descCell"><b>{m.descricao}</b></td><td>{m.tipo}</td><td>{m.rebaixo}</td><td>{m.acabamento}</td><td>{m.cor}</td>
                  <td className="num">{fmt(m.planejado)}</td><td className="num mono">{fmt(m.comprimento)}</td><td className="num mono">{fmt(m.largura)}</td><td className="num mono">{fmt(m.espessura)}</td>
                  <td className="num">{fmt(m.produzido)}</td><td className="num"><b>{fmt(m.saldo)}</b></td><td className="num">{fmtPct(m.concluido)}</td>
                  <td><Status value={o.status} /></td><td><Badge tone={tomPrio(String(m.prioridade))}>{m.prioridade}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <Empty title="Nenhuma OF na fila." />}
      </TableScroll>

      <Drawer open={!!sel} title={sel ? `OF ${sel.p.of || "-"}` : "Operação"} onClose={() => setSelId(null)}>
        {sel && (
          <div className="op-drawer">
            <header className="op-head">
              <div className="row between"><span className="muted">Pedido {sel.p.pedido}</span><Status value={sel.o.status} /></div>
              <h2>{sel.p.descricao}</h2>
              <p className="muted">{familiaDe(sel.p.categoria)} · {sel.p.medida || "sem medida"}</p>
            </header>

            <div className="op-qty-board">
              <div><small>Planejado</small><b>{fmt(sel.o.quantidadePlanejada)}</b></div>
              <div><small>Produzido</small><b>{fmt(sel.o.quantidadeProduzida)}</b></div>
              <div><small>Refugo</small><b>{fmt(sel.o.quantidadeRefugo)}</b></div>
              <div className="highlight"><small>Saldo</small><b>{fmt(saldo)}</b></div>
            </div>
            <Progress value={pct(sel.o.quantidadeProduzida, sel.o.quantidadePlanejada)} tone={saldo === 0 ? "success" : "info"} label={`${fmtPct(pct(sel.o.quantidadeProduzida, sel.o.quantidadePlanejada))}`} />

            <dl className="kv">
              {[["Material", sel.p.material], ["Rebaixo", sel.p.rebaixo], ["Acabamento", sel.p.acabamento], ["Cor", sel.p.cor]].map(([a, b]) => (
                <div key={a}><dt>{a}</dt><dd>{b || "-"}</dd></div>
              ))}
            </dl>

            {podeApontar && (
              <>
                <div className="op-qty-display" aria-live="polite">{qty || "0"}</div>
                <div className="op-keypad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].map((t) => (
                    <button key={t} type="button" onClick={() => tecla(t)}>{t}</button>
                  ))}
                  <button type="button" className="success" disabled={busy || !Number(qty)} onClick={() => somar(Number(qty))}>Lançar</button>
                </div>
                <div className="op-quick">
                  {[1, 5, 10].map((n) => <button key={n} type="button" disabled={busy} onClick={() => somar(n)}>+{n}</button>)}
                  <button type="button" disabled={busy || !saldo} onClick={() => somar(saldo)}>Tudo ({fmt(saldo)})</button>
                  <button type="button" className="danger" disabled={busy || !Number(qty)} onClick={refugo}>+ Refugo</button>
                </div>
              </>
            )}

            <div className="op-actions">
              {sel.o.status === "LIBERADA" && <button className="primary" disabled={busy} onClick={() => op("INICIAR")}><Play /> Iniciar</button>}
              {sel.o.status === "EM_ANDAMENTO" && <button className="success" disabled={busy} onClick={async () => { if (await op("FINALIZAR")) setSelId(null); }}><CheckCircle2 /> Finalizar</button>}
              <button onClick={() => setAndon(true)}><AlertTriangle /> Parada / Andon</button>
              <button className="danger" disabled={busy} onClick={() => op("DIVERGENCIA")}>Divergência</button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={acima !== null}
        title="Quantidade acima do saldo"
        onClose={() => setAcima(null)}
        footer={<><button onClick={() => setAcima(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={async () => { const n = acima!; setAcima(null); if (await op("SOMAR", n, true)) setQty(""); }}>Confirmar mesmo assim</button></>}
      >
        <p className="modalText">Você está lançando <b>{fmt(acima)}</b>, mas o saldo é <b>{fmt(saldo)}</b>. Confirma o excedente?</p>
      </Modal>

      <Modal
        open={andon}
        title="Abrir Andon"
        onClose={() => setAndon(false)}
        footer={<><button onClick={() => setAndon(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={sendAndon}>Abrir Andon</button></>}
      >
        <div className="form-grid">
          <Field label="Processo"><input value={LABELS[sel?.o.processo || ""] || sel?.o.processo || ""} readOnly /></Field>
          <Field label="OF"><input value={sel?.p.of || ""} readOnly /></Field>
          <Field label="Motivo" className="span-all"><select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Descrição" className="span-all"><textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={4} /></Field>
        </div>
      </Modal>
    </>
  );
}
