import { allowedPath } from "@/lib/permissions";

export type FonteIndustrial = {
  modulo: string;
  tela: string;
  descricao: string;
  consultas: string[];
  cobertura: "PROGRAMACAO_ATIVA" | "HISTORICO" | "CADASTRO" | "OPERACIONAL";
  ressalva: string;
};

/** Diretório explícito de fontes de leitura para o agente industrial. Nunca concede permissões. */
export const FONTES_INDUSTRIAIS: FonteIndustrial[] = [
  { modulo:"Programação",tela:"/programacao",descricao:"Filtros importados, pedidos, OFs, peças e operações",consultas:["resumo_producao","consultar_panorama_pecas","buscar_pedido","consultar_pecas_por_medida"],cobertura:"PROGRAMACAO_ATIVA",ressalva:"Filtro ativo não representa todos os filtros do dia" },
  { modulo:"Programação do gerente",tela:"/programacao-gerente",descricao:"Riscos, materiais, sequenciamento e capacidades de produção",consultas:["diagnostico_integrado","planejar_fabrica","consultar_capacidade","diagnosticar_usinagem"],cobertura:"OPERACIONAL",ressalva:"Projeções e capacidades não são apontamentos de produção real" },
  { modulo:"Líderes",tela:"/lideres",descricao:"Linhas por setor, medidas e quantidades programadas",consultas:["consultar_panorama_pecas","diagnosticar_catalogo_setores"],cobertura:"PROGRAMACAO_ATIVA",ressalva:"Quantidade por setor pode se repetir entre processos" },
  { modulo:"Romaneios",tela:"/romaneios",descricao:"Romaneios já gerados e documentos por pedido",consultas:["historico_romaneios","gerar_documentos_pedido"],cobertura:"HISTORICO",ressalva:"Romaneio não comprova expedição ou entrega" },
  { modulo:"Histórico",tela:"/historico",descricao:"Importações e programações em diferentes datas",consultas:["consultar_periodo"],cobertura:"HISTORICO",ressalva:"Somente informações já importadas e armazenadas" },
  { modulo:"Qualidade",tela:"/inspecao-pallets",descricao:"Inspeção e status de pallets",consultas:["resumo_qualidade"],cobertura:"OPERACIONAL",ressalva:"Status de inspeção não comprova carregamento" },
  { modulo:"Faltas e retrabalho",tela:"/excecoes",descricao:"Faltas de peças e exceções operacionais",consultas:["listar_excecoes","analisar_riscos"],cobertura:"OPERACIONAL",ressalva:"Somente ocorrências registradas" },
  { modulo:"Sobral IA",tela:"/sobral-ia",descricao:"Base de conhecimento cadastrada e revisada",consultas:["consultar_conhecimento"],cobertura:"CADASTRO",ressalva:"Regras da equipe não são dados de produção em tempo real" },
];

export function fontesAcessiveis(perfil:string):FonteIndustrial[] {
  return FONTES_INDUSTRIAIS.filter(x=>allowedPath(perfil,x.tela));
}

export const RESTRICOES_FUNDAMENTAIS = [
  "Sem API de apontamentos Consistem, não afirmar produção real consolidada de todos os filtros do dia.",
  "Os dados devem ser apresentados com fonte, filtro, período, unidade e pendências.",
  "A IA pode cruzar fontes acessíveis ao perfil, mas não pode ampliar permissões.",
  "Dados sem código técnico inequívoco devem permanecer pendentes; não inferir STD, ULTRA ou PINUS.",
] as const;
