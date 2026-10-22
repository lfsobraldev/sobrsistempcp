import type { Perfil } from "@/types/pcp";

const ALL_PCP = [
  "/marketing", "/engenharia", "/ordens-fabricacao", "/acessos", "/planejamento-mensal", "/consolidado", "/dashboard", "/comercial", "/vendas", "/planejamento-aps", "/expedicao", "/custos", "/fiscal", "/financeiro", "/manutencao", "/documentos", "/qualidade-inspecao", "/compras", "/producao-consultas", "/medicoes", "/gestao-pedidos", "/apontamento-entregas", "/integracao-consistem", "/programacao", "/programacao-gerente", "/prioridades", "/criticos", "/lideres",
  "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia", "/configuracoes", "/sac", "/carteira", "/pcp-painel", "/apontamento-operacoes", "/estoque",
];

const BY_ROLE: Record<Perfil, string[]> = {
  PCP: ALL_PCP,
  GERENTE: ["/marketing", "/engenharia", "/ordens-fabricacao", "/planejamento-mensal", "/consolidado", "/estoque", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/comercial", "/vendas", "/planejamento-aps", "/expedicao", "/custos", "/fiscal", "/financeiro", "/manutencao", "/documentos", "/qualidade-inspecao", "/compras", "/producao-consultas", "/medicoes", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia"],
  ENCARREGADO: ["/engenharia", "/ordens-fabricacao", "/planejamento-mensal", "/consolidado", "/estoque", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/comercial", "/vendas", "/planejamento-aps", "/expedicao", "/qualidade-inspecao", "/compras", "/producao-consultas", "/medicoes", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/sobral-ia"],
  LIDER: ["/apontamento-operacoes", "/lideres", "/excecoes", "/sobral-ia", "/manutencao"],
  APONTADOR: ["/apontamento-operacoes", "/lideres"],
  QUALIDADE: ["/dashboard", "/medicoes", "/inspecao-pallets", "/qualidade-inspecao", "/documentos"],
  COMERCIAL: ["/marketing", "/estoque", "/carteira", "/comercial", "/vendas", "/medicoes", "/gestao-pedidos", "/sac"],
  LOGISTICA: ["/expedicao", "/estoque", "/carteira", "/gestao-pedidos", "/sac"],
  LIDER_ENTREGAS: ["/apontamento-entregas"],
  SAC: ["/sac"],
};

export function allowedPath(role: string, path: string) {
  const unidade=/^\/(pcp|apontamento|estoque|programacao)\/(sul|nordeste|consolidado)$/.exec(path);
  if(unidade)path=({pcp:'/pcp-painel',apontamento:'/apontamento-operacoes',estoque:'/estoque',programacao:'/planejamento-mensal'} as Record<string,string>)[unidade[1]];
  return (BY_ROLE as Record<string, string[]>)[role]?.includes(path) ?? false;
}
export function pathsFor(role: string) {
  return (BY_ROLE as Record<string, string[]>)[role] ?? [];
}
