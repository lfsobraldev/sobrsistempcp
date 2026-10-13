import type {
  Produto,
} from "@/types/pcp";

import { ordenarProcessos } from "@/lib/processos";

import {
  compareChave,
  compareProduto,
  familiaProduto,
  produtoEntraPCP,
} from "@/lib/sort";

export const LABELS:
  Record<
    string,
    string
  > = {
  PREPARACAO:
    "Preparação",

  "USINAGEM-PORTAS":
    "Usinagem de Portas",

  "USINAGEM-TRAVESSAS":
    "Usinagem de Travessas",

  "USINAGEM-CONTRATESTA":
    "Usinagem Contratesta",

  "USINAGEM-DOBRADICAS":
    "Usinagem Dobradiças",

  "USINAGEM-TUPIA":
    "Tupia / Canal da Borracha",

  LIXAR:
    "Lixadeira",

  RECOBRIDORA:
    "Recobridora 1",

  "RECOBRIDORA-2":
    "Recobridora 2",

  LUSTRACAO:
    "Lustração",

  TERCEIROS:
    "Terceiros",

  "EMBALAGEM-PORTAS":
    "Embalagem de Portas",

  "EMBALAGEM-1":
    "Embalagem 1 • Perna de batente",

  "EMBALAGEM-2":
    "Embalagem 2 • Travessa de batente",

  "EMBALAGEM-3":
    "Embalagem 3 • Perna de alizar",

  "EMBALAGEM-4":
    "Embalagem 4 • Travessa de alizar",

  "EMBALAGEM-5":
    "Embalagem 5 • Kit de correr",

  "EMBALAGEM-6":
    "Embalagem 6 • Baguete",

  "EMBALAGEM-7":
    "Embalagem 7 • Suporte de trilho",

  "EMBALAGEM-REVENDA":
    "Embalagem • Revenda",

  "EMBALAGEM-ENGENHARIA":
    "Embalagem • Engenharia",

  EXPEDICAO:
    "Expedição",
};
export function atual(
  produto: Produto
) {
  return (
    produto.operacoes.find(
      (operacao) =>
        operacao.status !==
        "CONCLUIDA"
    ) ||
    null
  );
}

export function resumoMaquinas(
  produtos: Produto[]
) {
  const map =
    new Map<
      string,
      any
    >();

  for (
    const produto
    of produtos
  ) {
    if (
      !produtoEntraPCP(
        produto
      )
    ) {
      continue;
    }

    for (
      const operacao
      of produto.operacoes
    ) {
      const atualMap =
        map.get(
          operacao.processo
        ) || {
          processo:
            operacao.processo,

          operacoes: 0,

          concluidas: 0,

          emAndamento: 0,

          liberadas: 0,

          filaAtual: 0,

          pecasPlanejadas: 0,

          pecasEquivalentes: 0,

          produzidas: 0,

          refugo: 0,
        };

      atualMap.operacoes++;

      atualMap.pecasPlanejadas +=
        operacao.quantidadePlanejada;

      atualMap.pecasEquivalentes +=
        operacao.quantidadePlanejada *
        (
          operacao.percentual /
          100
        );

      atualMap.produzidas +=
        operacao.quantidadeProduzida;

      atualMap.refugo +=
        operacao.quantidadeRefugo;

      if (
        operacao.status ===
        "CONCLUIDA"
      ) {
        atualMap.concluidas++;
      }

      if (
        operacao.status ===
        "EM_ANDAMENTO"
      ) {
        atualMap.emAndamento++;
      }

      if (
        operacao.status ===
        "LIBERADA"
      ) {
        atualMap.liberadas++;
      }

      if (
        atual(
          produto
        )?.id ===
        operacao.id
      ) {
        atualMap.filaAtual++;
      }

      map.set(
        operacao.processo,
        atualMap
      );
    }
  }

  const rows = [
    ...map.values(),
  ].map(
    (
      row
    ) => ({
      ...row,

      progresso:
        row.pecasPlanejadas
          ? Math.round(
              (
                row.pecasEquivalentes /
                row.pecasPlanejadas
              ) *
                1000
            ) /
            10
          : 0,

      filaPecas:
        Math.max(
          0,
          row.pecasPlanejadas -
            row.pecasEquivalentes
        ),
    })
  );

  const ordem = ordenarProcessos(rows.map((row) => row.processo));
  const rank = new Map(ordem.map((processo, index) => [processo, index]));

  return rows.sort(
    (a, b) =>
      (rank.get(a.processo) ?? 999) -
      (rank.get(b.processo) ?? 999)
  );
}

function consolidate(
  produtos: Produto[],
  processo: string,
  filter: (
    produto: Produto
  ) => boolean
) {
  const map =
    new Map<
      string,
      any
    >();

  for (
    const produto
    of produtos
  ) {
    if (
      !produtoEntraPCP(
        produto
      )
    ) {
      continue;
    }

    if (
      !produto.operacoes.some(
        (
          operacao
        ) =>
          operacao.processo ===
          processo
      )
    ) {
      continue;
    }

    if (
      !filter(
        produto
      )
    ) {
      continue;
    }

    const operacao =
      produto.operacoes.find(
        (
          item
        ) =>
          item.processo ===
          processo
      );

    if (!operacao) {
      continue;
    }

    const planejado =
      operacao.quantidadePlanejada ??
      produto.quantidade;

    const produzido =
      operacao.quantidadeProduzida ??
      0;

    const refugo =
      operacao.quantidadeRefugo ??
      0;

    const familia =
      familiaProduto(
        produto
      );

    const key = [
      familia,
      produto.categoria,
      produto.material,
      produto.medida,
      produto.rebaixo,
      produto.acabamento,
      produto.cor,
    ].join("|");

    const existing =
      map.get(key);

    if (existing) {
      existing.quantidade +=
        planejado;

      existing.produzido +=
        produzido;

      existing.refugo +=
        refugo;

      existing.ofs++;
    } else {
      map.set(
        key,
        {
          key,

          categoria:
            produto.categoria,

          familia,

          descricao:
            produto.descricao,

          produto:
            produto.produto,

          tipo:
            produto.tipo,

          material:
            produto.material,

          medida:
            produto.medida,

          rebaixo:
            produto.rebaixo,

          acabamento:
            produto.acabamento,

          cor:
            produto.cor,

          prioridade:
            produto.prioridade,

          pedido:
            produto.pedido,

          of:
            produto.of,

          quantidade:
            planejado,

          produzido,

          refugo,

          ofs: 1,
        }
      );
    }
  }

  return [
    ...map.values(),
  ]
    .map(
      (
        row
      ) => ({
        ...row,

        saldo:
          Math.max(
            0,
            row.quantidade -
              row.produzido
          ),
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        compareChave(
          a,
          b
        )
    );
}

export const leaderPlanRows = (
  produtos: Produto[],
  processo: string
) =>
  consolidate(
    produtos,
    processo,
    (
      produto
    ) =>
      produto.operacoes.some(
        (
          operacao
        ) =>
          operacao.processo ===
          processo
      )
  );

export const leaderReleasedRows = (
  produtos: Produto[],
  processo: string
) =>
  consolidate(
    produtos,
    processo,
    (
      produto
    ) =>
      atual(
        produto
      )?.processo ===
      processo
  );

export function queueRows(
  produtos: Produto[],
  processo: string
) {
  const statusWeight:
    Record<
      string,
      number
    > = {
    EM_ANDAMENTO: 0,
    LIBERADA: 1,
    DIVERGENCIA: 2,
    PENDENTE: 3,
    BLOQUEADA: 4,
  };

  return produtos
    .filter(
      (
        produto
      ) =>
        produtoEntraPCP(
          produto
        )
    )
    .filter(
      (
        produto
      ) =>
        produto.operacoes.some(
          (
            operacao
          ) =>
            operacao.processo ===
            processo
        )
    )
    .flatMap(
      (
        produto
      ) =>
        produto.operacoes
          .filter(
            (
              operacao
            ) =>
              operacao.processo ===
              processo
          )
          .map(
            (
              operacao
            ) => ({
              p: produto,
              o: operacao,
            })
          )
    )
    .filter(
      (
        row
      ) =>
        row.o.status !==
        "CONCLUIDA"
    )
    .sort(
      (
        a,
        b
      ) => {
        const statusDiff =
          (
            statusWeight[
              a.o.status
            ] ??
            9
          ) -
          (
            statusWeight[
              b.o.status
            ] ??
            9
          );

        if (
          statusDiff !==
          0
        ) {
          return statusDiff;
        }

        if (
          a.o.fixada &&
          !b.o.fixada
        ) {
          return -1;
        }

        if (
          !a.o.fixada &&
          b.o.fixada
        ) {
          return 1;
        }

        if (
          a.o.fixada &&
          b.o.fixada
        ) {
          return (
            a.o.ordemFila -
            b.o.ordemFila
          );
        }

        const productionDiff =
          compareProduto(
            a.p,
            b.p
          );

        if (
          productionDiff !==
          0
        ) {
          return productionDiff;
        }

        return (
          a.o.ordemFila -
          b.o.ordemFila
        );
      }
    );
}
