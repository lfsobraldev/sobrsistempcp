import type { Perfil } from "@/types/pcp";

const ALL_PCP = [
  "/dashboard", "/gestao-pedidos", "/apontamento-entregas", "/integracao-consistem", "/programacao", "/programacao-gerente", "/prioridades", "/criticos", "/lideres",
  "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia", "/configuracoes", "/sac", "/carteira", "/pcp-painel", "/apontamento-operacoes", "/estoque",
];

const BY_ROLE: Record<Perfil, string[]> = {
  PCP: ALL_PCP,
  GERENTE: ["/estoque", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia"],
  ENCARREGADO: ["/estoque", "/pcp-painel", "/apontamento-operacoes", "/carteira", "/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/sobral-ia"],
  LIDER: ["/apontamento-operacoes", "/lideres", "/excecoes", "/sobral-ia"],
  APONTADOR: ["/apontamento-operacoes", "/lideres"],
  QUALIDADE: ["/dashboard", "/inspecao-pallets"],
  COMERCIAL: ["/estoque", "/carteira", "/gestao-pedidos", "/sac"],
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
