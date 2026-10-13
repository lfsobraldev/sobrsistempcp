import type { Perfil } from "@/types/pcp";

const ALL_PCP = [
  "/dashboard", "/programacao", "/programacao-gerente", "/prioridades", "/criticos", "/lideres",
  "/apontamentos", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico", "/configuracoes",
];

const BY_ROLE: Record<Perfil, string[]> = {
  PCP: ALL_PCP,
  GERENTE: ["/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios", "/historico"],
  ENCARREGADO: ["/dashboard", "/programacao-gerente", "/prioridades", "/lideres", "/excecoes", "/inspecao-pallets", "/romaneios"],
  LIDER: ["/lideres", "/excecoes"],
  APONTADOR: ["/apontamentos"],
  QUALIDADE: ["/dashboard", "/inspecao-pallets"],
};

export function allowedPath(role: string, path: string) {
  return (BY_ROLE as Record<string, string[]>)[role]?.includes(path) ?? false;
}
export function pathsFor(role: string) {
  return (BY_ROLE as Record<string, string[]>)[role] ?? [];
}
