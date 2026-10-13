import { sql } from "@/lib/db";
import type { Sessao } from "@/types/pcp";
import { allowedPath, pathsFor } from "@/lib/permissions";
import { signAction } from "@/lib/ia/claude";
import { agruparPorCarga, extrairRomaneio, validarRomaneio } from "@/lib/ia/romaneio";
import { analisarRiscos, capacidadeProcessos, localHoje, planejarFabrica } from "@/lib/ia/intelligence";
import { processosUsinagemDoItem, familiaIndustrial, tipoPeca, temCanalBorracha } from "@/lib/domain/industrial";

export type Attachment =
  | { type: "navigate"; path: string; label: string }
  | { type: "confirm"; label: string; token: string }
  | { type: "romaneio"; data: unknown; alertas: unknown; resumo: unknown }
  | { type: "planilha_usinagem"; setores: string[]; arquivo: string; label: string; pedido?: string }
  | { type: "planilha_programacao"; arquivo: string; label: string; setores?: string[] };

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
  gerar_planilha_usinagem: "Gera uma planilha Excel de usinagem usando os dados reais da programação ativa. Pode gerar todas as usinagens ou apenas um processo específico, e filtrar por pedido.",
  gerar_planilha_programacao: "Gera a planilha Excel completa da programação da fábrica usando a programação ativa e as regras reais por setor.",
  analisar_riscos: "Calcula risco operacional de pedidos com base em prazo, progresso, bloqueios, faltas/retrabalhos, Andons, qualidade e gargalos de capacidade.",
  planejar_fabrica: "Sugere a sequência de produção por processo usando prioridade, prazo, saldo, fila fixada e capacidade cadastrada. Não altera dados.",
  consultar_capacidade: "Compara saldo de produção por processo com a capacidade cadastrada do turno e identifica gargalos.",
  diagnosticar_usinagem: "Audita a rota de usinagem da programação ativa e compara operações esperadas pelas regras industriais com as operações realmente cadastradas. Detecta operação faltante, indevida e item que exige revisão.",
  propor_prioridade: "Propõe alterar a prioridade de um pedido (NORMAL, ALTA, URGENTE). O usuário precisa confirmar.",
} as const;

async function programacaoAtiva() {
  const db = sql();
  const [pg] = await db`select id, filtro, data_programacao, turno from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  return { db, pg };
}
const j = <T,>(v: T): T => v;

export async function runTool(name: string, input: any, ctx: ToolCtx): Promise<unknown> {
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
      case "analisar_riscos": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });
        const pedido = String(input.pedido || "").trim();
        const riscos = await analisarRiscos(db, pg, pedido);
        return j({
          dataAnalise: localHoje(),
          programacao: pg,
          metodologia: "Indicador heurístico baseado em fatos do PCP; não é previsão garantida.",
          riscos: pedido ? riscos : riscos.slice(0, 30),
        });
      }

      case "planejar_fabrica": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });
        return j(await planejarFabrica(db, pg));
      }

      case "consultar_capacidade": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });
        return j({ programacao: pg, processos: await capacidadeProcessos(db, pg) });
      }

      case "diagnosticar_usinagem": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });

        const pedido = String(input.pedido || "").trim();
        const produtos = pedido
          ? await db`
              select id,pedido,of,item,produto,descricao,categoria,tipo,canal,rebaixo,
                     material,acabamento,cor,medida
              from pcp_produtos
              where programacao_id=${pg.id} and pedido=${pedido}
              order by pedido,item
            `
          : await db`
              select id,pedido,of,item,produto,descricao,categoria,tipo,canal,rebaixo,
                     material,acabamento,cor,medida
              from pcp_produtos
              where programacao_id=${pg.id}
              order by pedido,item
              limit 3000
            `;

        const ids = produtos.map((x: any) => x.id);
        const ops = ids.length
          ? await db`
              select produto_id,processo,status,quantidade_planejada::float planejado,
                     quantidade_produzida::float produzido
              from pcp_operacoes
              where produto_id = any(${ids})
            `
          : [];

        const byProd = new Map<string, string[]>();
        for (const o of ops as any[]) {
          const k = String(o.produto_id);
          byProd.set(k, [...(byProd.get(k) || []), String(o.processo)]);
        }

        const detalhes = (produtos as any[]).map((p) => {
          const item = {
            categoria: p.categoria,
            descricao: p.descricao,
            produto: p.produto,
            tipo: p.tipo,
            canal: p.canal,
            rebaixo: p.rebaixo,
            material: p.material,
            acabamento: p.acabamento,
            cor: p.cor,
            medida: p.medida,
            pedido: p.pedido,
            of: p.of,
          };

          const esperadas = processosUsinagemDoItem(item);
          const atuais = (byProd.get(String(p.id)) || []).filter((x) => x.startsWith("USINAGEM-"));
          const faltantes = esperadas.filter((x) => !atuais.includes(x));
          const indevidas = atuais.filter((x) => !esperadas.includes(x));
          const familia = familiaIndustrial(item);
          const revisaoFriso =
            /\bFRISO(?:S)?\b/i.test(String(p.descricao || "")) &&
            familia !== "PORTAS";

          return {
            pedido: p.pedido,
            of: p.of,
            item: p.item,
            descricao: p.descricao,
            familia,
            tipoPeca: familia === "BATENTES" ? tipoPeca(item) : null,
            canalBorracha: familia === "BATENTES" ? temCanalBorracha(item) : false,
            esperadas,
            atuais,
            faltantes,
            indevidas,
            revisao: revisaoFriso || faltantes.length > 0 || indevidas.length > 0,
            motivoRevisao: revisaoFriso
              ? "FRISO autônomo/fora de PORTAS sem regra industrial explícita."
              : "",
          };
        });

        const divergencias = detalhes.filter((x) => x.revisao);
        return j({
          programacao: pg,
          pedido: pedido || null,
          auditados: detalhes.length,
          divergencias: divergencias.length,
          resumo: {
            faltantes: divergencias.reduce((n, x) => n + x.faltantes.length, 0),
            indevidas: divergencias.reduce((n, x) => n + x.indevidas.length, 0),
            revisaoFriso: divergencias.filter((x) => x.motivoRevisao).length,
          },
          itens: divergencias.slice(0, 200),
        });
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
      case "gerar_planilha_programacao": {
        if (!["PCP", "GERENTE", "ENCARREGADO", "LIDER"].includes(ctx.user.perfil)) {
          return j({ erro: "Sem permissão para gerar programação." });
        }
        const { pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });
        ctx.attachments.push({
          type: "planilha_programacao",
          arquivo: "Programacao_Producao_IA",
          label: "Gerar programação completa",
        });
        return j({
          ok: true,
          programacao: pg,
          mensagem: "Botão para gerar a programação Excel completa foi exibido ao usuário.",
        });
      }

      case "gerar_planilha_usinagem": {
        if (!["PCP", "GERENTE", "ENCARREGADO", "LIDER"].includes(ctx.user.perfil)) {
          return j({ erro: "Sem permissão para gerar planilha de usinagem." });
        }

        const todos = [
          "USINAGEM-PORTAS",
          "USINAGEM-TRAVESSAS",
          "USINAGEM-CONTRATESTA",
          "USINAGEM-DOBRADICAS",
          "USINAGEM-TUPIA",
        ];

        const solicitado = String(input.processo || "").trim().toUpperCase();
        const pedido = String(input.pedido || "").trim();
        const setores = solicitado && solicitado !== "TODAS"
          ? todos.filter((x) => x === solicitado)
          : todos;

        if (!setores.length) {
          return j({ erro: "Processo de usinagem inválido.", processos: todos });
        }

        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });

        const rows = pedido
          ? await db`
              select distinct o.processo
              from pcp_operacoes o
              join pcp_produtos p on p.id=o.produto_id
              where p.programacao_id=${pg.id}
                and p.pedido=${pedido}
                and o.processo = any(${setores})
            `
          : await db`
              select distinct o.processo
              from pcp_operacoes o
              join pcp_produtos p on p.id=o.produto_id
              where p.programacao_id=${pg.id}
                and o.processo = any(${setores})
            `;

        const existentes = rows.map((r: any) => String(r.processo));
        if (!existentes.length) {
          return j({ erro: "A programação ativa não possui itens de usinagem para os setores solicitados." });
        }

        const arquivoBase = existentes.length === 1
          ? `Usinagem_${existentes[0].replace(/[^A-Z0-9]+/gi, "_")}`
          : "Planilha_Usinagem";
        const arquivo = pedido ? `${arquivoBase}_Pedido_${pedido}` : arquivoBase;

        ctx.attachments.push({
          type: "planilha_usinagem",
          setores: existentes,
          arquivo,
          label: pedido
            ? `Gerar usinagem do pedido ${pedido}`
            : existentes.length === 1
              ? `Gerar ${existentes[0]}`
              : "Gerar planilha de usinagem",
          pedido: pedido || undefined,
        });

        return j({
          ok: true,
          programacao: pg,
          setores: existentes,
          pedido: pedido || null,
          mensagem: "Botão para gerar a planilha Excel real foi exibido ao usuário.",
        });
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
