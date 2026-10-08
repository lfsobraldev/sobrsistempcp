import { createHash, createHmac } from "node:crypto";

const CHANNEL = "sobral-pcp-live";

export type RealtimeEvent =
  | "PRODUCAO_ATUALIZADA"
  | "PRIORIDADE_ATUALIZADA"
  | "PROGRAMACAO_ATUALIZADA"
  | "PALLET_ATUALIZADO"
  | "QUALIDADE_ATUALIZADA";

export async function publishRealtimeEvent(
  event: RealtimeEvent,
  meta: Record<string, string | number | boolean | null> = {}
) {
  const appId = process.env.PUSHER_APP_ID?.trim();
  const key = process.env.PUSHER_KEY?.trim();
  const secret = process.env.PUSHER_SECRET?.trim();
  const cluster = process.env.PUSHER_CLUSTER?.trim();

  // Realtime nunca pode derrubar uma ação operacional.
  if (!appId || !key || !secret || !cluster) return false;

  try {
    const path = `/apps/${appId}/events`;
    const body = JSON.stringify({
      name: "pcp:atualizacao",
      channel: CHANNEL,
      data: JSON.stringify({
        event,
        at: new Date().toISOString(),
        ...meta,
      }),
    });

    const authTimestamp = Math.floor(Date.now() / 1000).toString();
    const bodyMd5 = createHash("md5").update(body).digest("hex");
    const query = [
      `auth_key=${key}`,
      `auth_timestamp=${authTimestamp}`,
      "auth_version=1.0",
      `body_md5=${bodyMd5}`,
    ].join("&");

    const stringToSign = `POST\n${path}\n${query}`;
    const signature = createHmac("sha256", secret)
      .update(stringToSign)
      .digest("hex");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);

    try {
      const response = await fetch(
        `https://api-${cluster}.pusher.com${path}?${query}&auth_signature=${signature}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
          cache: "no-store",
        }
      );
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export const REALTIME_CHANNEL = CHANNEL;
