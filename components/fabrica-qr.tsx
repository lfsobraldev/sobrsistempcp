"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, DataTable, Drawer, Empty, Field, Kpi, Panel } from "@/components/ui";
import { useImpressaoEtiquetas } from "@/components/etiquetas";
import { lerQr, qrEndereco, qrPeca } from "@/lib/qr-fabrica";

type Row = Record<string, any>;
export const NOME_ETAPA: Record<string, string> = { PREPARACAO: "Preparação", COLAGEM_PORTAS: "Colagem de portas", ESQUADRIAS_BORDAS: "Esquadrias e bordas", RECOBRIDORA_PERFIL: "Recobridora de perfil", USINAGEM: "Usinagem", USINAGEM_2: "Usinagem 2", CNC: "CNC", LUSTRACAO: "Lustração", PLASTIFICADORA: "Plastificadora", PLASTIFICADORA_PORTAS: "Plastificadora de portas", EMBALAGEM: "Embalagem", EXPEDICAO: "Expedição" };
const ETAPAS = Object.keys(NOME_ETAPA);
const ATRASO_DIAS = 5;
const S = 10; // 1 unidade da planta = 10 px no desenho

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const PALETA: Record<string, { w: number; h: number; cor: string; nome: string }> = {
  SETOR: { w: 22, h: 10, cor: "#dbeafe", nome: "Setor" }, MAQUINA: { w: 8, h: 5, cor: "#e9d5ff", nome: "Máquina" },
  TRILHO: { w: 30, h: 2, cor: "#fde68a", nome: "Trilho" }, CORREDOR: { w: 60, h: 3, cor: "#f1f5f9", nome: "Corredor" },
  PORTA: { w: 3, h: 2, cor: "#86efac", nome: "Porta" }, TEXTO: { w: 16, h: 3, cor: "#ffffff", nome: "Texto" },
};
const snap = (v: number) => Math.round(v * 2) / 2;
const novoId = () => "n" + Math.random().toString(36).slice(2, 10);

/* ============================== PLANTA DESENHADA ============================== */
export function AbaPlanta({ pode }: { pode: boolean }) {
  const [lay, setLay] = useState<Row | null>(null); const [fab, setFab] = useState<Row | null>(null); const [fluxo, setFluxo] = useState<Row | null>(null);
  const [blocos, setBlocos] = useState<Row[]>([]); const [sel, setSel] = useState<string | null>(null);
  const [editar, setEditar] = useState(false); const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [aberto, setAberto] = useState<Row | null>(null);
  const drag = useRef<{ id: string; modo: "mover" | "redim"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const carregar = useCallback(async () => {
    try {
      const [l, f, p] = await Promise.all([api("/api/wms?visao=layout"), api("/api/wms?visao=fabrica"), api("/api/mapa-fabrica")]);
      setLay(l); setFab(f); setFluxo(p);
      if (!sujo) setBlocos(l.blocos.map((b: Row) => ({ ...b })));
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, [sujo]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (editar) return; const i = setInterval(carregar, 60000); return () => clearInterval(i); }, [editar, carregar]);

  const W = (lay?.planta?.largura ?? 100) * S, H = (lay?.planta?.altura ?? 60) * S;
  const setorCod = useMemo(() => Object.fromEntries((lay?.setores ?? []).map((s: Row) => [s.id, s.codigo])), [lay]);
  const endSetor = useMemo(() => Object.fromEntries((fab?.posicoes ?? []).map((p: Row) => [p.id, p.setor])), [fab]);

  const info = (b: Row) => {
    const itens: Row[] = (fab?.itens ?? []).filter((i: Row) => (b.endereco_id && i.endereco_id === b.endereco_id) || (!b.endereco_id && b.setor_id && endSetor[i.endereco_id] === setorCod[b.setor_id]));
    const and: Row[] = b.etapa ? fluxo?.setores?.[b.etapa]?.andamento ?? [] : [];
    const atr = and.filter((p) => p.dias > ATRASO_DIAS).length;
    return { itens, and, atr };
  };

  const alterar = (id: string, patch: Row) => { setBlocos((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b))); setSujo(true); };
  const pt = (e: React.PointerEvent) => { const r = svgRef.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * (W / S), y: ((e.clientY - r.top) / r.height) * (H / S) }; };
  const iniciar = (e: React.PointerEvent, b: Row, modo: "mover" | "redim") => {
    if (!editar) return; e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pt(e); drag.current = { id: b.id, modo, sx: p.x, sy: p.y, ox: b.x, oy: b.y, ow: b.w, oh: b.h }; setSel(b.id);
  };
  const mover = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return; const p = pt(e); const dx = p.x - d.sx, dy = p.y - d.sy;
    if (d.modo === "mover") alterar(d.id, { x: Math.max(0, Math.min(W / S - 1, snap(d.ox + dx))), y: Math.max(0, Math.min(H / S - 1, snap(d.oy + dy))) });
    else alterar(d.id, { w: Math.max(1, snap(d.ow + dx)), h: Math.max(1, snap(d.oh + dy)) });
  };
  const adicionar = (tipo: string) => {
    const p = PALETA[tipo]; const id = novoId();
    setBlocos((bs) => [...bs, { id, tipo, nome: p.nome, setor_id: null, endereco_id: null, etapa: "", x: 2, y: 2, w: p.w, h: p.h, cor: p.cor }]); setSel(id); setSujo(true);
  };
  const layoutInicial = () => {
    if (blocos.length && !window.confirm("Isso substitui o desenho atual (só vale ao salvar). Continuar?")) return;
    const novos: Row[] = [];
    ETAPAS.forEach((et, i) => novos.push({ id: novoId(), tipo: "SETOR", nome: NOME_ETAPA[et], setor_id: null, endereco_id: null, etapa: et, x: 2 + (i % 4) * 24, y: 3 + Math.floor(i / 4) * 12, w: 22, h: 10, cor: "#dbeafe" }));
    (lay?.setores ?? []).forEach((s: Row, i: number) => novos.push({ id: novoId(), tipo: "SETOR", nome: s.nome, setor_id: s.id, endereco_id: null, etapa: "", x: 2 + (i % 4) * 24, y: 41 + Math.floor(i / 4) * 9, w: 22, h: 7, cor: "#fef3c7" }));
    setBlocos(novos); setSujo(true);
  };
  const salvar = async () => {
    setBusy(true); setErro(""); setOk("");
    try {
      await api("/api/wms", { acao: "LAYOUT_SALVAR", blocos: blocos.map(({ id: _i, ...b }) => b) });
      setSujo(false); setEditar(false); setOk("Planta salva."); setSel(null);
      const l = await api("/api/wms?visao=layout"); setLay(l); setBlocos(l.blocos.map((b: Row) => ({ ...b })));
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar."); } finally { setBusy(false); }
  };
  const b = blocos.find((x) => x.id === sel);
  const totalPed = new Set((fluxo ? Object.values(fluxo.setores as Record<string, Row>) : []).flatMap((s: Row) => s.andamento.map((p: Row) => p.pedido))).size;

  return (
    <>
      {erro && <p className="error" role="alert">{erro}</p>}{ok && <p className="success" role="status">{ok}</p>}
      <div className="kpis">
        <Kpi label="Pedidos rodando agora" value={totalPed} />
        <Kpi label="Itens localizados" value={fab?.itens?.length ?? 0} />
        <Kpi label="Sem endereço" value={fab?.semEndereco?.length ?? 0} tone={fab?.semEndereco?.length ? "danger" : "success"} />
      </div>
      <div className="mf-linha">
        {pode && !editar && <button className="primary" onClick={() => setEditar(true)}>Editar desenho da planta</button>}
        {editar && (<>
          <button className="primary" disabled={busy || !sujo} onClick={salvar}>Salvar planta</button>
          <button onClick={() => { setEditar(false); setSujo(false); setSel(null); setBlocos((lay?.blocos ?? []).map((x: Row) => ({ ...x }))); }}>Cancelar</button>
          <button onClick={layoutInicial}>Gerar layout inicial</button>
          {Object.keys(PALETA).map((t) => <button key={t} onClick={() => adicionar(t)}>+ {PALETA[t].nome}</button>)}
        </>)}
      </div>
      {!blocos.length && !editar && <Empty title="A planta ainda não foi desenhada" sub={pode ? "Clique em Editar desenho da planta e depois em Gerar layout inicial. Ajuste arrastando os blocos para onde ficam na fábrica." : "Peça ao PCP ou Gerente para desenhar a planta."} />}
      <div className="pl-wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={`pl-svg ${editar ? "edit" : ""}`} onPointerMove={mover} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)} onClick={() => editar && setSel(null)} role="img" aria-label="Planta da fábrica">
          <defs><pattern id="grade" width={S * 2} height={S * 2} patternUnits="userSpaceOnUse"><path d={`M ${S * 2} 0 L 0 0 0 ${S * 2}`} fill="none" stroke="#e2e8f0" strokeWidth="1" /></pattern></defs>
          <rect width={W} height={H} fill="#fff" /><rect width={W} height={H} fill="url(#grade)" />
          {blocos.map((bl) => {
            const { itens, and, atr } = info(bl);
            const vivo = !editar && bl.tipo === "SETOR";
            const fill = vivo && atr ? "#fecaca" : vivo && (and.length || itens.length) ? "#bfdbfe" : bl.cor;
            const x = bl.x * S, y = bl.y * S, w = bl.w * S, h = bl.h * S; const max = Math.max(4, Math.floor(w / 7));
            const nome = String(bl.nome ?? ""); const linhas = [] as string[];
            if (bl.tipo === "TEXTO") linhas.push(nome); else { linhas.push(nome.length > max ? nome.slice(0, max - 1) + "…" : nome); if (bl.etapa) linhas.push(`${and.length} pedido(s)${atr ? ` · ${atr} parado(s)` : ""}`); if (itens.length) linhas.push(`${itens.length} item(ns) no local`); }
            return (
              <g key={bl.id} onPointerDown={(e) => iniciar(e, bl, "mover")} onClick={(e) => { e.stopPropagation(); if (editar) setSel(bl.id); else if (bl.tipo === "SETOR" || bl.tipo === "TRILHO") setAberto(bl); }} style={{ cursor: editar ? "move" : bl.tipo === "SETOR" || bl.tipo === "TRILHO" ? "pointer" : "default" }} tabIndex={0} aria-label={`${nome}: ${and.length} pedidos, ${itens.length} itens`}>
                {bl.tipo !== "TEXTO" && <rect x={x} y={y} width={w} height={h} rx={bl.tipo === "CORREDOR" ? 2 : 8} fill={fill} stroke={sel === bl.id ? "#2563eb" : "#94a3b8"} strokeWidth={sel === bl.id ? 3 : 1.2} strokeDasharray={bl.tipo === "CORREDOR" ? "6 4" : undefined} />}
                {linhas.map((t, i) => <text key={i} x={x + 8} y={y + 18 + i * 15} fontSize={i === 0 ? 13 : 11} fontWeight={i === 0 ? 700 : 400} fill="#0f172a">{t}</text>)}
                {editar && sel === bl.id && bl.tipo !== "TEXTO" && <rect x={x + w - 9} y={y + h - 9} width={14} height={14} rx={3} fill="#2563eb" style={{ cursor: "nwse-resize" }} onPointerDown={(e) => iniciar(e, bl, "redim")} />}
              </g>
            );
          })}
        </svg>
        {editar && b && (
          <Panel title="Bloco selecionado" subtitle="Arraste no desenho; puxe o canto azul para redimensionar.">
            <div className="formGrid">
              <Field label="Nome"><input value={b.nome} onChange={(e) => alterar(b.id, { nome: e.target.value })} /></Field>
              <Field label="Tipo"><select value={b.tipo} onChange={(e) => alterar(b.id, { tipo: e.target.value })}>{Object.keys(PALETA).map((t) => <option key={t} value={t}>{PALETA[t].nome}</option>)}</select></Field>
              <Field label="Etapa da produção" hint="mostra os pedidos em andamento"><select value={b.etapa ?? ""} onChange={(e) => alterar(b.id, { etapa: e.target.value })}><option value="">—</option>{ETAPAS.map((t) => <option key={t} value={t}>{NOME_ETAPA[t]}</option>)}</select></Field>
              <Field label="Setor do WMS" hint="mostra peças e sobras do setor"><select value={b.setor_id ?? ""} onChange={(e) => alterar(b.id, { setor_id: e.target.value || null })}><option value="">—</option>{(lay?.setores ?? []).map((s: Row) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Field>
              <Field label="Endereço / trilho" hint="amarra o bloco a uma posição"><select value={b.endereco_id ?? ""} onChange={(e) => alterar(b.id, { endereco_id: e.target.value || null })}><option value="">—</option>{(lay?.enderecos ?? []).map((s: Row) => <option key={s.id} value={s.id}>{s.codigo}</option>)}</select></Field>
              <Field label="Cor"><input type="color" value={/^#[0-9a-f]{6}$/i.test(b.cor) ? b.cor : "#e2e8f0"} onChange={(e) => alterar(b.id, { cor: e.target.value })} /></Field>
              {(["x", "y", "w", "h"] as const).map((k) => <Field key={k} label={{ x: "Posição X", y: "Posição Y", w: "Largura", h: "Altura" }[k]}><input type="number" step="0.5" min={k === "w" || k === "h" ? 1 : 0} value={b[k]} onChange={(e) => alterar(b.id, { [k]: Math.max(k === "w" || k === "h" ? 1 : 0, Number(e.target.value) || 0) })} /></Field>)}
              <button onClick={() => { setBlocos((bs) => bs.filter((x) => x.id !== b.id)); setSel(null); setSujo(true); }}>Remover bloco</button>
            </div>
          </Panel>
        )}
      </div>
      <div className="mf-leg"><span><i style={{ background: "#bfdbfe" }} />com pedido ou peça agora</span><span><i style={{ background: "#fecaca" }} />pedido parado &gt; {ATRASO_DIAS} dias</span><span>atualiza a cada 1 minuto</span></div>
      <Drawer open={!!aberto} title={aberto?.nome ?? ""} onClose={() => setAberto(null)}>
        {aberto && (() => {
          const { itens, and } = info(aberto);
          return (<>
            {aberto.etapa && (<DataTable head={["Pedido", "Cliente", "Início", "Dias"]} empty={<Empty title="Nenhum pedido neste setor agora" />}>
              {and.map((p) => <tr key={p.pedido}><td>{p.pedido}</td><td>{p.cliente || "—"}</td><td>{p.inicio ? new Date(String(p.inicio).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td><td>{p.dias > ATRASO_DIAS ? <Badge tone="danger">{p.dias}</Badge> : p.dias}</td></tr>)}
            </DataTable>)}
            {(aberto.setor_id || aberto.endereco_id) && (<DataTable head={["Tipo", "Código", "Descrição", "Pedido", "Qtd", "Dias"]} empty={<Empty title="Nada endereçado aqui" />}>
              {itens.map((i) => <tr key={i.tipo + i.ref}><td>{i.tipo}</td><td>{i.codigo}</td><td>{i.descricao}</td><td>{i.pedido || "—"}</td><td>{i.quantidade}</td><td>{i.dias}</td></tr>)}
            </DataTable>)}
            {!aberto.etapa && !aberto.setor_id && !aberto.endereco_id && <Empty title="Bloco sem vínculo" sub="Em Editar, ligue a uma etapa, setor ou endereço." />}
          </>);
        })()}
      </Drawer>
    </>
  );
}

/* ============================== MOVIMENTAR POR QR ============================== */
export function AbaMovimentar() {
  const [texto, setTexto] = useState(""); const [pend, setPend] = useState<Row | null>(null);
  const [log, setLog] = useState<Row[]>([]); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false); const video = useRef<HTMLVideoElement>(null); const ultimo = useRef({ t: "", em: 0 });
  const inp = useRef<HTMLInputElement>(null);
  const temCamera = typeof window !== "undefined" && "BarcodeDetector" in window;

  const processar = useCallback(async (bruto: string) => {
    const q = lerQr(bruto); setErro("");
    if (!q) { setErro("QR não reconhecido. Leia uma etiqueta da fábrica."); return; }
    if (q.tipo === "FICHA") { window.location.href = `/ficha?pedido=${encodeURIComponent(q.pedido)}`; return; }
    if (q.tipo !== "ENDERECO") { setPend(q); return; }
    if (!pend) { setErro("Leia primeiro a etiqueta da peça, sobra ou pallet."); return; }
    setBusy(true);
    try {
      const corpo = pend.tipo === "PECA" ? { tipo: "PECA", ref: pend.peca, pedido: pend.pedido } : pend.tipo === "SOBRA" ? { tipo: "SOBRA", ref: pend.numero } : { tipo: "PALLET", ref: pend.codigo };
      const r = await api("/api/wms", { acao: "MOVER", ...corpo, endereco: q.codigo });
      setLog((l) => [{ quando: new Date(), item: pend.tipo === "PECA" ? `${pend.pedido} · ${pend.peca}` : pend.tipo === "SOBRA" ? `Sobra ${pend.numero}` : `Pallet ${pend.codigo}`, para: r.resultado?.endereco ?? q.codigo, setor: r.resultado?.setor }, ...l].slice(0, 30));
      setPend(null);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao mover."); } finally { setBusy(false); inp.current?.focus(); }
  }, [pend]);

  useEffect(() => {
    if (!cam) return; let parar = false; let stream: MediaStream | null = null;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Det = (window as any).BarcodeDetector; const det = new Det({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const volta = async () => {
          if (parar || !video.current) return;
          try { const r = await det.detect(video.current); const v = r[0]?.rawValue; if (v && (v !== ultimo.current.t || Date.now() - ultimo.current.em > 3000)) { ultimo.current = { t: v, em: Date.now() }; await processar(v); } } catch { /* quadro sem QR */ }
          setTimeout(volta, 300);
        };
        volta();
      } catch { setErro("Não foi possível abrir a câmera."); setCam(false); }
    })();
    return () => { parar = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam, processar]);

  return (
    <>
      <Panel title="Movimentar peça, sobra ou pallet" subtitle="1) Leia a etiqueta do item. 2) Leia a etiqueta do endereço de destino. A localização, o histórico e o rastro por setor se atualizam sozinhos.">
        <div className="mf-linha">
          <Field label={pend ? "Agora leia o ENDEREÇO de destino" : "Leia a etiqueta do item"} className="grow">
            <input ref={inp} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Aponte o leitor aqui ou cole o texto do QR" onKeyDown={(e) => { if (e.key === "Enter" && texto.trim()) { processar(texto); setTexto(""); } }} />
          </Field>
          {temCamera && <button onClick={() => setCam((c) => !c)}>{cam ? "Fechar câmera" : "Ler com a câmera"}</button>}
          {pend && <button onClick={() => setPend(null)}>Cancelar item</button>}
        </div>
        {cam && <video ref={video} playsInline muted className="qr-video" />}
        {pend && <p className="success">Item lido: <b>{pend.tipo === "PECA" ? `peça ${pend.peca} do pedido ${pend.pedido}` : pend.tipo === "SOBRA" ? `sobra ${pend.numero}` : `pallet ${pend.codigo}`}</b>. Falta ler o endereço.</p>}
        {erro && <p className="error" role="alert">{erro}</p>}
        {busy && <p>Movendo…</p>}
      </Panel>
      <Panel title="Movimentações desta sessão">
        <DataTable head={["Hora", "Item", "Novo endereço", "Setor"]} empty={<Empty title="Nenhuma movimentação ainda" />}>
          {log.map((l, i) => <tr key={i}><td>{l.quando.toLocaleTimeString("pt-BR")}</td><td>{l.item}</td><td><b>{l.para}</b></td><td>{l.setor || "—"}</td></tr>)}
        </DataTable>
      </Panel>
    </>
  );
}

/* ============================== ETIQUETAS ============================== */
export function AbaEtiquetas() {
  const { imprimir, area } = useImpressaoEtiquetas();
  const [fab, setFab] = useState<Row | null>(null); const [setor, setSetor] = useState("");
  const [pedido, setPedido] = useState(""); const [pecas, setPecas] = useState<Row[] | null>(null); const [marc, setMarc] = useState<Record<string, boolean>>({}); const [porUnidade, setPorUnidade] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { api("/api/wms?visao=fabrica").then(setFab).catch((e) => setErro(e.message)); }, []);
  const ends: Row[] = (fab?.posicoes ?? []).filter((p: Row) => !setor || p.setor === setor);
  const chave = (p: Row) => `${p.item}-${p.produto}`;
  const buscar = async () => { try { const r = await api("/api/wms?visao=pedido-pecas&pedido=" + encodeURIComponent(pedido.trim())); setPecas(r.pecas); setMarc(Object.fromEntries(r.pecas.map((p: Row) => [chave(p), true]))); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const imprimirPecas = () => {
    const lista = (pecas ?? []).filter((p) => marc[chave(p)]).flatMap((p) => {
      const n = porUnidade ? Math.min(50, Math.max(1, Math.round(p.quantidade))) : 1;
      return Array.from({ length: n }, (_, i) => {
        const cod = porUnidade ? `${chave(p)}-${i + 1}` : chave(p);
        return { titulo: `PEDIDO ${pedido.trim()}`, linhas: [String(p.descricao).slice(0, 60), [p.medida, p.acabamento, p.cor].filter(Boolean).join(" · "), porUnidade ? `Unidade ${i + 1}/${n}` : `Qtd ${p.quantidade}`, cod], qr: qrPeca(pedido.trim(), cod) };
      });
    });
    if (lista.length) imprimir(lista);
  };
  return (
    <>
      {erro && <p className="error" role="alert">{erro}</p>}
      <Panel title="Etiquetas de endereço (setor, trilho e posição)" subtitle="Cole no trilho ou na prateleira. Ao ler o QR do endereço depois do QR da peça, a localização é atualizada.">
        <div className="mf-linha">
          <Field label="Setor"><select value={setor} onChange={(e) => setSetor(e.target.value)}><option value="">Todos</option>{(fab?.setores ?? []).map((s: Row) => <option key={s.id} value={s.codigo}>{s.nome}</option>)}</select></Field>
          <button className="primary" disabled={!ends.length} onClick={() => imprimir(ends.map((p: Row) => ({ titulo: p.codigo, linhas: [`Setor ${p.setor ?? "—"}`, [p.rua && `Rua ${p.rua}`, p.modulo && `Mód ${p.modulo}`, p.nivel && `Nív ${p.nivel}`].filter(Boolean).join(" · ") || String(p.tipo_posicao), "ENDEREÇO"], qr: qrEndereco(p.codigo) })))}>Imprimir {ends.length} etiqueta(s)</button>
        </div>
        {!ends.length && <Empty title="Nenhum endereço cadastrado" sub="Cadastre em WMS > Mapa (setor, rua, módulo, nível)." />}
      </Panel>
      <Panel title="Etiquetas de peça por pedido" subtitle="Uma etiqueta por item do pedido (ou por unidade). O QR leva pedido e código da peça.">
        <div className="mf-linha">
          <Field label="Pedido"><input value={pedido} onChange={(e) => setPedido(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="ex.: 26847" /></Field>
          <button onClick={buscar} disabled={!pedido.trim()}>Buscar itens</button>
          <label className="mf-chk"><input type="checkbox" checked={porUnidade} onChange={(e) => setPorUnidade(e.target.checked)} /> uma etiqueta por unidade (até 50 por item)</label>
        </div>
        {pecas && (<>
          <DataTable head={["", "Item", "Código", "Descrição", "Medida", "Acabamento", "Qtd"]} empty={<Empty title="Pedido sem itens na programação" />}>
            {pecas.map((p) => <tr key={chave(p)}><td><input type="checkbox" checked={!!marc[chave(p)]} onChange={(e) => setMarc({ ...marc, [chave(p)]: e.target.checked })} aria-label={`Selecionar ${chave(p)}`} /></td><td>{p.item}</td><td>{p.produto}</td><td>{p.descricao}</td><td>{p.medida || "—"}</td><td>{p.acabamento || "—"}</td><td>{p.quantidade}</td></tr>)}
          </DataTable>
          <button className="primary" disabled={!pecas.some((p) => marc[chave(p)])} onClick={imprimirPecas}>Imprimir etiquetas</button>
        </>)}
      </Panel>
      {area}
    </>
  );
}
