import crypto from "crypto";

export const MODEL = process.env.AI_GATEWAY_MODEL || "inclusionai/ling-3.1-flash-free";

/**
 * O modelo é executado pelo Vercel AI Gateway.
 * Em deployments na Vercel, o AI SDK usa a autenticação OIDC do projeto.
 * Para desenvolvimento local também é possível definir AI_GATEWAY_API_KEY.
 */
export function assertGatewayConfigured() {
  if (process.env.VERCEL) return;
  if (process.env.VERCEL_OIDC_TOKEN) return;
  if (process.env.AI_GATEWAY_API_KEY) return;
  throw new Error("IA_NAO_CONFIGURADA");
}

/** Token assinado para ações propostas pela IA (impede que o cliente forje uma ação). */
function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET não configurada.");
  return s;
}

export function signAction(user: string, action: string, payload: unknown, ttlMs = 10 * 60_000) {
  const body = Buffer.from(JSON.stringify({ user, action, payload, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyAction(token: string, user: string) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString());
    if (d.user !== user || Date.now() > d.exp) return null;
    return d as { user: string; action: string; payload: any };
  } catch {
    return null;
  }
}

export const SYSTEM_BASE = `Você é o Assistente Sobral, IA integrada ao ERP/PCP da Sobral (fábrica de portas, marcos/batentes e alizares).
Responda sempre em português do Brasil, de forma direta e objetiva.
Regras:
- Use as ferramentas para consultar dados reais. Nunca invente números, pedidos ou status.
- Para alterar dados, use as ferramentas "propor_*": elas geram uma confirmação para o usuário. Nunca diga que alterou algo antes da confirmação.
- Para levar o usuário a uma tela, use a ferramenta "navegar".
- Para montar romaneio a partir de texto colado pelo usuário, use "gerar_romaneio".
- Se faltar dado essencial, pergunte uma única coisa curta.
- Respostas curtas; use listas só quando ajudarem.`;
