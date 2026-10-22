import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"] as const;
const WRITE = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"] as const;
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);

async function unidadeGET() {
  try {
    await requireRoles([...READ]);
    const [documentos, vinculos, qualificacoes, requisitos, config] = await Promise.all([
      q(`select d.*,(select json_agg(json_build_object('id',v.id,'versao',v.versao,'status',v.status,'conteudo',v.conteudo,'anexo_url',v.anexo_url,'resumo',v.resumo_alteracao,'criado_por',v.criado_por,'aprovado_por',v.aprovado_por,'vigencia_inicio',v.vigencia_inicio) order by v.versao desc) from doc_versoes v where v.documento_id=d.id) versoes from doc_documentos d order by d.codigo`),
      q(`select l.*,d.codigo from doc_vinculos l join doc_documentos d on d.id=l.documento_id order by d.codigo`),
      q(`select * from qlf_qualificacoes where revogado_em is null order by processo,usuario`),
      q(`select * from qlf_requisitos order by processo`),
      q(`select ativa from qlf_config`),
    ]);
    return NextResponse.json({ documentos, vinculos, qualificacoes, requisitos, qualificacaoAtiva: !!config[0]?.ativa }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha ao consultar documentos." }, { status: forbidden ? 403 : /does not exist/.test(m) ? 503 : 400 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const ator = user.usuario;
    if (acao === "DOCUMENTO") {
      if (!clean(b.codigo, 40) || !clean(b.titulo, 240)) throw new Error("Informe código e título.");
      const [d] = await q(`insert into doc_documentos(codigo,titulo,tipo,criado_por) values($1,$2,$3,$4) returning id`, [clean(b.codigo, 40).toUpperCase(), clean(b.titulo, 240), clean(b.tipo, 12).toUpperCase() || "INSTRUCAO", ator]);
      await q(`select doc_nova_versao($1::uuid,$2,$3,'Emissão inicial',$4)`, [d.id, String(b.conteudo ?? "").slice(0, 200_000), clean(b.anexoUrl, 500), ator]);
    } else if (acao === "VERSAO") {
      await q(`select doc_nova_versao($1::uuid,null,null,$2,$3)`, [need(clean(b.documentoId, 40), "Documento inválido."), clean(b.resumo, 1000), ator]);
    } else if (acao === "EDITAR") {
      const r = await q(`update doc_versoes set conteudo=$2,anexo_url=$3,resumo_alteracao=$4 where id=$1 and status='RASCUNHO' returning id`, [need(clean(b.versaoId, 40), "Versão inválida."), String(b.conteudo ?? "").slice(0, 200_000), clean(b.anexoUrl, 500), clean(b.resumo, 1000)]);
      if (!r.length) throw new Error("Somente rascunho pode ser editado.");
    } else if (acao === "ENVIAR") {
      await q(`select doc_enviar($1::uuid,$2)`, [need(clean(b.versaoId, 40), "Versão inválida."), ator]);
    } else if (acao === "APROVAR") {
      await q(`select doc_aprovar($1::uuid,$2,$3)`, [need(clean(b.versaoId, 40), "Versão inválida."), ator, user.perfil === "GERENTE"]);
    } else if (acao === "REPROVAR") {
      await q(`select doc_reprovar($1::uuid,$2)`, [need(clean(b.versaoId, 40), "Versão inválida."), ator]);
    } else if (acao === "VINCULO") {
      const processo = clean(b.processo, 80), produto = clean(b.produtoCodigo, 60);
      if (!processo && !produto) throw new Error("Informe o setor ou o produto.");
      await q(`insert into doc_vinculos(documento_id,processo,produto_codigo) values($1,$2,$3) on conflict do nothing`, [need(clean(b.documentoId, 40), "Documento inválido."), processo, produto]);
    } else if (acao === "VINCULO_REMOVER") {
      await q(`delete from doc_vinculos where id=$1`, [need(clean(b.vinculoId, 40), "Vínculo inválido.")]);
    } else if (acao === "REQUISITO") {
      const processo = clean(b.processo, 80);
      if (!processo) throw new Error("Informe o setor.");
      if (b.remover) await q(`delete from qlf_requisitos where upper(processo)=upper($1)`, [processo]);
      else await q(`insert into qlf_requisitos(processo,criado_por) values($1,$2) on conflict do nothing`, [processo, ator]);
    } else if (acao === "QUALIFICACAO") {
      const usuario = clean(b.usuario, 160).toLowerCase(), processo = clean(b.processo, 80), nivel = clean(b.nivel, 9).toUpperCase();
      if (!usuario || !processo) throw new Error("Informe usuário e setor.");
      const validade = clean(b.validade, 10);
      if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw new Error("Validade inválida.");
      await q(`update qlf_qualificacoes set revogado_em=now(),revogado_por=$3 where lower(usuario)=$1 and upper(processo)=upper($2) and revogado_em is null`, [usuario, processo, ator]);
      if (!b.revogar) await q(`insert into qlf_qualificacoes(usuario,processo,nivel,validade,concedido_por) values($1,$2,$3,$4,$5)`, [usuario, processo, nivel, validade || null, ator]);
    } else if (acao === "QUALIFICACAO_LIGAR") {
      if (user.perfil !== "GERENTE" && user.perfil !== "PCP") throw new Error("Sem permissão.");
      await q(`update qlf_config set ativa=$1,atualizado_por=$2,atualizado_em=now()`, [!!b.ativa, ator]);
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
