export type SeqItem = {
  prioridade?: string;
  categoria?: string;
  material?: string;
  acabamento?: string;
  cor?: string;
  rebaixo?: string;
  medida?: string;
  pedido?: string;
  of?: string;
};

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

export function parseMeasure(
  v: unknown
): [number, number, number] {
  const m = String(v ?? "").match(
    /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i
  );

  if (!m) {
    return [0, 0, 0];
  }

  return [
    Number(m[1].replace(",", ".")),
    Number(m[2].replace(",", ".")),
    Number(m[3].replace(",", ".")),
  ];
}

export function isBatenteTravessa(
  item: SeqItem
) {
  const t = norm(
    [
      item.categoria,
      item.material,
    ].join(" ")
  );

  return (
    t.includes("BATENTE") ||
    t.includes("TRAVESSA") ||
    t.includes("PERNA") ||
    t.includes("MARCO") ||
    /\bM P\b/.test(t) ||
    /\bM T\b/.test(t)
  );
}

export function batenteTypeRank(
  item: SeqItem
) {
  const t = norm(
    item.categoria
  );

  if (
    t.includes("TRAVESSA") ||
    /\bM T\b/.test(t)
  ) {
    return 1;
  }

  return 0;
}

const priorityRank = (
  p?: string
) => {
  const n =
    norm(p);

  if (
    n === "URGENTE"
  ) {
    return 0;
  }

  if (
    n === "ALTA"
  ) {
    return 1;
  }

  return 2;
};

function familyRank(
  item: SeqItem
) {
  const t =
    norm(
      item.categoria
    );

  if (
    isBatenteTravessa(
      item
    )
  ) {
    return 0;
  }

  if (
    t.startsWith(
      "ALIZAR"
    )
  ) {
    return 1;
  }

  if (
    t.startsWith(
      "BAGUETE"
    )
  ) {
    return 2;
  }

  if (
    t.startsWith(
      "KIT"
    )
  ) {
    return 3;
  }

  if (
    t.startsWith(
      "PORTA"
    )
  ) {
    return 4;
  }

  if (
    t.startsWith(
      "BANDEIRA"
    )
  ) {
    return 5;
  }

  return 6;
}

function alizarTypeRank(
  item: SeqItem
) {
  const t =
    norm(
      item.categoria
    );

  return t.includes(
    "TRAVESSA"
  )
    ? 1
    : 0;
}

export function compareProduction(
  a: SeqItem,
  b: SeqItem
) {
  const priorityDiff =
    priorityRank(
      a.prioridade
    ) -
    priorityRank(
      b.prioridade
    );

  if (
    priorityDiff
  ) {
    return priorityDiff;
  }

  const familyDiff =
    familyRank(a) -
    familyRank(b);

  if (
    familyDiff
  ) {
    return familyDiff;
  }

  const txt = (
    x: unknown,
    y: unknown
  ) =>
    norm(x).localeCompare(
      norm(y),
      "pt-BR",
      {
        numeric: true,
      }
    );

  const [
    comprimentoA,
    larguraA,
    espessuraA,
  ] =
    parseMeasure(
      a.medida
    );

  const [
    comprimentoB,
    larguraB,
    espessuraB,
  ] =
    parseMeasure(
      b.medida
    );

  /*
   * ==================================================
   * BATENTES / PERNAS / TRAVESSAS
   * ==================================================
   *
   * REGRA PRINCIPAL:
   *
   * A LARGURA SEMPRE VEM PRIMEIRO.
   *
   * Maior → menor.
   *
   * Exemplo:
   *
   * 230 BATENTE
   * 230 TRAVESSA
   * 180 BATENTE
   * 180 TRAVESSA
   * 130 BATENTE
   * 130 TRAVESSA
   * 90 BATENTE
   * 90 TRAVESSA
   *
   * Material, acabamento, cor e rebaixo
   * NÃO podem fazer uma largura menor
   * subir antes de uma largura maior.
   */
  if (
    isBatenteTravessa(
      a
    ) &&
    isBatenteTravessa(
      b
    )
  ) {
    // 1º REGRA:
    // MAIOR LARGURA PRIMEIRO
    if (
      larguraA !==
      larguraB
    ) {
      return (
        larguraB -
        larguraA
      );
    }

    /*
     * A partir daqui,
     * os dois itens já possuem
     * a MESMA largura.
     *
     * Somente agora podemos
     * organizar setup.
     */
    const setupDiff =
      txt(
        a.material,
        b.material
      ) ||
      txt(
        a.acabamento,
        b.acabamento
      ) ||
      txt(
        a.cor,
        b.cor
      ) ||
      txt(
        a.rebaixo,
        b.rebaixo
      );

    if (
      setupDiff
    ) {
      return setupDiff;
    }

    // Dentro da mesma largura:
    // BATENTE/PERNA primeiro,
    // TRAVESSA depois.
    const typeDiff =
      batenteTypeRank(
        a
      ) -
      batenteTypeRank(
        b
      );

    if (
      typeDiff
    ) {
      return typeDiff;
    }

    // Comprimento maior primeiro
    if (
      comprimentoA !==
      comprimentoB
    ) {
      return (
        comprimentoB -
        comprimentoA
      );
    }

    // Espessura maior primeiro
    if (
      espessuraA !==
      espessuraB
    ) {
      return (
        espessuraB -
        espessuraA
      );
    }

    return (
      txt(
        a.pedido,
        b.pedido
      ) ||
      txt(
        a.of,
        b.of
      ) ||
      txt(
        a.categoria,
        b.categoria
      )
    );
  }

  /*
   * ==================================================
   * ALIZARES
   * ==================================================
   */
  if (
    familyRank(a) ===
      1 &&
    familyRank(b) ===
      1
  ) {
    const setupDiff =
      txt(
        a.material,
        b.material
      ) ||
      txt(
        a.acabamento,
        b.acabamento
      ) ||
      txt(
        a.cor,
        b.cor
      ) ||
      txt(
        a.rebaixo,
        b.rebaixo
      );

    if (
      setupDiff
    ) {
      return setupDiff;
    }

    const typeDiff =
      alizarTypeRank(
        a
      ) -
      alizarTypeRank(
        b
      );

    if (
      typeDiff
    ) {
      return typeDiff;
    }

    if (
      larguraA !==
      larguraB
    ) {
      return (
        larguraB -
        larguraA
      );
    }

    if (
      comprimentoA !==
      comprimentoB
    ) {
      return (
        comprimentoB -
        comprimentoA
      );
    }

    if (
      espessuraA !==
      espessuraB
    ) {
      return (
        espessuraB -
        espessuraA
      );
    }
  } else {
    /*
     * ==================================================
     * DEMAIS FAMÍLIAS
     * ==================================================
     */
    const setupDiff =
      txt(
        a.material,
        b.material
      ) ||
      txt(
        a.acabamento,
        b.acabamento
      ) ||
      txt(
        a.cor,
        b.cor
      ) ||
      txt(
        a.rebaixo,
        b.rebaixo
      );

    if (
      setupDiff
    ) {
      return setupDiff;
    }

    if (
      larguraA !==
      larguraB
    ) {
      return (
        larguraB -
        larguraA
      );
    }

    if (
      comprimentoA !==
      comprimentoB
    ) {
      return (
        comprimentoB -
        comprimentoA
      );
    }

    if (
      espessuraA !==
      espessuraB
    ) {
      return (
        espessuraB -
        espessuraA
      );
    }
  }

  return (
    txt(
      a.pedido,
      b.pedido
    ) ||
    txt(
      a.of,
      b.of
    ) ||
    txt(
      a.categoria,
      b.categoria
    )
  );
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
    .map(
      (
        q
      ) => {
        const c =
          caps.find(
            (
              x
            ) =>
              x.processo ===
              q.processo
          );

        const rate =
          c &&
          c.pecasHora >
            0
            ? c.pecasHora *
              Math.max(
                0,
                c.eficiencia ||
                  100
              ) /
              100
            : 0;

        return {
          ...q,

          capacidadeConfigurada:
            !!rate,

          pecasHora:
            rate,

          horasFila:
            rate >
            0
              ? q.filaPecas /
                rate
              : null,
        };
      }
    )
    .sort(
      (
        a,
        b
      ) =>
        (
          b.horasFila ??
          -1
        ) -
        (
          a.horasFila ??
          -1
        )
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

  const run =
    Math.max(
      0,
      plannedMinutes -
        stopMinutes
    );

  const availability =
    run /
    plannedMinutes;

  const performance =
    run > 0
      ? Math.min(
          1,
          produced /
            (
              idealRate *
              (
                run /
                60
              )
            )
        )
      : 0;

  const quality =
    produced > 0
      ? Math.min(
          1,
          good /
            produced
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
    queueHours?:
      | number
      | null;
  }
) {
  let score = 0;

  const reasons:
    string[] = [];

  if (
    norm(
      input.priority
    ) ===
    "URGENTE"
  ) {
    score += 3;

    reasons.push(
      "Prioridade urgente"
    );
  } else if (
    norm(
      input.priority
    ) ===
    "ALTA"
  ) {
    score += 1;

    reasons.push(
      "Prioridade alta"
    );
  }

  if (
    input.blocked
  ) {
    score += 4;

    reasons.push(
      "Bloqueio de qualidade/pallet"
    );
  }

  if (
    input.openAndon
  ) {
    score += 3;

    reasons.push(
      "Ocorrência Andon aberta"
    );
  }

  if (
    (
      input.queueHours ??
      0
    ) >= 4
  ) {
    score += 3;

    reasons.push(
      "Fila estimada acima de 4 h"
    );
  } else if (
    (
      input.queueHours ??
      0
    ) >= 2
  ) {
    score += 1;

    reasons.push(
      "Fila estimada acima de 2 h"
    );
  }

  if (
    (
      input.remaining ??
      0
    ) > 0
  ) {
    reasons.push(
      `${
        input.remaining
      } peças restantes`
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
  const m =
    new Map<
      string,
      number
    >();

  for (
    const r of rows
  ) {
    m.set(
      r.motivo,
      (
        m.get(
          r.motivo
        ) ||
        0
      ) +
        Math.max(
          0,
          r.minutos ||
            0
        )
    );
  }

  return [
    ...m,
  ]
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
      (
        a,
        b
      ) =>
        b.minutos -
        a.minutos
    );
}
