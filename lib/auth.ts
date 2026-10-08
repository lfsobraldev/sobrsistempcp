import crypto from "crypto";
import { cookies } from "next/headers";
import type { Perfil, Sessao } from "@/types/pcp";

const validRoles = new Set(["PCP","GERENTE","ENCARREGADO","LIDER","APONTADOR"]);

export const users = () => [
  { user: process.env.PCP_USER, pass: process.env.PCP_PASSWORD, role: "PCP" as Perfil },
  { user: process.env.GERENTE_USER, pass: process.env.GERENTE_PASSWORD, role: "GERENTE" as Perfil },
  { user: process.env.ENCARREGADO_USER, pass: process.env.ENCARREGADO_PASSWORD, role: "ENCARREGADO" as Perfil },
  { user: process.env.LIDER_USER, pass: process.env.LIDER_PASSWORD, role: "LIDER" as Perfil },
  { user: process.env.APONTADOR_USER, pass: process.env.APONTADOR_PASSWORD, role: "APONTADOR" as Perfil },
  { user: process.env.ADMIN_USER, pass: process.env.ADMIN_INITIAL_PASSWORD, role: "PCP" as Perfil }
].filter(x => x.user && x.pass);

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET não configurada.");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createToken(user: string, role: Perfil) {
  const payload = `${user}|${role}|${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): Sessao | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let payload = "";
  try { payload = Buffer.from(encoded, "base64url").toString("utf8"); }
  catch { return null; }

  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch { return null; }

  const [usuario, perfil, ts] = payload.split("|");
  if (!usuario || !validRoles.has(perfil) || !ts) return null;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > 12 * 60 * 60 * 1000) return null;

  return { usuario, perfil: perfil as Perfil, processos: [] };
}

export async function session(): Promise<Sessao | null> {
  const c = await cookies();
  const s = verifyToken(c.get("pcp_session")?.value);
  if (!s) return null;

 const processEnv =
  s.perfil ===
  "LIDER"
    ? process.env.LIDER_PROCESSOS
    : s.perfil ===
      "APONTADOR"
    ? process.env.APONTADOR_PROCESSOS
    : "";

const recebidos =
  (
    processEnv ||
    ""
  )
    .split(
      ","
    )
    .map(
      (
        x
      ) =>
        x
          .trim()
          .toUpperCase()
    )
    .filter(
      Boolean
    );

const processos =
  new Set<string>();

for (
  const processo
  of recebidos
) {
  /*
   * COMPATIBILIDADE
   * COM ENV ANTIGA.
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

    continue;
  }

  processos.add(
    processo
  );
}

s.processos =
  [
    ...processos,
  ];

return s;
export async function requireRoles(roles: Perfil[]) {
  const s = await session();
  if (!s || !roles.includes(s.perfil)) throw new Error("SEM_PERMISSAO");
  return s;
}
