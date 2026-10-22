/**
 * Regras do apontamento de produção por operação (puras, testáveis).
 * Mantêm as regras já existentes em /api/operacoes/[id] (INICIAR/SOMAR só em LIBERADA/EM_ANDAMENTO;
 * SOMAR não passa do planejado sem `force`) e fecham lacunas: finalizar operação pendente/bloqueada/já concluída,
 * valores absolutos sem validação e divergência duplicada.
 */
export type Acao = "INICIAR" | "SOMAR" | "FINALIZAR" | "DIVERGENCIA" | "PRODUZIDO" | "REFUGO";
export type OpEstado = { status: string; quantidadePlanejada: number; quantidadeProduzida: number; quantidadeRefugo: number };
export type Resultado = { ok: true } | { ok: false; http: 400 | 409; codigo: string; erro: string };

const ABERTAS = ["LIBERADA", "EM_ANDAMENTO"];
const bad = (http: 400 | 409, codigo: string, erro: string): Resultado => ({ ok: false, http, codigo, erro });
const arred = (n: number) => Math.round(n * 1000) / 1000;

export function validarAcao(op: OpEstado, acao: Acao, valor: number | undefined, opts: { force?: boolean } = {}): Resultado {
  const st = op.status;
  if(['SOMAR','PRODUZIDO','REFUGO'].includes(acao) && valor!==undefined && Number.isFinite(valor) && (Math.abs(valor)>9999999999999 || Math.abs(valor*1000-Math.round(valor*1000))>0.000001))
    return bad(400,'QUANTIDADE_INVALIDA','Use quantidade com até três casas decimais, dentro do limite permitido.');
  switch (acao) {
    case "INICIAR":
      return ABERTAS.includes(st) ? { ok: true } : bad(409, "NAO_LIBERADA", "Essa operação ainda não está liberada.");
    case "SOMAR": {
      if (valor === undefined || !Number.isFinite(valor) || valor === 0) return bad(400, "QUANTIDADE_INVALIDA", "Quantidade inválida.");
      if (!ABERTAS.includes(st)) return bad(409, "NAO_LIBERADA", "Operação não liberada para apontamento.");
      const novo = arred(op.quantidadeProduzida + valor);
      if (novo < 0) return bad(409, "CORRECAO_MAIOR_QUE_PRODUZIDO", `A correção é maior que o produzido (${op.quantidadeProduzida}).`);
      if (!opts.force && novo > op.quantidadePlanejada) return bad(409, "ACIMA_SALDO", `Quantidade acima do saldo: restam ${Math.max(0, arred(op.quantidadePlanejada - op.quantidadeProduzida))}.`);
      return { ok: true };
    }
    case "FINALIZAR":
      if (st === "CONCLUIDA") return bad(409, "JA_CONCLUIDA", "Operação já concluída.");
      if (st === "PENDENTE") return bad(409, "NAO_LIBERADA", "Operação pendente: conclua antes a operação anterior do roteiro.");
      if (st === "BLOQUEADA") return bad(409, "BLOQUEADA", "Operação bloqueada.");
      return { ok: true };
    case "DIVERGENCIA":
      if (st === "CONCLUIDA") return bad(409, "JA_CONCLUIDA", "Operação já concluída.");
      if (st === "DIVERGENCIA") return bad(409, "JA_EM_DIVERGENCIA", "Operação já está em divergência.");
      return { ok: true };
    case "PRODUZIDO":
    case "REFUGO": {
      if (valor === undefined || !Number.isFinite(valor) || valor < 0) return bad(400, "QUANTIDADE_INVALIDA", "Informe uma quantidade válida (zero ou maior).");
      if (["PENDENTE", "BLOQUEADA"].includes(st)) return bad(409, "NAO_LIBERADA", "Operação não liberada para apontamento.");
      if (acao === "PRODUZIDO" && !opts.force && valor > op.quantidadePlanejada) return bad(409, "ACIMA_SALDO", `Quantidade acima do planejado (${op.quantidadePlanejada}).`);
      return { ok: true };
    }
  }
  return bad(400, "ACAO_INVALIDA", "Ação inválida.");
}

export type OpDiag = {
  id: string; produtoId: string; pedido: string; of: string; processo: string; sequencia: number;
  status: string; planejada: number; produzida: number; refugo: number; percentual: number;
};
export type ProdutoDiag = { produtoId: string; pedido: string; of: string; produto: string };
export type Divergencia = { codigo: string; gravidade: "ALTA" | "MEDIA" | "BAIXA"; produtoId: string; operacaoId?: string; pedido: string; of: string; processo?: string; texto: string };

export function diagnosticarOperacoes(produtos: ProdutoDiag[], ops: OpDiag[]): Divergencia[] {
  const out: Divergencia[] = [];
  const porProduto = new Map<string, OpDiag[]>();
  for (const o of ops) { if (!porProduto.has(o.produtoId)) porProduto.set(o.produtoId, []); porProduto.get(o.produtoId)!.push(o); }
  for (const p of produtos) {
    if (!porProduto.has(p.produtoId)) out.push({ codigo: "SEM_ROTEIRO", gravidade: "ALTA", produtoId: p.produtoId, pedido: p.pedido, of: p.of, texto: `Produto ${p.produto || "(sem código)"} sem roteiro de operações.` });
  }
  for (const [produtoId, lista] of porProduto) {
    const ord = [...lista].sort((a, b) => a.sequencia - b.sequencia);
    const vistos = new Set<number>();
    for (const o of ord) {
      const base = { produtoId, operacaoId: o.id, pedido: o.pedido, of: o.of, processo: o.processo };
      if (!Number.isFinite(o.planejada) || o.planejada <= 0) out.push({ ...base, codigo: "QUANTIDADE_PLANEJADA_INVALIDA", gravidade: "ALTA", texto: `${o.processo}: quantidade planejada inválida (${o.planejada}).` });
      if (o.produzida < 0 || o.refugo < 0) out.push({ ...base, codigo: "QUANTIDADE_NEGATIVA", gravidade: "ALTA", texto: `${o.processo}: quantidade negativa.` });
      if (o.planejada > 0 && o.produzida > o.planejada) out.push({ ...base, codigo: "PRODUZIDO_ACIMA_PLANEJADO", gravidade: "MEDIA", texto: `${o.processo}: produzido ${o.produzida} acima do planejado ${o.planejada}.` });
      if (o.status === "CONCLUIDA" && o.planejada > 0 && o.produzida < o.planejada) out.push({ ...base, codigo: "CONCLUIDA_INCOMPLETA", gravidade: "MEDIA", texto: `${o.processo}: concluída com ${o.produzida} de ${o.planejada} peça(s) apontadas.` });
      if (vistos.has(o.sequencia)) out.push({ ...base, codigo: "SEQUENCIA_DUPLICADA", gravidade: "ALTA", texto: `${o.processo}: sequência ${o.sequencia} repetida no roteiro.` });
      vistos.add(o.sequencia);
    }
    let anteriorAberta: OpDiag | null = null;
    for (const o of ord) {
      if (anteriorAberta && ["EM_ANDAMENTO", "CONCLUIDA"].includes(o.status))
        out.push({ codigo: "ORDEM_DO_ROTEIRO_QUEBRADA", gravidade: "MEDIA", produtoId, operacaoId: o.id, pedido: o.pedido, of: o.of, processo: o.processo, texto: `${o.processo} está ${o.status === "CONCLUIDA" ? "concluída" : "em andamento"} mas ${anteriorAberta.processo} (anterior) não foi concluída.` });
      if (o.status !== "CONCLUIDA" && !anteriorAberta) anteriorAberta = o;
    }
  }
  const peso = { ALTA: 0, MEDIA: 1, BAIXA: 2 } as const;
  return out.sort((a, b) => peso[a.gravidade] - peso[b.gravidade] || a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true }));
}

/** Ausência de setores é ausência de autorização; nunca significa acesso irrestrito. */
export function podeOperarProcesso(perfil:string,processos:readonly string[]|undefined,processo:string){return ['PCP','GERENTE','ENCARREGADO'].includes(perfil)||(['LIDER','APONTADOR'].includes(perfil)&&Boolean(processos?.includes(processo)));}
