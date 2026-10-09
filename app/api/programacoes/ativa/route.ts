import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { session } from "@/lib/auth";

/**
 * Corrige programações antigas que ainda possuem:
 * USINAGEM-1, USINAGEM-2 e EMBALAGEM.
 *
 * A migração é idempotente: depois que os nomes antigos deixam de existir,
 * as queries abaixo não alteram mais nada.
 */
async function migrarProcessosLegados(
  db: ReturnType<typeof sql>,
  programacaoId: string
) {
  const legacy = await db`
    select count(*)::int as total
    from pcp_operacoes o
    join pcp_produtos p on p.id = o.produto_id
    where p.programacao_id = ${programacaoId}
      and o.processo in ('USINAGEM-1', 'USINAGEM-2', 'EMBALAGEM')
  `;

  void legacy;

  /*
   * PERNAS DE BATENTE:
   * o processo antigo de usinagem precisa ser desmembrado.
   *
   * Mantemos a operação original para CONTRATESTA e criamos as etapas
   * adicionais de DOBRADIÇAS e TUPIA quando aplicável.
   */
  await db`
    insert into pcp_operacoes (
      produto_id,
      processo,
      sequencia,
      percentual,
      status,
      ordem_fila,
      fixada,
      quantidade_planejada,
      quantidade_produzida,
      quantidade_refugo,
      iniciado_em,
      finalizado_em,
      atualizado_em
    )
    select
      o.produto_id,
      'USINAGEM-DOBRADICAS',
      7,
      o.percentual,
      o.status,
      o.ordem_fila,
      o.fixada,
      o.quantidade_planejada,
      o.quantidade_produzida,
      o.quantidade_refugo,
      o.iniciado_em,
      o.finalizado_em,
      now()
    from pcp_operacoes o
    join pcp_produtos p on p.id = o.produto_id
    where p.programacao_id = ${programacaoId}
      and o.processo in ('USINAGEM-1', 'USINAGEM-2')
      and upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
      and not exists (
        select 1
        from pcp_operacoes x
        where x.produto_id = o.produto_id
          and x.processo = 'USINAGEM-DOBRADICAS'
      )
  `;

  await db`
    insert into pcp_operacoes (
      produto_id,
      processo,
      sequencia,
      percentual,
      status,
      ordem_fila,
      fixada,
      quantidade_planejada,
      quantidade_produzida,
      quantidade_refugo,
      iniciado_em,
      finalizado_em,
      atualizado_em
    )
    select
      o.produto_id,
      'USINAGEM-TUPIA',
      8,
      o.percentual,
      o.status,
      o.ordem_fila,
      o.fixada,
      o.quantidade_planejada,
      o.quantidade_produzida,
      o.quantidade_refugo,
      o.iniciado_em,
      o.finalizado_em,
      now()
    from pcp_operacoes o
    join pcp_produtos p on p.id = o.produto_id
    where p.programacao_id = ${programacaoId}
      and o.processo in ('USINAGEM-1', 'USINAGEM-2')
      and upper(coalesce(p.categoria, '')) like 'BATENTE%'
      and (
        (
          trim(coalesce(p.rebaixo, '')) <> ''
          and upper(trim(coalesce(p.rebaixo, ''))) not in (
            'N/A', 'NA', 'N.A.', '-', '—', 'N/D', 'ND', 'NAO', 'NÃO',
            'SEM', 'SEM REBAIXO', 'S REBAIXO'
          )
        )
        or (
          trim(coalesce(p.canal, '')) <> ''
          and upper(trim(coalesce(p.canal, ''))) not in (
            'N/A', 'NA', 'N.A.', '-', '—', 'N/D', 'ND', 'NAO', 'NÃO',
            'SEM', 'SEM CANAL', 'S CANAL'
          )
        )
        or (
          upper(coalesce(p.descricao, '')) like '%BORRACHA%'
          and upper(coalesce(p.descricao, '')) not like '%SEM BORRACHA%'
        )
        or (
          upper(coalesce(p.descricao, '')) like '%CANAL%'
          and upper(coalesce(p.descricao, '')) not like '%SEM CANAL%'
        )
      )
      and not exists (
        select 1
        from pcp_operacoes x
        where x.produto_id = o.produto_id
          and x.processo = 'USINAGEM-TUPIA'
      )
  `;

  /*
   * Converte a operação antiga de usinagem para a máquina correta.
   */
  await db`
    update pcp_operacoes o
    set
      processo = case
        when upper(coalesce(p.categoria, '')) like 'PORTA%' then 'USINAGEM-PORTAS'
        when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%' then 'USINAGEM-TRAVESSAS'
        when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%' then 'USINAGEM-CONTRATESTA'
        else o.processo
      end,
      sequencia = case
        when upper(coalesce(p.categoria, '')) like 'PORTA%' then 2
        when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%' then 3
        when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%' then 6
        else o.sequencia
      end,
      atualizado_em = now()
    from pcp_produtos p
    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo in ('USINAGEM-1', 'USINAGEM-2')
      and (
        upper(coalesce(p.categoria, '')) like 'PORTA%'
        or upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
        or upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
      )
  `;

  /*
   * Remove peças que nunca deveriam estar nas usinagens:
   * alizares, baguetes, kit/suporte, bandeiras e demais componentes.
   */
  await db`
    delete from pcp_operacoes o
    using pcp_produtos p
    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo in ('USINAGEM-1', 'USINAGEM-2')
  `;

  /*
   * SEPARA AS EMBALAGENS REAIS:
   * - EMBALAGEM-PORTAS: portas e bandeiras
   * - EMBALAGEM-1: pernas de batente
   * - EMBALAGEM-2: travessas de batente
   * - EMBALAGEM-3: pernas de alizar
   * - EMBALAGEM-4: travessas de alizar
   * - EMBALAGEM-5: kit de correr
   * - EMBALAGEM-6: baguete
   * - EMBALAGEM-7: suporte de trilho
   *
   * Corrige também programações antigas já salvas.
   */
  await db`
    update pcp_operacoes o
    set
      processo = case
        when upper(coalesce(p.categoria, '')) like 'PORTA%'
          or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
          then 'EMBALAGEM-PORTAS'

        when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
          then 'EMBALAGEM-1'

        when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
          then 'EMBALAGEM-2'

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%TRAVESSA%'
          or (
            upper(coalesce(p.categoria, '')) like 'ALIZAR%'
            and upper(coalesce(p.descricao, '')) like '%TRAVESSA%'
          )
          then 'EMBALAGEM-4'

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%'
          then 'EMBALAGEM-3'

        when upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
          then 'EMBALAGEM-7'

        when upper(coalesce(p.categoria, '')) like 'KIT%'
          or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
          then 'EMBALAGEM-5'

        when upper(coalesce(p.categoria, '')) like 'BAGUETE%'
          or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
          then 'EMBALAGEM-6'

        else o.processo
      end,

      sequencia = case
        when upper(coalesce(p.categoria, '')) like 'PORTA%'
          or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
          then 12

        when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
          then 13

        when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
          then 14

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%TRAVESSA%'
          or (
            upper(coalesce(p.categoria, '')) like 'ALIZAR%'
            and upper(coalesce(p.descricao, '')) like '%TRAVESSA%'
          )
          then 16

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%'
          then 15

        when upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
          then 19

        when upper(coalesce(p.categoria, '')) like 'KIT%'
          or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
          then 17

        when upper(coalesce(p.categoria, '')) like 'BAGUETE%'
          or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
          then 18

        else o.sequencia
      end,

      atualizado_em = now()

    from pcp_produtos p

    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo in (
        'EMBALAGEM',
        'EMBALAGEM-PORTAS',
        'EMBALAGEM-1',
        'EMBALAGEM-2',
        'EMBALAGEM-3',
        'EMBALAGEM-4',
        'EMBALAGEM-5',
        'EMBALAGEM-6',
        'EMBALAGEM-7'
      )
  `;

  /*
   * Remove resíduos genéricos antigos que não conseguiram ser classificados.
   */
  await db`
    delete from pcp_operacoes o
    using pcp_produtos p
    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo = 'EMBALAGEM'
  `;

  /*
   * NORMALIZA AS RECOBRIDORAS DA PROGRAMAÇÃO ATIVA.
   *
   * RECOBRIDORA 1:
   * BATENTES + TRAVESSAS DE BATENTE
   *
   * RECOBRIDORA 2:
   * ALIZARES + TRAVESSAS DE ALIZAR + BAGUETES
   * + KIT DE CORRER / SUPORTE DE TRILHO
   */
  await db`
    update pcp_operacoes o
    set
      processo = 'RECOBRIDORA',
      atualizado_em = now()
    from pcp_produtos p
    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo in ('RECOBRIDORA', 'RECOBRIDORA-2')
      and upper(coalesce(p.categoria, '')) like 'BATENTE%'
  `;

  await db`
    update pcp_operacoes o
    set
      processo = 'RECOBRIDORA-2',
      atualizado_em = now()
    from pcp_produtos p
    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo in ('RECOBRIDORA', 'RECOBRIDORA-2')
      and (
        upper(coalesce(p.categoria, '')) like 'ALIZAR%'
        or upper(coalesce(p.categoria, '')) like 'BAGUETE%'
        or upper(coalesce(p.categoria, '')) like 'KIT%'
        or upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
      )
  `;

  /*
   * Remove das recobridoras qualquer família que não pertença
   * a nenhuma das duas máquinas.
   */
  await db`
    delete from pcp_operacoes o
    using pcp_produtos p
    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo in ('RECOBRIDORA', 'RECOBRIDORA-2')
      and not (
        upper(coalesce(p.categoria, '')) like 'BATENTE%'
        or upper(coalesce(p.categoria, '')) like 'ALIZAR%'
        or upper(coalesce(p.categoria, '')) like 'BAGUETE%'
        or upper(coalesce(p.categoria, '')) like 'KIT%'
        or upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
      )
  `;

  /*
   * GARANTE TUPIA PARA BATENTES E TRAVESSAS COM
   * REBAIXO / CANAL / BORRACHA.
   *
   * Isso corrige também programações antigas já salvas.
   */
  await db`
    insert into pcp_operacoes (
      produto_id,
      processo,
      sequencia,
      percentual,
      status,
      ordem_fila,
      fixada,
      quantidade_planejada,
      quantidade_produzida,
      quantidade_refugo,
      atualizado_em
    )
    select
      p.id,
      'USINAGEM-TUPIA',
      8,
      0,
      'PENDENTE',
      0,
      false,
      p.quantidade,
      0,
      0,
      now()
    from pcp_produtos p
    where p.programacao_id = ${programacaoId}
      and upper(coalesce(p.categoria, '')) like 'BATENTE%'
      and (
        (
          trim(coalesce(p.rebaixo, '')) <> ''
          and upper(trim(coalesce(p.rebaixo, ''))) not in (
            'N/A', 'NA', 'N.A.', '-', '—', 'N/D', 'ND',
            'NAO', 'NÃO', 'SEM', 'SEM REBAIXO', 'S REBAIXO'
          )
        )
        or (
          trim(coalesce(p.canal, '')) <> ''
          and upper(trim(coalesce(p.canal, ''))) not in (
            'N/A', 'NA', 'N.A.', '-', '—', 'N/D', 'ND',
            'NAO', 'NÃO', 'SEM', 'SEM CANAL', 'S CANAL'
          )
        )
        or upper(coalesce(p.descricao, '')) like '%CANAL%'
        or upper(coalesce(p.descricao, '')) like '%BORRACHA%'
        or upper(coalesce(p.descricao, '')) like '%REBAIXO%'
        or upper(coalesce(p.descricao, '')) ~ '(^|[^A-Z0-9])RB[ ]*[0-9]+'
      )
      and upper(coalesce(p.descricao, '')) not like '%SEM CANAL%'
      and upper(coalesce(p.descricao, '')) not like '%SEM BORRACHA%'
      and not exists (
        select 1
        from pcp_operacoes x
        where x.produto_id = p.id
          and x.processo = 'USINAGEM-TUPIA'
      )
  `;

  /*
   * GARANTE A EMBALAGEM CORRETA MESMO QUANDO O CSV NÃO TROUXE
   * A COLUNA EMBALAGEM PREENCHIDA.
   */
  await db`
    insert into pcp_operacoes (
      produto_id,
      processo,
      sequencia,
      percentual,
      status,
      ordem_fila,
      fixada,
      quantidade_planejada,
      quantidade_produzida,
      quantidade_refugo,
      atualizado_em
    )
    select
      p.id,

      case
        when upper(coalesce(p.categoria, '')) like 'PORTA%'
          or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
          then 'EMBALAGEM-PORTAS'

        when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
          then 'EMBALAGEM-1'

        when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
          then 'EMBALAGEM-2'

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%TRAVESSA%'
          or (
            upper(coalesce(p.categoria, '')) like 'ALIZAR%'
            and upper(coalesce(p.descricao, '')) like '%TRAVESSA%'
          )
          then 'EMBALAGEM-4'

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%'
          then 'EMBALAGEM-3'

        when upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
          then 'EMBALAGEM-7'

        when upper(coalesce(p.categoria, '')) like 'KIT%'
          or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
          then 'EMBALAGEM-5'

        when upper(coalesce(p.categoria, '')) like 'BAGUETE%'
          or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
          then 'EMBALAGEM-6'

        else null
      end,

      case
        when upper(coalesce(p.categoria, '')) like 'PORTA%'
          or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
          then 12

        when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
          then 13

        when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
          then 14

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%TRAVESSA%'
          or (
            upper(coalesce(p.categoria, '')) like 'ALIZAR%'
            and upper(coalesce(p.descricao, '')) like '%TRAVESSA%'
          )
          then 16

        when upper(coalesce(p.categoria, '')) like 'ALIZAR%'
          then 15

        when upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
          or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
          then 19

        when upper(coalesce(p.categoria, '')) like 'KIT%'
          or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
          then 17

        when upper(coalesce(p.categoria, '')) like 'BAGUETE%'
          or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
          then 18

        else 99
      end,

      0,
      'PENDENTE',
      0,
      false,
      p.quantidade,
      0,
      0,
      now()

    from pcp_produtos p

    where p.programacao_id = ${programacaoId}
      and upper(coalesce(p.categoria, '')) not like 'FERRAGEM%'
      and (
        upper(coalesce(p.categoria, '')) like 'PORTA%'
        or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
        or upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
        or upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
        or upper(coalesce(p.categoria, '')) like 'ALIZAR%'
        or upper(coalesce(p.categoria, '')) like 'BAGUETE%'
        or upper(coalesce(p.categoria, '')) like 'KIT%'
        or upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
        or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
      )
      and not exists (
        select 1
        from pcp_operacoes x
        where x.produto_id = p.id
          and x.processo = case
            when upper(coalesce(p.categoria, '')) like 'PORTA%'
              or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
              then 'EMBALAGEM-PORTAS'

            when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
              then 'EMBALAGEM-1'

            when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
              then 'EMBALAGEM-2'

            when upper(coalesce(p.categoria, '')) like 'ALIZAR%TRAVESSA%'
              or (
                upper(coalesce(p.categoria, '')) like 'ALIZAR%'
                and upper(coalesce(p.descricao, '')) like '%TRAVESSA%'
              )
              then 'EMBALAGEM-4'

            when upper(coalesce(p.categoria, '')) like 'ALIZAR%'
              then 'EMBALAGEM-3'

            when upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
              or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
              or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
              then 'EMBALAGEM-7'

            when upper(coalesce(p.categoria, '')) like 'KIT%'
              or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
              then 'EMBALAGEM-5'

            when upper(coalesce(p.categoria, '')) like 'BAGUETE%'
              or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
              then 'EMBALAGEM-6'

            else null
          end
      )
  `;

  /*
   * REMOVE USINAGENS NOVAS QUE NÃO PERTENCEM À FAMÍLIA DA PEÇA.
   * Isso evita resíduos de programações que foram convertidas
   * enquanto a classificação ainda estava incorreta.
   */
  await db`
    delete from pcp_operacoes o
    using pcp_produtos p
    where p.id = o.produto_id
      and p.programacao_id = ${programacaoId}
      and o.processo in (
        'USINAGEM-PORTAS',
        'USINAGEM-TRAVESSAS',
        'USINAGEM-CONTRATESTA',
        'USINAGEM-DOBRADICAS',
        'USINAGEM-TUPIA'
      )
      and (
        (
          o.processo = 'USINAGEM-PORTAS'
          and upper(coalesce(p.categoria, '')) not like 'PORTA%'
        )
        or (
          o.processo = 'USINAGEM-TRAVESSAS'
          and upper(coalesce(p.categoria, '')) not like 'BATENTE%TRAVESSA%'
        )
        or (
          o.processo in (
            'USINAGEM-CONTRATESTA',
            'USINAGEM-DOBRADICAS'
          )
          and upper(coalesce(p.categoria, '')) not like 'BATENTE%PERNA%'
        )
        or (
          o.processo = 'USINAGEM-TUPIA'
          and upper(coalesce(p.categoria, '')) not like 'BATENTE%'
        )
      )
  `;

  /*
   * Atualiza o diagnóstico salvo da programação.
   */
  await db`
    update pcp_programacoes pg
    set
      import_operacoes = (
        select count(*)::int
        from pcp_operacoes o
        join pcp_produtos p on p.id = o.produto_id
        where p.programacao_id = pg.id
      ),
      import_processos = coalesce(
        (
          select jsonb_object_agg(t.processo, t.total)
          from (
            select o.processo, count(*)::int as total
            from pcp_operacoes o
            join pcp_produtos p on p.id = o.produto_id
            where p.programacao_id = pg.id
            group by o.processo
          ) t
        ),
        '{}'::jsonb
      )
    where pg.id = ${programacaoId}
  `;
}

export async function GET() {
  try {
    if (!(await session())) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const db = sql();

    const ativa = await db`
      select id
      from pcp_programacoes
      where status = 'ATIVA'
      order by criado_em desc
      limit 1
    `;

    if (!ativa.length) {
      return NextResponse.json(
        { programacao: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const programacaoId = String(ativa[0].id);

    /*
     * Faz a correção automaticamente na primeira leitura
     * de uma programação antiga.
     */
    await migrarProcessosLegados(db, programacaoId);

    const pgs = await db`
      select
        id,
        filtro,
        to_char(data_programacao,'YYYY-MM-DD') data,
        turno,
        status,
        origem,
        criado_em,
        import_linhas,
        import_pedidos,
        import_ofs,
        import_pecas,
        import_operacoes,
        import_sem_rota,
        import_inconsistencias,
        import_processos
      from pcp_programacoes
      where id = ${programacaoId}
      limit 1
    `;

    const pg: any = pgs[0];

    const products = await db`
      select *
      from pcp_produtos
      where programacao_id = ${programacaoId}
      order by pedido, item
    `;

    const ops = await db`
      select o.*
      from pcp_operacoes o
      join pcp_produtos p on p.id = o.produto_id
      where p.programacao_id = ${programacaoId}
      order by o.processo, o.ordem_fila, o.sequencia
    `;

    const produtos = products.map((p: any) => ({
      id: p.id,
      filtro: p.filtro,
      pedido: p.pedido,
      item: p.item,
      produto: p.produto,
      descricao: p.descricao,
      tipo: p.tipo,
      canal: p.canal,
      rebaixo: p.rebaixo,
      acabamento: p.acabamento,
      cor: p.cor,
      quantidade: Number(p.quantidade),
      pedidoCliente: p.pedido_cliente,
      statusEngenharia: p.status_engenharia,
      of: p.of,
      percentualProduto: Number(p.percentual_produto),
      codigoModelo: p.codigo_modelo,
      descricaoModelo: p.descricao_modelo,
      outrasCaracteristicas: p.outras_caracteristicas,
      categoria: p.categoria,
      material: p.material,
      medida: p.medida,
      prioridade: p.prioridade,
      operacoes: ops
        .filter((o: any) => o.produto_id === p.id)
        .map((o: any) => ({
          id: o.id,
          produtoId: o.produto_id,
          processo: o.processo,
          sequencia: o.sequencia,
          percentual: Number(o.percentual),
          status: o.status,
          ordemFila: o.ordem_fila,
          fixada: o.fixada,
          quantidadePlanejada: Number(o.quantidade_planejada),
          quantidadeProduzida: Number(o.quantidade_produzida),
          quantidadeRefugo: Number(o.quantidade_refugo),
          iniciadoEm: o.iniciado_em,
          finalizadoEm: o.finalizado_em,
        })),
    }));

    return NextResponse.json(
      {
        programacao: {
          id: pg.id,
          filtro: pg.filtro,
          data: pg.data,
          turno: pg.turno,
          status: pg.status,
          origem: pg.origem,
          criadoEm: pg.criado_em,
          diagnostico: {
            linhas: Number(pg.import_linhas),
            pedidos: Number(pg.import_pedidos),
            ofs: Number(pg.import_ofs),
            pecas: Number(pg.import_pecas),
            operacoes: Number(pg.import_operacoes),
            semRota: Number(pg.import_sem_rota),
            inconsistenciasRota: Number(pg.import_inconsistencias),
            processos: pg.import_processos || {},
          },
          produtos,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ||
          "Falha ao carregar programação.",
      },
      {
        status: 500,
      }
    );
  }
}
