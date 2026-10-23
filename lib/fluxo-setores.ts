// Distribui os pedidos pelos setores da fábrica: em andamento, na fila (próxima etapa da rota) e concluídas.
export type EtapaLinha = { pedido: string; etapa: string; data_inicio: string | null; data_conclusao: string | null; dias?: number | null; cliente?: string | null; previsao_saida?: string | null };
export type SetorFluxo = {
  andamento: { pedido: string; cliente: string; inicio: string | null; dias: number; previsaoSaida: unknown }[];
  fila: { pedido: string; cliente: string; desde: string | null; previsaoSaida: unknown }[];
  concluidas: number;
};

export function distribuirSetores(rows: EtapaLinha[], fluxo: readonly string[]): Record<string, SetorFluxo> {
  const porSetor: Record<string, SetorFluxo> = {};
  for (const s of fluxo) porSetor[s] = { andamento: [], fila: [], concluidas: 0 };
  const porPedido = new Map<string, EtapaLinha[]>();
  for (const r of rows) {
    const lista = porPedido.get(String(r.pedido)) ?? []; lista.push(r); porPedido.set(String(r.pedido), lista);
    const s = porSetor[String(r.etapa)];
    if (!s) continue;
    if (r.data_conclusao) s.concluidas++;
    else if (r.data_inicio) s.andamento.push({ pedido: r.pedido, cliente: r.cliente || "", inicio: r.data_inicio, dias: Number(r.dias ?? 0), previsaoSaida: r.previsao_saida });
  }
  for (const [ped, lista] of porPedido) {
    const rota = fluxo.map((et) => lista.find((r) => r.etapa === et)).filter((r): r is EtapaLinha => !!r);
    let ultimaConcl: string | null = null;
    for (const r of rota) {
      if (r.data_conclusao) { ultimaConcl = r.data_conclusao; continue; }
      // primeira etapa não concluída: se já começou está em andamento; se não, e a anterior fechou, está na fila
      if (!r.data_inicio && ultimaConcl) porSetor[r.etapa].fila.push({ pedido: ped, cliente: r.cliente || "", desde: ultimaConcl, previsaoSaida: r.previsao_saida });
      break;
    }
  }
  for (const s of fluxo) { porSetor[s].andamento.sort((a, b) => b.dias - a.dias); porSetor[s].fila.sort((a, b) => String(a.desde).localeCompare(String(b.desde))); }
  return porSetor;
}
