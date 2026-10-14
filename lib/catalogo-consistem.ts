import { sql } from "@/lib/db";
import type { Produto } from "@/types/pcp";
import { completarPorRegras } from "@/lib/ia/completar-filtro";

export const normalizarCodigo = (v: unknown) => String(v ?? "").trim().replace(/\\.0$/, "").toUpperCase();
export function consolidarCatalogo(linhas: {codigo: string; narrativa: string}[]) {
  const mapa = new Map<string, Set<string>>();
  for (const row of linhas) {
    const codigo = normalizarCodigo(row.codigo);
    const narrativa = String(row.narrativa || "").trim().replace(/\\s+/g," ");
    if (!codigo) continue;
    const narrativas = mapa.get(codigo) || new Set<string>();
    if (narrativa) narrativas.add(narrativa);
    mapa.set(codigo,narrativas);
  }
  return [...mapa].map(([codigo, narrativas])=>({
    codigo, narrativa: narrativas.size === 1 ? [...narrativas][0] : "",
    conflito: narrativas.size > 1,
    vazio: narrativas.size === 0,
    variantes: [...narrativas].slice(0, 6)
  }));
}
export async function ensureCatalogo(db = sql()) {
  await db`create table if not exists pcp_catalogo_versoes (
    id uuid primary key, status text not null default 'PREPARANDO',
    criado_em timestamptz not null default now(), ativo_em timestamptz,
    total integer not null default 0, conflitos integer not null default 0
  )`;
  await db`create table if not exists pcp_catalogo_produtos (
    versao uuid not null references pcp_catalogo_versoes(id) on delete cascade,
    codigo text not null, narrativa text not null default '',
    conflito boolean not null default false, vazio boolean not null default false,
    variantes jsonb not null default '[]'::jsonb,
    primary key (versao,codigo)
  )`;
  await db`create index if not exists ix_pcp_catalogo_codigo on pcp_catalogo_produtos(codigo)`;
}
export type RegistroCatalogo = {codigo: string; narrativa: string; conflito: boolean; vazio: boolean};
export async function enriquecerComCatalogo(produtos: Produto[], db = sql()) {
  const codigos = [...new Set(produtos.map(p=>normalizarCodigo(p.produto)).filter(Boolean))];
  if (!codigos.length) return {produtos, correspondencias:0, conflitos:[], naoEncontrados:codigos};
  await ensureCatalogo(db);
  const rows = await db`
    select c.codigo,c.narrativa,c.conflito,c.vazio
    from pcp_catalogo_produtos c
    join pcp_catalogo_versoes v on v.id=c.versao
    where v.status='ATIVA' and c.codigo = any(${codigos}::text[])
  ` as RegistroCatalogo[];
  const mapa = new Map(rows.map(r=>[r.codigo,r]));
  let correspondencias=0;
  const conflitos = new Set<string>();
  const naoEncontrados = new Set<string>();
  const atualizados=produtos.map(p=>{
    const codigo=normalizarCodigo(p.produto), ref=mapa.get(codigo);
    if (!ref) { if(codigo) naoEncontrados.add(codigo); return p; }
    if(ref.conflito || ref.vazio || !ref.narrativa) {conflitos.add(codigo);return p;}
    correspondencias++;
    // Analisa a narrativa oficial apenas para preencher campos vazios:
    // a descrição abreviada e todas as quantidades/OFs/rotas são preservadas.
    const base={...p, descricao:ref.narrativa};
    const preenchido=completarPorRegras(base).produto;
    const campos=("tipo material medida cor acabamento rebaixo canal").split(" ") as Array<keyof Produto>;
    const copy={...p};
    for (const campo of campos) {
      if(!String(copy[campo]??"").trim() && String(preenchido[campo]??"").trim()) {
        (copy as any)[campo]=preenchido[campo];
      }
    }
    return copy;
  });
  return {produtos:atualizados, correspondencias, conflitos:[...conflitos], naoEncontrados:[...naoEncontrados]};
}
