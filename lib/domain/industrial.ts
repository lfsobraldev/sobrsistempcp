export type SeqItem = {
  prioridade?: string;
  categoria?: string;
  descricao?: string;
  produto?: string;
  tipo?: string;
  material?: string;
  acabamento?: string;
  cor?: string;
  rebaixo?: string;
  medida?: string;
  pedido?: string;
  of?: string;
};

export type FamiliaIndustrial =
  | "PORTAS"
  | "BATENTES"
  | "ALIZARES"
  | "KIT CORRER"
  | "BAGUETE"
  | "BANDEIRA"
  | "OUTROS"
  | "FERRAGENS";

const norm = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const pontuacao = (value: unknown) =>
  norm(value).replace(/[^A-Z0-9]+/g, " ").trim();

function textoItem(item: SeqItem) {
  return pontuacao(
    [item.categoria, item.descricao, item.produto, item.tipo]
      .filter(Boolean)
      .join(" ")
  );
}

/** Apenas a descrição, sem pontuação (P.A. -> P A). Usada em testes de prefixo. */
const textoDescricao = (item: SeqItem) => pontuacao(item.descricao);

/**
 * REGRA DE LARGURA: "ASC" = da MENOR para a MAIOR largura.
 * Para inverter (maior -> menor) basta trocar para "DESC".
 * Largura = segunda dimensão da medida (CxLxE).
 */
export const LARGURA_ORDEM: "ASC" | "DESC" = "DESC";

/** Abaixo deste comprimento (mm) a peça sem identificação é tratada como travessa. */
const LIMITE_TRAVESSA = 1500;

const MEDIDA =
  /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/i;

export function parseMeasure(
  value: unknown
): [number, number, number] {
  const match = String(value ?? "").match(MEDIDA);

  if (!match) {
    return [0, 0, 0];
  }

  const n = (v?: string) => (v ? Number(v.replace(",", ".")) : 0);

  return [n(match[1]), n(match[2]), n(match[3])];
}

/** Medida do item; se o campo medida estiver vazio, lê da descrição (inclusive truncada: 2100X700X). */
export function medidaDoItem(item: SeqItem): [number, number, number] {
  const direta = parseMeasure(item.medida);

  if (direta[0] > 0 && direta[1] > 0) {
    return direta;
  }

  return parseMeasure(item.descricao);
}

export function familiaIndustrial(
  item: SeqItem
): FamiliaIndustrial {
  const text = textoItem(item);
  const desc = textoDescricao(item);

  // BANDEIRA
  if (/\bBANDEIRA\b/.test(text) || /\bBAND\b/.test(text)) {
    return "BANDEIRA";
  }

  // KIT DE CORRER / SUPORTE DE TRILHO (antes de alizar/batente: "P A KIT DE CORRER")
  if (
    /\bKIT\b/.test(text) ||
    /\bKIT DE CORRER\b/.test(text) ||
    /\bSUP(ORTE)? TRILHO\b/.test(text) ||
    /\bTRILHO\b/.test(text)
  ) {
    return "KIT CORRER";
  }

  // FERRAGENS - NÃO ENTRAM NO PCP
  if (
    /\bFERRAGEM\b/.test(text) ||
    /\bDOBRADICA\b/.test(text) ||
    /\bDOB\b/.test(text) ||
    /\bDOBR\b/.test(text) ||
    /\bFECHADURA\b/.test(text) ||
    /\bFEC\b/.test(text) ||
    /\bCONTRA ?TESTA\b/.test(text) ||
    /\bPUXADOR\b/.test(text) ||
    /\bROLDANA\b/.test(text)
  ) {
    return "FERRAGENS";
  }

  // PORTAS
  if (
    /\b(PORTA|PORTAS|FOLHA)\b/.test(text) ||
    /^(FO|FOL|FP|FPC|F P|F P P)\b/.test(desc)
  ) {
    return "PORTAS";
  }

  // BAGUETE
  if (/\bBAGUETE\b/.test(text) || /\bBAG\b/.test(text)) {
    return "BAGUETE";
  }

  // ALIZARES (antes de batente)
  if (
    /\bALIZAR(ES)?\b/.test(text) ||
    /\b(PE AL|PER ALI|P A|TR AL|TR ALI|TRA ALI|T A)\b/.test(text) ||
    /^A (STD|ULTRA)\b/.test(desc)
  ) {
    return "ALIZARES";
  }

  // BATENTES
  if (
    /\b(BATENTE|MARCO)\b/.test(text) ||
    /\b(M P|M T|M CJ|M STD|M ULTRA)\b/.test(text)
  ) {
    return "BATENTES";
  }

  // Descrição que começa direto pela medida (ex.: 2110x130x30 42x10 ... ou 2200X70X15 RTO ...)
  if (/^\d+X\d+/.test(desc)) {
    const esp = medidaDoItem(item)[2];

    if (esp > 0 && esp <= 20) return "ALIZARES";
    if (esp >= 25) return "BATENTES";

    return /\bRTO?\b/.test(desc) ? "ALIZARES" : "BATENTES";
  }

  return "OUTROS";
}

export function ehFerragem(item: SeqItem) {
  return familiaIndustrial(item) === "FERRAGENS";
}

export type TipoPeca = "PERNA" | "TRAVESSA";

/** Perna x travessa (batentes e alizares). Sem identificação explícita, decide pelo comprimento. */
export function tipoPeca(item: SeqItem): TipoPeca {
  const text = textoItem(item);

  if (/\b(TRAVESSA|TRAV|TR AL|TR ALI|TRA ALI|T A|M T)\b/.test(text)) {
    return "TRAVESSA";
  }

  if (/\b(PERNA|PE AL|PER ALI|P A|M P)\b/.test(text)) {
    return "PERNA";
  }

  const comprimento = medidaDoItem(item)[0];

  return comprimento > 0 && comprimento < LIMITE_TRAVESSA
    ? "TRAVESSA"
    : "PERNA";
}

function prioridadeRank(value?: string) {
  const priority = norm(value);

  if (priority === "URGENTE") return 0;
  if (priority === "ALTA") return 1;

  return 2;
}

/** Sequência fixa: PORTAS > BATENTES > ALIZARES > BAGUETES > KIT DE CORRER/SUPORTE DE TRILHO > demais. */
const FAMILY_ORDER: Record<FamiliaIndustrial, number> = {
  PORTAS: 0,
  BATENTES: 1,
  ALIZARES: 2,
  BAGUETE: 3,
  "KIT CORRER": 4,
  BANDEIRA: 5,
  OUTROS: 6,
  FERRAGENS: 99,
};

function familyRank(item: SeqItem) {
  return FAMILY_ORDER[familiaIndustrial(item)] ?? 98;
}

function compareText(a: unknown, b: unknown) {
  return norm(a).localeCompare(norm(b), "pt-BR", { numeric: true });
}

/** Largura desconhecida (0) vai sempre para o fim. */
function compareLargura(a: number, b: number) {
  const x = a > 0 ? a : Infinity;
  const y = b > 0 ? b : Infinity;

  if (x === y) return 0;
  if (x === Infinity) return 1;
  if (y === Infinity) return -1;

  return LARGURA_ORDEM === "ASC" ? x - y : y - x;
}

const compareSetup = (a: SeqItem, b: SeqItem) =>
  compareText(a.material, b.material) ||
  compareText(a.acabamento, b.acabamento) ||
  compareText(a.cor, b.cor) ||
  compareText(a.rebaixo, b.rebaixo);

/**
 * Ordem DENTRO de uma mesma família.
 * Batentes e alizares: mesma largura ficam juntas (perna e travessa em sequência,
 * dentro do mesmo material/acabamento/cor/rebaixo) — nunca todas as pernas e depois
 * todas as travessas.
 */
export function compareDentroDaFamilia(a: SeqItem, b: SeqItem) {
  const family = familiaIndustrial(a);
  const [compA, largA, espA] = medidaDoItem(a);
  const [compB, largB, espB] = medidaDoItem(b);

  const larguraDiff = compareLargura(largA, largB);

  if (larguraDiff !== 0) return larguraDiff;

  if (family === "BATENTES" || family === "ALIZARES") {
    const setup = compareSetup(a, b);

    if (setup) return setup;

    const tipoDiff =
      (tipoPeca(a) === "TRAVESSA" ? 1 : 0) -
      (tipoPeca(b) === "TRAVESSA" ? 1 : 0);

    if (tipoDiff !== 0) return tipoDiff;

    if (compA !== compB) return compB - compA;
    if (espA !== espB) return espB - espA;
  } else {
    if (compA !== compB) return compB - compA;

    const setup = compareSetup(a, b);

    if (setup) return setup;

    if (espA !== espB) return espB - espA;

    const descDiff = compareText(a.descricao, b.descricao);

    if (descDiff) return descDiff;
  }

  return (
    compareText(a.pedido, b.pedido) ||
    compareText(a.of, b.of) ||
    compareText(a.categoria, b.categoria)
  );
}

/** Ordem de produção (filas): prioridade -> família -> largura. */
export function compareProduction(a: SeqItem, b: SeqItem) {
  const priorityDiff =
    prioridadeRank(a.prioridade) - prioridadeRank(b.prioridade);

  if (priorityDiff !== 0) return priorityDiff;

  const familyDiff = familyRank(a) - familyRank(b);

  if (familyDiff !== 0) return familyDiff;

  return compareDentroDaFamilia(a, b);
}

/** Ordem ESTRITA da planilha: família primeiro e, dentro dela, largura MAIOR -> MENOR. Prioridade não quebra essa sequência. */
export function compareParaPlanilha(a: SeqItem, b: SeqItem) {
  const familyDiff = familyRank(a) - familyRank(b);

  if (familyDiff !== 0) return familyDiff;

  return compareDentroDaFamilia(a, b);
}

export type Capacity = {
  processo: string;
  pecasHora: number;
  minutosDisponiveis: number;
  eficiencia: number;
};

export type Queue = {
  processo: string;
  filaPecas: number;
  pedidos: number;
};

export function bottlenecks(
  queues: Queue[],
  caps: Capacity[]
) {
  return queues
    .map((q) => {
      const c = caps.find(
        (x) =>
          x.processo ===
          q.processo
      );

      const rate =
        c &&
        c.pecasHora > 0
          ? c.pecasHora *
            Math.max(
              0,
              c.eficiencia || 100
            ) /
            100
          : 0;

      return {
        ...q,
        capacidadeConfigurada: !!rate,
        pecasHora: rate,
        horasFila:
          rate > 0
            ? q.filaPecas / rate
            : null,
      };
    })
    .sort(
      (a, b) =>
        (b.horasFila ?? -1) -
        (a.horasFila ?? -1)
    );
}

export function calcOee(
  input: {
    plannedMinutes?: number;
    stopMinutes?: number;
    idealRate?: number;
    produced?: number;
    good?: number;
  }
) {
  const {
    plannedMinutes,
    stopMinutes = 0,
    idealRate,
    produced,
    good,
  } = input;

  if (
    !plannedMinutes ||
    plannedMinutes <= 0 ||
    !idealRate ||
    idealRate <= 0 ||
    produced == null ||
    good == null ||
    produced < 0 ||
    good < 0
  ) {
    return null;
  }

  const run = Math.max(
    0,
    plannedMinutes - stopMinutes
  );

  const availability =
    run / plannedMinutes;

  const performance =
    run > 0
      ? Math.min(
          1,
          produced /
            (
              idealRate *
              (run / 60)
            )
        )
      : 0;

  const quality =
    produced > 0
      ? Math.min(
          1,
          good / produced
        )
      : 0;

  return {
    availability,
    performance,
    quality,
    oee:
      availability *
      performance *
      quality,
  };
}

export function riskLevel(
  input: {
    priority?: string;
    blocked?: boolean;
    openAndon?: boolean;
    remaining?: number;
    queueHours?: number | null;
  }
) {
  let score = 0;
  const reasons: string[] = [];

  if (
    norm(input.priority) ===
    "URGENTE"
  ) {
    score += 3;
    reasons.push(
      "Prioridade urgente"
    );
  } else if (
    norm(input.priority) ===
    "ALTA"
  ) {
    score += 1;
    reasons.push(
      "Prioridade alta"
    );
  }

  if (input.blocked) {
    score += 4;
    reasons.push(
      "Bloqueio de qualidade/pallet"
    );
  }

  if (input.openAndon) {
    score += 3;
    reasons.push(
      "Ocorrência Andon aberta"
    );
  }

  if (
    (input.queueHours ?? 0) >=
    4
  ) {
    score += 3;
    reasons.push(
      "Fila estimada acima de 4 h"
    );
  } else if (
    (input.queueHours ?? 0) >=
    2
  ) {
    score += 1;
    reasons.push(
      "Fila estimada acima de 2 h"
    );
  }

  if (
    (input.remaining ?? 0) >
    0
  ) {
    reasons.push(
      `${input.remaining} peças restantes`
    );
  }

  return {
    level:
      score >= 7
        ? "CRITICO"
        : score >= 4
        ? "RISCO"
        : score >= 2
        ? "ATENCAO"
        : "NO_PRAZO",
    score,
    reasons,
  };
}

export function pareto<
  T extends {
    motivo: string;
    minutos: number;
  }
>(
  rows: T[]
) {
  const map =
    new Map<string, number>();

  for (const row of rows) {
    map.set(
      row.motivo,
      (
        map.get(row.motivo) ||
        0
      ) +
        Math.max(
          0,
          row.minutos || 0
        )
    );
  }

  return [...map]
    .map(
      ([
        motivo,
        minutos,
      ]) => ({
        motivo,
        minutos,
      })
    )
    .sort(
      (a, b) =>
        b.minutos -
        a.minutos
    );
}
