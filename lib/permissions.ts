import type { Perfil } from "@/types/pcp";

const ALL_PCP = [
  "/plataforma", "/pessoas",
  "/marketing", "/engenharia", "/ordens-fabricacao", "/acessos", "/planejamento-mensal", "/consolidado", "/dashboard", "/comercial", "/vendas", "/planejamento-aps", "/expedicao", "/custos", "/fiscal", "/financeiro", "/manutencao", "/documentos", "/indicadores", "/qualidade-inspecao", "/compras", "/producao-consultas", "/medicoes", "/gestao-pedidos", "/apontamento-entregas", "/integracao-consistem", "/programacao", "/programacao-gerente", "/prioridades", "/criticos", "/lideres",
  "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia", "/configuracoes", "/sac", "/carteira", "/pcp-painel", "/apontamento-operacoes", "/estoque", "/estoque-avancado", "/wms", "/mapa-fabrica", "/corporativo", "/seguranca", "/embalagem", "/plano-corte", "/cotacoes", "/controladoria", "/seguranca",
];

const BY_ROLE: Record<Perfil, string[]> = {
  PCP: ALL_PCP,
  GERENTE: ["/pessoas", "/marketing", "/engenharia", "/ordens-fabricacao", "/planejamento-mensal", "/consolidado", "/estoque", "/estoque-avancado", "/wms", "/mapa-fabrica", "/controladoria", "/corporativo", "/seguranca", "/embalagem", "/plano-corte", "/cotacoes", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/comercial", "/vendas", "/planejamento-aps", "/expedicao", "/custos", "/fiscal", "/financeiro", "/manutencao", "/documentos", "/indicadores", "/qualidade-inspecao", "/compras", "/producao-consultas", "/medicoes", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia", "/plataforma"],
  ENCARREGADO: ["/pessoas", "/engenharia", "/ordens-fabricacao", "/planejamento-mensal", "/consolidado", "/estoque", "/estoque-avancado", "/wms", "/mapa-fabrica", "/corporativo", "/seguranca", "/embalagem", "/plano-corte", "/cotacoes", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/comercial", "/vendas", "/planejamento-aps", "/expedicao", "/qualidade-inspecao", "/compras", "/producao-consultas", "/medicoes", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/sobral-ia", "/plataforma"],
  LIDER: ["/apontamento-operacoes", "/lideres", "/excecoes", "/sobral-ia", "/manutencao", "/indicadores", "/plataforma"],
  APONTADOR: ["/apontamento-operacoes", "/lideres", "/plataforma"],
  QUALIDADE: ["/pessoas", "/wms", "/mapa-fabrica", "/embalagem", "/plano-corte", "/cotacoes", "/corporativo", "/dashboard", "/medicoes", "/inspecao-pallets", "/qualidade-inspecao", "/documentos", "/indicadores", "/plataforma"],
  COMERCIAL: ["/wms", "/mapa-fabrica", "/marketing", "/estoque", "/carteira", "/comercial", "/vendas", "/medicoes", "/gestao-pedidos", "/sac", "/plataforma"],
  LOGISTICA: ["/wms", "/mapa-fabrica", "/embalagem", "/plano-corte", "/cotacoes", "/expedicao", "/estoque", "/carteira", "/gestao-pedidos", "/sac", "/plataforma"],
  LIDER_ENTREGAS: ["/apontamento-entregas", "/plataforma"],
  SAC: ["/sac", "/plataforma"],
  SUPERVISOR: [],
  DIRETOR: [],
  ADMINISTRADOR: [],
};
BY_ROLE.SUPERVISOR = BY_ROLE.ENCARREGADO;
BY_ROLE.DIRETOR = BY_ROLE.GERENTE;
BY_ROLE.ADMINISTRADOR = ALL_PCP;

export function allowedPath(role: string, path: string) {
  const unidade=/^\/(pcp|apontamento|estoque|programacao)\/(sul|nordeste|consolidado)$/.exec(path);
  if(unidade)path=({pcp:'/pcp-painel',apontamento:'/apontamento-operacoes',estoque:'/estoque',programacao:'/planejamento-mensal'} as Record<string,string>)[unidade[1]];
  return (BY_ROLE as Record<string, string[]>)[role]?.includes(path) ?? false;
}
export function pathsFor(role: string) {
  return (BY_ROLE as Record<string, string[]>)[role] ?? [];
}
