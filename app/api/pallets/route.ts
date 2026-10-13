import {
  NextResponse,
} from "next/server";

import {
  sql,
} from "@/lib/db";

import {
  requireRoles,
  session,
} from "@/lib/auth";

const MANAGE_ROLES = [
  "PCP",
  "GERENTE",
  "ENCARREGADO",
] as const;

const VIEW_ROLES = [
  "PCP",
  "GERENTE",
  "ENCARREGADO",
  "LIDER",
  "QUALIDADE",
] as const;

type Area =
  | "QUALIDADE"
  | "MSAC";

function statusGlobal(
  q: string,
  m: string
) {
  if (
    q === "BLOQUEADO" ||
    m === "BLOQUEADO"
  ) {
    return "BLOQUEADO";
  }

  if (
    q === "LIBERADO" &&
    m === "LIBERADO"
  ) {
    return "LIBERADO";
  }

  if (
    q === "LIBERADO" ||
    m === "LIBERADO"
  ) {
    return "EM_LIBERACAO";
  }

  return "AGUARDANDO_INSPECAO";
}

function clean(
  v: unknown,
  max = 240
) {
  return String(
    v ?? ""
  )
    .trim()
    .slice(
      0,
      max
    );
}

function num(
  v: unknown
) {
  const n =
    Number(
      v ?? 0
    );

  return Number.isFinite(
    n
  ) && n >= 0
    ? n
    : 0;
}

function nullableNum(
  v: unknown
) {
  if (
    v === null ||
    v === undefined ||
    String(
      v
    ).trim() === ""
  ) {
    return null;
  }

  const n =
    Number(
      v
    );

  return Number.isFinite(
    n
  )
    ? n
    : null;
}

function nullableDate(
  v: unknown
) {
  const value =
    clean(
      v,
      60
    );

  if (!value) {
    return null;
  }

  const d =
    new Date(
      value
    );

  return Number.isNaN(
    d.getTime()
  )
    ? null
    : d.toISOString();
}

async function audit(
  db: ReturnType<
    typeof sql
  >,
  palletId: string,
  usuario: string,
  tipo: string,
  descricao: string,
  antes: unknown,
  depois: unknown
) {
  await db`
    insert into
      pcp_pallet_eventos(
        pallet_id,
        usuario,
        tipo,
        descricao,
        antes,
        depois
      )
    values(
      ${palletId},
      ${usuario},
      ${tipo},
      ${descricao},
      ${
        JSON.stringify(
          antes
        )
      }::jsonb,
      ${
        JSON.stringify(
          depois
        )
      }::jsonb
    )
  `;
}

export async function GET(
  req: Request
) {
  try {
    const s =
      await session();

    if (
      !s ||
      !VIEW_ROLES.includes(
        s.perfil as any
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Sem permissão.",
        },
        {
          status: 403,
        }
      );
    }

    const url =
      new URL(
        req.url
      );

    const q =
      clean(
        url.searchParams.get(
          "q"
        ),
        120
      );

    const status =
      clean(
        url.searchParams.get(
          "status"
        ),
        40
      );

    const id =
      clean(
        url.searchParams.get(
          "id"
        ),
        80
      );

    const includeFotos =
      url.searchParams.get(
        "includeFotos"
      ) === "1";

    const db =
      sql();

    if (id) {
      const [item] =
        await db`
          select
            p.*,

            coalesce(
              (
                select
                  count(*)::int
                from
                  pcp_pallet_fotos f
                where
                  f.pallet_id=p.id
              ),
              0
            ) as fotos_count,

            coalesce(
              (
                select
                  json_agg(
                    json_build_object(
                      'id',
                      f.id,

                      'dataUrl',
                      case
                        when ${includeFotos}
                        then f.data_url
                        else null
                      end,

                      'url',
                      '/api/pallets/fotos?id=' || f.id,

                      'legenda',
                      f.legenda,

                      'area',
                      f.area,

                      'tipo',
                      f.tipo,

                      'ncId',
                      f.nc_id,

                      'usuario',
                      f.usuario,

                      'criadoEm',
                      f.criado_em
                    )
                    order by
                      f.criado_em desc
                  )
                from
                  pcp_pallet_fotos f
                where
                  f.pallet_id=p.id
              ),
              '[]'::json
            ) as fotos,

            coalesce(
              (
                select
                  json_agg(
                    json_build_object(
                      'id',
                      i.id,

                      'area',
                      i.area,

                      'resultado',
                      i.resultado,

                      'checklist',
                      i.checklist,

                      'observacao',
                      i.observacao,

                      'usuario',
                      i.usuario,

                      'criadoEm',
                      i.criado_em
                    )
                    order by
                      i.criado_em desc
                  )
                from
                  pcp_pallet_inspecoes i
                where
                  i.pallet_id=p.id
              ),
              '[]'::json
            ) as inspecoes,

            coalesce(
              (
                select
                  json_agg(
                    json_build_object(
                      'id',
                      n.id,

                      'codigo',
                      n.codigo,

                      'categoria',
                      n.categoria,

                      'tipoDefeito',
                      n.tipo_defeito,

                      'gravidade',
                      n.gravidade,

                      'quantidadeAfetada',
                      n.quantidade_afetada,

                      'localDefeito',
                      n.local_defeito,

                      'descricao',
                      n.descricao,

                      'contencao',
                      n.contencao,

                      'acaoCorretiva',
                      n.acao_corretiva,

                      'responsavel',
                      n.responsavel,

                      'prazo',
                      n.prazo,

                      'status',
                      n.status,

                      'correcaoExecutada',
                      n.correcao_executada,

                      'corrigidoPor',
                      n.corrigido_por,

                      'corrigidoEm',
                      n.corrigido_em,

                      'reinspecaoResultado',
                      n.reinspecao_resultado,

                      'reinspecaoUsuario',
                      n.reinspecao_usuario,

                      'reinspecaoEm',
                      n.reinspecao_em,

                      'reinspecaoObservacao',
                      n.reinspecao_observacao,

                      'criadoPor',
                      n.criado_por,

                      'criadoEm',
                      n.criado_em
                    )
                    order by
                      n.criado_em desc
                  )
                from
                  pcp_pallet_nao_conformidades n
                where
                  n.pallet_id=p.id
              ),
              '[]'::json
            )
            as "naoConformidades",

            coalesce(
              (
                select
                  json_agg(
                    json_build_object(
                      'id',
                      m.id,

                      'caracteristica',
                      m.caracteristica,

                      'nominal',
                      m.nominal,

                      'toleranciaMin',
                      m.tolerancia_min,

                      'toleranciaMax',
                      m.tolerancia_max,

                      'medido',
                      m.medido,

                      'unidade',
                      m.unidade,

                      'resultado',
                      m.resultado,

                      'observacao',
                      m.observacao,

                      'usuario',
                      m.usuario,

                      'criadoEm',
                      m.criado_em
                    )
                    order by
                      m.criado_em desc
                  )
                from
                  pcp_pallet_medicoes m
                where
                  m.pallet_id=p.id
              ),
              '[]'::json
            ) as medicoes,

            coalesce(
              (
                select
                  json_agg(
                    json_build_object(
                      'id',
                      e.id,

                      'tipo',
                      e.tipo,

                      'descricao',
                      e.descricao,

                      'usuario',
                      e.usuario,

                      'criadoEm',
                      e.criado_em
                    )
                    order by
                      e.criado_em desc
                  )
                from
                  pcp_pallet_eventos e
                where
                  e.pallet_id=p.id
              ),
              '[]'::json
            ) as eventos

          from
            pcp_pallets p

          where
            p.id=${id}
        `;

      if (!item) {
        return NextResponse.json(
          {
            error:
              "Pallet não encontrado.",
          },
          {
            status: 404,
          }
        );
      }

      return NextResponse.json(
        {
          item,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const rows =
      await db`
        select
          p.*,

          coalesce(
            (
              select
                count(*)::int
              from
                pcp_pallet_fotos f
              where
                f.pallet_id=p.id
            ),
            0
          ) as fotos_count

        from
          pcp_pallets p

        where
          (
            ${q}=''
            or
            p.codigo
              ilike
              ${`%${q}%`}
            or
            p.pedido
              ilike
              ${`%${q}%`}
            or
            p.cliente
              ilike
              ${`%${q}%`}
            or
            p.pallet
              ilike
              ${`%${q}%`}
            or
            p.filtro
              ilike
              ${`%${q}%`}
          )

          and
          (
            ${status}=''
            or
            p.status=${status}
          )

        order by

          case
            p.status

            when
              'BLOQUEADO'
            then 0

            when
              'EM_LIBERACAO'
            then 1

            when
              'AGUARDANDO_INSPECAO'
            then 2

            else 3
          end,

          p.atualizado_em desc

        limit 500
      `;

    const resumoRows =
      await db`
        select

          count(*)::int
            total,

          count(*)
            filter(
              where
                status='LIBERADO'
            )::int
            liberados,

          count(*)
            filter(
              where
                status='BLOQUEADO'
            )::int
            bloqueados,

          count(*)
            filter(
              where
                status='EM_LIBERACAO'
            )::int
            em_liberacao,

          count(*)
            filter(
              where
                status=
                'AGUARDANDO_INSPECAO'
            )::int
            aguardando,

          (
            select
              count(*)::int
            from
              pcp_pallet_nao_conformidades n
            where
              n.status
              not in(
                'APROVADA',
                'ENCERRADA'
              )
          )
          as nc_abertas

        from
          pcp_pallets

        where
          criado_em >=
          current_date -
          interval '30 days'
      `;

    return NextResponse.json(
      {
        itens:
          rows,

        resumo:
          resumoRows[0] ||
          {},
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ||
          "Falha ao carregar pallets.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  req: Request
) {
  try {
    const s =
      await requireRoles([
        "PCP",
        "GERENTE",
        "ENCARREGADO",
        "LIDER",
      ]);

    const b =
      await req.json();

    const db =
      sql();

    const pedido =
      clean(
        b.pedido,
        60
      );

    const pallet =
      clean(
        b.pallet,
        60
      );

    if (
      !pedido ||
      !pallet
    ) {
      return NextResponse.json(
        {
          error:
            "Pedido e pallet são obrigatórios.",
        },
        {
          status: 400,
        }
      );
    }

    const codigo =
      `PLT-${
        new Date()
          .toISOString()
          .slice(
            0,
            10
          )
          .replaceAll(
            "-",
            ""
          )
      }-${
        Math.random()
          .toString(
            36
          )
          .slice(
            2,
            7
          )
          .toUpperCase()
      }`;

    const [created] =
      await db`
        insert into
          pcp_pallets(
            codigo,
            pedido,
            cliente,
            filtro,
            pallet,
            tipo_produto,
            quantidade,
            jogos,
            turno,
            destino,
            montador,
            conferente,
            observacao,
            criado_por
          )
        values(
          ${codigo},
          ${pedido},
          ${
            clean(
              b.cliente
            )
          },
          ${
            clean(
              b.filtro,
              60
            )
          },
          ${pallet},
          ${
            clean(
              b.tipoProduto
            )
          },
          ${
            num(
              b.quantidade
            )
          },
          ${
            num(
              b.jogos
            )
          },
          ${
            clean(
              b.turno,
              20
            ) ||
            "A"
          },
          ${
            clean(
              b.destino
            )
          },
          ${
            clean(
              b.montador
            )
          },
          ${
            clean(
              b.conferente
            )
          },
          ${
            clean(
              b.observacao,
              1000
            )
          },
          ${s.usuario}
        )

        returning *
      `;

    await audit(
      db,
      created.id,
      s.usuario,
      "PALLET_CRIADO",
      `Pallet ${pallet} criado`,
      {},
      created
    );

    return NextResponse.json(
      {
        ok: true,
        item:
          created,
      },
      {
        status: 201,
      }
    );
  } catch (e: any) {
    const status =
      e?.message ===
      "SEM_PERMISSAO"
        ? 403
        : 500;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Sem permissão."
            : e?.message ||
              "Falha ao criar pallet.",
      },
      {
        status,
      }
    );
  }
}

export async function PATCH(
  req: Request
) {
  try {
    const s =
      await requireRoles([
        "PCP",
        "GERENTE",
        "ENCARREGADO",
        "LIDER",
        "QUALIDADE",
      ]);

    const b =
      await req.json();

    const id =
      clean(
        b.id,
        80
      );

    const action =
      clean(
        b.action,
        50
      ).toUpperCase();

    /*
     * Perfil QUALIDADE atua somente no fluxo da Qualidade.
     * Não pode criar/editar pallet, liberar MSAC nem reabrir.
     */
    if (
      s.perfil === "QUALIDADE" &&
      ![
        "INSPECIONAR",
        "CRIAR_NC",
        "REINSPECIONAR_NC",
        "MEDICAO",
        "QUALIDADE_LIBERAR",
        "QUALIDADE_BLOQUEAR",
      ].includes(action)
    ) {
      return NextResponse.json(
        { error: "Ação não permitida para o perfil Qualidade." },
        { status: 403 }
      );
    }

    if (
      s.perfil === "QUALIDADE" &&
      action === "INSPECIONAR" &&
      clean(b.area,20).toUpperCase() !== "QUALIDADE"
    ) {
      return NextResponse.json(
        { error: "O perfil Qualidade só pode registrar inspeção da Qualidade." },
        { status: 403 }
      );
    }

    const db =
      sql();

    const [old] =
      await db`
        select *
        from
          pcp_pallets
        where
          id=${id}
      `;

    if (!old) {
      return NextResponse.json(
        {
          error:
            "Pallet não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      action ===
      "INSPECIONAR"
    ) {
      const areaRaw = clean(
        b.area,
        20
      ).toUpperCase();

      const area = areaRaw as Area;

      if (
        !(
          area ===
            "QUALIDADE" ||
          area ===
            "MSAC"
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Área inválida.",
          },
          {
            status: 400,
          }
        );
      }

      const checklist =
        b.checklist &&
        typeof
          b.checklist ===
          "object"
          ? b.checklist
          : {};

      const resultado =
        clean(
          b.resultado,
          30
        ).toUpperCase() ||
        "CONFORME";

      await db`
        insert into
          pcp_pallet_inspecoes(
            pallet_id,
            area,
            resultado,
            checklist,
            observacao,
            usuario
          )
        values(
          ${id},
          ${area},
          ${resultado},
          ${
            JSON.stringify(
              checklist
            )
          }::jsonb,
          ${
            clean(
              b.observacao,
              1500
            )
          },
          ${s.usuario}
        )
      `;

      await db`
        update
          pcp_pallets
        set
          atualizado_em=now()
        where
          id=${id}
      `;

      await audit(
        db,
        id,
        s.usuario,
        "INSPECAO_REGISTRADA",
        `Inspeção ${area} registrada`,
        old,
        {
          area,
          resultado,
          checklist,
        }
      );

      return NextResponse.json({
        ok: true,
      });
    }

    if (
      action ===
      "CRIAR_NC"
    ) {
      const descricao =
        clean(
          b.descricao,
          2000
        );

      const tipoDefeito =
        clean(
          b.tipoDefeito,
          180
        );

      if (
        !descricao ||
        !tipoDefeito
      ) {
        return NextResponse.json(
          {
            error:
              "Tipo do defeito e descrição são obrigatórios.",
          },
          {
            status: 400,
          }
        );
      }

      const gravidade =
        clean(
          b.gravidade,
          20
        ).toUpperCase();

      if (
        ![
          "CRITICA",
          "MAIOR",
          "MENOR",
        ].includes(
          gravidade
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Gravidade inválida.",
          },
          {
            status: 400,
          }
        );
      }

      const codigo =
        `NC-${
          new Date()
            .toISOString()
            .slice(
              0,
              10
            )
            .replaceAll(
              "-",
              ""
            )
        }-${
          Math.random()
            .toString(
              36
            )
            .slice(
              2,
              7
            )
            .toUpperCase()
        }`;

      const [nc] =
        await db`
          insert into
            pcp_pallet_nao_conformidades(
              pallet_id,
              codigo,
              categoria,
              tipo_defeito,
              gravidade,
              quantidade_afetada,
              local_defeito,
              descricao,
              contencao,
              acao_corretiva,
              responsavel,
              prazo,
              status,
              criado_por
            )
          values(
            ${id},
            ${codigo},
            ${
              clean(
                b.categoria,
                80
              )
            },
            ${tipoDefeito},
            ${gravidade},
            ${
              num(
                b.quantidadeAfetada
              )
            },
            ${
              clean(
                b.localDefeito,
                300
              )
            },
            ${descricao},
            ${
              clean(
                b.contencao,
                2000
              )
            },
            ${
              clean(
                b.acaoCorretiva,
                2000
              )
            },
            ${
              clean(
                b.responsavel,
                160
              )
            },
            ${
              nullableDate(
                b.prazo
              )
            },
            'ABERTA',
            ${s.usuario}
          )

          returning *
        `;

      const [updated] =
        await db`
          update
            pcp_pallets
          set
            qualidade_status=
              'BLOQUEADO',

            msac_status=
              case
                when
                  msac_status=
                    'LIBERADO'
                then
                  'PENDENTE'
                else
                  msac_status
              end,

            status=
              'BLOQUEADO',

            bloqueio_motivo=
              ${
                `NC ${codigo}: ${tipoDefeito}`
              },

            bloqueado_por=
              ${s.usuario},

            bloqueado_em=
              now(),

            atualizado_em=
              now()

          where
            id=${id}

          returning *
        `;

      await audit(
        db,
        id,
        s.usuario,
        "NAO_CONFORMIDADE_CRIADA",
        `${codigo} • ${tipoDefeito}`,
        old,
        nc
      );

      await audit(
        db,
        id,
        s.usuario,
        "PALLET_BLOQUEADO_NC",
        `Pallet bloqueado pela ${codigo}`,
        old,
        updated
      );

      return NextResponse.json({
        ok: true,
        item:
          nc,
      });
    }

    if (
      action ===
      "REGISTRAR_CORRECAO"
    ) {
      const ncId =
        clean(
          b.ncId,
          80
        );

      const correcao =
        clean(
          b.correcaoExecutada,
          2500
        );

      if (!correcao) {
        return NextResponse.json(
          {
            error:
              "Descreva a correção executada.",
          },
          {
            status: 400,
          }
        );
      }

      const [ncOld] =
        await db`
          select *
          from
            pcp_pallet_nao_conformidades
          where
            id=${ncId}
            and
            pallet_id=${id}
        `;

      if (!ncOld) {
        return NextResponse.json(
          {
            error:
              "Não conformidade não encontrada.",
          },
          {
            status: 404,
          }
        );
      }

      const [nc] =
        await db`
          update
            pcp_pallet_nao_conformidades
          set
            correcao_executada=
              ${correcao},

            corrigido_por=
              ${s.usuario},

            corrigido_em=
              now(),

            status=
              'AGUARDANDO_REINSPECAO',

            atualizado_em=
              now()

          where
            id=${ncId}

          returning *
        `;

      await db`
        update
          pcp_pallets
        set
          atualizado_em=now()
        where
          id=${id}
      `;

      await audit(
        db,
        id,
        s.usuario,
        "CORRECAO_REGISTRADA",
        `${nc.codigo} enviada para reinspeção`,
        ncOld,
        nc
      );

      return NextResponse.json({
        ok: true,
        item:
          nc,
      });
    }

    if (
      action ===
      "REINSPECIONAR_NC"
    ) {
      if (
        !MANAGE_ROLES.includes(
          s.perfil as any
        ) &&
        s.perfil !== "QUALIDADE"
      ) {
        return NextResponse.json(
          {
            error:
              "Somente PCP, Gerente, Encarregado ou Qualidade pode concluir a reinspeção.",
          },
          {
            status: 403,
          }
        );
      }

      const ncId =
        clean(
          b.ncId,
          80
        );

      const resultado =
        clean(
          b.resultado,
          20
        ).toUpperCase();

      if (
        ![
          "APROVADO",
          "REPROVADO",
        ].includes(
          resultado
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Resultado de reinspeção inválido.",
          },
          {
            status: 400,
          }
        );
      }

      const [ncOld] =
        await db`
          select *
          from
            pcp_pallet_nao_conformidades
          where
            id=${ncId}
            and
            pallet_id=${id}
        `;

      if (!ncOld) {
        return NextResponse.json(
          {
            error:
              "Não conformidade não encontrada.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        ncOld.status !==
        "AGUARDANDO_REINSPECAO"
      ) {
        return NextResponse.json(
          {
            error:
              "A NC precisa estar aguardando reinspeção.",
          },
          {
            status: 409,
          }
        );
      }

      const novoStatus =
        resultado ===
        "APROVADO"
          ? "APROVADA"
          : "REPROVADA";

      const [nc] =
        await db`
          update
            pcp_pallet_nao_conformidades
          set
            status=
              ${novoStatus},

            reinspecao_resultado=
              ${resultado},

            reinspecao_usuario=
              ${s.usuario},

            reinspecao_em=
              now(),

            reinspecao_observacao=
              ${
                clean(
                  b.observacao,
                  1800
                )
              },

            atualizado_em=
              now()

          where
            id=${ncId}

          returning *
        `;

      const [pend] =
        await db`
          select
            count(*)::int
            total

          from
            pcp_pallet_nao_conformidades

          where
            pallet_id=${id}

            and
            status
            not in(
              'APROVADA',
              'ENCERRADA'
            )
        `;

      if (
        Number(
          pend?.total ||
            0
        ) === 0
      ) {
        await db`
          update
            pcp_pallets
          set
            qualidade_status=
              'PENDENTE',

            status=
              'AGUARDANDO_INSPECAO',

            bloqueio_motivo=
              '',

            bloqueado_por=
              '',

            bloqueado_em=
              null,

            atualizado_em=
              now()

          where
            id=${id}
        `;
      } else {
        await db`
          update
            pcp_pallets
          set
            atualizado_em=now()
          where
            id=${id}
        `;
      }

      await audit(
        db,
        id,
        s.usuario,
        "REINSPECAO_NC",
        `${nc.codigo} • ${resultado}`,
        ncOld,
        nc
      );

      return NextResponse.json({
        ok: true,
        item:
          nc,
      });
    }

    if (
      action ===
      "MEDICAO"
    ) {
      const caracteristica =
        clean(
          b.caracteristica,
          180
        );

      const medido =
        nullableNum(
          b.medido
        );

      if (
        !caracteristica ||
        medido === null
      ) {
        return NextResponse.json(
          {
            error:
              "Característica e valor medido são obrigatórios.",
          },
          {
            status: 400,
          }
        );
      }

      const nominal =
        nullableNum(
          b.nominal
        );

      const min =
        nullableNum(
          b.toleranciaMin
        );

      const max =
        nullableNum(
          b.toleranciaMax
        );

      let resultado =
        "REGISTRADO";

      if (
        min !== null ||
        max !== null
      ) {
        const abaixo =
          min !== null &&
          medido < min;

        const acima =
          max !== null &&
          medido > max;

        resultado =
          abaixo ||
          acima
            ? "NAO_CONFORME"
            : "CONFORME";
      }

      const [m] =
        await db`
          insert into
            pcp_pallet_medicoes(
              pallet_id,
              caracteristica,
              nominal,
              tolerancia_min,
              tolerancia_max,
              medido,
              unidade,
              resultado,
              observacao,
              usuario
            )
          values(
            ${id},
            ${caracteristica},
            ${nominal},
            ${min},
            ${max},
            ${medido},
            ${
              clean(
                b.unidade,
                30
              ) ||
              "mm"
            },
            ${resultado},
            ${
              clean(
                b.observacao,
                1200
              )
            },
            ${s.usuario}
          )

          returning *
        `;

      await db`
        update
          pcp_pallets
        set
          atualizado_em=now()
        where
          id=${id}
      `;

      await audit(
        db,
        id,
        s.usuario,
        "MEDICAO_REGISTRADA",
        `${
          caracteristica
        }: ${
          medido
        } ${
          clean(
            b.unidade,
            30
          ) ||
          "mm"
        } • ${
          resultado
        }`,
        {},
        m
      );

      return NextResponse.json({
        ok: true,
        item:
          m,
      });
    }

    if (
      [
        "QUALIDADE_LIBERAR",
        "QUALIDADE_BLOQUEAR",
        "MSAC_LIBERAR",
        "MSAC_BLOQUEAR",
        "REABRIR",
      ].includes(
        action
      )
    ) {
      const qualidadePodeDecidir =
        s.perfil === "QUALIDADE" &&
        action.startsWith("QUALIDADE_");

      if (
        !MANAGE_ROLES.includes(
          s.perfil as any
        ) &&
        !qualidadePodeDecidir
      ) {
        return NextResponse.json(
          {
            error:
              "Sem permissão para esta decisão.",
          },
          {
            status: 403,
          }
        );
      }

      if (
        action ===
        "QUALIDADE_LIBERAR"
      ) {
        const [nc] =
          await db`
            select
              count(*)::int
              total

            from
              pcp_pallet_nao_conformidades

            where
              pallet_id=${id}

              and
              status
              not in(
                'APROVADA',
                'ENCERRADA'
              )
          `;

        if (
          Number(
            nc?.total ||
              0
          ) > 0
        ) {
          return NextResponse.json(
            {
              error:
                "Existem não conformidades abertas. Conclua a correção e reinspeção antes de liberar.",
            },
            {
              status: 409,
            }
          );
        }
      }

      if (
        action.startsWith(
          "MSAC_"
        ) &&
        old.qualidade_status !==
          "LIBERADO" &&
        action !==
          "MSAC_BLOQUEAR"
      ) {
        return NextResponse.json(
          {
            error:
              "A Qualidade precisa liberar o pallet antes da liberação MSAC.",
          },
          {
            status: 409,
          }
        );
      }

      let q =
        old.qualidade_status;

      let m =
        old.msac_status;

      let motivo =
        clean(
          b.motivo,
          800
        );

      const obs =
        clean(
          b.observacao,
          1000
        );

      if (
        action ===
        "QUALIDADE_LIBERAR"
      ) {
        q =
          "LIBERADO";
      }

      if (
        action ===
        "QUALIDADE_BLOQUEAR"
      ) {
        q =
          "BLOQUEADO";
      }

      if (
        action ===
        "MSAC_LIBERAR"
      ) {
        m =
          "LIBERADO";
      }

      if (
        action ===
        "MSAC_BLOQUEAR"
      ) {
        m =
          "BLOQUEADO";
      }

      if (
        action ===
        "REABRIR"
      ) {
        q =
          "PENDENTE";

        m =
          "PENDENTE";

        motivo =
          "";
      }

      if (
        action.endsWith(
          "BLOQUEAR"
        ) &&
        !motivo
      ) {
        return NextResponse.json(
          {
            error:
              "Informe o motivo do bloqueio.",
          },
          {
            status: 400,
          }
        );
      }

      const global =
        statusGlobal(
          q,
          m
        );

      const [updated] =
        await db`
          update
            pcp_pallets

          set
            qualidade_status=
              ${q},

            msac_status=
              ${m},

            status=
              ${global},

            qualidade_usuario=
              case
                when
                  ${action}
                  like
                  'QUALIDADE_%'
                then
                  ${s.usuario}
                else
                  qualidade_usuario
              end,

            qualidade_em=
              case
                when
                  ${action}
                  like
                  'QUALIDADE_%'
                then
                  now()
                else
                  qualidade_em
              end,

            qualidade_observacao=
              case
                when
                  ${action}
                  like
                  'QUALIDADE_%'
                then
                  ${obs}
                else
                  qualidade_observacao
              end,

            msac_usuario=
              case
                when
                  ${action}
                  like
                  'MSAC_%'
                then
                  ${s.usuario}
                else
                  msac_usuario
              end,

            msac_em=
              case
                when
                  ${action}
                  like
                  'MSAC_%'
                then
                  now()
                else
                  msac_em
              end,

            msac_observacao=
              case
                when
                  ${action}
                  like
                  'MSAC_%'
                then
                  ${obs}
                else
                  msac_observacao
              end,

            bloqueio_motivo=
              ${
                global ===
                "BLOQUEADO"
                  ? motivo
                  : ""
              },

            bloqueado_por=
              ${
                global ===
                "BLOQUEADO"
                  ? s.usuario
                  : ""
              },

            bloqueado_em=
              ${
                global ===
                "BLOQUEADO"
                  ? new Date()
                      .toISOString()
                  : null
              },

            atualizado_em=
              now()

          where
            id=${id}

          returning *
        `;

      await audit(
        db,
        id,
        s.usuario,
        action,
        `${
          action.replaceAll(
            "_",
            " "
          )
        } — ${
          old.pallet
        }`,
        old,
        updated
      );

      return NextResponse.json({
        ok: true,
        item:
          updated,
      });
    }

    if (
      action ===
      "ATUALIZAR"
    ) {
      const [updated] =
        await db`
          update
            pcp_pallets

          set
            cliente=
              ${
                clean(
                  b.cliente
                )
              },

            filtro=
              ${
                clean(
                  b.filtro,
                  60
                )
              },

            tipo_produto=
              ${
                clean(
                  b.tipoProduto
                )
              },

            quantidade=
              ${
                num(
                  b.quantidade
                )
              },

            jogos=
              ${
                num(
                  b.jogos
                )
              },

            turno=
              ${
                clean(
                  b.turno,
                  20
                )
              },

            destino=
              ${
                clean(
                  b.destino
                )
              },

            montador=
              ${
                clean(
                  b.montador
                )
              },

            conferente=
              ${
                clean(
                  b.conferente
                )
              },

            observacao=
              ${
                clean(
                  b.observacao,
                  1000
                )
              },

            atualizado_em=
              now()

          where
            id=${id}

          returning *
        `;

      await audit(
        db,
        id,
        s.usuario,
        "PALLET_ATUALIZADO",
        `Pallet ${old.pallet} atualizado`,
        old,
        updated
      );

      return NextResponse.json({
        ok: true,
        item:
          updated,
      });
    }

    return NextResponse.json(
      {
        error:
          "Ação inválida.",
      },
      {
        status: 400,
      }
    );
  } catch (e: any) {
    const status =
      e?.message ===
      "SEM_PERMISSAO"
        ? 403
        : 500;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Sem permissão."
            : e?.message ||
              "Falha ao atualizar pallet.",
      },
      {
        status,
      }
    );
  }
}
