import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { criarProvedor } from "@/lib/fiscal/provedor";
import { gerarBlocoK, type OpK } from "@/lib/fiscal/sped-k";
import { conferirFiscalEntrada, extrairFiscalNfe } from "@/lib/fiscal/entrada";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isComp = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
const num = (v: unknown, msg: string) => { const n = Number(String(v ?? "").replace(",", ".")); if (!Number.isFinite(n) || n < 0) throw new Error(msg); return n; };
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const uf = (v: unknown) => { const s = clean(v, 2).toUpperCase(); if (!/^[A-Z]{2}$/.test(s)) throw new Error("UF inválida."); return s; };
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function proxMes(comp: string) { const [y, m] = comp.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; }

async function spedK(comp: string) {
  const ini = `${comp}-01`, prox = proxMes(comp);
  const ultimo = new Date(new Date(`${prox}T12:00:00Z`).getTime() - 86400_000).toISOString().slice(0, 10);
  const ofs = await q(`select o.id,o.numero,p.codigo,o.concluido_em,min(m.criado_em) ini,max(m.criado_em) fim,sum(m.quantidade_base) qtd
    from erp_ordens_fabricacao o join est_produtos p on p.id=o.produto_estoque_id join est_movimentos m on m.of_id=o.id and m.produto_id=o.produto_estoque_id and m.tipo='ENTRADA' and m.estorno_de is null
    where m.criado_em>=$1::date and m.criado_em<$2::date group by o.id,o.numero,p.codigo,o.concluido_em order by o.numero`, [ini, prox]);
  const ids = ofs.map((o) => o.id);
  const ins = ids.length ? await q(`select m.of_id,p.codigo,min(m.criado_em) dt,sum(case when m.tipo='SAIDA' and m.estorno_de is null then m.quantidade_base when m.tipo='ENTRADA' and m.estorno_de is not null then -m.quantidade_base else 0 end) qtd
    from est_movimentos m join est_produtos p on p.id=m.produto_id join erp_ordens_fabricacao o on o.id=m.of_id where m.of_id=any($1::uuid[]) and m.produto_id<>o.produto_estoque_id group by m.of_id,p.codigo`, [ids]) : [];
  const estoque = await q(`select p.codigo,sum(s.fisico) qtd from est_saldos s join est_produtos p on p.id=s.produto_id group by p.codigo having sum(s.fisico)>0 order by p.codigo`);
  const d10 = (v: unknown) => new Date(v as string).toISOString().slice(0, 10);
  const ops: OpK[] = ofs.map((o) => ({ docOp: `OF-${o.numero}`, codItem: o.codigo, dtIni: d10(o.ini), dtFin: o.concluido_em ? d10(o.concluido_em) : d10(o.fim), qtdEnc: Number(o.qtd),
    insumos: ins.filter((i) => i.of_id === o.id && Number(i.qtd) > 0).map((i) => ({ data: d10(i.dt), codItem: i.codigo, qtd: Number(i.qtd) })) }));
  return gerarBlocoK({ ini, fim: ultimo, ops, estoque: estoque.map((e) => ({ codItem: e.codigo, qtd: Number(e.qtd) })) });
}

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const exp = url.searchParams.get("export"), comp = url.searchParams.get("competencia") || "";
    if (exp) {
      if (!isComp(comp)) throw new Error("Competência inválida (AAAA-MM).");
      if (exp === "sped-k") return new Response(await spedK(comp), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="bloco-k-${comp}.txt"`, "Cache-Control": "no-store" } });
      if (exp === "csv") {
        const rows = await q(`select f.numero,f.chave,f.status,f.total,f.tributos,f.autorizado_em,f.payload->'destinatario'->>'razao_social' cliente from fis_documentos f where to_char(f.criado_em at time zone 'America/Sao_Paulo','YYYY-MM')=$1 order by f.criado_em`, [comp]);
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const linhas = ["numero;chave;status;cliente;total;ICMS;IPI;IBS;CBS"].concat(rows.map((r) => [r.numero, r.chave, r.status, r.cliente, Number(r.total).toFixed(2).replace(".", ","), ...["ICMS", "IPI", "IBS", "CBS"].map((t) => Number(r.tributos?.[t] ?? 0).toFixed(2).replace(".", ","))].map(esc).join(";")));
        return new Response("﻿" + linhas.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="documentos-${comp}.csv"`, "Cache-Control": "no-store" } });
      }
      throw new Error("Exportação inválida.");
    }
    const ap = url.searchParams.get("apuracao");
    if (ap) {
      if (!isComp(ap)) throw new Error("Competência inválida (AAAA-MM).");
      return NextResponse.json({ apuracao: await q(`select * from fis_apurar($1)`, [ap]), creditos: await q(`select * from fis_creditos where competencia=$1 order by criado_em desc`, [ap]) }, { headers: { "Cache-Control": "no-store" } });
    }
    const docId = url.searchParams.get("doc");
    if (docId) { const [d] = await q(`select * from fis_documentos where id=$1`, [need(docId, "Documento inválido.")]); if (!d) throw new Error("Documento não encontrado."); return NextResponse.json({ doc: d }, { headers: { "Cache-Control": "no-store" } }); }
    const [emitente, documentos, eventos, regras, cfops, produtos, clientes, provedores, parametros] = await Promise.all([
      q(`select * from fis_emitente`),
      q(`select f.id,f.evento_id,f.status,f.numero,f.chave,f.total,f.tributos,f.pendencias,f.erro,f.criado_em,f.payload->'destinatario'->>'razao_social' cliente,f.payload->>'remessa' remessa from fis_documentos f order by f.criado_em desc limit 200`),
      q(`select e.id,e.criado_em,r.numero remessa,c.razao_social cliente,(select sum((i->>'valor')::numeric) from jsonb_array_elements(e.payload->'itens') i) total from exp_eventos_faturamento e join exp_remessas r on r.id=e.remessa_id join crm_clientes c on c.id=r.cliente_id where e.status='PRONTO' and not exists(select 1 from fis_documentos d where d.evento_id=e.id) order by e.criado_em`),
      q(`select * from fis_regras order by ativo desc,operacao,vigencia_inicio desc limit 300`),
      q(`select * from fis_cfop order by codigo`),
      q(`select p.id,p.codigo,p.descricao,f.ncm,f.cest,f.origem,f.unidade_trib,f.classe_ibs_cbs from est_produtos p left join fis_produto_fiscal f on f.produto_id=p.id where p.ativo order by (f.ncm is null) desc,p.codigo limit 3000`),
      q(`select id,razao_social,documento,uf,ie,regime_tributario,contribuinte_icms from crm_clientes where ativo order by razao_social limit 2000`),
      q(`select id,nome,adaptador,ambiente,segredo_ref,ativo from fis_provedores order by nome`),
      q(`select * from fis_parametros order by chave,vigencia_inicio desc`),
    ]);
    return NextResponse.json({ emitente: emitente[0] ?? null, documentos, eventos, regras, cfops, produtos, clientes, provedores, parametros }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha ao consultar o fiscal." }, { status: forbidden ? 403 : /does not exist/.test(m) ? 503 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...READ]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const ator = user.usuario;
    if (acao === "EMITENTE") {
      const cnpj = digits(b.cnpj);
      if (cnpj.length !== 14) throw new Error("CNPJ do emitente inválido.");
      const regime = clean(b.regime, 10).toUpperCase();
      await q(`insert into fis_emitente(singleton,razao_social,cnpj,ie,uf,regime,atualizado_por) values(true,$1,$2,$3,$4,$5,$6) on conflict(singleton) do update set razao_social=excluded.razao_social,cnpj=excluded.cnpj,ie=excluded.ie,uf=excluded.uf,regime=excluded.regime,atualizado_por=excluded.atualizado_por,atualizado_em=now()`,
        [clean(b.razaoSocial, 240) || (() => { throw new Error("Informe a razão social."); })(), cnpj, clean(b.ie, 30), uf(b.uf), regime, ator]);
    } else if (acao === "CLIENTE_FISCAL") {
      const regime = clean(b.regime, 10).toUpperCase();
      if (!["SIMPLES", "PRESUMIDO", "REAL"].includes(regime)) throw new Error("Regime inválido.");
      await q(`update crm_clientes set uf=$2,ie=$3,regime_tributario=$4,contribuinte_icms=$5,atualizado_por=$6,atualizado_em=now() where id=$1`, [need(clean(b.clienteId, 40), "Cliente inválido."), uf(b.uf), clean(b.ie, 30), regime, b.contribuinte !== false, ator]);
    } else if (acao === "PRODUTO_FISCAL") {
      const ncm = digits(b.ncm);
      if (ncm.length !== 8) throw new Error("NCM deve ter 8 dígitos.");
      const cest = digits(b.cest);
      if (cest && cest.length !== 7) throw new Error("CEST deve ter 7 dígitos.");
      await q(`insert into fis_produto_fiscal(produto_id,ncm,cest,origem,unidade_trib,classe_ibs_cbs,atualizado_por) values($1,$2,$3,$4,$5,$6,$7) on conflict(produto_id) do update set ncm=excluded.ncm,cest=excluded.cest,origem=excluded.origem,unidade_trib=excluded.unidade_trib,classe_ibs_cbs=excluded.classe_ibs_cbs,atualizado_por=excluded.atualizado_por,atualizado_em=now()`,
        [need(clean(b.produtoId, 40), "Produto inválido."), ncm, cest || null, Math.round(num(b.origem ?? 0, "Origem inválida.")), clean(b.unidade, 6) || "UN", clean(b.classeIbsCbs, 10), ator]);
    } else if (acao === "CFOP") {
      const cod = digits(b.codigo);
      if (cod.length !== 4) throw new Error("CFOP deve ter 4 dígitos.");
      const sentido = clean(b.sentido, 7).toUpperCase();
      await q(`insert into fis_cfop(codigo,descricao,sentido) values($1,$2,$3) on conflict(codigo) do update set descricao=excluded.descricao,sentido=excluded.sentido`, [cod, clean(b.descricao, 240) || cod, sentido]);
    } else if (acao === "REGRA") {
      const ini = clean(b.vigenciaInicio, 10), fim = clean(b.vigenciaFim, 10);
      if (!isDate(ini) || (fim && !isDate(fim))) throw new Error("Vigência inválida.");
      const tributos = (Array.isArray(b.tributos) ? b.tributos : []).map((t: Row) => ({ tributo: clean(t.tributo, 10).toUpperCase(), cst: clean(t.cst, 4), aliquota: num(t.aliquota, "Alíquota inválida."), reducao_base: num(t.reducaoBase ?? 0, "Redução inválida.") }));
      for (const t of tributos) if (!t.tributo || t.aliquota > 100 || t.reducao_base > 100) throw new Error("Tributo/alíquota inválidos.");
      await q(`insert into fis_regras(descricao,operacao,uf_origem,uf_destino,ncm_prefixo,regime,cfop,tributos,ibs_cst,ibs_classe,ibs_aliquota,cbs_aliquota,vigencia_inicio,vigencia_fim,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)`,
        [clean(b.descricao, 200), clean(b.operacao, 30).toUpperCase() || "VENDA", clean(b.ufOrigem, 2) ? uf(b.ufOrigem) : null, clean(b.ufDestino, 2) ? uf(b.ufDestino) : null, digits(b.ncmPrefixo).slice(0, 8), clean(b.regime, 10) ? clean(b.regime, 10).toUpperCase() : null,
         digits(b.cfop), JSON.stringify(tributos), clean(b.ibsCst, 10), clean(b.ibsClasse, 10), num(b.ibsAliquota ?? 0, "Alíquota IBS inválida."), num(b.cbsAliquota ?? 0, "Alíquota CBS inválida."), ini, fim || null, ator]);
    } else if (acao === "REGRA_DESATIVAR") {
      await q(`update fis_regras set ativo=false where id=$1`, [need(clean(b.regraId, 40), "Regra inválida.")]);
    } else if (acao === "PARAMETRO") {
      const ini = clean(b.vigenciaInicio, 10);
      if (!isDate(ini)) throw new Error("Vigência inválida.");
      await q(`insert into fis_parametros(chave,vigencia_inicio,valor,criado_por) values($1,$2,$3,$4)`, [clean(b.chave, 60).toUpperCase(), ini, clean(b.valor, 200), ator]);
    } else if (acao === "PROVEDOR") {
      await q(`insert into fis_provedores(nome,adaptador,ambiente,segredo_ref,criado_por) values($1,$2,$3,$4,$5)`, [clean(b.nome, 120), clean(b.adaptador, 40).toUpperCase(), clean(b.ambiente, 12).toUpperCase() || "HOMOLOGACAO", clean(b.segredoRef, 80), ator]);
    } else if (acao === "MONTAR") {
      const data = clean(b.data, 10) || hoje();
      if (!isDate(data)) throw new Error("Data inválida.");
      const [r] = await q(`select fis_montar_nfe($1::uuid,$2::date,$3) id`, [need(clean(b.eventoId, 40), "Evento inválido."), data, ator]);
      return NextResponse.json({ ok: true, id: r.id });
    } else if (acao === "EMITIR") {
      const docId = need(clean(b.docId, 40), "Documento inválido.");
      const [d] = await q(`select * from fis_documentos where id=$1`, [docId]);
      if (!d) throw new Error("Documento não encontrado.");
      if (d.status !== "PRONTO") throw new Error(`Documento ${d.status} não pode ser emitido.`);
      const [prov] = b.provedorId ? await q(`select * from fis_provedores where id=$1 and ativo`, [need(clean(b.provedorId, 40), "Provedor inválido.")]) : await q(`select * from fis_provedores where ativo order by criado_em limit 1`);
      if (!prov) throw new Error("Cadastre e ative um provedor fiscal antes de emitir.");
      const [{ prox }] = await q(`select coalesce(max(nullif(numero,'')::int),0)+1 prox from fis_documentos`);
      const adapter = criarProvedor(prov.adaptador, prov.ambiente, () => Number(prox));
      await q(`select fis_mudar_status($1::uuid,'ENVIADO',null,null,null,null,$2::uuid,$3)`, [docId, prov.id, ator]);
      const r = await adapter.emitir({ id: docId, tipo: d.tipo, payload: d.payload, total: Number(d.total) });
      if (r.status === "AUTORIZADO") await q(`select fis_mudar_status($1::uuid,'AUTORIZADO',$2,$3,$4,null,$5::uuid,$6)`, [docId, r.chave, r.numero, r.protocolo, prov.id, ator]);
      else await q(`select fis_mudar_status($1::uuid,'REJEITADO',null,null,null,$2,$3::uuid,$4)`, [docId, r.erro, prov.id, ator]);
      return NextResponse.json({ ok: true, retorno: r });
    } else if (acao === "CANCELAR") {
      const docId = need(clean(b.docId, 40), "Documento inválido."), just = clean(b.justificativa, 500);
      const [d] = await q(`select d.*,p.adaptador,p.ambiente from fis_documentos d left join fis_provedores p on p.id=d.provedor_id where d.id=$1`, [docId]);
      if (!d || d.status !== "AUTORIZADO") throw new Error("Somente documento autorizado pode ser cancelado.");
      if (just.length < 15) throw new Error("Justificativa deve ter ao menos 15 caracteres.");
      const adapter = criarProvedor(d.adaptador, d.ambiente, () => 0);
      const r = await adapter.cancelar(d.chave, just);
      if (!r.ok) throw new Error(r.erro || "Provedor recusou o cancelamento.");
      await q(`select fis_mudar_status($1::uuid,'CANCELADO',null,null,$2,$3,null,$4)`, [docId, r.protocolo ?? null, just, ator]);
    } else if (acao === "CREDITO") {
      const comp = clean(b.competencia, 7);
      if (!isComp(comp)) throw new Error("Competência inválida.");
      await q(`insert into fis_creditos(competencia,tributo,valor,origem,documento,criado_por) values($1,$2,$3,$4,$5,$6)`, [comp, clean(b.tributo, 10).toUpperCase(), num(b.valor, "Valor inválido."), clean(b.origem, 120), clean(b.documento, 80), ator]);
    } else if (acao === "XML_FISCAL") {
      const itens = extrairFiscalNfe(String(b.xml ?? ""));
      if (!itens.length) throw new Error("Nenhum item encontrado no XML.");
      const cad = new Map<string, string>((await q(`select p.codigo,f.ncm from fis_produto_fiscal f join est_produtos p on p.id=f.produto_id`)).map((r) => [r.codigo, r.ncm]));
      const cf = new Set<string>((await q(`select codigo from fis_cfop where sentido='ENTRADA'`)).map((r) => r.codigo));
      return NextResponse.json({ ok: true, itens: itens.length, divergencias: conferirFiscalEntrada(itens, cad, cf) });
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /duplicate key/.test(m) ? "Registro duplicado." : m || "Falha ao gravar." }, { status: forbidden ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
