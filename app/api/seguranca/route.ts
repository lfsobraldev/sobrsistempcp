import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const LEITURA = ["PCP", "GERENTE", "ENCARREGADO"] as const;
const ADMIN_CARGOS = ["PCP", "DIRETOR", "ADMINISTRADOR"];
const MODULOS = ["COMPRAS", "VENDAS", "FINANCEIRO", "ESTOQUE", "WMS", "PRODUCAO", "QUALIDADE", "RH", "FISCAL", "PROJETOS"];
const ACOES = ["VER", "CRIAR", "EDITAR", "APROVAR", "CANCELAR", "EXPORTAR"];
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: unknown, msg: string) => { const s = clean(v, 40); if (!isUuid(s)) throw new Error(msg); return s; };
const valor = (v: unknown, msg: string, vazioNulo = false) => {
  if (vazioNulo && (v === "" || v == null)) return null;
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error(msg);
  return n;
};
const dia = (v: unknown, msg: string) => { const s = clean(v, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error(msg); return s; };
const H = { "Cache-Control": "no-store" };
const erro = (e: unknown, fb: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || fb }, { status: proibido ? 403 : 400 });
};

async function unidadeGET(req: Request) {
  try {
    const user = await requireRoles([...LEITURA]);
    const cargo = user.cargo || user.perfil;
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "pendentes";
    if (visao === "contexto") {
      const [cfg] = await q("select valor from erp_config where chave='empresa.nome'").catch(() => [{ valor: "Famossul" }]);
      return NextResponse.json({ cargo, nivel: Number((await q("select erp_cargo_nivel($1) n", [cargo]))[0].n), admin: ADMIN_CARGOS.includes(cargo), empresa: cfg?.valor || "Famossul", modulos: MODULOS, acoes: ACOES }, { headers: H });
    }
    if (visao === "pendentes") {
      const todas = await q("select * from erp_v_aprovacoes_pendentes order by dias desc,numero");
      const nivel = Number((await q("select erp_cargo_nivel($1) n", [cargo]))[0].n);
      const deleg = Number((await q("select coalesce(max(erp_cargo_nivel(cargo_delegado)),0) n from erp_delegacoes where ativo and para_usuario=$1 and current_date between inicio and fim", [user.usuario]))[0].n);
      const lista = await Promise.all(todas.map(async (a) => ({ ...a, valor: Number(a.valor), possoDecidir: a.solicitante !== user.usuario && Math.max(nivel, deleg) >= Number((await q("select erp_cargo_nivel($1) n", [a.cargo_exigido]))[0].n) })));
      const minhas = await q("select id,numero,modulo,tipo_documento,documento_ref,valor::float,status,nivel_atual,niveis_total,criado_em,encerrado_em from erp_aprovacoes where solicitante=$1 order by numero desc limit 100", [user.usuario]);
      const decididas = await q("select a.numero,a.modulo,a.tipo_documento,a.documento_ref,a.valor::float,a.status,e.nivel,e.status etapa,e.decidido_por,e.decidido_em,e.parecer from erp_aprovacao_etapas e join erp_aprovacoes a on a.id=e.aprovacao_id where e.status<>'PENDENTE' order by e.decidido_em desc limit 100");
      return NextResponse.json({ pendentes: lista, minhas, decididas }, { headers: H });
    }
    if (visao === "aprovacao") {
      const id = need(url.searchParams.get("id"), "Aprovação inválida.");
      const etapas = await q("select nivel,cargo_exigido,status,decidido_por,decidido_em,parecer from erp_aprovacao_etapas where aprovacao_id=$1::uuid order by nivel", [id]);
      return NextResponse.json({ etapas }, { headers: H });
    }
    if (visao === "matriz") {
      const [cargos, linhas] = await Promise.all([
        q("select cargo,nivel,descricao from erp_cargos_nivel order by nivel,cargo"),
        q("select cargo,modulo,acao,permitido,limite_valor::float from erp_autorizacoes order by cargo,modulo,acao"),
      ]);
      return NextResponse.json({ cargos, linhas, modulos: MODULOS, acoes: ACOES }, { headers: H });
    }
    if (visao === "regras") {
      const regras = await q("select id,modulo,tipo_documento,valor_min::float,valor_max::float,nivel,cargo_aprovador,ativo from erp_aprovacao_regras order by modulo,tipo_documento,valor_min,nivel");
      const cargos = await q("select cargo from erp_cargos_nivel where nivel>=3 order by nivel");
      return NextResponse.json({ regras, cargos }, { headers: H });
    }
    if (visao === "delegacoes") {
      const [deleg, cargos] = await Promise.all([
        q("select id,de_usuario,para_usuario,cargo_delegado,inicio,fim,ativo from erp_delegacoes order by inicio desc limit 100"),
        q("select cargo from erp_cargos_nivel where nivel>=4 order by nivel"),
      ]);
      return NextResponse.json({ delegacoes: deleg, cargos }, { headers: H });
    }
    if (visao === "auditoria") {
      if (!["PCP", "GERENTE"].includes(user.perfil)) throw new Error("SEM_PERMISSAO");
      const entidade = clean(url.searchParams.get("entidade"), 80), ator = clean(url.searchParams.get("ator"), 160), ref = clean(url.searchParams.get("ref"), 120);
      const de = clean(url.searchParams.get("de"), 10), ate = clean(url.searchParams.get("ate"), 10);
      const rows = await q(
        `select id,ator,acao,entidade,entidade_id,antes,depois,criado_em from erp_auditoria
         where ($1='' or entidade=$1) and ($2='' or ator ilike '%'||$2||'%') and ($3='' or entidade_id=$3)
          and ($4='' or criado_em>=$4::date) and ($5='' or criado_em<($5::date+1)) order by id desc limit 300`, [entidade, ator, ref, de, ate]);
      const entidades = await q("select distinct entidade from erp_auditoria order by 1");
      return NextResponse.json({ eventos: rows, entidades: entidades.map((e) => e.entidade) }, { headers: H });
    }
    if (visao === "config") {
      return NextResponse.json({ config: await q("select chave,valor,descricao from erp_config order by chave") }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar."); }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...LEITURA]);
    const cargo = user.cargo || user.perfil;
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const admin = () => { if (!ADMIN_CARGOS.includes(cargo)) throw new Error("SEM_PERMISSAO"); };
    let resp: Record<string, unknown> = { ok: true };
    if (acao === "SOLICITAR") {
      const modulo = clean(b.modulo, 30).toUpperCase();
      if (!MODULOS.includes(modulo)) throw new Error("Módulo inválido.");
      const [r] = await q("select erp_aprovacao_solicitar($1,$2,$3,$4,$5::numeric,$6,$7) id", [modulo, clean(b.tipoDocumento, 40).toUpperCase(), clean(b.documentoId, 80), clean(b.documentoRef, 160), valor(b.valor, "Valor inválido."), clean(b.descricao, 1000), user.usuario]);
      resp = { ok: true, id: r.id };
    } else if (acao === "DECIDIR") {
      const [r] = await q("select erp_aprovacao_decidir($1::uuid,$2,$3,$4,$5) s", [need(b.id, "Aprovação inválida."), clean(b.decisao, 10).toUpperCase(), clean(b.parecer, 1000), user.usuario, cargo]);
      resp = { ok: true, status: r.s };
    } else if (acao === "CANCELAR") {
      await q("select erp_aprovacao_cancelar($1::uuid,$2)", [need(b.id, "Aprovação inválida."), user.usuario]);
    } else if (acao === "MATRIZ_SALVAR") {
      admin();
      const c = clean(b.cargo, 30), m = clean(b.modulo, 30), a = clean(b.acaoMatriz, 10).toUpperCase();
      if (!MODULOS.includes(m) || !ACOES.includes(a)) throw new Error("Módulo ou ação inválidos.");
      if (c === "ADMINISTRADOR" && b.permitido === false) throw new Error("O Administrador não pode perder permissões.");
      await q(`insert into erp_autorizacoes(cargo,modulo,acao,permitido,limite_valor,atualizado_por) values($1,$2,$3,$4,$5,$6)
        on conflict(cargo,modulo,acao) do update set permitido=excluded.permitido,limite_valor=excluded.limite_valor,atualizado_por=excluded.atualizado_por,atualizado_em=now()`,
        [c, m, a, b.permitido !== false, valor(b.limite, "Limite inválido.", true), user.usuario]);
    } else if (acao === "REGRA_SALVAR") {
      admin();
      const vmin = valor(b.valorMin, "Valor mínimo inválido.") as number, vmax = valor(b.valorMax, "Valor máximo inválido.", true);
      if (vmax !== null && vmax < vmin) throw new Error("O valor máximo não pode ser menor que o mínimo.");
      const modulo = clean(b.modulo, 30).toUpperCase();
      if (!MODULOS.includes(modulo)) throw new Error("Módulo inválido.");
      await q("insert into erp_aprovacao_regras(modulo,tipo_documento,valor_min,valor_max,nivel,cargo_aprovador,criado_por) values($1,$2,$3,$4,$5,$6,$7)", [modulo, clean(b.tipoDocumento, 40).toUpperCase(), vmin, vmax, Math.min(5, Math.max(1, Math.floor(Number(b.nivel) || 1))), clean(b.cargoAprovador, 30), user.usuario]);
    } else if (acao === "REGRA_ATIVA") {
      admin();
      await q("update erp_aprovacao_regras set ativo=$2 where id=$1::uuid", [need(b.id, "Regra inválida."), b.ativo === true]);
    } else if (acao === "DELEGAR") {
      const para = clean(b.paraUsuario, 160);
      if (!para) throw new Error("Informe o usuário que vai substituir.");
      const cd = clean(b.cargoDelegado, 30);
      const meuNivel = Number((await q("select erp_cargo_nivel($1) n", [cargo]))[0].n), nivelDeleg = Number((await q("select erp_cargo_nivel($1) n", [cd]))[0].n);
      if (nivelDeleg > meuNivel) throw new Error("Você não pode delegar um cargo acima do seu.");
      await q("insert into erp_delegacoes(de_usuario,para_usuario,cargo_delegado,inicio,fim,criado_por) values($1,$2,$3,$4::date,$5::date,$1)", [user.usuario, para, cd, dia(b.inicio, "Início inválido."), dia(b.fim, "Fim inválido.")]);
    } else if (acao === "DELEGACAO_ENCERRAR") {
      await q("update erp_delegacoes set ativo=false where id=$1::uuid and (de_usuario=$2 or $3)", [need(b.id, "Delegação inválida."), user.usuario, ADMIN_CARGOS.includes(cargo)]);
    } else if (acao === "CONFIG_SALVAR") {
      admin();
      const chave = clean(b.chave, 60);
      if (!/^[a-z_.]+$/.test(chave)) throw new Error("Chave inválida.");
      await q("update erp_config set valor=$2,atualizado_por=$3,atualizado_em=now() where chave=$1", [chave, clean(b.valor, 200), user.usuario]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json(resp, { headers: H });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/duplicate key|unique/.test(m)) return NextResponse.json({ error: "Já existe uma aprovação pendente ou regra igual." }, { status: 409 });
    return erro(e, "Falha ao gravar.");
  }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
