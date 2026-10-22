import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { capacidade, cartaIndividuos, regrasAlerta } from "@/lib/cep";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"] as const;
const WRITE = ["PCP", "GERENTE", "QUALIDADE"] as const;
const MEDIR = ["PCP", "GERENTE", "QUALIDADE", "LIDER", "APONTADOR"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
type Row = Record<string, any>;
const db = () => sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]>; transaction: (q: unknown[]) => Promise<Row[][]> };
const q = (t: string, p: unknown[] = []) => db().query(t, p);
const num = (v: unknown, msg: string) => { const n = Number(typeof v === "string" ? v.replace(",", ".") : v); if (!Number.isFinite(n)) throw new Error(msg); return n; };

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...MEDIR]);
    const u = new URL(req.url);
    const id = clean(u.searchParams.get("id"), 40);
    if (id) {
      need(id, "Lote inválido.");
      const [lote] = await q(`select l.*,p.codigo produto_codigo,p.descricao produto_descricao,pl.amostragem,pl.amostragem_valor from qld_lotes_inspecao l join est_produtos p on p.id=l.produto_id join qld_planos pl on pl.id=l.plano_id where l.id=$1`, [id]);
      if (!lote) throw new Error("Lote de inspeção não encontrado.");
      const [carac, medicoes] = await Promise.all([
        q(`select * from qld_plano_caracteristicas where plano_id=$1 order by linha`, [lote.plano_id]),
        q(`select m.*,i.codigo instrumento from qld_medicoes m join qld_instrumentos i on i.id=m.instrumento_id where m.lote_inspecao_id=$1 order by m.linha,m.id`, [id]),
      ]);
      const cep = carac.map((c) => {
        const v = medicoes.filter((m) => m.linha === c.linha).map((m) => Number(m.valor));
        if (v.length < 2) return { linha: c.linha, n: v.length };
        const cap = capacidade(v, Number(c.tol_min), Number(c.tol_max));
        return { linha: c.linha, ...cap, carta: cartaIndividuos(v), alertas: regrasAlerta(v, cap.media, cap.sigmaCurto) };
      });
      return NextResponse.json({ lote, caracteristicas: carac, medicoes, cep }, { headers: { "Cache-Control": "no-store" } });
    }
    const [lotes, instrumentos, planos, ncs, ppm, produtos, locais] = await Promise.all([
      q(`select l.*,p.codigo produto_codigo,p.descricao produto_descricao from qld_lotes_inspecao l join est_produtos p on p.id=l.produto_id order by l.numero desc limit 200`),
      q(`select *,(calibracao_validade<current_date) vencido,(calibracao_validade-current_date) dias from qld_instrumentos order by ativo desc,calibracao_validade`),
      q(`select pl.*,p.codigo produto_codigo,p.descricao produto_descricao,(select json_agg(c order by c.linha) from qld_plano_caracteristicas c where c.plano_id=pl.id) caracteristicas from qld_planos pl join est_produtos p on p.id=pl.produto_id where pl.ativo order by p.codigo`),
      q(`select n.*,(select json_agg(a order by a.linha) from qld_acoes a where a.nc_id=n.id) acoes from qld_nao_conformidades n order by n.numero desc limit 100`),
      q(`select * from qld_ppm(6)`),
      q(`select id,codigo,descricao from est_produtos where ativo order by codigo limit 3000`),
      q(`select id,codigo from est_locais where ativo order by codigo`),
    ]);
    return NextResponse.json({ lotes, instrumentos, planos, ncs, ppm, produtos, locais }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : m || "Falha ao consultar qualidade." }, { status: forbidden ? 403 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const user = await requireRoles([...(acao === "MEDIR" || acao === "MEDIR_LOTE" ? MEDIR : WRITE)]);
    const uname = user.usuario;

    if (acao === "INSTRUMENTO") {
      const codigo = clean(b.codigo, 60), validade = clean(b.calibracaoValidade, 10);
      if (!codigo) throw new Error("Informe o código do instrumento.");
      if (!isDate(validade)) throw new Error("Informe a validade da calibração.");
      await q(`insert into qld_instrumentos(codigo,descricao,tipo,calibrado_em,calibracao_validade,criado_por) values($1,$2,$3,$4,$5,$6)
        on conflict(codigo) do update set descricao=excluded.descricao,tipo=excluded.tipo,calibrado_em=excluded.calibrado_em,calibracao_validade=excluded.calibracao_validade,ativo=true`,
        [codigo, clean(b.descricao), clean(b.tipo, 60), clean(b.calibradoEm, 10) || null, validade, uname]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "PLANO") {
      const produtoId = need(clean(b.produtoId, 40), "Selecione o produto.");
      const tipo = clean(b.tipo, 12).toUpperCase();
      if (!["RECEBIMENTO", "PROCESSO", "FINAL"].includes(tipo)) throw new Error("Tipo de plano inválido.");
      const am = clean(b.amostragem, 10).toUpperCase() || "TOTAL";
      if (!["TOTAL", "FIXA", "PERCENTUAL"].includes(am)) throw new Error("Amostragem inválida.");
      const car = Array.isArray(b.caracteristicas) ? b.caracteristicas : [];
      if (!car.length || car.length > 50) throw new Error("Informe de 1 a 50 características.");
      const itens = car.map((c: Row, i: number) => {
        const min = num(c.tolMin, `Característica ${i + 1}: tolerância mínima inválida.`), max = num(c.tolMax, `Característica ${i + 1}: tolerância máxima inválida.`);
        if (max < min) throw new Error(`Característica ${i + 1}: máximo menor que mínimo.`);
        if (!clean(c.nome, 120)) throw new Error(`Característica ${i + 1}: informe o nome.`);
        return { linha: i + 1, nome: clean(c.nome, 120), unidade: clean(c.unidade, 20), nominal: c.nominal === "" || c.nominal == null ? null : num(c.nominal, "Nominal inválido."), tol_min: min, tol_max: max, tipo_instrumento: clean(c.tipoInstrumento, 60), obrigatoria: c.obrigatoria !== false };
      });
      const d = db();
      const novo = crypto.randomUUID();
      await d.transaction([
        d.query(`update qld_planos set ativo=false where produto_id=$1 and tipo=$2 and processo=$3 and ativo`, [produtoId, tipo, clean(b.processo, 80)]),
        d.query(`insert into qld_planos(id,produto_id,tipo,processo,amostragem,amostragem_valor,criado_por) values($1,$2,$3,$4,$5,$6,$7)`, [novo, produtoId, tipo, clean(b.processo, 80), am, num(b.amostragemValor ?? 0, "Valor de amostragem inválido."), uname]),
        d.query(`insert into qld_plano_caracteristicas(plano_id,linha,nome,unidade,nominal,tol_min,tol_max,tipo_instrumento,obrigatoria) select $1::uuid,x.linha,x.nome,x.unidade,x.nominal,x.tol_min,x.tol_max,x.tipo_instrumento,x.obrigatoria from jsonb_to_recordset($2::jsonb) as x(linha int,nome text,unidade text,nominal numeric,tol_min numeric,tol_max numeric,tipo_instrumento text,obrigatoria boolean)`, [novo, JSON.stringify(itens)]),
      ] as unknown[]);
      return NextResponse.json({ ok: true, id: novo });
    }
    if (acao === "ABRIR_LOTE") {
      const [r] = await q(`select qld_abrir_lote($1::uuid,$2::numeric,$3,$4,$5::uuid,$6::uuid,$7) id`, [need(clean(b.planoId, 40), "Selecione o plano."), num(b.quantidade, "Quantidade inválida."), clean(b.referenciaTipo, 20) || "MANUAL", clean(b.referencia, 80), clean(b.loteEstoqueId, 40) || null, clean(b.localId, 40) || null, uname]);
      return NextResponse.json({ ok: true, id: r.id });
    }
    if (acao === "MEDIR_LOTE") {
      const linhas = Array.isArray(b.medicoes) ? b.medicoes : [];
      if (!linhas.length || linhas.length > 2000) throw new Error("Informe de 1 a 2000 medições.");
      const med = linhas.map((m: any) => ({ linha: Number(m.linha), valor: Number(String(m.valor).replace(",", ".")) }));
      if (med.some((m: any) => !Number.isInteger(m.linha) || m.linha < 1 || !Number.isFinite(m.valor))) throw new Error("Há medições com característica ou valor inválido.");
      const [r] = await q(`select qld_medir_lote($1::uuid,$2::jsonb,$3::uuid,$4) n`, [need(clean(b.loteId, 40), "Lote inválido."), JSON.stringify(med), need(clean(b.instrumentoId, 40), "Selecione o instrumento."), uname]);
      return NextResponse.json({ ok: true, importadas: Number(r.n) });
    }
    if (acao === "MEDIR") {
      const [r] = await q(`select qld_medir($1::uuid,$2::int,$3::numeric,$4::uuid,$5) conforme`, [need(clean(b.loteId, 40), "Lote inválido."), Number(b.linha), num(b.valor, "Valor inválido."), need(clean(b.instrumentoId, 40), "Selecione o instrumento."), uname]);
      return NextResponse.json({ ok: true, conforme: r.conforme });
    }
    if (acao === "DECIDIR") {
      const [r] = await q(`select qld_decidir($1::uuid,$2,$3,$4) status`, [need(clean(b.loteId, 40), "Lote inválido."), clean(b.decisao, 30).toUpperCase(), clean(b.motivo, 500), uname]);
      return NextResponse.json({ ok: true, status: r.status });
    }
    if (acao === "NC") {
      const descricao = clean(b.descricao, 2000);
      if (descricao.length < 5) throw new Error("Descreva a não conformidade.");
      const [r] = await q(`insert into qld_nao_conformidades(origem,lote_inspecao_id,produto_id,descricao,responsavel,prazo,criado_por) values($1,$2,$3,$4,$5,$6,$7) returning id`,
        [clean(b.origem, 20).toUpperCase() || "INTERNA", clean(b.loteId, 40) || null, clean(b.produtoId, 40) || null, descricao, clean(b.responsavel, 160), clean(b.prazo, 10) || null, uname]);
      return NextResponse.json({ ok: true, id: r.id });
    }
    if (acao === "NC_ANALISE") {
      const porques = (Array.isArray(b.porques) ? b.porques : []).map((p: unknown) => clean(p, 300)).filter(Boolean).slice(0, 5);
      const r = await q(`update qld_nao_conformidades set causa_raiz=$2,porques=$3::jsonb,status=case when status='ABERTA' then 'EM_ANALISE' else status end where id=$1 and status<>'ENCERRADA' returning id`, [need(clean(b.id, 40), "NC inválida."), clean(b.causaRaiz, 2000), JSON.stringify(porques)]);
      if (!r.length) throw new Error("NC não encontrada ou já encerrada.");
      return NextResponse.json({ ok: true });
    }
    if (acao === "NC_ACAO") {
      const id = need(clean(b.id, 40), "NC inválida.");
      const tipo = clean(b.tipo, 12).toUpperCase();
      if (!["CONTENCAO", "CORRETIVA", "PREVENTIVA"].includes(tipo)) throw new Error("Tipo de ação inválido.");
      if (clean(b.descricao, 1000).length < 3) throw new Error("Descreva a ação.");
      await q(`insert into qld_acoes(nc_id,linha,tipo,descricao,responsavel,prazo) select $1::uuid,coalesce(max(linha),0)+1,$2,$3,$4,$5 from qld_acoes where nc_id=$1::uuid`, [id, tipo, clean(b.descricao, 1000), clean(b.responsavel, 160), clean(b.prazo, 10) || null]);
      await q(`update qld_nao_conformidades set status='EM_ACAO' where id=$1 and status in ('ABERTA','EM_ANALISE')`, [id]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "NC_ACAO_CONCLUIR") {
      await q(`update qld_acoes set concluida_em=now() where nc_id=$1 and linha=$2 and concluida_em is null`, [need(clean(b.id, 40), "NC inválida."), Number(b.linha)]);
      return NextResponse.json({ ok: true });
    }
    if (acao === "NC_ENCERRAR") {
      await q(`select qld_encerrar_nc($1::uuid,$2)`, [need(clean(b.id, 40), "NC inválida."), uname]);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    const dup = m.includes("duplicate key");
    return NextResponse.json({ error: forbidden ? "Sem permissão." : dup ? "Registro duplicado." : m || "Falha ao gravar." }, { status: forbidden ? 403 : dup ? 409 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
