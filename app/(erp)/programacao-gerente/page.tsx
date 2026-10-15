"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Factory,
  FileSpreadsheet,
  Filter,
  Layers3,
  PackageCheck,
  RefreshCw,
  Route,
  Search,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { useOps } from "@/components/operational-provider";
import { Panel } from "@/components/ui";
import type { Produto } from "@/types/pcp";
import { LABELS, resumoMaquinas } from "@/lib/metrics";
import { exportarCompleto } from "@/lib/export";
import {
  familiaIndustrial,
  medidaDoItem,
  tipoPeca,
} from "@/lib/domain/industrial";
import { familiaProduto } from "@/lib/sort";

type ControlePedido = {
  pedido: string;
  cliente: string;
  dataEntrega: string | null;
  statusEntrega: string;
  observacao: string;
};

type ExcecaoPeca = {
  id: string;
  pedido: string;
  tipo: string;
  quantidade: number;
  status: string;
};

type ViewMode = "PEDIDOS" | "MATERIA" | "SETORES" | "SEQUENCIAMENTO";

function n(v: unknown) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function fmt(v: number) {
  return Math.round(v).toLocaleString("pt-BR");
}

function m3Produto(p: Produto) {
  const [c, l, e] = medidaDoItem(p);
  if (!(c > 0 && l > 0 && e > 0)) return 0;
  return (c * l * e * n(p.quantidade)) / 1_000_000_000;
}

function mlProduto(p: Produto) {
  // Metro linear físico da peça, sem multiplicar pelo número de operações.
  const familia = familiaIndustrial(p);
  if (!["BATENTES", "ALIZARES", "BAGUETE", "KIT CORRER"].includes(familia)) return 0;
  const [comprimento] = medidaDoItem(p);
  return comprimento > 0 ? (comprimento / 1000) * n(p.quantidade) : 0;
}

function materialDaLinha(p: Produto): "ULTRA" | "STD" | "PINUS" | null {
  const texto = [p.material, p.tipo, p.descricao, p.descricaoModelo, p.outrasCaracteristicas]
    .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/\bPINUS\b/.test(texto)) return "PINUS";
  if (/\b(?:MDF\s+)?STD\b/.test(texto)) return "STD";
  if (/\b(?:MDF\s+)?ULTRA\b/.test(texto)) return "ULTRA";
  if (/(?:^|[\s(])(?:U|UL|ULT|ULTR)(?=[\s)]|$)/.test(texto)
    && ["ALIZARES", "BATENTES", "BAGUETE"].includes(familiaIndustrial(p))) return "ULTRA";
  return null;
}

function materialPedido(produtos: Produto[]) {
  const tipos = new Set(produtos.map(materialDaLinha).filter(Boolean));
  return tipos.has("ULTRA") && tipos.has("STD") ? "ULTRA/STD"
    : tipos.has("ULTRA") ? "ULTRA"
    : tipos.has("STD") ? "STD" : tipos.has("PINUS") ? "PINUS" : "-";
}

function alizaresPedido(produtos: Produto[]) {
  return [...new Set(
    produtos.filter((p) => familiaIndustrial(p) === "ALIZARES")
      .map((p) => {
        const [comprimento, largura, espessura] = medidaDoItem(p);
        return comprimento > 0 && largura > 0 && espessura > 0
          ? [comprimento, largura, espessura].join("x") : "";
      }).filter(Boolean)
  )].sort((a, b) => {
    const ma = a.split("x").map(Number);
    const mb = b.split("x").map(Number);
    return mb[0] - ma[0] || mb[1] - ma[1] || mb[2] - ma[2];
  });
}

function batentesPedido(produtos: Produto[]) {
  return [...new Set(
    produtos.filter((p) => familiaIndustrial(p) === "BATENTES")
      .map((p) => {
        const [c, l, e] = medidaDoItem(p);
        return c > 0 && l > 0 && e > 0 ? [c, l, e].join("x") : "";
      }).filter(Boolean)
  )].sort((a, b) => {
    const ma = a.split("x").map(Number);
    const mb = b.split("x").map(Number);
    return mb[0] - ma[0] || mb[1] - ma[1] || mb[2] - ma[2];
  });
}

type ConjuntoComponente = "PORTAS" | "PERNAS BATENTE" | "TRAVESSAS BATENTE" | "PERNA ALIZAR L MAIOR" | "PERNA ALIZAR L MENOR" | "TRAVESSA ALIZAR L MAIOR" | "TRAVESSA ALIZAR L MENOR";
const COMPOSICAO: Record<ConjuntoComponente,number> = {
  "PORTAS":1,"PERNAS BATENTE":2,"TRAVESSAS BATENTE":1,"PERNA ALIZAR L MAIOR":2,
  "PERNA ALIZAR L MENOR":2,"TRAVESSA ALIZAR L MAIOR":1,"TRAVESSA ALIZAR L MENOR":1
};
const COMPONENTES_CONJUNTO = Object.keys(COMPOSICAO) as ConjuntoComponente[];
function conjuntosPedido(produtos: Produto[]) {
  const estoque=Object.fromEntries(COMPONENTES_CONJUNTO.map(x=>[x,0])) as Record<ConjuntoComponente,number>;
  let alizarIndefinido=0;
  for(const p of produtos) {
    const f=familiaIndustrial(p), q=n(p.quantidade);
    if(f==="PORTAS") {estoque.PORTAS+=q;continue;}
    if(f==="BATENTES") {estoque[tipoPeca(p)==="PERNA" ? "PERNAS BATENTE" : "TRAVESSAS BATENTE"]+=q;continue;}
    if(f!=="ALIZARES") continue;
    const txt=[p.descricao,p.categoria,p.outrasCaracteristicas,p.descricaoModelo].filter(Boolean)
      .join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    // Catálogo: "L (menor)", "L(menor)", "L MENOR", "L-MAIOR", "L. MAIOR".
    // Não usar "menor" isolado para evitar atribuir lado de outra peça.
    const maior=/\bL[\s.\/-]*\(?\s*(?:MAIOR|GRANDE)\s*\)?(?=\W|$)/.test(txt)
      || /\bL[\s.\/-]*(?:MAIOR|GRANDE)\b/.test(txt);
    const menor=/\bL[\s.\/-]*\(?\s*(?:MENOR|PEQUENO)\s*\)?(?=\W|$)/.test(txt)
      || /\bL[\s.\/-]*(?:MENOR|PEQUENO)\b/.test(txt);
    if(maior===menor){alizarIndefinido+=q;continue;}
    const trav=tipoPeca(p)==="TRAVESSA";
    const key:ConjuntoComponente=trav?(maior?"TRAVESSA ALIZAR L MAIOR":"TRAVESSA ALIZAR L MENOR"):(maior?"PERNA ALIZAR L MAIOR":"PERNA ALIZAR L MENOR");
    estoque[key]+=q;
  }
  const conjuntos=Math.min(...COMPONENTES_CONJUNTO.map(x=>Math.floor(estoque[x]/COMPOSICAO[x])));
  const restantes=Object.fromEntries(COMPONENTES_CONJUNTO.map(x=>[x,Math.max(0,estoque[x]-conjuntos*COMPOSICAO[x])])) as Record<ConjuntoComponente,number>;
  // Cada porta corresponde a no máximo um kit. As portas sem conjunto
  // completo são kits desmembrados; sobras de alizares/batentes não criam kits.
  const desmembrados=Math.max(0,estoque.PORTAS-conjuntos);
  return {conjuntos,desmembrados,restantes,estoque,faltas:COMPONENTES_CONJUNTO.filter(x=>Math.floor(estoque[x]/COMPOSICAO[x])===conjuntos),alizarIndefinido};
}

function statusPedido(produtos: Produto[]) {
  const ops = produtos.flatMap((p) => p.operacoes);
  if (!ops.length) return "SEM ROTA";
  if (ops.every((o) => o.status === "CONCLUIDA")) return "CONCLUÍDO";
  if (ops.some((o) => o.status === "EM_ANDAMENTO")) return "EM PRODUÇÃO";
  if (ops.some((o) => o.status === "DIVERGENCIA" || o.status === "BLOQUEADA"))
    return "ATENÇÃO";
  return "PROGRAMADO";
}

function classStatus(value: string) {
  const v = value.toLowerCase();
  if (v.includes("concl")) return "done";
  if (v.includes("produção")) return "running";
  if (v.includes("aten")) return "alert";
  return "planned";
}

export default function ProgramacaoGerentePage() {
  const { pg, refresh, lastSync } = useOps();
  const produtos = pg?.produtos || [];

  const [view, setView] = useState<ViewMode>("PEDIDOS");
  const [filtroMateria, setFiltroMateria] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [processo, setProcesso] = useState("TODOS");
  const [pedidoAberto, setPedidoAberto] = useState("");
  const [busy, setBusy] = useState(false);
  const [gestao, setGestao] = useState<{ controles: ControlePedido[]; excecoes: ExcecaoPeca[] }>({
    controles: [],
    excecoes: [],
  });
  const [savingPrazo, setSavingPrazo] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch("/api/gestao-producao", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { controles: [], excecoes: [] }))
      .then((j) => {
        if (ativo) {
          setGestao({
            controles: j.controles || [],
            excecoes: j.excecoes || [],
          });
        }
      });
    return () => {
      ativo = false;
    };
  }, [pg?.id, lastSync?.getTime()]);

  const pedidos = useMemo(() => {
    const map = new Map<string, Produto[]>();
    for (const p of produtos) {
      if (!p.pedido) continue;
      const arr = map.get(p.pedido) || [];
      arr.push(p);
      map.set(p.pedido, arr);
    }

    return [...map.entries()]
      .map(([pedido, itens]) => {
        const operacoes = itens.flatMap((p) =>
          p.operacoes.map((o) => ({ p, o }))
        );
        const processos = [...new Set(operacoes.map((x) => x.o.processo))];
        const pecas = itens.reduce((s, p) => s + n(p.quantidade), 0);
        const produzido = operacoes.reduce(
          (s, x) => s + n(x.o.quantidadeProduzida),
          0
        );
        const planejado = operacoes.reduce(
          (s, x) => s + n(x.o.quantidadePlanejada),
          0
        );
        const tipo =
          itens.find((p) => p.tipoPedido && p.tipoPedido !== "NORMAL")
            ?.tipoPedido || "NORMAL";

        const controle = gestao.controles.find((c) => c.pedido === pedido);
        const excecoes = gestao.excecoes.filter((e) => e.pedido === pedido && e.status === "ABERTA");

        return {
          pedido,
          itens,
          operacoes,
          processos,
          pecas,
          ofs: new Set(itens.map((p) => p.of).filter(Boolean)).size,
          m3: itens.reduce((s, p) => s + m3Produto(p), 0),
          ml: itens.reduce((s, p) => s + mlProduto(p), 0),
          kits: itens.filter(p=>familiaIndustrial(p)==="PORTAS").reduce((sum,p)=>sum+n(p.quantidade),0),
          conjuntosCompletosEstimados: conjuntosPedido(itens).conjuntos,
          kitsDesmembrados: conjuntosPedido(itens).desmembrados,
          componentesConjunto: conjuntosPedido(itens),
          usinagem: itens.some((p) => p.usinagemPlanilha),
          alizares: alizaresPedido(itens),
          batentes: batentesPedido(itens),
          material: materialPedido(itens),
          status: statusPedido(itens),
          andamento: planejado > 0 ? Math.min(100, (produzido / planejado) * 100) : 0,
          tipo,
          prioridade:
            itens.some((p) => p.prioridade === "URGENTE")
              ? "URGENTE"
              : itens.some((p) => p.prioridade === "ALTA")
              ? "ALTA"
              : "NORMAL",
          dataEntrega: controle?.dataEntrega || "",
          statusEntrega: controle?.statusEntrega || "SEM_DATA",
          clienteControle: controle?.cliente || "",
          excecoes,
        };
      })
      .sort((a, b) =>
        a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true })
      );
  }, [produtos, gestao]);

  const processos = useMemo(
    () => [...new Set(produtos.flatMap((p) => p.operacoes.map((o) => o.processo)))],
    [produtos]
  );

  const pedidosFiltrados = useMemo(() => {
    const q = search.trim().toUpperCase();
    return pedidos.filter((p) => {
      if (processo !== "TODOS" && !p.processos.includes(processo)) return false;
      if (!q) return true;
      return (
        p.pedido.toUpperCase().includes(q) ||
        p.itens.some((x) =>
          [x.of, x.descricao, x.categoria, x.medida, x.material]
            .join(" ")
            .toUpperCase()
            .includes(q)
        )
      );
    });
  }, [pedidos, search, processo]);

  const maquinas = useMemo(() => resumoMaquinas(produtos), [produtos]);

  const sequenciamento = useMemo(() => {
    const rows = produtos.flatMap((p) =>
      p.operacoes.map((o) => ({ p, o }))
    );

    return rows
      .filter((x) => processo === "TODOS" || x.o.processo === processo)
      .sort((a, b) => {
        const pa = processos.indexOf(a.o.processo);
        const pb = processos.indexOf(b.o.processo);
        return (
          pa - pb ||
          a.o.ordemFila - b.o.ordemFila ||
          a.p.pedido.localeCompare(b.p.pedido, "pt-BR", { numeric: true })
        );
      });
  }, [produtos, processo, processos]);

  const totalPecas = pedidos.reduce((s, p) => s + p.pecas, 0);
  const pendUsinagem = pedidos.filter((p) => !p.usinagem).length;
  const kits = pedidos.reduce((s, p) => s + p.kits, 0);
  const kitsDesmembrados = pedidos.reduce((s,p) => s + p.kitsDesmembrados,0);
  const conjuntosCompletosEstimados = pedidos.reduce((sum,p) => sum + p.conjuntosCompletosEstimados,0);
  const volume = pedidos.reduce((s, p) => s + p.m3, 0);
  const metrosLineares = pedidos.reduce((s, p) => s + p.ml, 0);
  const consumoMaterial = useMemo(() => {
    const dados = { STD: { pecas: 0, ml: 0 }, ULTRA: { pecas: 0, ml: 0 }, PINUS: { pecas: 0, ml: 0 } };
    const grupos = new Map<string, { peca: string; material: "STD" | "ULTRA" | "PINUS"; pecas: number; ml: number }>();
    let semClassificacao = 0;
    let semComprimento = 0;
    const pendencias: { pedido: string; of: string; codigo: string; descricao: string; familia: string; material: string; medida: string; quantidade: number; motivo: string }[] = [];
    for (const p of produtos) {
      if (!["BATENTES", "ALIZARES", "BAGUETE", "KIT CORRER"].includes(familiaIndustrial(p))) continue;
      // Ferragens, roldanas e conjuntos de acessórios não consomem perfil linear.
      if (/FERRAGENS?|ROLDANAS?|PARAFUSOS?|FECHADURAS?/i.test([p.descricao,p.categoria].join(" "))) continue;
      const material = materialDaLinha(p);
      const comprimento = medidaDoItem(p)[0];
      const familia = familiaIndustrial(p);
      const categoria = String(p.categoria || "").toUpperCase();
      const peca = familia === "ALIZARES" ? `${tipoPeca(p) === "PERNA" ? "Perna" : "Travessa"} de alizar`
        : familia === "BATENTES" ? `${tipoPeca(p) === "PERNA" ? "Perna" : "Travessa"} de batente`
        : familia === "BAGUETE" ? "Baguete"
        : categoria.includes("SUPORTE") || /SUPORTE.*TRILHO/i.test(p.descricao) ? "Suporte de trilho" : "Kit de correr";
      if (material) {
        const chave = `${peca}|${material}`;
        const grupo = grupos.get(chave) || { peca, material, pecas: 0, ml: 0 };
        grupo.pecas += n(p.quantidade);
        if (comprimento > 0) grupo.ml += comprimento / 1000 * n(p.quantidade);
        grupos.set(chave, grupo);
      }
      if (!material) semClassificacao += n(p.quantidade);
      else {
        dados[material].pecas += n(p.quantidade);
        if (comprimento > 0) dados[material].ml += comprimento / 1000 * n(p.quantidade);
      }
      if (!(comprimento > 0)) semComprimento += n(p.quantidade);
      if (!material || !(comprimento > 0)) pendencias.push({
        pedido: p.pedido, of: p.of, codigo: p.produto, descricao: p.descricao,
        familia: familiaIndustrial(p), material: p.material || "", medida: p.medida || "",
        quantidade: n(p.quantidade),
        motivo: [!material ? "Material não classificado como STD, ULTRA ou PINUS" : "", !(comprimento > 0) ? "Comprimento ausente/inválido" : ""].filter(Boolean).join(" + "),
      });
    }
    return { dados, grupos: [...grupos.values()].sort((a,b) => a.peca.localeCompare(b.peca,"pt-BR") || a.material.localeCompare(b.material)), semClassificacao, semComprimento, pendencias };
  }, [produtos]);

  async function exportar() {
    if (!produtos.length) return;
    setBusy(true);
    try {
      await exportarCompleto(produtos);
    } finally {
      setBusy(false);
    }
  }

  async function salvarPrazo(pedido: string, dataEntrega: string) {
    setSavingPrazo(pedido);
    try {
      const r = await fetch("/api/gestao-producao", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido, dataEntrega }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao salvar prazo.");

      setGestao((atual) => {
        const existente = atual.controles.find((x) => x.pedido === pedido);
        const proximo = {
          pedido,
          cliente: existente?.cliente || "",
          dataEntrega: dataEntrega || null,
          statusEntrega: j.controle?.status_entrega || (dataEntrega ? "NO_PRAZO" : "SEM_DATA"),
          observacao: existente?.observacao || "",
        };
        return {
          ...atual,
          controles: [
            ...atual.controles.filter((x) => x.pedido !== pedido),
            proximo,
          ],
        };
      });
    } finally {
      setSavingPrazo("");
    }
  }

  if (!pg) {
    return (
      <>
        <div className="pageTitle">
          <div>
            <span>PLANEJAMENTO</span>
            <h1>Programação Gerente</h1>
            <p>Visão consolidada do sequenciamento diário da fábrica.</p>
          </div>
        </div>
        <Panel
          title="Sem programação ativa"
          subtitle="Importe e libere um filtro do Consistem para montar a programação gerencial."
        >
          <div className="empty">
            <Factory />
            <b>Nenhuma programação ativa.</b>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <div className="pageTitle managerPageTitle">
        <div>
          <span>PLANEJAMENTO INDUSTRIAL</span>
          <h1>Programação Gerente</h1>
          <p>
            Pedidos, peças, rota de máquinas e sequência de produção do dia em
            uma única visão.
          </p>
        </div>
        <div className="managerTopActions">
          <button className="secondary" onClick={() => void refresh()}>
            <RefreshCw /> Atualizar
          </button>
          <button className="primary" disabled={busy} onClick={exportar}>
            <FileSpreadsheet />
            {busy ? "EXPORTANDO..." : "EXPORTAR EXCEL"}
          </button>
        </div>
      </div>

      <section className="managerHero">
        <div>
          <span>PROGRAMAÇÃO ATIVA</span>
          <b>Filtro {pg.filtro || "-"}</b>
          <small>
            {pg.data ? new Date(`${pg.data}T12:00:00`).toLocaleDateString("pt-BR") : "-"}
            {" • "}Turno {pg.turno || "-"}
          </small>
        </div>
        <div>
          <span>ÚLTIMA ATUALIZAÇÃO</span>
          <b>{lastSync ? lastSync.toLocaleTimeString("pt-BR") : "--:--"}</b>
          <small>dados da programação ativa</small>
        </div>
      </section>

      <nav className="managerViewTabs" aria-label="Subabas da programação gerencial" style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
        {([["PEDIDOS","Pedidos e visão geral"],["MATERIA","Matéria-prima"],["SETORES","Setores / Máquinas"],["SEQUENCIAMENTO","Sequenciamento"]] as const).map(([id,label]) => <button key={id} type="button" className={view===id?"active":""} onClick={()=>setView(id)}>{label}</button>)}
      </nav>
      {view === "PEDIDOS" && <section className="managerKpis">
        <article>
          <span>PEDIDOS DO DIA</span>
          <b>{pedidos.length}</b>
          <small>na programação</small>
        </article>
        <article>
          <span>PEÇAS</span>
          <b>{fmt(totalPecas)}</b>
          <small>quantidade total</small>
        </article>
        <article>
          <span>SETORES / MÁQUINAS</span>
          <b>{maquinas.length}</b>
          <small>com carga programada</small>
        </article>
        <article>
          <span>CONJUNTOS PREVISTOS</span>
          <b>{fmt(kits)}</b>
          <small>1 porta = 1 conjunto previsto, por pedido</small>
        </article>
        <article><span>PORTAS SEM CONJUNTO COMPLETO</span><b>{fmt(kitsDesmembrados)}</b><small>faltam componentes; não são kits confirmados</small></article>
        <article><span>COMPOSIÇÃO COMPLETA ESTIMADA</span><b>{fmt(conjuntosCompletosEstimados)}</b><small>conferência dos componentes, não reduz o total previsto</small></article>
        <article>
          <span>USINAGEM PENDENTE</span>
          <b>{pendUsinagem}</b>
          <small>pedido(s)</small>
        </article>
        <article className={pedidos.some((p) => p.statusEntrega === "ATRASADO") ? "attention" : ""}>
          <span>PRAZOS CRÍTICOS</span>
          <b>{pedidos.filter((p) => ["ATRASADO", "URGENTE"].includes(p.statusEntrega)).length}</b>
          <small>atrasados ou próximos</small>
        </article>
        <article className={gestao.excecoes.some((e) => e.status === "ABERTA") ? "attention" : ""}>
          <span>FALTAS / EXCEÇÕES</span>
          <b>{gestao.excecoes.filter((e) => e.status === "ABERTA").length}</b>
          <small>abertas na produção</small>
        </article>
        <article>
          <span>METROS LINEARES</span>
          <b>{metrosLineares.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          <small>mL físicos · batentes, alizares e perfis</small>
        </article>
        <article>
          <span>VOLUME</span>
          <b>{volume.toFixed(3)}</b>
          <small>m³ estimados</small>
        </article>
      </section>}

      {view === "MATERIA" && (
      <Panel title="Necessidade de matéria-prima" subtitle="Consumo previsto separado por família da peça e material. Metros lineares = comprimento em metros × quantidade de peças. Não multiplica por operações.">
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:12}}><label htmlFor="filtro-materia">Filtrar material</label><select id="filtro-materia" value={filtroMateria} onChange={e=>setFiltroMateria(e.target.value)}><option value="TODOS">Todos os materiais</option><option value="STD">STD</option><option value="ULTRA">ULTRA</option><option value="PINUS">PINUS</option></select></div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>PEÇA / PERFIL</th><th>MATERIAL</th><th className="num">PEÇAS</th><th className="num">METROS LINEARES (m)</th></tr></thead>
            <tbody>
              {consumoMaterial.grupos.filter(x => filtroMateria === "TODOS" || x.material === filtroMateria).map((x) => (
                <tr key={`${x.peca}-${x.material}`}><td><b>{x.peca}</b></td><td>{x.material}</td><td className="num">{fmt(x.pecas)}</td><td className="num"><b>{x.ml.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {(consumoMaterial.semClassificacao > 0 || consumoMaterial.semComprimento > 0) && <>
          <p>Conferir antes de comprar: {fmt(consumoMaterial.semClassificacao)} peça(s) sem classificação STD/ULTRA/PINUS e {fmt(consumoMaterial.semComprimento)} peça(s) sem comprimento válido. Os dois grupos podem se sobrepor.</p>
          <details><summary>Ver exatamente quais peças estão pendentes ({consumoMaterial.pendencias.length} linhas)</summary>
            <div className="tableWrap"><table><thead><tr><th>PEDIDO</th><th>OF</th><th>CÓDIGO</th><th>FAMÍLIA</th><th>DESCRIÇÃO</th><th>MATERIAL ORIGINAL</th><th>MEDIDA ORIGINAL</th><th className="num">PEÇAS</th><th>MOTIVO</th></tr></thead>
            <tbody>{consumoMaterial.pendencias.map((x, i) => <tr key={i}><td>{x.pedido}</td><td>{x.of}</td><td>{x.codigo}</td><td>{x.familia}</td><td>{x.descricao}</td><td>{x.material || "—"}</td><td>{x.medida || "—"}</td><td className="num">{fmt(x.quantidade)}</td><td>{x.motivo}</td></tr>)}</tbody></table></div>
          </details>
        </>}
      </Panel>

      )}

      {view !== "MATERIA" && <div className="managerToolbar">
        <div className="managerFilters">
          <label>
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pedido, OF, peça, medida..."
            />
          </label>
          <label>
            <Filter />
            <select value={processo} onChange={(e) => setProcesso(e.target.value)}>
              <option value="TODOS">Todos os setores</option>
              {processos.map((p) => (
                <option key={p} value={p}>
                  {LABELS[p] || p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>}

      {view === "PEDIDOS" && (
        <Panel
          title="Pedidos programados"
          subtitle="Uma linha por pedido. Clique para abrir a rota completa das peças."
        >
          <div className="tableWrap managerOrdersTable">
            <table>
              <thead>
                <tr>
                  <th>PEDIDO</th>
                  <th>PRIOR.</th>
                  <th>TIPO</th>
                  <th className="num">PEÇAS</th>
                  <th className="num">OFs</th>
                  <th className="num">m³</th>
                  <th className="num">mL</th>
                  <th className="num">CONJUNTOS PREVISTOS</th><th className="num">PORTAS SEM CONJUNTO</th>
                  <th>USINAGEM</th>
                  <th>ALIZAR</th>
                  <th>BATENTES</th>
                  <th>MATERIAL</th>
                  <th>PRAZO ENTREGA</th>
                  <th>EXCEÇÕES</th>
                  <th>ANDAMENTO</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((pedido) => (
                  <>
                    <tr
                      key={pedido.pedido}
                      className={pedidoAberto === pedido.pedido ? "managerOrderSelected" : ""}
                    >
                      <td><b>{pedido.pedido}</b></td>
                      <td>
                        <span className={`priority p-${pedido.prioridade.toLowerCase()}`}>
                          {pedido.prioridade}
                        </span>
                      </td>
                      <td>{pedido.tipo}</td>
                      <td className="num">{fmt(pedido.pecas)}</td>
                      <td className="num">{pedido.ofs}</td>
                      <td className="num">{pedido.m3.toFixed(3)}</td>
                      <td className="num">{pedido.ml.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="num"><b>{fmt(pedido.kits)}</b><details><summary>Componentes</summary><div style={{minWidth:240,textAlign:"left"}}>{COMPONENTES_CONJUNTO.map(nome=><div key={nome}>{nome}: {fmt(pedido.componentesConjunto.estoque[nome])} peças (exige {COMPOSICAO[nome]} por conjunto; comporta {fmt(Math.floor(pedido.componentesConjunto.estoque[nome] / COMPOSICAO[nome]))} conjuntos)</div>)}{pedido.componentesConjunto.alizarIndefinido>0&&<div>Alizares cujo L maior/menor não foi identificado: {fmt(pedido.componentesConjunto.alizarIndefinido)}</div>}<div>Limitante(s): {pedido.componentesConjunto.faltas.join(", ")}</div><small>Cada porta do pedido corresponde a um conjunto previsto. A conferência dos componentes não reduz essa previsão. Composição: 1 porta, 2 pernas batente, 1 travessa batente, 2 pernas alizar L maior, 2 L menor, 1 travessa alizar L maior e 1 L menor.</small></div></details></td><td className="num"><b>{fmt(pedido.kitsDesmembrados)}</b><small> portas sem conjunto completo</small></td>
                      <td>
                        <span className={`managerFlag ${pedido.usinagem ? "ok" : "pending"}`}>
                          {pedido.usinagem ? "SIM" : "NÃO"}
                        </span>
                      </td>
                      <td>{pedido.alizares.length ? pedido.alizares.join(" / ") : "-"}</td>
                      <td>{pedido.batentes.length ? pedido.batentes.join(" / ") : "-"}</td>
                      <td><b>{pedido.material}</b></td>
                      <td>
                        <div className="managerDueCell">
                          <CalendarClock />
                          <input
                            type="date"
                            value={pedido.dataEntrega}
                            disabled={savingPrazo === pedido.pedido}
                            onChange={(e) => salvarPrazo(pedido.pedido, e.target.value)}
                          />
                          <span className={`managerDueStatus ${String(pedido.statusEntrega).toLowerCase()}`}>
                            {pedido.statusEntrega === "ATRASADO"
                              ? "ATRASADO"
                              : pedido.statusEntrega === "URGENTE"
                              ? "PRÓXIMO"
                              : pedido.statusEntrega === "NO_PRAZO"
                              ? "NO PRAZO"
                              : "SEM DATA"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {pedido.excecoes.length ? (
                          <span className="managerExceptionCount"><AlertTriangle /> {pedido.excecoes.length}</span>
                        ) : (
                          <span className="managerExceptionNone">-</span>
                        )}
                      </td>
                      <td>
                        <div className="managerProgress">
                          <i><em style={{ width: `${pedido.andamento}%` }} /></i>
                          <span>{pedido.andamento.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`managerStatus ${classStatus(pedido.status)}`}>
                          {pedido.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="managerExpand"
                          onClick={() =>
                            setPedidoAberto((atual) =>
                              atual === pedido.pedido ? "" : pedido.pedido
                            )
                          }
                          title={pedidoAberto === pedido.pedido ? "Fechar detalhes" : "Abrir detalhes"}
                        >
                          {pedidoAberto === pedido.pedido ? <ChevronDown /> : <ChevronRight />}
                        </button>
                      </td>
                    </tr>

                    {pedidoAberto === pedido.pedido && (
                      <tr key={`${pedido.pedido}-detail`} className="managerDetailRow">
                        <td colSpan={17}>
                          <div className="managerOrderDetail">
                            <div className="managerOrderRoute">
                              <header>
                                <div>
                                  <span>ROTA DO PEDIDO</span>
                                  <b>{pedido.processos.length} etapa(s)</b>
                                </div>
                              </header>
                              <div>
                                {pedido.processos.map((proc, index) => (
                                  <div key={proc} className="managerRouteStep">
                                    <i>{index + 1}</i>
                                    <span>
                                      <b>{LABELS[proc] || proc}</b>
                                      <small>
                                        {pedido.operacoes.filter((x) => x.o.processo === proc).length} linha(s)
                                      </small>
                                    </span>
                                    {index < pedido.processos.length - 1 && <ChevronRight />}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="tableWrap managerPieceTable">
                              <table>
                                <thead>
                                  <tr>
                                    <th>SETOR / MÁQUINA</th>
                                    <th>SEQ.</th>
                                    <th>OF</th>
                                    <th>FAMÍLIA</th>
                                    <th>PEÇA</th>
                                    <th>MEDIDA</th>
                                    <th>MATERIAL</th>
                                    <th className="num">QTD.</th>
                                    <th>STATUS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pedido.operacoes
                                    .sort((a, b) =>
                                      a.o.sequencia - b.o.sequencia ||
                                      a.o.ordemFila - b.o.ordemFila
                                    )
                                    .map(({ p, o }) => (
                                      <tr key={o.id}>
                                        <td><b>{LABELS[o.processo] || o.processo}</b></td>
                                        <td>{o.ordemFila || "-"}</td>
                                        <td>{p.of || "-"}</td>
                                        <td>{familiaProduto(p)}</td>
                                        <td>{p.descricao}</td>
                                        <td>{p.medida || "-"}</td>
                                        <td>{p.material || "-"}</td>
                                        <td className="num">{fmt(n(o.quantidadePlanejada))}</td>
                                        <td>{o.status.replaceAll("_", " ")}</td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {view === "SETORES" && (
        <div className="managerMachineGrid">
          {maquinas
            .filter((m: any) => processo === "TODOS" || m.processo === processo)
            .map((m: any) => {
              const filas = produtos
                .flatMap((p) =>
                  p.operacoes
                    .filter((o) => o.processo === m.processo && o.status !== "CONCLUIDA")
                    .map((o) => ({ p, o }))
                )
                .sort((a, b) => a.o.ordemFila - b.o.ordemFila);

              return (
                <article key={m.processo} className="managerMachineCard">
                  <header>
                    <div>
                      <span>SETOR / MÁQUINA</span>
                      <h3>{LABELS[m.processo] || m.processo}</h3>
                    </div>
                    <b>{m.progresso.toFixed(0)}%</b>
                  </header>

                  <div className="managerMachineStats">
                    <div><small>PROGRAMADO</small><b>{fmt(m.pecasPlanejadas)}</b></div>
                    <div><small>PRODUZIDO</small><b>{fmt(m.produzidas)}</b></div>
                    <div><small>FILA</small><b>{fmt(m.filaPecas)}</b></div>
                  </div>

                  <div className="managerMachineQueue">
                    {filas.slice(0, 8).map(({ p, o }) => (
                      <div key={o.id}>
                        <i>{o.ordemFila || "-"}</i>
                        <span>
                          <b>Pedido {p.pedido}</b>
                          <small>{p.descricao} • {p.medida || "sem medida"}</small>
                        </span>
                        <strong>{fmt(n(o.quantidadePlanejada))}</strong>
                      </div>
                    ))}
                    {!filas.length && (
                      <div className="managerQueueEmpty">Sem fila pendente.</div>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}

      {view === "SEQUENCIAMENTO" && (
        <Panel
          title="Sequenciamento do dia"
          subtitle="Ordem das peças em cada setor/máquina conforme a programação ativa."
        >
          <div className="tableWrap managerSequenceTable">
            <table>
              <thead>
                <tr>
                  <th>SETOR / MÁQUINA</th>
                  <th>SEQ.</th>
                  <th>PEDIDO</th>
                  <th>OF</th>
                  <th>FAMÍLIA</th>
                  <th>DESCRIÇÃO</th>
                  <th>MEDIDA</th>
                  <th>MATERIAL</th>
                  <th>ACABAMENTO</th>
                  <th>COR</th>
                  <th className="num">QTD.</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {sequenciamento.map(({ p, o }) => (
                  <tr key={o.id}>
                    <td><b>{LABELS[o.processo] || o.processo}</b></td>
                    <td><b>{o.ordemFila || "-"}</b></td>
                    <td>{p.pedido}</td>
                    <td>{p.of || "-"}</td>
                    <td>{familiaProduto(p)}</td>
                    <td>{p.descricao}</td>
                    <td>{p.medida || "-"}</td>
                    <td>{p.material || "-"}</td>
                    <td>{p.acabamento || "-"}</td>
                    <td>{p.cor || "-"}</td>
                    <td className="num">{fmt(n(o.quantidadePlanejada))}</td>
                    <td>
                      <span className={`managerStatus ${classStatus(o.status)}`}>
                        {o.status.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
