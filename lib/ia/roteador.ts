/** Seleciona só as ferramentas plausíveis para a pergunta (menos tokens por chamada). Sem correspondência → todas. */
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const GRUPOS: { re: RegExp; tools: string[] }[] = [
  { re: /inconsist|erro|diverg|duplic|repetid|sem rota|confian|qualidade dos dados|auditor|conferi|valida/, tools: ["auditar_consistencia", "diagnosticar_catalogo_setores", "consultar_catalogo", "diagnosticar_usinagem", "buscar_pedido"] },
  { re: /gargalo|risco|atras|capacidade|eficien|oportunidad|meta|bloque|urgen|prazo|sobrecarg|diagnost|fabrica/, tools: ["diagnostico_integrado", "analisar_riscos", "oportunidades_industriais", "consultar_capacidade", "planejar_fabrica", "planejamento_capacidade", "simular_programacao_urgente", "listar_andon", "listar_excecoes", "simular_aps_maquinas"] },
  { re: /pedido|\bof\b|\bofs\b|item|op[0-9]|\b\d{4,6}\b/, tools: ["buscar_pedido", "consultar_panorama_pecas", "analisar_riscos", "gerar_documentos_pedido", "diagnosticar_usinagem"] },
  { re: /medida|travessa|perna|alizar|batente|baguete|porta|kit|metro|linear|\d+\s*x\s*\d+/, tools: ["consultar_pecas_por_medida", "consultar_panorama_pecas", "consultar_periodo", "resumo_metros_lineares", "consultar_catalogo"] },
  { re: /material|ultra|std|pinus|cor\b|rebaixo|codigo|catalogo|descri/, tools: ["consultar_panorama_pecas", "consultar_catalogo", "diagnosticar_catalogo_setores"] },
  { re: /semana|mes|periodo|hoje|ontem|amanha|\d{1,2}\/\d{1,2}/, tools: ["consultar_periodo", "resumo_producao", "consultar_panorama_pecas"] },
  { re: /producao|produzid|resumo|situacao|status|andamento|apontad/, tools: ["resumo_producao", "buscar_pedido", "resumo_metros_lineares", "listar_andon"] },
  { re: /romaneio|etiqueta|carga|volume/, tools: ["gerar_romaneio", "gerar_documentos_pedido", "historico_romaneios"] },
  { re: /planilha|excel|exportar|usinagem/, tools: ["gerar_planilha_programacao", "gerar_planilha_usinagem", "diagnosticar_usinagem"] },
  { re: /prioridade|priorizar/, tools: ["propor_prioridade", "buscar_pedido"] },
  { re: /qualidade|pallet|inspec/, tools: ["resumo_qualidade"] },
  { re: /procedimento|regra|ensin|como funciona|conhecimento/, tools: ["consultar_conhecimento", "mapa_fontes_sistema"] },
];
const BASE = ["navegar", "consultar_conhecimento", "mapa_fontes_sistema"];

export function saudacaoSimples(texto: string) {
  const t = norm(texto).replace(/[^a-z0-9 ]/g, " ").trim();
  return t.length <= 40 && /^(?:(?:oi|ola|bom dia|boa tarde|boa noite|obrigad[oa]|muito obrigad[oa]|valeu|ok|certo|entendi|tudo bem)\s*)+$/.test(t);
}

export function selecionarFerramentas<T extends Record<string, unknown>>(pergunta: string, todas: T): Partial<T> {
  const t = norm(pergunta);
  const escolhidas = new Set<string>(BASE);
  let casou = false;
  for (const g of GRUPOS) if (g.re.test(t)) { casou = true; g.tools.forEach((x) => escolhidas.add(x)); }
  if (!casou) return todas;
  return Object.fromEntries(Object.entries(todas).filter(([k]) => escolhidas.has(k))) as Partial<T>;
}

/** Limita o histórico enviado: mantém o fim, resume respostas antigas do assistente. */
export function compactarHistorico<T extends { role: "user" | "assistant"; content: string }>(msgs: T[], max = 12): T[] {
  const recentes = msgs.slice(-max);
  const ultimo = recentes.length - 1;
  return recentes.map((m, i) => (i === ultimo || m.role === "user" ? m : { ...m, content: m.content.slice(0, 1500) }));
}
