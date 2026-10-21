import type { Perfil } from "@/types/pcp";

const ALL_PCP = [
  "/programacao/sul", "/programacao/nordeste", "/programacao/consolidado", "/dashboard", "/comercial", "/medicoes", "/gestao-pedidos", "/apontamento-entregas", "/integracao-consistem", "/programacao", "/programacao-gerente", "/prioridades", "/criticos", "/lideres",
  "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia", "/configuracoes", "/sac", "/carteira", "/pcp-painel", "/apontamento-operacoes", "/estoque",
];

const BY_ROLE: Record<Perfil, string[]> = {
  PCP: ALL_PCP,
  GERENTE: ["/programacao/sul", "/programacao/nordeste", "/programacao/consolidado", "/estoque", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/comercial", "/medicoes", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia"],
  ENCARREGADO: ["/programacao/sul", "/programacao/nordeste", "/programacao/consolidado", "/estoque", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/comercial", "/medicoes", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/sobral-ia"],
  LIDER: ["/apontamento-operacoes", "/lideres", "/excecoes", "/sobral-ia"],
  APONTADOR: ["/apontamento-operacoes", "/lideres"],
  QUALIDADE: ["/dashboard", "/medicoes", "/inspecao-pallets"],
  COMERCIAL: ["/estoque", "/carteira", "/comercial", "/medicoes", "/gestao-pedidos", "/sac"],
  LOGISTICA: ["/estoque", "/carteira", "/gestao-pedidos", "/sac"],
  LIDER_ENTREGAS: ["/apontamento-entregas"],
  SAC: ["/sac"],
};

export function allowedPath(role: string, path: string) {
  return (BY_ROLE as Record<string, string[]>)[role]?.includes(path) ?? false;
}
export function pathsFor(role: string) {
  return (BY_ROLE as Record<string, string[]>)[role] ?? [];
}
