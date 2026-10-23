import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA", "QUALIDADE", "COMERCIAL"] as const;
const WRITE = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"] as const;
const REVISAO_ABRIR = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL"] as const;
const REVISAO_APLICAR = ["PCP", "GERENTE"] as const;
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: unknown, msg: string) => { const s = clean(v, 40); if (!isUuid(s)) throw new Error(msg); return s; };
const opt = (v: unknown, msg: string) => (clean(v, 40) ? need(v, msg) : null);
const num = (v: unknown, msg: string) => { const n = Number(String(v ?? "").replace(",", ".")); if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw new Error(msg); return n; };
const H = { "Cache-Control": "no-store" };
const erro = (e: unknown, fb: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || fb }, { status: proibido ? 403 : 400 });
};

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "indicadores";
    if (visao === "indicadores") {
      const [r] = await q("select wms_indicadores() i");
      return NextResponse.json({ indicadores: r.i }, { headers: H });
    }
    if (visao === "mapa") {
      const [setores, posicoes, semEndereco] = await Promise.all([
        q("select id,codigo,nome,tipo,responsavel,ativo from wms_setores order by tipo,codigo"),
        q("select * from wms_v_mapa order by setor,rua,modulo,nivel,codigo limit 2000"),
        q("select p.id,p.codigo,p.pedido,p.cliente,p.status,p.quantidade::float from pcp_pallets p where not exists(select 1 from wms_pallet_posicoes pp where pp.pallet_id=p.id) and p.status in('LIBERADO','EM_LIBERACAO','AGUARDANDO_INSPECAO','BLOQUEADO') order by p.criado_em desc limit 300"),
      ]);
      const locais = await q("select id,codigo from est_locais where ativo order by codigo");
      return NextResponse.json({ setores, posicoes, semEndereco, locais }, { headers: H });
    }
    if (visao === "pallets") {
      const busca = clean(url.searchParams.get("busca"), 60);
      const rows = await q(
        `select p.id,p.codigo,p.pedido,p.cliente,p.status,p.quantidade::float,p.jogos::float,e.id endereco_id,e.codigo endereco,s.nome setor,pp.desde,wms_pedido_em_revisao(p.pedido) em_revisao
         from pcp_pallets p left join wms_pallet_posicoes pp on pp.pallet_id=p.id left join est_enderecos e on e.id=pp.endereco_id left join wms_setores s on s.id=e.setor_id
         where ($1='' or p.codigo ilike '%'||$1||'%' or p.pedido ilike '%'||$1||'%' or p.cliente ilike '%'||$1||'%') order by p.atualizado_em desc limit 300`, [busca]);
      return NextResponse.json({ pallets: rows }, { headers: H });
    }
    if (visao === "sobras") {
      const f = { medida: clean(url.searchParams.get("medida"), 80), material: clean(url.searchParams.get("material"), 80), acabamento: clean(url.searchParams.get("acabamento"), 80) };
      const rows = await q(
        `select s.id,s.numero,s.descricao,s.medida,s.material,s.acabamento,s.mao,s.quantidade::float,s.origem_pedido,s.origem_revisao,s.status,s.reservada_pedido,s.custo::float,e.codigo endereco,s.criado_em
         from wms_sobras s left join est_enderecos e on e.id=s.endereco_id
         where ($1='' or lower(s.medida)=lower($1)) and ($2='' or lower(s.material)=lower($2)) and ($3='' or lower(s.acabamento)=lower($3))
         order by case s.status when 'DISPONIVEL' then 0 when 'RESERVADA' then 1 else 2 end,s.numero desc limit 500`, [f.medida, f.material, f.acabamento]);
      const enderecos = await q("select e.id,e.codigo from est_enderecos e join wms_setores s on s.id=e.setor_id where s.tipo='SOBRAS' and e.ativo order by e.codigo");
      return NextResponse.json({ sobras: rows, enderecos }, { headers: H });
    }
    if (visao === "revisoes") {
      const [paradas, historico, enderecos] = await Promise.all([
        q("select * from wms_v_revisoes_paradas order by vencida desc,dias_espera desc,pedido"),
        q("select id,pedido,numero,status,motivo,solicitante,responsavel,prazo,aberta_em,encerrada_em,encerrada_por,parecer from pcp_pedido_revisoes where status in('APLICADA','REJEITADA') order by encerrada_em desc limit 100"),
        q("select e.id,e.codigo from est_enderecos e join wms_setores s on s.id=e.setor_id where s.tipo='SOBRAS' and e.ativo order by e.codigo"),
      ]);
      return NextResponse.json({ paradas, historico, enderecos }, { headers: H });
    }
    if (visao === "revisao") {
      const id = need(url.searchParams.get("id"), "Revisão inválida.");
      const [cab] = await q("select * from pcp_pedido_revisoes where id=$1::uuid", [id]);
      const itens = await q("select i.linha,i.acao,i.descricao,i.medida,i.material,i.acabamento,i.mao,i.qtd_antes::float,i.qtd_depois::float,i.destino,i.sobra_id,e.codigo endereco_destino from pcp_pedido_revisao_itens i left join est_enderecos e on e.id=i.endereco_destino_id where i.revisao_id=$1::uuid order by i.linha", [id]);
      const sugestoes = await q(
        `select a.linha,s.id sobra_id,s.numero,s.quantidade::float,s.origem_pedido,e.codigo endereco from pcp_pedido_revisao_itens a
         join wms_sobras s on s.status='DISPONIVEL' and lower(s.medida)=lower(a.medida) and lower(s.material)=lower(a.material) and lower(s.acabamento)=lower(a.acabamento) and (a.mao='' or s.mao='' or s.mao=a.mao)
         left join est_enderecos e on e.id=s.endereco_id where a.revisao_id=$1::uuid and (a.acao='ACRESCENTA' or (a.acao='ALTERA' and a.qtd_depois>a.qtd_antes)) and a.medida<>'' order by a.linha,s.numero limit 100`, [id]);
      return NextResponse.json({ revisao: cab, itens, sugestoes }, { headers: H });
    }
    if (visao === "picking") {
      const [listas, pedidosProntos] = await Promise.all([
        q("select l.id,l.numero,l.pedido,l.status,l.criado_em,l.concluida_em,(select count(*) from wms_picking_itens i where i.lista_id=l.id)::int total,(select count(*) from wms_picking_itens i where i.lista_id=l.id and i.conferido)::int conferidos from wms_picking_listas l order by l.numero desc limit 100"),
        q("select p.pedido,count(*)::int pallets from pcp_pallets p where p.status='LIBERADO' and not exists(select 1 from exp_remessa_pallets rp where rp.pallet_id=p.id) and not exists(select 1 from wms_picking_itens i join wms_picking_listas l on l.id=i.lista_id where i.pallet_id=p.id and l.status in('ABERTA','EM_SEPARACAO','CONCLUIDA')) group by p.pedido order by p.pedido limit 200"),
      ]);
      return NextResponse.json({ listas, pedidosProntos }, { headers: H });
    }
    if (visao === "lista") {
      const id = need(url.searchParams.get("id"), "Lista inválida.");
      const [cab] = await q("select id,numero,pedido,status from wms_picking_listas where id=$1::uuid", [id]);
      const itens = await q("select i.ordem,p.codigo,p.cliente,p.quantidade::float,p.jogos::float,i.endereco_codigo,i.conferido,i.conferido_por,i.conferido_em from wms_picking_itens i join pcp_pallets p on p.id=i.pallet_id where i.lista_id=$1::uuid order by i.ordem", [id]);
      return NextResponse.json({ lista: cab, itens }, { headers: H });
    }
    if (visao === "recebimentos") {
      const [recs, produtos] = await Promise.all([
        q("select r.id,r.numero,r.documento,r.fornecedor,r.status,r.criado_em,(select count(*) from wms_recebimento_itens i where i.recebimento_id=r.id)::int itens from wms_recebimentos r order by r.numero desc limit 100"),
        q("select id,codigo,descricao from est_produtos order by codigo limit 1000"),
      ]);
      return NextResponse.json({ recebimentos: recs, produtos }, { headers: H });
    }
    if (visao === "recebimento") {
      const id = need(url.searchParams.get("id"), "Recebimento inválido.");
      const itens = await q("select i.linha,p.codigo,p.descricao,i.qtd_esperada::float,i.qtd_conferida::float from wms_recebimento_itens i join est_produtos p on p.id=i.produto_id where i.recebimento_id=$1::uuid order by i.linha", [id]);
      return NextResponse.json({ itens }, { headers: H });
    }
    if (visao === "etiquetas") {
      const pedido = clean(url.searchParams.get("pedido"), 60);
      const rows = await q("select id,tipo,referencia,pedido,revisao,valida,impressa_por,impressa_em from wms_etiquetas where ($1='' or pedido=$1) order by impressa_em desc limit 200", [pedido]);
      return NextResponse.json({ etiquetas: rows }, { headers: H });
    }
    if (visao === "fabrica") {
      const [setores, posicoes, itens, semEndereco] = await Promise.all([
        q("select id,codigo,nome,tipo from wms_setores where ativo order by tipo,codigo"),
        q("select m.id,m.codigo,m.rua,m.modulo,m.nivel,m.setor,m.tipo_posicao,m.bloqueado,m.capacidade_pallets,m.pallets::int from wms_v_mapa m where m.ativo order by m.setor,m.rua,m.modulo,m.nivel,m.codigo limit 3000"),
        q("select endereco_id,tipo,ref,codigo,descricao,quantidade::float,pedido,dias from wms_v_localizador_end order by endereco_id,tipo,codigo limit 5000"),
        q("select tipo,ref,codigo,descricao,quantidade::float,pedido,desde from wms_v_sem_endereco order by desde limit 300"),
      ]);
      return NextResponse.json({ setores, posicoes, itens, semEndereco }, { headers: H });
    }
    if (visao === "localizador") {
      const busca = clean(url.searchParams.get("busca"), 80);
      const rows = await q(
        `select tipo,ref,codigo,descricao,quantidade::float,pedido,dias,endereco,setor,setor_nome from wms_v_localizador_end
         where $1='' or descricao ilike '%'||$1||'%' or codigo ilike '%'||$1||'%' or pedido ilike '%'||$1||'%' or endereco ilike '%'||$1||'%'
         order by tipo,dias desc limit 300`, [busca]);
      return NextResponse.json({ itens: rows }, { headers: H });
    }
    if (visao === "rastro") {
      const pedido = clean(url.searchParams.get("pedido"), 60);
      const [pecas, datas, historico, paradas, setores] = await Promise.all([
        pedido ? q("select peca,setor,setor_nome,evento,quantidade::float,obs,por,em,dias_parada::float from pcp_v_rastro_atual where pedido=$1 order by setor,peca", [pedido]) : Promise.resolve([]),
        pedido ? q("select setor,setor_nome,inicio_real,fim_real,pecas::int,problemas::int from pcp_v_rastro_setor_datas where pedido=$1 order by inicio_real nulls last", [pedido]) : Promise.resolve([]),
        pedido ? q("select l.peca,s.nome setor,l.evento,l.quantidade::float,l.obs,l.por,l.em from pcp_rastro_leituras l join wms_setores s on s.id=l.setor_id where l.pedido=$1 order by l.em desc,l.id desc limit 200", [pedido]) : Promise.resolve([]),
        q("select pedido,peca,setor_nome,evento,obs,por,em,dias_parada::float from pcp_v_rastro_paradas order by dias_parada desc limit 100"),
        q("select codigo,nome from wms_setores where ativo order by tipo,codigo"),
      ]);
      return NextResponse.json({ pecas, datas, historico, paradas, setores }, { headers: H });
    }
    if (visao === "layout") {
      const [pl] = await q("select id,codigo,nome,largura,altura from wms_plantas where codigo='FABRICA'");
      const blocos = pl ? await q("select id,tipo,nome,setor_id,endereco_id,etapa,x::float,y::float,w::float,h::float,cor from wms_layout_blocos where planta_id=$1::uuid order by tipo,nome", [pl.id]) : [];
      const [setores, enderecos] = await Promise.all([
        q("select id,codigo,nome,tipo from wms_setores where ativo order by tipo,codigo"),
        q("select e.id,e.codigo,s.codigo setor from est_enderecos e left join wms_setores s on s.id=e.setor_id where e.ativo order by e.codigo limit 3000"),
      ]);
      return NextResponse.json({ planta: pl ?? null, blocos, setores, enderecos }, { headers: H });
    }
    if (visao === "pedido-pecas") {
      const pedido = clean(url.searchParams.get("pedido"), 60);
      const rows = pedido ? await q(
        `select p.item,p.produto,p.descricao,p.medida,p.acabamento,p.cor,p.quantidade::float
         from pcp_produtos p where p.pedido=$1 and p.programacao_id=(select programacao_id from pcp_produtos where pedido=$1 order by programacao_id desc limit 1)
         order by p.item,p.produto limit 500`, [pedido]) : [];
      return NextResponse.json({ pecas: rows }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar o WMS."); }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const papeis: readonly string[] = acao === "REVISAO_ABRIR" ? REVISAO_ABRIR : acao === "REVISAO_APLICAR" ? REVISAO_APLICAR : acao === "REVISAO_AVANCAR" || acao === "REVISAO_DESTINO" ? ["PCP", "GERENTE", "ENCARREGADO"] : WRITE;
    const user = await requireRoles([...papeis] as never);
    const ator = user.usuario;
    let resp: Record<string, unknown> = { ok: true };
    if (acao === "SETOR_NOVO") {
      if (!["PCP", "GERENTE"].includes(user.perfil)) throw new Error("SEM_PERMISSAO");
      const tipo = clean(b.tipo, 14).toUpperCase();
      await q("insert into wms_setores(codigo,nome,tipo,responsavel,criado_por) values($1,$2,$3,$4,$5)", [clean(b.codigo, 30).toUpperCase(), clean(b.nome, 120), tipo, clean(b.responsavel, 160), ator]);
    } else if (acao === "ENDERECO_NOVO") {
      const codigo = clean(b.codigo, 40).toUpperCase();
      if (!codigo) throw new Error("Informe o código do endereço.");
      const cap = clean(b.capacidadePallets, 6) ? Math.floor(num(b.capacidadePallets, "Capacidade de pallets inválida.")) : null;
      await q("insert into est_enderecos(local_id,codigo,descricao,criado_por,setor_id,rua,modulo,nivel,tipo_posicao,capacidade_pallets) values($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9,$10)",
        [need(b.localId, "Selecione o depósito."), codigo, clean(b.descricao, 160), ator, need(b.setorId, "Selecione o setor."), clean(b.rua, 20).toUpperCase(), clean(b.modulo, 20).toUpperCase(), clean(b.nivel, 20).toUpperCase(), ["PALLET", "PRATELEIRA", "CHAO", "DOCA"].includes(clean(b.tipoPosicao, 12)) ? clean(b.tipoPosicao, 12) : "PRATELEIRA", cap]);
    } else if (acao === "ENDERECO_BLOQUEAR") {
      const bloq = b.bloqueado === true;
      if (bloq && !clean(b.motivo, 200)) throw new Error("Informe o motivo do bloqueio.");
      await q("update est_enderecos set bloqueado=$2,motivo_bloqueio=$3 where id=$1::uuid", [need(b.id, "Endereço inválido."), bloq, bloq ? clean(b.motivo, 200) : ""]);
    } else if (acao === "PALLET_ALOCAR") {
      await q("select wms_pallet_alocar($1::uuid,$2::uuid,$3,$4)", [need(b.palletId, "Pallet inválido."), need(b.enderecoId, "Endereço inválido."), ator, clean(b.motivo, 200)]);
    } else if (acao === "PALLET_SUGERIR") {
      const [r] = await q("select e.id,e.codigo from est_enderecos e where e.id=wms_sugerir_endereco($1)", [clean(b.setorTipo, 14).toUpperCase()]);
      resp = { ok: true, endereco: r || null };
    } else if (acao === "PALLET_RETIRAR") {
      await q("select wms_pallet_retirar($1::uuid,$2,$3)", [need(b.palletId, "Pallet inválido."), ator, clean(b.motivo, 200)]);
    } else if (acao === "REVISAO_ABRIR") {
      const itens = Array.isArray(b.itens) ? b.itens.slice(0, 200) : [];
      const [r] = await q("select wms_revisao_abrir($1,$2,$3,$4::date,$5::jsonb,$6) id", [clean(b.pedido, 60), clean(b.motivo, 1000), clean(b.solicitante, 160), clean(b.prazo, 10), JSON.stringify(itens), ator]);
      resp = { ok: true, id: r.id };
    } else if (acao === "REVISAO_AVANCAR") {
      await q("select wms_revisao_avancar($1::uuid,$2,$3,$4,$5)", [need(b.id, "Revisão inválida."), clean(b.status, 20).toUpperCase(), clean(b.responsavel, 160), clean(b.parecer, 1000), ator]);
    } else if (acao === "REVISAO_DESTINO") {
      await q("select wms_revisao_destino($1::uuid,$2::int,$3,$4::uuid,$5)", [need(b.id, "Revisão inválida."), Math.floor(num(b.linha, "Linha inválida.")), clean(b.destino, 14).toUpperCase(), opt(b.enderecoId, "Endereço inválido."), ator]);
    } else if (acao === "REVISAO_APLICAR") {
      const [r] = await q("select wms_revisao_aplicar($1::uuid,$2) r", [need(b.id, "Revisão inválida."), ator]);
      resp = { ok: true, resultado: r.r };
    } else if (acao === "SOBRA_RESERVAR") {
      await q("select wms_sobra_reservar($1::uuid,$2,$3)", [need(b.id, "Sobra inválida."), clean(b.pedido, 60), ator]);
    } else if (acao === "SOBRA_BAIXAR") {
      await q("select wms_sobra_baixar($1::uuid,$2,$3)", [need(b.id, "Sobra inválida."), clean(b.status, 12).toUpperCase(), ator]);
    } else if (acao === "SOBRA_CUSTO") {
      const custo = Number(String(b.custo ?? "").replace(",", "."));
      if (!Number.isFinite(custo) || custo < 0 || custo > 1e9) throw new Error("Custo inválido.");
      await q("update wms_sobras set custo=$2,atualizado_em=now() where id=$1::uuid", [need(b.id, "Sobra inválida."), custo]);
    } else if (acao === "SOBRA_CRIAR") {
      const qtdS = num(b.quantidade, "Quantidade inválida.");
      await q("insert into wms_sobras(descricao,medida,material,acabamento,mao,quantidade,origem_pedido,endereco_id,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9)",
        [clean(b.descricao, 300) || "Retalho", clean(b.medida, 80), clean(b.material, 80), clean(b.acabamento, 80), clean(b.mao, 10), qtdS, clean(b.origem, 60), opt(b.enderecoId, "Endereço inválido."), ator]);
    } else if (acao === "LAYOUT_SALVAR") {
      if (!["PCP", "GERENTE"].includes(user.perfil)) throw new Error("SEM_PERMISSAO");
      const blocos = Array.isArray(b.blocos) ? b.blocos.slice(0, 400) : [];
      const [r] = await q("select wms_layout_salvar('FABRICA',$1::jsonb,$2) n", [JSON.stringify(blocos), ator]);
      resp = { ok: true, blocos: r.n };
    } else if (acao === "MOVER") {
      const [r] = await q("select wms_mover($1,$2,$3,$4,$5,$6) r", [clean(b.tipo, 8), clean(b.ref, 120), clean(b.endereco, 40), ator, clean(b.pedido, 60), clean(b.obs, 200)]);
      resp = { ok: true, resultado: r.r };
    } else if (acao === "RASTRO_LER") {
      const [r] = await q("select pcp_rastro_ler($1,$2,$3,$4,$5,$6,$7) id", [clean(b.pedido, 60), clean(b.peca, 120), clean(b.setor, 30), clean(b.evento, 10), Number(String(b.quantidade ?? 1).replace(",", ".")) || 1, clean(b.obs, 300), ator]);
      resp = { ok: true, id: r.id };
    } else if (acao === "PICKING_CRIAR") {
      const [r] = await q("select wms_picking_criar($1,$2::uuid,$3) id", [clean(b.pedido, 60), opt(b.remessaId, "Remessa inválida."), ator]);
      resp = { ok: true, id: r.id };
    } else if (acao === "PICKING_CONFERIR") {
      const [r] = await q("select wms_picking_conferir($1::uuid,$2,$3) r", [need(b.id, "Lista inválida."), clean(b.codigo, 60), ator]);
      resp = { ok: true, ...r.r };
    } else if (acao === "PICKING_CANCELAR") {
      await q("update wms_picking_listas set status='CANCELADA' where id=$1::uuid and status in('ABERTA','EM_SEPARACAO')", [need(b.id, "Lista inválida.")]);
    } else if (acao === "RECEBIMENTO_NOVO") {
      const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 200);
      if (!itens.length) throw new Error("Informe ao menos um item.");
      const [r] = await q("insert into wms_recebimentos(documento,fornecedor,criado_por) values($1,$2,$3) returning id", [clean(b.documento, 60), clean(b.fornecedor, 200), ator]);
      let linha = 0;
      for (const it of itens) await q("insert into wms_recebimento_itens(recebimento_id,linha,produto_id,qtd_esperada) values($1::uuid,$2,$3::uuid,$4)", [r.id, ++linha, need(it.produtoId, `Linha ${linha}: produto inválido.`), num(it.quantidade, `Linha ${linha}: quantidade inválida.`)]);
      resp = { ok: true, id: r.id };
    } else if (acao === "RECEBIMENTO_CONFERIR") {
      const c = Number(String(b.quantidade ?? "").replace(",", "."));
      if (!Number.isFinite(c) || c < 0 || c > 1e9) throw new Error("Quantidade inválida.");
      await q("update wms_recebimento_itens set qtd_conferida=$3 where recebimento_id=$1::uuid and linha=$2 and exists(select 1 from wms_recebimentos r where r.id=recebimento_id and r.status='ABERTO')", [need(b.id, "Recebimento inválido."), Math.floor(num(b.linha, "Linha inválida.")), c]);
    } else if (acao === "RECEBIMENTO_FECHAR") {
      const [r] = await q("select wms_recebimento_fechar($1::uuid,$2) s", [need(b.id, "Recebimento inválido."), ator]);
      resp = { ok: true, status: r.s };
    } else if (acao === "ETIQUETA_REGISTRAR") {
      const tipo = clean(b.tipo, 10).toUpperCase();
      if (!["PALLET", "PECA", "SOBRA", "LISTA"].includes(tipo)) throw new Error("Tipo de etiqueta inválido.");
      const rev = clean(b.revisao, 6) ? Math.floor(Number(b.revisao)) : null;
      await q("insert into wms_etiquetas(tipo,referencia,pedido,revisao,conteudo,impressa_por) values($1,$2,$3,$4,$5::jsonb,$6)", [tipo, clean(b.referencia, 80), clean(b.pedido, 60), Number.isFinite(rev as number) ? rev : null, JSON.stringify(b.conteudo && typeof b.conteudo === "object" ? b.conteudo : {}), ator]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json(resp, { headers: H });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/duplicate key/.test(m)) return NextResponse.json({ error: "Registro já existe." }, { status: 409 });
    return erro(e, "Falha ao gravar.");
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
