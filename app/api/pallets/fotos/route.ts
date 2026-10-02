import {
  NextResponse,
} from "next/server";

import {
  sql,
} from "@/lib/db";

import {
  requireRoles,
} from "@/lib/auth";

function clean(
  v: unknown,
  max = 300
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

    const palletId =
      clean(
        b.palletId,
        80
      );

    const ncId =
      clean(
        b.ncId,
        80
      ) || null;

    const dataUrl =
      String(
        b.dataUrl ||
          ""
      );

    const area =
      clean(
        b.area,
        20
      ).toUpperCase() ||
      "QUALIDADE";

    const tipo =
      clean(
        b.tipo,
        20
      ).toUpperCase() ||
      "GERAL";

    if (!palletId) {
      return NextResponse.json(
        {
          error:
            "Pallet não informado.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(
        dataUrl
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Formato de imagem inválido.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      dataUrl.length >
      3_000_000
    ) {
      return NextResponse.json(
        {
          error:
            "Foto muito grande.",
        },
        {
          status: 413,
        }
      );
    }

    if (
      ![
        "GERAL",
        "ANTES",
        "DEPOIS",
      ].includes(
        tipo
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Tipo de evidência inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const db =
      sql();

    const [p] =
      await db`
        select
          id,
          pallet
        from pcp_pallets
        where id=${palletId}
      `;

    if (!p) {
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

    if (ncId) {
      const [nc] =
        await db`
          select id
          from
            pcp_pallet_nao_conformidades
          where
            id=${ncId}
            and pallet_id=${palletId}
        `;

      if (!nc) {
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
    }

    const [foto] =
      await db`
        insert into
          pcp_pallet_fotos(
            pallet_id,
            nc_id,
            data_url,
            legenda,
            area,
            tipo,
            usuario
          )
        values(
          ${palletId},
          ${ncId},
          ${dataUrl},
          ${clean(
            b.legenda,
            300
          )},
          ${area},
          ${tipo},
          ${s.usuario}
        )
        returning id
      `;

    await db`
      insert into
        pcp_pallet_eventos(
          pallet_id,
          usuario,
          tipo,
          descricao,
          depois
        )
      values(
        ${palletId},
        ${s.usuario},
        'FOTO_ADICIONADA',
        ${
          `${tipo} adicionada ao pallet ${p.pallet}`
        },
        ${
          JSON.stringify({
            fotoId:
              foto.id,
            area,
            tipo,
            ncId,
          })
        }::jsonb
      )
    `;

    await db`
      update
        pcp_pallets
      set
        atualizado_em=now()
      where
        id=${palletId}
    `;

    return NextResponse.json(
      {
        ok: true,
        id:
          foto.id,
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
              "Falha ao salvar foto.",
      },
      {
        status,
      }
    );
  }
}

export async function DELETE(
  req: Request
) {
  try {
    const s =
      await requireRoles([
        "PCP",
        "GERENTE",
        "ENCARREGADO",
      ]);

    const url =
      new URL(
        req.url
      );

    const id =
      clean(
        url.searchParams.get(
          "id"
        ),
        80
      );

    const db =
      sql();

    const [old] =
      await db`
        select *
        from
          pcp_pallet_fotos
        where
          id=${id}
      `;

    if (!old) {
      return NextResponse.json(
        {
          error:
            "Foto não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    await db`
      delete from
        pcp_pallet_fotos
      where
        id=${id}
    `;

    await db`
      insert into
        pcp_pallet_eventos(
          pallet_id,
          usuario,
          tipo,
          descricao,
          antes
        )
      values(
        ${old.pallet_id},
        ${s.usuario},
        'FOTO_REMOVIDA',
        'Foto removida',
        ${
          JSON.stringify({
            id:
              old.id,
            area:
              old.area,
            tipo:
              old.tipo,
            legenda:
              old.legenda,
            ncId:
              old.nc_id,
          })
        }::jsonb
      )
    `;

    return NextResponse.json({
      ok: true,
    });
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
              "Falha ao remover foto.",
      },
      {
        status,
      }
    );
  }
}
