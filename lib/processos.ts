/**
 * Processos oficiais do PCP.
 *
 * PROCESSOS_FONTE = nomes das colunas recebidas do Consistem.
 * PROCESSOS = setores/máquinas reais usados dentro do PCP.
 */

export const PROCESSOS_FONTE = [
  "PREPARACAO",
  "USINAGEM-1",
  "LIXAR",
  "RECOBRIDORA",
  "RECOBRIDORA-2",
  "USINAGEM-2",
  "LUSTRACAO",
  "TERCEIROS",
  "EMBALAGEM",
  "EXPEDICAO",
] as const;

export const PROCESSOS: string[] = [
  "PREPARACAO",

  "USINAGEM-PORTAS",
  "USINAGEM-TRAVESSAS",

  "LIXAR",

  "RECOBRIDORA",
  "RECOBRIDORA-2",

  "USINAGEM-CONTRATESTA",
  "USINAGEM-DOBRADICAS",
  "USINAGEM-TUPIA",

  "LUSTRACAO",
  "TERCEIROS",

  "EMBALAGEM-PORTAS",
  "EMBALAGEM-1",
  "EMBALAGEM-2",
  "EMBALAGEM-3",

  "EXPEDICAO",
];

export type Processo = string;
export type ProcessoFonte = (typeof PROCESSOS_FONTE)[number];

const ORDEM = new Map<string, number>(
  PROCESSOS.map((processo, index) => [processo, index])
);

export function ordenarProcessos<T extends string>(processos: T[]): T[] {
  return [...processos].sort((a, b) => {
    const oa = ORDEM.get(a) ?? 999;
    const ob = ORDEM.get(b) ?? 999;
    return oa - ob || a.localeCompare(b, "pt-BR");
  });
}
