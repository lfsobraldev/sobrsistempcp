import {listarTransferencias} from "@/lib/transferencias-unidades";
import {consultarLotesCiclo} from "@/lib/ciclo-consultas";
import {idsProdutosRecorte,lerFiltrosPCP} from "@/lib/pcp-filters";
import { classificacaoSchema } from "@/lib/engenharia";
import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirEstoque } from "@/lib/estoque-schema";
import { PERFIS_VER } from "@/lib/estoque";

export const runtime = "nodejs";
async function unidadeGET(req: Request) {
  try {
    await requireRoles([...PERFIS_VER]);
    const db = sql(); await garantirEstoque(db);
    const url = new URL(req.url);
    const headers = { "Cache-Control": "no-store" };
    if(url.searchParams.get('visao')==='transferencias'){const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});return NextResponse.json(await listarTransferencias(page,url.searchParams),{headers});}
    if(url.searchParams.get('visao')==='lotes'){const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});return NextResponse.json(await consultarLotesCiclo(db,url.searchParams,page),{headers});}

    const categoria=url.searchParams.get("classificacao")||"";
    if(categoria&&!classificacaoSchema.safeParse(categoria).success)return NextResponse.json({error:"Classificação inválida."},{status:400});
    const cod = (url.searchParams.get("codigo") || "").trim();
    if (cod) {
      // leitura de código de barras ou código do produto → produto + unidade + fator
      const r = await db.query(`select p.id produto_id,p.codigo,p.descricao,p.unidade_base,u.unidade,u.fator::float fator from est_produto_unidades u join est_produtos p on p.id=u.produto_id where u.codigo_barras=$1 and p.ativo
        union all select p.id,p.codigo,p.descricao,p.unidade_base,p.unidade_base,1 from est_produtos p where upper(p.codigo)=upper($1) and p.ativo limit 1`, [cod]);
      return NextResponse.json({ encontrado: r[0] || null }, { headers });
    }

    const prodId = url.searchParams.get("produto");
    if (prodId) {
      if (!/^[0-9a-f-]{36}$/i.test(prodId)) return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
      const [porLocal, reservas, ultimos] = await Promise.all([
        db.query(`select l.codigo local,s.fisico::float,s.reservado::float,s.bloqueado::float,(s.fisico-s.reservado-s.bloqueado)::float disponivel from est_saldos s join est_locais l on l.id=s.local_id where s.produto_id=$1::uuid order by l.codigo`, [prodId]),
        db.query(`select m.pedido,l.codigo local,sum(case when m.tipo='RESERVA' then m.quantidade_base when m.tipo='LIBERA_RESERVA' then -m.quantidade_base when m.tipo='SAIDA' and m.baixa_reserva then -m.quantidade_base else 0 end)::float reservado from est_movimentos m join est_locais l on l.id=m.local_origem_id where m.produto_id=$1::uuid and m.pedido<>'' and m.tipo in('RESERVA','LIBERA_RESERVA','SAIDA') group by m.pedido,l.codigo having sum(case when m.tipo='RESERVA' then m.quantidade_base when m.tipo='LIBERA_RESERVA' then -m.quantidade_base when m.tipo='SAIDA' and m.baixa_reserva then -m.quantidade_base else 0 end)>0 order by m.pedido`, [prodId]),
        db.query(`select m.id,m.tipo,m.quantidade_base::float quantidade_base,m.quantidade_informada::float quantidade_informada,m.unidade_informada,m.sinal,m.documento,m.pedido,m.motivo,m.usuario,m.criado_em,lo.codigo origem,ld.codigo destino from est_movimentos m left join est_locais lo on lo.id=m.local_origem_id left join est_locais ld on ld.id=m.local_destino_id where m.produto_id=$1::uuid order by m.id desc limit 30`, [prodId]),
      ]);
      return NextResponse.json({ porLocal, reservasPorPedido: reservas, ultimos }, { headers });
    }

    const q = "%" + (url.searchParams.get("q") || "").trim().replace(/[%_\\]/g, "") + "%";
    const local = (url.searchParams.get("local") || "").trim();
    const filtro = url.searchParams.get('saldo') || '';
    const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});
    const f=lerFiltrosPCP(url.searchParams),escopo=f.clientes.length>0||f.representantes.length>0||f.filtros.length>0||f.pedidos.length>0||!['SELECAO','ATIVO','TODOS'].includes(f.mes);
    const codigos=escopo?(await idsProdutosRecorte(db,url.searchParams)).map(p=>String(p.produto)):null;
    const base=`select p.id produto_id,p.codigo,p.descricao,p.unidade_base,p.estoque_minimo::float estoque_minimo,
      coalesce(sum(s.fisico),0)::float fisico,coalesce(sum(s.reservado),0)::float reservado,coalesce(sum(s.bloqueado),0)::float bloqueado,
      coalesce(sum(s.fisico-s.reservado-s.bloqueado),0)::float disponivel,count(s.local_id)::int locais
      from est_produtos p left join est_saldos s on s.produto_id=p.id and ($2='' or s.local_id::text=$2)
      where p.ativo and ($3='' or p.classificacao=$3) and ($4::text[] is null or p.codigo=any($4::text[]))
      and ($1='%%' or p.codigo ilike $1 or p.descricao ilike $1 or exists(select 1 from est_produto_unidades u where u.produto_id=p.id and u.codigo_barras ilike $1)) group by p.id`;
    const cond=`($5='' or ($5='abaixo-minimo' and estoque_minimo>0 and disponivel<estoque_minimo) or ($5='bloqueado' and bloqueado>0) or ($5='reservado' and reservado>0) or ($5='com-saldo' and fisico>0))`;
    const args=[q,local,categoria,codigos,filtro];
    const [lista,contagens]=await Promise.all([
      db.query(`select * from (${base}) x where ${cond} order by codigo limit 50 offset $6`,[...args,(page-1)*50]),
      db.query(`select count(*)::int "produtosAtivos",count(*) filter(where fisico>0)::int "comSaldo",count(*) filter(where estoque_minimo>0 and disponivel<estoque_minimo)::int "abaixoMinimo",count(*) filter(where bloqueado>0)::int "comBloqueio",count(*) filter(where reservado>0)::int "comReserva",count(*) filter(where ${cond})::int total from (${base}) x`,args)
    ]);
    const rows=lista;
    const porLocal = await db.query(`select s.produto_id,l.id local_id,l.codigo local,s.fisico::float,s.reservado::float,s.bloqueado::float,(s.fisico-s.reservado-s.bloqueado)::float disponivel from est_saldos s join est_locais l on l.id=s.local_id where ($1='' or s.local_id::text=$1) and (s.fisico>0 or s.reservado>0 or s.bloqueado>0) order by l.codigo`, [local]);
    return NextResponse.json({
      produtos: lista,
      locais: porLocal,
      // contagens (unidades diferentes não são somadas)
      total:Number(contagens[0].total),page,
      resumo:contagens[0],
    }, { headers });
  } catch (e: any) { const f = e?.message === "SEM_PERMISSAO"; return NextResponse.json({ error: f ? "Sem permissão." : e?.message || "Falha." }, { status: f ? 403 : /aguardando migração|does not exist/.test(e?.message||"")?503:500 }); }
}

export const GET = unidadeHandler(unidadeGET);
