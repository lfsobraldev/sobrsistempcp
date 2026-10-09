export type SeqItem = {
  prioridade?: string;
  categoria?: string;
  descricao?: string;
  descricaoModelo?: string;
  outrasCaracteristicas?: string;
  produto?: string;
  tipo?: string;
  canal?: string;
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
  norm(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

function textoItem(item: SeqItem) {
  return pontuacao(
    [
      item.categoria,
      item.descricao,
      item.descricaoModelo,
      item.outrasCaracteristicas,
      item.produto,
      item.tipo,
      item.canal,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

const textoDescricao = (item: SeqItem) =>
  pontuacao(item.descricao);

/*
 * Identidade principal da linha do Filtro 51.
 *
 * Descrição Modelo / Outras Características podem descrever o conjunto
 * completo (por exemplo, "PORTA ...") mesmo quando a linha atual é um
 * batente ou alizar. Por isso a classificação primeiro olha os campos
 * próprios da peça e só usa o texto completo como último recurso.
 */
function textoPrimario(item: SeqItem) {
  return pontuacao(
    [
      item.categoria,
      item.descricao,
      item.produto,
      item.tipo,
      item.canal,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * MAIOR -> MENOR.
 */
export const LARGURA_ORDEM:
  | "ASC"
  | "DESC" = "DESC";

const LIMITE_TRAVESSA = 1500;

const MEDIDA =
  /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/i;

export function parseMeasure(
  value: unknown
): [number, number, number] {
  const match =
    String(value ?? "").match(MEDIDA);

  if (!match) {
    return [0, 0, 0];
  }

  const n = (v?: string) =>
    v
      ? Number(v.replace(",", "."))
      : 0;

  return [
    n(match[1]),
    n(match[2]),
    n(match[3]),
  ];
}

export function medidaDoItem(
  item: SeqItem
): [number, number, number] {
  const direta =
    parseMeasure(item.medida);

  if (
    direta[0] > 0 &&
    direta[1] > 0
  ) {
    return direta;
  }

  return parseMeasure(
    item.descricao
  );
}

export function familiaIndustrial(
  item: SeqItem
): FamiliaIndustrial {
  const text =
    textoItem(item);

  const primary =
    textoPrimario(item);

  const desc =
    textoDescricao(item);

  /*
   * BANDEIRA
   */
  if (
    /\bBANDEIRA\b/.test(primary) ||
    /\bBAND\b/.test(primary) ||
    /\bBANDEIRA\b/.test(text)
  ) {
    return "BANDEIRA";
  }

  /*
   * KIT DE CORRER / SUPORTE DE TRILHO
   */
  if (
    /\bKIT DE CORRER\b/.test(primary) ||
    /\bKIT CORRER\b/.test(primary) ||
    /\bSUP(?:ORTE)?(?: DE)? TRILHO\b/.test(primary) ||
    /\bSUP(?: DE)? TRILHO\b/.test(primary) ||
    /\bSUP KIT\b/.test(primary) ||
    /\bPERNA KIT\b/.test(primary) ||
    /\bPE KIT\b/.test(primary) ||
    /\bAL KIT\b/.test(primary) ||
    /\bA KIT\b/.test(primary) ||
    /\bCA KIT\b/.test(primary) ||
    /\bCAB K COR\b/.test(primary) ||
    /\bP K COR\b/.test(primary) ||
    /\bS K COR\b/.test(primary) ||
    (
      /\bKIT\b/.test(primary) &&
      /\bCORRER\b/.test(primary)
    )
  ) {
    return "KIT CORRER";
  }

  /*
   * FERRAGENS
   */
  if (
    /\bFERRAGEM(?:NS)?\b/.test(primary) ||
    /\bFECHADURA(?:S)?\b/.test(primary) ||
    /\bDOBRADIC(?:A|AS)\b/.test(primary) ||
    /\bDOBRADICA(?:S)?\b/.test(primary) ||
    /\bDOBR\.?\s*(?:ACO|AÇO)?\b/.test(primary) ||
    /\bFEC\.?\s*DOBR\.?\b/.test(primary) ||
    /\bFEC\.?\b/.test(primary) ||
    /\bPUXADOR(?:ES)?\b/.test(primary) ||
    /\bROLDANA(?:S)?\b/.test(primary) ||
    /\bTRINCO(?:S)?\b/.test(primary) ||
    /\bPARAFUS(?:O|OS)\b/.test(primary)
  ) {
    return "FERRAGENS";
  }

  /*
   * BAGUETE
   */
  if (
    /\bBAGUETE\b/.test(primary) ||
    /^BAG\b/.test(desc)
  ) {
    return "BAGUETE";
  }

  /*
   * COMPONENTES DEVEM GANHAR DE "PORTA".
   *
   * Uma linha de batente/alizar pode carregar "PORTA" em Descrição Modelo.
   * Antes isso fazia a peça entrar no meio das portas.
   */
  if (
    /\bALIZAR(?:ES)?\b/.test(primary) ||
    /\bPERNA(?:S)?(?: DE)? ALIZAR(?:ES)?\b/.test(primary) ||
    /\bTRAVESSA(?:S)?(?: DE)? ALIZAR(?:ES)?\b/.test(primary) ||
    /\b(PE AL|PE ALI|PER AL|PER ALI|P A|TR AL|TR ALI|TRA ALI|T A)\b/.test(primary) ||
    /^A (STD|ULTRA)\b/.test(desc)
  ) {
    return "ALIZARES";
  }

  if (
    /\b(BATENTE|MARCO)\b/.test(primary) ||
    /\bPERNA(?:S)?(?: DE)? (?:BATENTE|MARCO)\b/.test(primary) ||
    /\bTRAVESSA(?:S)?(?: DE)? (?:BATENTE|MARCO)\b/.test(primary) ||
    /\b(PE BAT|PER BAT|P BAT|TR BAT|TRA BAT|M P|M T|M CJ|M STD|M ULTRA)\b/.test(primary)
  ) {
    return "BATENTES";
  }

  /*
   * Linhas que chegam apenas como PERNA/TRAVESSA + medida.
   * O perfil físico decide a família quando o texto não diz BATENTE/ALIZAR.
   */
  if (
    /\b(PERNA|PERNAS|TRAVESSA|TRAVESSAS|TRAV)\b/.test(primary)
  ) {
    const [, largura, esp] = medidaDoItem(item);

    if (esp > 0 && esp <= 20) {
      return "ALIZARES";
    }

    if (esp >= 25 || (largura > 0 && largura <= 400)) {
      return "BATENTES";
    }
  }

  /*
   * PORTA EXPLÍCITA NA PRÓPRIA LINHA.
   */
  if (
    /\b(PORTA|PORTAS)\b/.test(primary) ||
    /^FO POR\b/.test(desc) ||
    /^FO P\b/.test(desc) ||
    /^FP\b/.test(desc) ||
    /^FPC\b/.test(desc) ||
    /^FOL[ .]/.test(desc) ||
    /^F P P\b/.test(desc)
  ) {
    return "PORTAS";
  }

  /*
   * PEÇA COMEÇANDO DIRETO PELA MEDIDA.
   *
   * Larguras típicas de folha são muito maiores que larguras de
   * batente/alizar. Isso evita contar uma porta numérica como batente.
   */
  if (
    /^\d+X\d+/.test(desc)
  ) {
    const [
      ,
      largura,
      esp,
    ] =
      medidaDoItem(item);

    if (
      largura >= 450
    ) {
      return "PORTAS";
    }

    if (
      esp > 0 &&
      esp <= 20
    ) {
      return "ALIZARES";
    }

    if (
      esp >= 25
    ) {
      return "BATENTES";
    }

    return /\bRTO?\b/.test(desc)
      ? "ALIZARES"
      : "BATENTES";
  }

  /*
   * ÚLTIMO RECURSO:
   * usa o contexto completo somente quando a própria linha não identificou
   * a peça. Assim ainda reconhecemos portas cujo modelo carrega o nome,
   * sem deixar esse contexto sobrescrever batentes/alizares explícitos.
   */
  if (
    /\b(PORTA|PORTAS)\b/.test(text)
  ) {
    return "PORTAS";
  }

  return "OUTROS";
}

export function ehFerragem(
  item: SeqItem
) {
  return (
    familiaIndustrial(item) ===
    "FERRAGENS"
  );
}

export type TipoPeca =
  | "PERNA"
  | "TRAVESSA";

export function tipoPeca(
  item: SeqItem
): TipoPeca {
  const text =
    textoItem(item);

  if (
    /\b(TRAVESSA|TRAV|TR AL|TR ALI|TRA ALI|T A|M T)\b/.test(
      text
    )
  ) {
    return "TRAVESSA";
  }

  if (
    /\b(PERNA|PE AL|PER ALI|P A|M P)\b/.test(
      text
    )
  ) {
    return "PERNA";
  }

  const comprimento =
    medidaDoItem(item)[0];

  return (
    comprimento > 0 &&
    comprimento < LIMITE_TRAVESSA
  )
    ? "TRAVESSA"
    : "PERNA";
}

export function categoriaIndustrial(
  item: SeqItem
) {
  const familia =
    familiaIndustrial(item);

  const text =
    textoItem(item);

  if (
    familia === "PORTAS"
  ) {
    return "PORTA";
  }

  if (
    familia === "BANDEIRA"
  ) {
    return "BANDEIRA";
  }

  if (
    familia === "BAGUETE"
  ) {
    return "BAGUETE";
  }

  if (
    familia === "FERRAGENS"
  ) {
    return "FERRAGEM";
  }

  if (
    familia === "KIT CORRER"
  ) {
    if (
      /\bSUP(?:ORTE)?(?: DE)? TRILHO\b/.test(
        text
      ) ||
      /\bSUP(?: DE)? TRILHO\b/.test(
        text
      )
    ) {
      return "SUPORTE TRILHO";
    }

    return "KIT CORRER";
  }

  if (
    familia === "BATENTES"
  ) {
    return `BATENTE • ${tipoPeca(
      item
    )}`;
  }

  if (
    familia === "ALIZARES"
  ) {
    return `ALIZAR • ${tipoPeca(
      item
    )}`;
  }

  return "OUTROS";
}

/*
 * BATENTE QUE PRECISA
 * PASSAR NA TUPIA /
 * CANAL DA BORRACHA
 */
export function temCanalBorracha(
  item: SeqItem
) {
  const canal =
    norm(item.canal);

  const rebaixo =
    norm(item.rebaixo);

  const text =
    textoItem(item);

  const vazioTecnico = (
    value: string
  ) =>
    !value ||
    [
      "N/A",
      "NA",
      "N.A.",
      "-",
      "—",
      "N/D",
      "ND",
      "NAO",
      "NÃO",
      "SEM",
      "SEM REBAIXO",
      "S REBAIXO",
      "SEM CANAL",
      "S CANAL",
    ].includes(value);

  /*
   * NEGATIVOS EXPLÍCITOS SEMPRE GANHAM.
   */
  if (
    /\bSEM CANAL\b/.test(text) ||
    /\bS CANAL\b/.test(text) ||
    /\bSEM BORRACHA\b/.test(text)
  ) {
    return false;
  }

  /*
   * A TUPIA É A USINAGEM DO CANAL/BORRACHA.
   *
   * No filtro, nem todas as linhas descrevem "CANAL" ou
   * "BORRACHA" literalmente. Muitas chegam apenas com REBAIXO
   * preenchido. Para batentes e travessas, rebaixo válido também
   * significa que a peça precisa passar pela Tupia.
   */
  if (
    !vazioTecnico(rebaixo)
  ) {
    return true;
  }

  if (
    /\bCANAL\b/.test(text) ||
    /\bBORRACHA\b/.test(text) ||
    /\bREBAIXO\b/.test(text) ||
    /\bRB\s*\d+/i.test(text)
  ) {
    return true;
  }

  if (
    !vazioTecnico(canal)
  ) {
    return true;
  }

  return false;
}

/*
 * REGRA CENTRAL DE SETOR.
 *
 * Nenhuma tela deve inventar
 * novamente a classificação.
 *
 * O filtro do Consistem possui
 * USINAGEM-1 / USINAGEM-2 /
 * EMBALAGEM.
 *
 * Aqui transformamos isso nos
 * setores reais da fábrica.
 */
export function processosUsinagemDoItem(
  item: SeqItem
): string[] {
  const familia =
    familiaIndustrial(item);

  if (familia === "PORTAS") {
    return [
      "USINAGEM-PORTAS",
    ];
  }

  if (familia !== "BATENTES") {
    return [];
  }

  if (
    tipoPeca(item) ===
    "TRAVESSA"
  ) {
    const processos = [
      "USINAGEM-TRAVESSAS",
    ];

    /*
     * Travessa de batente com rebaixo/canal/borracha
     * também passa na Tupia.
     */
    if (
      temCanalBorracha(item)
    ) {
      processos.push(
        "USINAGEM-TUPIA"
      );
    }

    return processos;
  }

  const processos = [
    "USINAGEM-CONTRATESTA",
    "USINAGEM-DOBRADICAS",
  ];

  if (
    temCanalBorracha(item)
  ) {
    processos.push(
      "USINAGEM-TUPIA"
    );
  }

  return processos;
}

export function ehComponenteEmbalagem1(
  item: SeqItem
) {
  const familia =
    familiaIndustrial(item);

  if (
    [
      "BATENTES",
      "ALIZARES",
      "BAGUETE",
      "KIT CORRER",
    ].includes(familia)
  ) {
    return true;
  }

  if (
    familia !== "OUTROS"
  ) {
    return false;
  }

  const text =
    textoItem(item);

  /*
   * Componentes que podem aparecer com nomenclaturas
   * diferentes no Consistem e não devem ser perdidos
   * da Embalagem 1.
   */
  return (
    /\bSUP(?:ORTE)?(?: DE)? TRILHO\b/.test(text) ||
    /\bSUP(?:ORTE)? KIT\b/.test(text) ||
    /\bKIT(?: DE)? CORRER\b/.test(text) ||
    /\bCAB(?:ECEIRA)?(?: DO)? KIT\b/.test(text) ||
    /\bPERNA(?: DO)? KIT\b/.test(text) ||
    /\bTRAVESSA(?: DE)? ALIZAR\b/.test(text) ||
    /\bPERNA(?: DE)? ALIZAR\b/.test(text) ||
    /\bTRAVESSA(?: DE)? BATENTE\b/.test(text) ||
    /\bPERNA(?: DE)? BATENTE\b/.test(text) ||
    /\bBAGUETE\b/.test(text)
  );
}

export function processoEmbalagemDoItem(
  item: SeqItem,
  incluirOutroComRota = false
): string | null {
  const familia =
    familiaIndustrial(item);

  const text =
    textoItem(item);

  if (
    familia === "PORTAS" ||
    familia === "BANDEIRA"
  ) {
    return "EMBALAGEM-PORTAS";
  }

  if (
    familia === "BATENTES"
  ) {
    return tipoPeca(item) === "TRAVESSA"
      ? "EMBALAGEM-2"
      : "EMBALAGEM-1";
  }

  if (
    familia === "ALIZARES"
  ) {
    return tipoPeca(item) === "TRAVESSA"
      ? "EMBALAGEM-4"
      : "EMBALAGEM-3";
  }

  /*
   * SUPORTE DE TRILHO precisa ser separado do KIT DE CORRER.
   * Como ambos pertencem à mesma família industrial em alguns filtros,
   * a identificação do suporte vem antes da regra do KIT.
   */
  if (
    /\bSUP(?:ORTE)?(?: DE)? TRILHO\b/.test(text) ||
    /\bSUP(?: DE)? TRILHO\b/.test(text) ||
    /\bSUPORTE TRILHO\b/.test(text)
  ) {
    return "EMBALAGEM-7";
  }

  if (
    familia === "KIT CORRER"
  ) {
    return "EMBALAGEM-5";
  }

  if (
    familia === "BAGUETE"
  ) {
    return "EMBALAGEM-6";
  }

  if (
    incluirOutroComRota &&
    familia === "OUTROS"
  ) {
    if (
      /\bSUP(?:ORTE)?(?: DE)? TRILHO\b/.test(text) ||
      /\bSUP(?: DE)? TRILHO\b/.test(text)
    ) {
      return "EMBALAGEM-7";
    }

    if (
      /\bKIT(?: DE)? CORRER\b/.test(text)
    ) {
      return "EMBALAGEM-5";
    }

    if (
      /\bBAGUETE\b/.test(text)
    ) {
      return "EMBALAGEM-6";
    }

    if (
      /\bALIZAR\b/.test(text)
    ) {
      return tipoPeca(item) === "TRAVESSA"
        ? "EMBALAGEM-4"
        : "EMBALAGEM-3";
    }
  }

  return null;
}

/*
 * Converte uma coluna genérica do Consistem
 * no setor/máquina real do PCP.
 */
export function processosOperacionaisDaFonte(
  item: SeqItem,
  processoFonte: string
): string[] {
  const processo =
    norm(processoFonte);

  if (
    processo === "USINAGEM-1" ||
    processo === "USINAGEM-2"
  ) {
    return processosUsinagemDoItem(item);
  }

  /*
   * RECOBRIDORAS REAIS
   *
   * RECOBRIDORA 1
   * → BATENTES (PERNAS + TRAVESSAS)
   *
   * RECOBRIDORA 2
   * → ALIZARES (PERNAS + TRAVESSAS)
   * → BAGUETES
   * → KIT DE CORRER / SUPORTE DE TRILHO
   *
   * A peça manda na máquina; não mantemos uma peça
   * na recobridora errada só porque a coluna veio preenchida.
   */
  if (
    processo === "RECOBRIDORA" ||
    processo === "RECOBRIDORA-2"
  ) {
    const familia =
      familiaIndustrial(item);

    if (
      familia === "BATENTES"
    ) {
      return [
        "RECOBRIDORA",
      ];
    }

    if (
      familia === "ALIZARES" ||
      familia === "BAGUETE" ||
      familia === "KIT CORRER"
    ) {
      return [
        "RECOBRIDORA-2",
      ];
    }

    return [];
  }

  if (
    processo === "EMBALAGEM"
  ) {
    const embalagem =
      processoEmbalagemDoItem(
        item,
        true
      );

    return embalagem
      ? [embalagem]
      : [];
  }

  return [
    processoFonte,
  ];
}

function prioridadeRank(
  value?: string
) {
  const priority =
    norm(value);

  if (
    priority === "URGENTE"
  ) {
    return 0;
  }

  if (
    priority === "ALTA"
  ) {
    return 1;
  }

  return 2;
}

/*
 * SEQUÊNCIA:
 *
 * PORTAS
 * BATENTES
 * ALIZARES
 * BAGUETES
 * KIT / SUPORTE TRILHO
 * BANDEIRAS
 * OUTROS
 */
const FAMILY_ORDER:
  Record<
    FamiliaIndustrial,
    number
  > = {
  PORTAS: 0,
  BATENTES: 1,
  ALIZARES: 2,
  BAGUETE: 3,
  "KIT CORRER": 4,
  BANDEIRA: 5,
  OUTROS: 6,
  FERRAGENS: 99,
};

function familyRank(
  item: SeqItem
) {
  return (
    FAMILY_ORDER[
      familiaIndustrial(item)
    ] ??
    98
  );
}

function compareText(
  a: unknown,
  b: unknown
) {
  return norm(a).localeCompare(
    norm(b),
    "pt-BR",
    {
      numeric: true,
    }
  );
}

function compareLargura(
  a: number,
  b: number
) {
  const x =
    a > 0
      ? a
      : Infinity;

  const y =
    b > 0
      ? b
      : Infinity;

  if (
    x === y
  ) {
    return 0;
  }

  if (
    x === Infinity
  ) {
    return 1;
  }

  if (
    y === Infinity
  ) {
    return -1;
  }

  return (
    LARGURA_ORDEM ===
    "ASC"
  )
    ? x - y
    : y - x;
}

const compareSetup = (
  a: SeqItem,
  b: SeqItem
) =>
  compareText(
    a.material,
    b.material
  ) ||
  compareText(
    a.acabamento,
    b.acabamento
  ) ||
  compareText(
    a.cor,
    b.cor
  ) ||
  compareText(
    a.rebaixo,
    b.rebaixo
  );

export function compareDentroDaFamilia(
  a: SeqItem,
  b: SeqItem
) {
  const family =
    familiaIndustrial(a);

  const [
    compA,
    largA,
    espA,
  ] =
    medidaDoItem(a);

  const [
    compB,
    largB,
    espB,
  ] =
    medidaDoItem(b);

  /*
   * PRIMEIRO:
   * LARGURA MAIOR -> MENOR
   */
  const larguraDiff =
    compareLargura(
      largA,
      largB
    );

  if (
    larguraDiff !== 0
  ) {
    return larguraDiff;
  }

  /*
   * BATENTES / ALIZARES
   *
   * mesma largura:
   * perna + travessa juntas
   */
  if (
    family === "BATENTES" ||
    family === "ALIZARES"
  ) {
    const setup =
      compareSetup(
        a,
        b
      );

    if (
      setup
    ) {
      return setup;
    }

    const tipoDiff =
      (
        tipoPeca(a) ===
        "TRAVESSA"
          ? 1
          : 0
      ) -
      (
        tipoPeca(b) ===
        "TRAVESSA"
          ? 1
          : 0
      );

    if (
      tipoDiff !== 0
    ) {
      return tipoDiff;
    }

    if (
      compA !== compB
    ) {
      return (
        compB -
        compA
      );
    }

    if (
      espA !== espB
    ) {
      return (
        espB -
        espA
      );
    }
  } else {
    if (
      compA !== compB
    ) {
      return (
        compB -
        compA
      );
    }

    const setup =
      compareSetup(
        a,
        b
      );

    if (
      setup
    ) {
      return setup;
    }

    if (
      espA !== espB
    ) {
      return (
        espB -
        espA
      );
    }

    const descDiff =
      compareText(
        a.descricao,
        b.descricao
      );

    if (
      descDiff
    ) {
      return descDiff;
    }
  }

  return (
    compareText(
      a.pedido,
      b.pedido
    ) ||
    compareText(
      a.of,
      b.of
    ) ||
    compareText(
      a.categoria,
      b.categoria
    )
  );
}

export function compareProduction(
  a: SeqItem,
  b: SeqItem
) {
  /*
   * A sequência industrial é soberana:
   * PORTAS -> BATENTES -> ALIZARES -> BAGUETES
   * -> KIT/SUPORTE -> BANDEIRAS -> OUTROS.
   *
   * Prioridade atua apenas dentro da mesma família.
   */
  const familyDiff =
    familyRank(a) -
    familyRank(b);

  if (
    familyDiff !== 0
  ) {
    return familyDiff;
  }

  const priorityDiff =
    prioridadeRank(
      a.prioridade
    ) -
    prioridadeRank(
      b.prioridade
    );

  if (
    priorityDiff !== 0
  ) {
    return priorityDiff;
  }

  return compareDentroDaFamilia(
    a,
    b
  );
}

export function compareParaPlanilha(
  a: SeqItem,
  b: SeqItem
) {
  const familyDiff =
    familyRank(a) -
    familyRank(b);

  if (
    familyDiff !== 0
  ) {
    return familyDiff;
  }

  const priorityDiff =
    prioridadeRank(
      a.prioridade
    ) -
    prioridadeRank(
      b.prioridade
    );

  if (
    priorityDiff !== 0
  ) {
    return priorityDiff;
  }

  return compareDentroDaFamilia(
    a,
    b
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
            ? (
                c.pecasHora *
                Math.max(
                  0,
                  c.eficiencia ||
                    100
                )
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
  } =
    input;

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
  let score =
    0;

  const reasons:
    string[] = [];

  if (
    norm(
      input.priority
    ) ===
    "URGENTE"
  ) {
    score +=
      3;

    reasons.push(
      "Prioridade urgente"
    );
  } else if (
    norm(
      input.priority
    ) ===
    "ALTA"
  ) {
    score +=
      1;

    reasons.push(
      "Prioridade alta"
    );
  }

  if (
    input.blocked
  ) {
    score +=
      4;

    reasons.push(
      "Bloqueio de qualidade/pallet"
    );
  }

  if (
    input.openAndon
  ) {
    score +=
      3;

    reasons.push(
      "Ocorrência Andon aberta"
    );
  }

  if (
    (
      input.queueHours ??
      0
    ) >=
    4
  ) {
    score +=
      3;

    reasons.push(
      "Fila estimada acima de 4 h"
    );
  } else if (
    (
      input.queueHours ??
      0
    ) >=
    2
  ) {
    score +=
      1;

    reasons.push(
      "Fila estimada acima de 2 h"
    );
  }

  if (
    (
      input.remaining ??
      0
    ) >
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
    new Map<
      string,
      number
    >();

  for (
    const row
    of rows
  ) {
    map.set(
      row.motivo,

      (
        map.get(
          row.motivo
        ) ||
        0
      ) +
        Math.max(
          0,
          row.minutos ||
            0
        )
    );
  }

  return [
    ...map,
  ]
    .map(
      (
        [
          motivo,
          minutos,
        ]
      ) => ({
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
