import { sql } from "@/lib/db";
import type { Sessao } from "@/types/pcp";
import { allowedPath, pathsFor } from "@/lib/permissions";
import { signAction } from "@/lib/ia/claude";
import { agruparPorCarga, extrairRomaneio, validarRomaneio } from "@/lib/ia/romaneio";

export type Attachment =
  | { type: "navigate"; path: string; label: string }
  | { type: "confirm"; label: string; token: string }
  | { type: "romaneio"; data: unknown; alertas: unknown; resumo: unknown };

export type ToolCtx = { user: Sessao; attachments: Attachment[] };

const WRITE_ROLES = ["PCP", "GERENTE", "ENCARREGADO"];

export const TOOL_META = {
  resumo_producao: "Resumo da programação ativa: filtro, turno, total de pedidos/OFs/peças e progresso por processo.",
  buscar_pedido: "Detalhes de um pedido na programação ativa: itens/OFs, prioridade e andamento por processo.",
  listar_andon: "Chamados Andon abertos (paradas/problemas na produção).",
  listar_excecoes: "Faltas e retrabalhos de peças (exceções). Status padrão: ABERTA.",
  resumo_qualidade: "Contagem de pallets por status de qualidade/MSAC.",
  historico_romaneios: "Romaneios gerados anteriormente. Filtra por pedido ou cliente.",
  navegar: "Leva o usuário para uma tela do sistema.",
  gerar_romaneio: "Extrai e valida um romaneio a partir de texto de pedido/lista colado pelo usuário. Retorna prévia com alertas.",
  propor_prioridade: "Propõe alterar a prioridade de um pedido (NORMAL, ALTA, URGENTE). O usuário precisa confirmar.",
} as const;

async function programacaoAtiva() {
  const db = sql();
  const [pg] = await db`select id, filtro, data_programacao, turno from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  return { db, pg };
}
const j = (v: unknown) => JSON.stringify(v);

export async function runTool(name: string, input: any, ctx: ToolCtx): Promise<string> {
  try {
    switch (name) {
      case "resumo_producao": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });
        const [tot] = await db`select count(distinct pedido)::int pedidos, count(*)::int ofs, coalesce(sum(quantidade),0)::float pecas from pcp_produtos where programacao_id=${pg.id}`;
        const proc = await db`select o.processo, o.status, count(*)::int n, coalesce(sum(o.quantidade_planejada),0)::float planejado, coalesce(sum(o.quantidade_produzida),0)::float produzido from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where p.programacao_id=${pg.id} group by 1,2 order by 1,2`;
        return j({ programacao: pg, totais: tot, porProcessoStatus: proc });
      }
      case "buscar_pedido": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });
        const pedido = String(input.pedido || "").trim();
        const itens = await db`select p.of, p.item, p.produto, p.descricao, p.quantidade::float qtd, p.prioridade, p.percentual_produto::float pct, (select json_agg(json_build_object('processo',o.processo,'status',o.status,'pct',o.percentual::float) order by o.sequencia) from pcp_operacoes o where o.produto_id=p.id) ops from pcp_produtos p where p.programacao_id=${pg.id} and p.pedido=${pedido} order by p.item limit 60`;
        if (!itens.length) return j({ erro: `Pedido ${pedido} não encontrado na programação ativa.` });
        return j({ pedido, totalItens: itens.length, itens });
      }
      case "listar_andon": {
        const db = sql();
        const r = await db`select processo, motivo, observacao, status, prioridade, usuario_abertura, criado_em from pcp_andon where status<>'RESOLVIDO' order by criado_em desc limit 30`;
        return j(r);
      }
      case "listar_excecoes": {
        const db = sql();
        const status = String(input.status || "ABERTA").toUpperCase();
        const r = await db`select pedido, of, tipo, quantidade::float qtd, motivo, processo_retorno, status, criado_em from pcp_excecoes_peca where status=${status} order by criado_em desc limit 40`;
        return j(r);
      }
      case "resumo_qualidade": {
        const db = sql();
        const r = await db`select coalesce(qualidade_status,'N/D') qualidade, coalesce(msac_status,'N/D') msac, count(*)::int n from pcp_pallets group by 1,2 order by n desc`;
        return j(r);
      }
      case "historico_romaneios": {
        const db = sql();
        const busca = `%${String(input.busca || "").trim()}%`;
        const lim = Math.min(Number(input.limite) || 10, 30);
        const r = await db`select pedido, cliente, transportadora, rota, total_itens, criado_por, criado_em from pcp_romaneios_hist where pedido ilike ${busca} or cliente ilike ${busca} order by criado_em desc limit ${lim}`;
        return j(r);
      }
      case "navegar": {
        const path = String(input.caminho || "");
        if (!allowedPath(ctx.user.perfil, path)) return j({ erro: "Tela inexistente ou sem permissão.", telasPermitidas: pathsFor(ctx.user.perfil) });
        ctx.attachments.push({ type: "navigate", path, label: path });
        return j({ ok: true, mensagem: `Botão de navegação para ${path} exibido ao usuário.` });
      }
      case "gerar_romaneio": {
        if (!["PCP", "GERENTE", "ENCARREGADO", "LIDER"].includes(ctx.user.perfil)) return j({ erro: "Sem permissão para romaneios." });
        const hist = await historicoContexto();
        const data = await extrairRomaneio(String(input.texto || ""), hist);
        const alertas = validarRomaneio(data);
        const resumo = agruparPorCarga(data, Number(input.max_volumes_por_carga) || 0);
        ctx.attachments.push({ type: "romaneio", data, alertas, resumo });
        return j({ itens: data.itens.length, cliente: data.cliente, pedido: data.pedido, alertas, resumo: { ...resumo, cargas: resumo.cargas.length } });
      }
      case "propor_prioridade": {
        if (!WRITE_ROLES.includes(ctx.user.perfil)) return j({ erro: "Seu perfil não pode alterar prioridades." });
        const pedido = String(input.pedido || "").trim();
        const prioridade = String(input.prioridade || "").toUpperCase();
        if (!pedido || !["NORMAL", "ALTA", "URGENTE"].includes(prioridade)) return j({ erro: "Dados inválidos." });
        const token = signAction(ctx.user.usuario, "prioridade", { pedido, prioridade });
        ctx.attachments.push({ type: "confirm", label: `Definir pedido ${pedido} como ${prioridade}`, token });
        return j({ ok: true, mensagem: "Confirmação exibida. Aguardando o usuário confirmar." });
      }
      default:
        return j({ erro: `Ferramenta desconhecida: ${name}` });
    }
  } catch (e: any) {
    return j({ erro: e?.message || "Falha ao executar ferramenta." });
  }
}

/** RAG simples: últimos romaneios do sistema como contexto de padrões da empresa. */
export async function historicoContexto(limit = 12): Promise<string[]> {
  try {
    const db = sql();
    const r = await db`select pedido, cliente, transportadora, rota, total_itens from pcp_romaneios_hist order by criado_em desc limit ${limit}`;
    return r.map((x: any) => `pedido ${x.pedido} | cliente ${x.cliente} | transp. ${x.transportadora} | rota ${x.rota} | ${x.total_itens} itens`);
  } catch { return []; }
}
