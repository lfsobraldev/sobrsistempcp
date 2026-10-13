import { NextResponse } from "next/server";
import { createToken, users } from "@/lib/auth";
import { sql } from "@/lib/db";
import crypto from "crypto";
import type { Perfil } from "@/types/pcp";

function verifyScryptPassword(
  senha: string,
  hash: string
) {
  try {
    const parts = hash.split("$");

    if (
      parts.length !== 3 ||
      parts[0] !== "scrypt"
    ) {
      return false;
    }

    const salt = parts[1];
    const expectedHex = parts[2];

    const expected = Buffer.from(
      expectedHex,
      "hex"
    );

    const calculated =
      crypto.scryptSync(
        senha,
        salt,
        expected.length
      );

    if (
      calculated.length !==
      expected.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      calculated,
      expected
    );
  } catch {
    return false;
  }
}

export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

    const usuario =
      String(
        body.usuario ?? ""
      ).trim();

    const senha =
      String(
        body.senha ?? ""
      );

    if (
      !usuario ||
      !senha
    ) {
      return NextResponse.json(
        {
          error:
            "Usuário ou senha inválidos.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * 1. PRIMEIRO TENTA
     * USUÁRIOS ANTIGOS
     * DA VERCEL / ENV.
     */
    const envUser =
      users().find(
        (x) =>
          x.user === usuario &&
          x.pass === senha
      );

    if (
      envUser
    ) {
      const response =
        NextResponse.json({
          ok: true,
          perfil:
            envUser.role,
        });

      response.cookies.set(
        "pcp_session",
        createToken(
          envUser.user!,
          envUser.role
        ),
        {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge:
            12 *
            60 *
            60,
        }
      );

      return response;
    }

    /*
     * 2. DEPOIS PROCURA
     * NA TABELA DO NEON.
     */
    const db =
      sql();

    const result =
      await db`
        SELECT
          usuario,
          nome,
          senha_hash,
          perfil,
          ativo
        FROM pcp_usuarios
        WHERE LOWER(usuario) = LOWER(${usuario})
        LIMIT 1
      `;

    const dbUser =
      result[0] as
        | {
            usuario: string;
            nome: string;
            senha_hash: string;
            perfil: string;
            ativo: boolean;
          }
        | undefined;

    if (
      !dbUser ||
      !dbUser.ativo
    ) {
      return NextResponse.json(
        {
          error:
            "Usuário ou senha inválidos.",
        },
        {
          status: 401,
        }
      );
    }

    const senhaValida =
      verifyScryptPassword(
        senha,
        dbUser.senha_hash
      );

    if (
      !senhaValida
    ) {
      return NextResponse.json(
        {
          error:
            "Usuário ou senha inválidos.",
        },
        {
          status: 401,
        }
      );
    }

    const perfil =
      dbUser.perfil as Perfil;

    const response =
      NextResponse.json({
        ok: true,
        perfil,
        nome: dbUser.nome,
      });

    response.cookies.set(
      "pcp_session",
      createToken(
        dbUser.usuario,
        perfil
      ),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge:
          12 *
          60 *
          60,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "ERRO LOGIN:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro ao acessar o sistema.",
        detalhe:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}
