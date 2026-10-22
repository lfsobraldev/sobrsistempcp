import { MAX_TENTATIVAS, assinarWebhook, proximaTentativaMin, urlWebhookSegura } from "@/lib/integracoes";

export type DbQuery = { query: (t: string, p?: unknown[]) => Promise<Record<string, any>[]> };
const limpar = (v: string, max = 200) => v.replace(/[\r\n]+/g, " ").slice(0, max);

/** Envia a fila pendente (até 20 por rodada) com assinatura HMAC e recuo exponencial. */
export async function entregarWebhooks(db: DbQuery) {
  const pend = await db.query("select f.id,f.evento,f.payload,f.tentativas,w.url,w.segredo from sys_webhook_fila f join sys_webhooks w on w.id=f.webhook_id where f.status='PENDENTE' and f.proxima_em<=now() and w.ativo order by f.id limit 20");
  let ok = 0, falhas = 0;
  for (const f of pend) {
    const corpo = JSON.stringify({ id: String(f.id), evento: f.evento, dados: f.payload });
    const ts = Math.floor(Date.now() / 1000);
    try {
      if (!urlWebhookSegura(f.url)) throw new Error("URL não permitida");
      const r = await fetch(f.url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json", "X-Sobral-Evento": f.evento, "X-Sobral-Timestamp": String(ts), "X-Sobral-Assinatura": assinarWebhook(corpo, f.segredo, ts) }, body: corpo });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await db.query("update sys_webhook_fila set status='ENVIADO',enviado_em=now(),tentativas=tentativas+1,ultimo_erro='' where id=$1", [f.id]);
      ok++;
    } catch (e) {
      const t = Number(f.tentativas) + 1;
      await db.query("update sys_webhook_fila set tentativas=$2,status=$3,proxima_em=now()+($4||' minutes')::interval,ultimo_erro=$5 where id=$1", [f.id, t, t >= MAX_TENTATIVAS ? "FALHA" : "PENDENTE", String(proximaTentativaMin(t)), limpar(e instanceof Error ? e.message : "Falha")]);
      falhas++;
    }
  }
  return { processados: pend.length, ok, falhas };
}
