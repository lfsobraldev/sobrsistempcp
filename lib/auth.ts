import crypto from "crypto";
import { identitySql } from "./db";
import { cookies } from "next/headers";
import type { Perfil, Sessao } from "@/types/pcp";

const validRoles = new Set([
  "PCP",
  "GERENTE",
  "ENCARREGADO",
  "LIDER",
  "APONTADOR",
  "QUALIDADE",
  "COMERCIAL",
  "LOGISTICA",
  "LIDER_ENTREGAS",
  "SAC",
  "SUPERVISOR",
  "DIRETOR",
  "ADMINISTRADOR",
]);

/** Cargos acima herdam todos os direitos do perfil-base; os extras (alçada, aprovação) usam `cargo`. */
export const PERFIL_BASE: Partial<Record<string, Perfil>> = { SUPERVISOR: "ENCARREGADO", DIRETOR: "GERENTE", ADMINISTRADOR: "GERENTE" };

/** Duração da sessão em horas (SESSAO_HORAS, 1 a 24; padrão 12). */
export function sessaoHoras() {
  const n = Number(process.env.SESSAO_HORAS);
  return Number.isFinite(n) && n >= 1 && n <= 24 ? Math.floor(n) : 12;
}

export const users = () =>
  [
    {
      user: process.env.PCP_USER,
      pass: process.env.PCP_PASSWORD,
      role: "PCP" as Perfil,
    },
    {
      user: process.env.GERENTE_USER,
      pass: process.env.GERENTE_PASSWORD,
      role: "GERENTE" as Perfil,
    },
    {
      user: process.env.ENCARREGADO_USER,
      pass: process.env.ENCARREGADO_PASSWORD,
      role: "ENCARREGADO" as Perfil,
    },
    {
      user: process.env.LIDER_USER,
      pass: process.env.LIDER_PASSWORD,
      role: "LIDER" as Perfil,
    },
    {
      user: process.env.APONTADOR_USER,
      pass: process.env.APONTADOR_PASSWORD,
      role: "APONTADOR" as Perfil,
    },
    {
      user: process.env.QUALIDADE_USER,
      pass: process.env.QUALIDADE_PASSWORD,
      role: "QUALIDADE" as Perfil,
    },
    { user: process.env.COMERCIAL_USER, pass: process.env.COMERCIAL_PASSWORD, role: "COMERCIAL" as Perfil },
    { user: process.env.LOGISTICA_USER, pass: process.env.LOGISTICA_PASSWORD, role: "LOGISTICA" as Perfil },
    {
      user: process.env.ADMIN_USER,
      pass: process.env.ADMIN_INITIAL_PASSWORD,
      role: "PCP" as Perfil,
    },
  ].filter((x) => x.user && x.pass);

function secret() {
  const s = process.env.AUTH_SECRET;

  if (!s) {
    throw new Error(
      "AUTH_SECRET não configurada."
    );
  }

  return s;
}

function sign(payload: string) {
  return crypto
    .createHmac(
      "sha256",
      secret()
    )
    .update(payload)
    .digest("hex");
}

export function createToken(
  user: string,
  role: Perfil
) {
  const payload =
    `${user}|${role}|${Date.now()}`;

  return `${Buffer.from(payload).toString(
    "base64url"
  )}.${sign(payload)}`;
}

export function verifyToken(
  token: string | undefined
): Sessao | null {
  if (!token) {
    return null;
  }

  const [
    encoded,
    signature,
  ] = token.split(".");

  if (
    !encoded ||
    !signature
  ) {
    return null;
  }

  let payload = "";

  try {
    payload = Buffer.from(
      encoded,
      "base64url"
    ).toString("utf8");
  } catch {
    return null;
  }

  const expected =
    sign(payload);

  if (
    signature.length !==
    expected.length
  ) {
    return null;
  }

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const [
    usuario,
    perfil,
    ts,
  ] = payload.split("|");

  if (
    !usuario ||
    !validRoles.has(perfil) ||
    !ts
  ) {
    return null;
  }

  const age =
    Date.now() -
    Number(ts);

  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age >
      sessaoHoras() *
        60 *
        60 *
        1000
  ) {
    return null;
  }

  return {
    usuario,
    perfil:
      perfil as Perfil,
    processos: [],
    emitidoEm:Number(ts),
  };
}

export async function session():
  Promise<Sessao | null> {
  const c =
    await cookies();

  const s =
    verifyToken(
      c.get(
        "pcp_session"
      )?.value
    );

  if (!s) {
    return null;
  }

  // Contas por ambiente são validadas contra a configuração atual. Contas de banco
  // são revogadas imediatamente ao desativar, trocar perfil ou trocar senha.
  const envAccount=users().find(u=>u.user===s.usuario);
  if(envAccount){if(envAccount.role!==s.perfil)return null;}
  else {
    try{
      const db=identitySql();
      const [u]=await db`select ativo,perfil,atualizado_em from pcp_usuarios where usuario=${s.usuario}`;
      if(!u?.ativo||u.perfil!==s.perfil||!s.emitidoEm||new Date(u.atualizado_em).getTime()>s.emitidoEm)return null;
    }catch{return null;}
  }

  const processEnv =
    s.perfil ===
    "LIDER"
      ? process.env
          .LIDER_PROCESSOS
      : s.perfil ===
        "APONTADOR"
      ? process.env
          .APONTADOR_PROCESSOS
      : "";

  const recebidos =
    (
      processEnv ||
      ""
    )
      .split(",")
      .map((x) =>
        x
          .trim()
          .toUpperCase()
      )
      .filter(Boolean);

  const processos =
    new Set<string>();

  for (
    const processo
    of recebidos
  ) {
    /*
     * COMPATIBILIDADE
     * COM CONFIGURAÇÃO ANTIGA
     */
    if (
      processo ===
      "USINAGEM-1"
    ) {
      processos.add(
        "USINAGEM-PORTAS"
      );

      processos.add(
        "USINAGEM-TRAVESSAS"
      );

      continue;
    }

    if (
      processo ===
      "USINAGEM-2"
    ) {
      processos.add(
        "USINAGEM-CONTRATESTA"
      );

      processos.add(
        "USINAGEM-DOBRADICAS"
      );

      processos.add(
        "USINAGEM-TUPIA"
      );

      continue;
    }

    if (
      processo ===
      "EMBALAGEM"
    ) {
      processos.add(
        "EMBALAGEM-PORTAS"
      );

      processos.add(
        "EMBALAGEM-1"
      );

      processos.add(
        "EMBALAGEM-2"
      );

      processos.add(
        "EMBALAGEM-3"
      );

      processos.add(
        "EMBALAGEM-4"
      );

      processos.add(
        "EMBALAGEM-5"
      );

      processos.add(
        "EMBALAGEM-6"
      );

      processos.add(
        "EMBALAGEM-7"
      );

      processos.add(
        "EMBALAGEM-REVENDA"
      );

      processos.add(
        "EMBALAGEM-ENGENHARIA"
      );

      continue;
    }

    processos.add(
      processo
    );
  }

  s.processos = [
    ...processos,
  ];

  const base = PERFIL_BASE[s.perfil];
  if (base) {
    s.cargo = s.perfil;
    s.perfil = base;
  } else {
    s.cargo = s.perfil;
  }

  return s;
}

export async function requireRoles(
  roles: Perfil[]
) {
  const s =
    await session();

  if (
    !s ||
    !roles.includes(
      s.perfil
    )
  ) {
    throw new Error(
      "SEM_PERMISSAO"
    );
  }

  return s;
}
