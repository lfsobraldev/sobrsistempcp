import { sql } from "@/lib/db";
import type { Sessao } from "@/types/pcp";
import { allowedPath, pathsFor } from "@/lib/permissions";
import { signAction } from "@/lib/ia/claude";
import { agruparPorCarga, extrairRomaneio, validarRomaneio } from "@/lib/ia/romaneio";
import { analisarRiscos, capacidadeProcessos, localHoje, planejarFabrica } from "@/lib/ia/intelligence";
import { processosUsinagemDoItem, familiaIndustrial, tipoPeca, temCanalBorracha } from "@/lib/domain/industrial";

export type Attachment =
  | { type: "navigate"; path: string; label: string }
  | { type: "arquivo"; url: string; label: string; pedido: string }
  | { type: "confirm"; label: string; token: string }
  | { type: "romaneio"; data: unknown; alertas: unknown; resumo: unknown }
  | { type: "planilha_usinagem"; setores: string[]; arquivo: string; label: string; pedido?: string }
  | { type: "planilha_programacao"; arquivo: string; label: string; setores?: string[] };

export type ToolCtx = { user: Sessao; attachments: Attachment[] };

const WRITE_ROLES = ["PCP", "GERENTE", "ENCARREGADO"];

export const TOOL_META = {
  simular_aps_maquinas: "Simula capacidade finita por máquina e turno, com eficiência, setup e compatibilidades reais cadastradas. Somente leitura. Informa máquinas sobrecarregadas e operações sem máquina adequada, sem alterar filas.",
  diagnostico_integrado: "Gera diagnóstico real da programação ativa com capacidade por setor, riscos de pedidos e plano de produção; não inventa dados faltantes e não altera a fábrica.",
  consultar_catalogo: "Consulta código e narrativa do catálogo mestre permanente da engenharia; informa conflito e variantes em vez de inventar especificações.",
  consultar_conhecimento: "Recupera conteúdo e exemplos que a equipe cadastrou na base de treinamento da Sobral IA, identificando a fonte do procedimento.",
  consultar_periodo: "Consulta programação histórica por datas, produto, peça e medida; não confunde programação ativa com semana. Retorna total por dia e pedido.",
  gerar_documentos_pedido: "Gera links autenticados para o romaneio e as etiquetas Excel de um pedido REAL da programação ativa, usando somente o gerador oficial e romaneio previamente processado; não inventa itens.",
  planejamento_capacidade: "Analisa gargalos reais, capacidade por turno, saldos, filas fixadas e sequência sugerida por processo. Não altera produção; sinaliza setores sem capacidade cadastrada.",
  consultar_pecas_por_medida: "Consulta peças EXATAMENTE por família, tipo PERNA ou TRAVESSA e perfil largura x espessura (ex.: travessas de alizar 50x9). Nunca somar pernas quando solicitado travessas. Para semana, declarar claramente que o dado é só da programação ativa, não o total semanal.",
  simular_programacao_urgente: "Simula uma programação urgente de um pedido existente na programação ativa, consulta operações com saldo, máquinas/setores envolvidos e filas fixadas. Somente leitura: não altera prioridades nem libera produção.",
  resumo_metros_lineares: "Calcula os metros lineares físicos da programação ativa, por pedido ou total, com comprimento x quantidade e itens sem medida identificados.",
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
      case "simular_aps_maquinas": {
        const { consultarAPS } = await import("@/lib/ia/aps-service");
        const resultado = await consultarAPS();
        if ("erro" in resultado) return resultado;
        return {
          fonte: resultado.fonte,
          programacao: resultado.programacao,
          confianca: resultado.confianca,
          incompleto: resultado.incompleto,
          totalOperacoesConsultadas: resultado.totalOperacoesConsultadas,
          maquinas: resultado.porMaquina,
          totalAlocacoes: resultado.alocacoes.length,
          alocacoesExemplo: resultado.alocacoes.slice(0,40),
          totalPendencias: resultado.pendentes.length,
          pendenciasExemplo: resultado.pendentes.slice(0,40),
          avisos: resultado.avisos,
          ressalva: "Tempos em turnos relativos, não são horários de entrega confirmados. Não altera programação."
        };
      }
      case "diagnostico_integrado": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return { erro: "Nenhuma programação ativa. Não é possível diagnosticar a fábrica sem dados." };
        const [capacidade, riscos, plano] = await Promise.all([
          capacidadeProcessos(db,pg), analisarRiscos(db,pg), planejarFabrica(db,pg)
        ]);
        return {
          fonte:"Programação ativa e capacidades cadastradas no Neon",
          filtro:pg.filtro, consultadoEm:new Date().toISOString(),
          capacidade,riscos,plano,
          observacao:"Análise baseada nos dados existentes; não representa operação em tempo real sem apontamentos atualizados. Sugestões não alteram programação."
        };
      }
      case "consultar_catalogo": {
        const codigo=String(input.codigo||"").trim().replace(/\.0$/,"").toUpperCase().slice(0,80);
        if(!codigo) return {erro:"Informe o código do produto."};
        const db=sql();
        const rows=await db`
          select c.codigo,c.narrativa,c.conflito,c.vazio,c.variantes,
                 v.ativo_em as catalogoAtualizadoEm
          from pcp_catalogo_produtos c join pcp_catalogo_versoes v on v.id=c.versao
          where v.status='ATIVA' and c.codigo=${codigo} limit 1
        `;
        return rows.length?{fonte:"Catálogo Mestre de Produtos",registro:rows[0]}:
          {fonte:"Catálogo Mestre de Produtos",erro:"Código não encontrado no catálogo ativo.",codigo};
      }
      case "consultar_conhecimento": {
        const assunto=String(input.assunto||"").trim().slice(0,120);
        if(assunto.length<2) return {erro:"Informe um assunto com pelo menos dois caracteres."};
        const busca="%"+assunto.replace(/[%_]/g,"")+"%";
        const db=sql();
        const rows=await db`
          with q as (select websearch_to_tsquery('portuguese',${assunto}) termos)
          select k.id,k.titulo,k.area,k.situacao,k.regra,k.exemplo,k.observacao,k.atualizado_em,
                 ts_rank(to_tsvector('portuguese',concat_ws(' ',k.titulo,k.area,k.situacao,k.regra,k.exemplo,k.observacao)),q.termos) relevancia
          from pcp_ia_conhecimento k cross join q
          where k.ativo=true and (
            to_tsvector('portuguese',concat_ws(' ',k.titulo,k.area,k.situacao,k.regra,k.exemplo,k.observacao))
            @@ q.termos
            or k.titulo ilike ${busca} or k.regra ilike ${busca}
          )
          order by relevancia desc,k.prioridade desc,k.atualizado_em desc limit 12
        `;
        return {fonte:"Biblioteca de conhecimento cadastrada pela equipe",assunto,resultados:rows};
      }
      case "consultar_periodo": {
        const inicio = String(input.inicio || "");
        const fim = String(input.fim || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim || !Number.isFinite(Date.parse(inicio)) || !Number.isFinite(Date.parse(fim)) || (Date.parse(fim)-Date.parse(inicio))>93*86400000) return { erro: "Período inválido; informe datas YYYY-MM-DD de até 93 dias." };
        const familia = String(input.familia || "ALIZARES").toUpperCase();
        const peca = String(input.peca || "TODOS").toUpperCase();
        const largura = Number(input.largura || 0), espessura = Number(input.espessura || 0);
        const db = sql();
        const rows = await db`
          select pg.data_programacao::text as dia, p.pedido, p.of, p.categoria, p.produto, p.tipo, p.descricao, p.medida, p.quantidade::float as quantidade
          from pcp_produtos p join pcp_programacoes pg on pg.id=p.programacao_id
          where pg.data_programacao::date >= ${inicio}::date and pg.data_programacao::date <= ${fim}::date
            and pg.status in ('ATIVA','ENCERRADA')
            and pg.id = (select pg2.id from pcp_programacoes pg2
              where pg2.data_programacao::date=pg.data_programacao::date
                and pg2.status in ('ATIVA','ENCERRADA')
              order by pg2.criado_em desc limit 1)
          order by pg.data_programacao,p.pedido limit 15000
        `;
        const { familiaIndustrial, tipoPeca, medidaDoItem } = await import("@/lib/domain/industrial");
        const porDia: Record<string,number> = {}, porPedido: Record<string,number> = {}, porOF: Record<string,number> = {};
        let total=0, linhas=0;
        for (const p of rows) {
          if (familiaIndustrial(p)!==familia || (peca!=="TODOS" && tipoPeca(p)!==peca)) continue;
          const [,l,e]=medidaDoItem(p);
          if ((largura && largura!==l) || (espessura && espessura!==e)) continue;
          const q=Number(p.quantidade||0);
          total+=q; linhas++;
          porDia[p.dia]=(porDia[p.dia]||0)+q;
          porPedido[p.pedido]=(porPedido[p.pedido]||0)+q;
          const chaveOF=String(p.pedido)+"/"+String(p.of || "SEM OF");
          porOF[chaveOF]=(porOF[chaveOF]||0)+q;
        }
        return { fonte:"programações salvas por data",inicio,fim,familia,peca,largura,espessura,totalProgramadoPecas:total,linhas,porDia,porPedido,porOF,
          alerta:rows.length>=15000?"Limite de 15 mil registros, total possivelmente incompleto":null,
          criterio:"Última programação cadastrada por dia. Quantidade programada não representa necessariamente saldo pendente." };
      }
      case "consultar_pecas_por_medida": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return { erro: "Nenhuma programação ativa." };
        const familiaFiltro = String(input.familia || "ALIZARES").toUpperCase();
        const largura = Number(input.largura);
        const espessura = Number(input.espessura);
        if (!["ALIZARES", "BATENTES", "BAGUETE", "PORTAS"].includes(familiaFiltro) ||
            !(largura > 0 && espessura > 0)) {
          return { erro: "Família ou medida inválida. Informe largura e espessura positivas em milímetros." };
        }
        const pedido = String(input.pedido || "").trim();
        const tipoFiltro = String(input.tipoPeca || "TODOS").toUpperCase();
        if (!["TODOS", "PERNA", "TRAVESSA"].includes(tipoFiltro)) return { erro: "Tipo de peça inválido." };
        const registros = await db`
          select p.id,p.pedido,p.of,p.categoria,p.descricao,p.medida,p.produto,p.tipo,p.quantidade::float quantidade,
            (select json_agg(json_build_object('processo',o.processo,
              'planejado',o.quantidade_planejada::float,
              'produzido',o.quantidade_produzida::float)) from pcp_operacoes o
              where o.produto_id=p.id and o.processo like 'EMBALAGEM%') as embalagens
          from pcp_produtos p where p.programacao_id=${pg.id}
          and (${pedido}='' or p.pedido=${pedido})
        `;
        const { medidaDoItem, familiaIndustrial, tipoPeca } = await import("@/lib/domain/industrial");
        let programado = 0, saldoEmbalagem = 0, semApontamento = 0, linhas = 0;
        const pedidos: Record<string, number> = {};
        const exemplos: Array<{ pedido: string; of: string; medida: string; quantidade: number }> = [];
        for (const p of registros) {
          if (familiaIndustrial(p) !== familiaFiltro) continue;
          if (tipoFiltro !== "TODOS" && tipoPeca(p) !== tipoFiltro) continue;
          const [comprimento, l, e] = medidaDoItem(p);
          if (l !== largura || e !== espessura) continue;
          const quantidade = Number(p.quantidade || 0);
          programado += quantidade; linhas++;
          pedidos[p.pedido] = (pedidos[p.pedido] || 0) + quantidade;
          if (exemplos.length < 30) exemplos.push({pedido: String(p.pedido),of: String(p.of || ""),medida: [comprimento,l,e].join("x"),quantidade});
          const ops = Array.isArray(p.embalagens) ? p.embalagens : [];
          if (!ops.length) { semApontamento += quantidade; continue; }
          const embalagem = ops.reduce((a: any, b: any) => Number(a.planejado || 0) >= Number(b.planejado || 0) ? a : b);
          saldoEmbalagem += Math.max(0, Number(embalagem.planejado || 0) - Number(embalagem.produzido || 0));
        }
        return {
          fonte: "programação ATIVA", filtro: pg.filtro, dataProgramacao: pg.data_programacao, turno: pg.turno,
          familia: familiaFiltro, tipoPeca: tipoFiltro, larguraMM: largura, espessuraMM: espessura,
          totalProgramadoPecas: programado, saldoEmbalagemConhecidoPecas: saldoEmbalagem,
          pecasSemOperacaoEmbalagem: semApontamento, linhas, porPedido: pedidos, exemplos,
          ressalva: "A consulta mede a programação ativa, NÃO a semana inteira. Saldo total exato não pode ser garantido quando faltam operações de embalagem; não somar operações distintas da mesma peça."
        };
      }
      case "resumo_metros_lineares": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return { erro: "Nenhuma programação ativa." };
        const pedido = String(input.pedido || "").trim();
        const rows = pedido ? await db`select pedido,of,categoria,descricao,medida,quantidade::float quantidade from pcp_produtos where programacao_id=${pg.id} and pedido=${pedido}` : await db`select pedido,of,categoria,descricao,medida,quantidade::float quantidade from pcp_produtos where programacao_id=${pg.id}`;
        const { medidaDoItem, familiaIndustrial } = await import("@/lib/domain/industrial");
        let total = 0;
        const semMedida: string[] = [];
        const porPedido: Record<string,number> = {};
        for (const p of rows) {
          const familia = familiaIndustrial(p);
          if (!["BATENTES","ALIZARES","BAGUETE","KIT CORRER"].includes(familia)) continue;
          const [comp] = medidaDoItem(p);
          if (!(comp > 0)) { semMedida.push(String(p.of || p.pedido)); continue; }
          const ml = comp / 1000 * Number(p.quantidade || 0);
          total += ml;
          porPedido[p.pedido] = (porPedido[p.pedido] || 0) + ml;
        }
        return { filtro: pg.filtro, pedido: pedido || null, unidade:"mL", total: Math.round(total*1000)/1000, porPedido, semMedida: semMedida.slice(0,50), metodologia:"Quantidade física x comprimento (mm)/1000; não duplicar pelas operações." };
      }
      case "resumo_producao": {
        const { db, pg } = await programacaoAtiva();
        if (!pg) return j({ erro: "Nenhuma programação ativa." });
        const [tot] = await db`
          select
            count(distinct pedido)::int pedidos,
            count(distinct nullif(trim(of),''))::int ofs,
            count(*)::int linhas,
            coalesce(sum(quantidade),0)::float pecas
          from pcp_produtos
          where programacao_id=${pg.id}
        `;
        const proc = await db`
          select
            o.processo,
            o.status,
            count(*)::int operacoes,
            coalesce(sum(o.quantidade_planejada),0)::float planejado,
            coalesce(sum(o.quantidade_produzida),0)::float produzido,
            coalesce(sum(greatest(o.quantidade_planejada-o.quantidade_produzida,0)),0)::float saldo
          from pcp_operacoes o
          join pcp_produtos p on p.id=o.produto_id
          where p.programacao_id=${pg.id}
          group by 1,2
          order by 1,2
        `;
        return j({
          programacao: pg,
          totais: tot,
          porProcessoStatus: proc,
          unidadeResumo: "PEÇAS",
          observacao: "Pedidos e OFs são contagens distintas. Situação por processo deve ser apresentada em quantidade de peças (planejado/produzido/saldo), não como quantidade de registros de operação."
        });
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

      case "simular_programacao_urgente": {
        if (!["PCP", "GERENTE", "ENCARREGADO"].includes(ctx.user.perfil))
          return { erro: "Sem permissão para simular programação urgente." };
        const pedido = String(input.pedido || "").trim();
        if (!pedido || pedido.length > 80) return { erro: "Informe um pedido válido." };
        const { db, pg } = await programacaoAtiva();
        if (!pg) return { erro: "Nenhuma programação ativa disponível." };
        const items = await db`
          select p.of,p.categoria,p.descricao,p.medida,p.material,p.quantidade::float quantidade,
            o.processo,o.status,o.ordem_fila,
            o.quantidade_planejada::float planejado,o.quantidade_produzida::float produzido,
            coalesce(o.fixada,false) fixada
          from pcp_produtos p
          join pcp_operacoes o on o.produto_id=p.id
          where p.programacao_id=${pg.id} and p.pedido=${pedido}
          order by o.processo,o.ordem_fila
        `;
        if (!items.length) return { erro: "Pedido sem operações na programação ativa.", pedido, filtro: pg.filtro };
        const pendentes = items.filter((o: any) =>
          o.status !== "CONCLUIDA" && Number(o.planejado) > Number(o.produzido));
        const setores = [...new Set(pendentes.map((o: any) => String(o.processo)))];
        const filasFixadas = setores.length ? await db`
          select o.processo,count(*)::int operacoes_fixadas
          from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id
          where p.programacao_id=${pg.id}
            and o.processo=any(${setores}) and coalesce(o.fixada,false)=true
            and p.pedido<>${pedido} and o.status<>'CONCLUIDA'
          group by o.processo
        ` : [];
        return {
          simulacao: true, alteraDados: false, pedido, filtro: pg.filtro,
          dataProgramacao: pg.data_programacao, turno: pg.turno,
          operacoesPendentes: pendentes.map((o: any) => ({
            of:o.of, descricao:o.descricao, familia:familiaIndustrial(o),
            material:o.material, medida:o.medida, processo:o.processo,
            filaAtual:Number(o.ordem_fila), fixada:Boolean(o.fixada),
            saldo:Math.max(0,Number(o.planejado)-Number(o.produzido)),
          })).slice(0,150),
          totalOperacoesPendentes:pendentes.length, setores,
          restricoesFilasFixadas: filasFixadas,
          proximoPasso: "Conferir capacidade, operações precedentes e prioridades; solicitar aprovação explícita e usar fluxo próprio de alteração. Nenhuma fila foi alterada.",
          observacao: "Não é uma programação otimizada APS; é prévia informativa baseada na programação ativa."
        };
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
      case "gerar_documentos_pedido": {
        if (!["PCP","GERENTE","ENCARREGADO","LIDER"].includes(ctx.user.perfil))
          return {erro:"Sem permissão para gerar documentos."};
        const pedido = String(input.pedido || "").trim();
        const tipo = String(input.tipo || "ambos").toLowerCase();
        if (!/^[a-zA-Z0-9._-]{1,80}$/.test(pedido) ||
          !["romaneio","etiquetas","ambos"].includes(tipo))
          return {erro:"Pedido ou tipo inválido."};
        const {db,pg} = await programacaoAtiva();
        if (!pg) return {erro:"Não há programação ativa."};
        const {ensurePreparedRomaneiosTable} = await import("@/lib/romaneio/prepared");
        await ensurePreparedRomaneiosTable(db);
        const [row] = await db`
          select pedido, cliente, status, warnings, resultado
          from pcp_romaneios_preparados
          where programacao_id=${pg.id} and pedido=${pedido} limit 1
        `;
        if (!row) return {erro:"Romaneio não preparado para esse pedido. Revise e prepare primeiro no módulo Romaneios.",pedido};
        const data = row.resultado;
        const {canGenerate} = await import("@/lib/romaneio/validation");
        if (!data?.packages?.length || !canGenerate(data))
          return {erro:"Romaneio com pendências impeditivas; não foi gerado.",pedido,warnings:row.warnings};
        const temCliente = Boolean(String(data.client || "").trim());
        const temDestino = Boolean(String(data.destination || "").trim());
        const tipos = tipo === "ambos" ? ["romaneio","etiquetas"] : [tipo];
        const gerados:string[] = [];
        const bloqueados:string[] = [];
        for (const t of tipos) {
          if (t === "etiquetas" && (!temCliente || !temDestino)) {
            bloqueados.push("Etiquetas: cliente e destino são obrigatórios.");
            continue;
          }
          const url = "/api/ia/arquivos?pedido=" + encodeURIComponent(pedido) + "&tipo=" + t;
          ctx.attachments.push({type:"arquivo",url,label:t==="romaneio"?"Baixar romaneio Excel":"Baixar etiquetas Excel",pedido});
          gerados.push(t);
        }
        return {pedido,cliente:row.cliente,status:row.status,gerados,bloqueados,
          observacao:"Arquivos são gerados no download a partir do romaneio preparado, sem modificar o pedido."};
      }
      case "planejamento_capacidade": {
        const {db,pg} = await programacaoAtiva();
        if (!pg) return {erro:"Nenhuma programação ativa."};
        const [capacidades,planejamento] = await Promise.all([
          capacidadeProcessos(db,pg),planejarFabrica(db,pg)
        ]);
        const cap = capacidades.map((x:any)=>({
          processo:x.processo,saldo:x.saldo,capacidadeTurno:x.capacidadeTurno,
          cargaPct:x.cargaPct,gargalo:x.gargalo,capacidadeCadastrada:x.capacidadeCadastrada,
          turnosEstimados:x.capacidadeTurno>0?Math.ceil(x.saldo/x.capacidadeTurno):null
        }));
        const filaComProjecao = (planejamento.sequencias || []).map((setor:any) => {
          const capacidadeTurno = Number(cap.find((c:any)=>c.processo===setor.processo)?.capacidadeTurno || 0);
          let acumulado = 0;
          return {
            processo: setor.processo, capacidadeTurno: capacidadeTurno || null,
            filaSugerida: (setor.filaSugerida || []).map((item:any) => {
              const saldo = Math.max(0,Number(item.saldo || 0));
              const inicio = capacidadeTurno > 0 ? Math.floor(acumulado / capacidadeTurno) + 1 : null;
              acumulado += saldo;
              const fim = capacidadeTurno > 0 ? Math.ceil(acumulado / capacidadeTurno) : null;
              return {...item, turnoEstimadoInicio:inicio,turnoEstimadoFim:fim,
                exigeRevisaoCapacidade:capacidadeTurno<=0};
            }),
          };
        });
        return {programacao:pg,capacidades:cap,
          gargalos:cap.filter((x:any)=>x.gargalo===true),
          semCadastro:cap.filter((x:any)=>!x.capacidadeCadastrada).map((x:any)=>x.processo),
          sequencias:filaComProjecao,
          premissas:"Capacidade estimada por peças/hora × minutos disponíveis × eficiência. Sequência sugerida por prioridade e prazo, preservando filas fixadas. Projeções são em turnos consecutivos por processo, sem calendário nem setup; não considerar como prazo prometido. NÃO é APS com setup e dependências calculados; não altera fila."};
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
