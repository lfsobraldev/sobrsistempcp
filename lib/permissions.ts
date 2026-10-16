import type { Perfil } from "@/types/pcp";

const ALL_PCP = [
  "/dashboard", "/gestao-pedidos", "/apontamento-entregas", "/integracao-consistem", "/programacao", "/programacao-gerente", "/prioridades", "/criticos", "/lideres",
  "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia", "/configuracoes",
];

const BY_ROLE: Record<Perfil, string[]> = {
  PCP: ALL_PCP,
  GERENTE: ["/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/sobral-ia"],
  ENCARREGADO: ["/gestao-pedidos", "/integracao-consistem", "/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/sobral-ia"],
  LIDER: ["/lideres", "/excecoes", "/sobral-ia"],
  APONTADOR: ["/lideres"],
  QUALIDADE: ["/dashboard", "/inspecao-pallets"],
  COMERCIAL: ["/gestao-pedidos"],
  LOGISTICA: ["/gestao-pedidos"],
  LIDER_ENTREGAS: ["/dashboard", "/gestao-pedidos", "/apontamento-entregas"],
};

export function allowedPath(role: string, path: string) {
  return (BY_ROLE as Record<string, string[]>)[role]?.includes(path) ?? false;
}
export function pathsFor(role: string) {
  return (BY_ROLE as Record<string, string[]>)[role] ?? [];
}
