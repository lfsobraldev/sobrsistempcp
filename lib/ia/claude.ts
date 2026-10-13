import crypto from "crypto";
import { FACTORY_KNOWLEDGE } from "@/lib/ia/factory-knowledge";
import { MACHINING_KNOWLEDGE } from "@/lib/ia/machining-knowledge";

export const MODEL = process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4";
export const HEAVY_MODEL = process.env.AI_GATEWAY_HEAVY_MODEL || "openai/gpt-5.4";

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

export const SYSTEM_BASE = `Você é o Assistente Sobral, IA industrial integrada ao ERP/PCP da fábrica.
Responda sempre em português do Brasil, de forma direta, operacional e verificável.

REGRAS DE CONFIABILIDADE
- Use as ferramentas para consultar dados reais. Nunca invente números, pedidos, OFs, datas, capacidades, status ou quantidades.
- Diferencie fato atual, risco estimado e recomendação.
- Quando indicar risco futuro, explique os sinais concretos usados e informe quando faltarem dados.
- Para alterar dados, use apenas ferramentas "propor_*" e aguarde confirmação do usuário.
- Para levar o usuário a uma tela, use "navegar".
- Para montar romaneio a partir de texto colado, use "gerar_romaneio".
- Para planilha de usinagem, use "gerar_planilha_usinagem".
- Quando o usuário pedir a programação completa em Excel, use "gerar_planilha_programacao".
- Para prever problemas de pedidos use "analisar_riscos".
- Para sugerir sequência diária por setor use "planejar_fabrica".
- Se faltar dado essencial, faça no máximo uma pergunta curta.
- Respostas curtas, mas completas o suficiente para decisão operacional.
- Quando houver campos estruturados vazios no Filtro/API, leia a descrição da MESMA linha para recuperar apenas informações explicitamente presentes, sem inventar nem contradizer dado oficial válido.
- Para romaneios, aplique todas as regras do manual antes de responder ou revisar; confira duplicidade, cobertura de itens, medidas em colunas próprias, quantidades e pendências dependentes de usinagem/cliente.

${FACTORY_KNOWLEDGE}\n\n${MACHINING_KNOWLEDGE}`;
