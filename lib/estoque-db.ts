import { aplicar, deltasDoMovimento, type Saldo, type TipoMov } from "./estoque";

/** Mínimo do cliente SQL usado aqui (neon: sql.query(texto, params) → linhas). */
export type Q = { query: (texto: string, params?: unknown[]) => Promise<any[]> };

export type Mov = {
  tipo: TipoMov; produtoId: string; localOrigem?: string | null; localDestino?: string | null; qBase: number; qInformada: number; unidade: string; fator: number;
  sinal?: 1 | -1; baixarReserva?: boolean; documento?: string; pedido?: string; of?: string; motivo?: string; observacao?: string; requestId?: string | null;
  usuario: string; ignorarInventario?: boolean;
};
export type Res = { ok: true; duplicado?: boolean } | { ok: false; http: 400 | 409 | 500; codigo: string; erro: string };

const COLS = "tipo,produto_id,local_origem_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,fator,sinal,baixa_reserva,documento,pedido,of,motivo,observacao,request_id,usuario";
const sel = (from: string) => `select $1::varchar,$2::uuid,$3::uuid,$4::uuid,$5::numeric,$6::numeric,$7::varchar,$8::numeric,$9::smallint,$10::boolean,$11::varchar,$12::varchar,$13::varchar,$14::varchar,$15::varchar,$16::varchar,$17::varchar from ${from}`;
const LEDGER = (from: string) => `m as(insert into est_movimentos(${COLS}) ${sel(from)} returning id) select (select count(*) from m)::int n`;

const SQL_UPSERT = `with s as(insert into est_saldos(produto_id,local_id,fisico) values($2::uuid,$4::uuid,$5::numeric) on conflict(produto_id,local_id) do update set fisico=est_saldos.fisico+excluded.fisico,atualizado_em=now() returning produto_id), ${LEDGER("s")}`;
const SQL_UPDATE = `with s as(update est_saldos set fisico=fisico+$18::numeric,reservado=reservado+$19::numeric,bloqueado=bloqueado+$20::numeric,atualizado_em=now() where produto_id=$2::uuid and local_id=$3::uuid returning produto_id), ${LEDGER("s")}`;
const SQL_TRANSF = `with o as(update est_saldos set fisico=fisico-$5::numeric,atualizado_em=now() where produto_id=$2::uuid and local_id=$3::uuid returning produto_id), d as(insert into est_saldos(produto_id,local_id,fisico) select $2::uuid,$4::uuid,$5::numeric from o on conflict(produto_id,local_id) do update set fisico=est_saldos.fisico+excluded.fisico,atualizado_em=now() returning produto_id), ${LEDGER("d")}`;

export async function lerSaldo(db: Q, produtoId: string, localId: string): Promise<Saldo> {
  const r = await db.query("select fisico::float,reservado::float,bloqueado::float from est_saldos where produto_id=$1::uuid and local_id=$2::uuid", [produtoId, localId]);
  return r[0] ? { fisico: Number(r[0].fisico), reservado: Number(r[0].reservado), bloqueado: Number(r[0].bloqueado) } : { fisico: 0, reservado: 0, bloqueado: 0 };
}
/** Quanto do saldo reservado naquele local pertence ao pedido (pelo histórico: reservas − liberações − saídas com baixa). */
export async function reservadoDoPedido(db: Q, produtoId: string, localId: string, pedido: string): Promise<number> {
  const r = await db.query(`select coalesce(sum(case when tipo='RESERVA' then quantidade_base when tipo='LIBERA_RESERVA' then -quantidade_base when tipo='SAIDA' and baixa_reserva then -quantidade_base else 0 end),0)::float v from est_movimentos where produto_id=$1::uuid and local_origem_id=$2::uuid and pedido=$3`, [produtoId, localId, pedido]);
  return Number(r[0]?.v || 0);
}
export async function inventarioAberto(db: Q, locais: string[]): Promise<number | null> {
  if (!locais.length) return null;
  const r = await db.query(`select numero from est_inventarios where status='EM_CONTAGEM' and (tipo='GERAL' or local_id=any($1::uuid[])) limit 1`, [locais]);
  return r[0] ? Number(r[0].numero) : null;
}

const falha = (http: 400 | 409 | 500, codigo: string, erro: string): Res => ({ ok: false, http, codigo, erro });

export async function executarMovimento(db: Q, m: Mov): Promise<Res> {
  const q = m.qBase;
  const { origem, destino } = deltasDoMovimento(m.tipo, q, { sinal: m.sinal, baixarReserva: m.baixarReserva });
  const rid = m.requestId || null;
  if (rid) { const d = await db.query("select 1 from est_movimentos where request_id=$1 limit 1", [rid]); if (d.length) return { ok: true, duplicado: true }; }

  const locais = [m.localOrigem, m.localDestino].filter(Boolean) as string[];
  if (!m.ignorarInventario) {
    const n = await inventarioAberto(db, locais);
    if (n !== null) return falha(409, "EM_INVENTARIO", `Produto/local em inventário aberto (nº ${n}). Conclua ou cancele o inventário antes de movimentar.`);
  }
  // Mensagem amigável antes de tentar (o banco continua sendo a barreira final via CHECK).
  const localOp = m.localOrigem || m.localDestino;
  if (origem && m.localOrigem) {
    const s = await lerSaldo(db, m.produtoId, m.localOrigem);
    const r = aplicar(s, origem);
    if (!r.ok) return falha(409, r.codigo, r.erro);
    if ((m.tipo === "LIBERA_RESERVA" || (m.tipo === "SAIDA" && m.baixarReserva)) && m.pedido) {
      const rp = await reservadoDoPedido(db, m.produtoId, m.localOrigem, m.pedido);
      if (q > rp + 1e-9) return falha(409, "RESERVA_DO_PEDIDO_INSUFICIENTE", `O pedido ${m.pedido} tem ${rp} reservado neste local.`);
    }
  } else if (destino && localOp) {
    const s = await lerSaldo(db, m.produtoId, m.localDestino as string);
    const r = aplicar(s, destino); if (!r.ok) return falha(409, r.codigo, r.erro);
  }

  const led = [m.tipo, m.produtoId, m.localOrigem ?? null, m.localDestino ?? null, q, m.qInformada, m.unidade, m.fator, m.sinal ?? 1, !!m.baixarReserva, m.documento || "", m.pedido || "", m.of || "", m.motivo || "", m.observacao || "", rid, m.usuario];
  let texto: string, params: unknown[];
  if (m.tipo === "TRANSFERENCIA") { texto = SQL_TRANSF; params = led; }
  else if (origem) { texto = SQL_UPDATE; params = [...led, origem.dF, origem.dR, origem.dB]; }
  else { texto = SQL_UPSERT; params = led; }
  try {
    const r = await db.query(texto, params);
    if (!Number(r[0]?.n)) return falha(409, "SEM_SALDO", "Não há saldo cadastrado para este produto no local informado.");
    return { ok: true };
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (e?.code === "23505" || /ux_est_mov_request/.test(msg)) return { ok: true, duplicado: true };
    if (e?.code === "23514" || /est_saldos_.*check|violates check constraint/.test(msg)) return falha(409, "SALDO_ALTERADO", "O saldo mudou enquanto você lançava e não comporta a operação. Atualize e confira.");
    throw e;
  }
}
