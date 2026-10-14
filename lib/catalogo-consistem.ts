import { sql } from "@/lib/db";
import type { Produto } from "@/types/pcp";
import { completarPorRegras } from "@/lib/ia/completar-filtro";

export const normalizarCodigo = (v: unknown) => String(v ?? "").trim().replace(/\.0$/, "").toUpperCase();
const chaveNarrativa = (v:string) => v.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase().replace(/\\s+/g," ").trim();

export function consolidarCatalogo(linhas: {codigo: string; narrativa: string}[]) {
  const mapa = new Map<string, Set<string>>();
  for (const row of linhas) {
    const codigo = normalizarCodigo(row.codigo);
    const narrativa = String(row.narrativa || "").trim().replace(/\s+/g," ");
    if (!codigo) continue;
    const narrativas = mapa.get(codigo) || new Set<string>();
    if (narrativa && ![...narrativas].some(v=>chaveNarrativa(v)===chaveNarrativa(narrativa))) narrativas.add(narrativa);
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
export type RegistroCatalogo = {codigo: string; narrativa: string; conflito: boolean; vazio: boolean; variantes?: string[]};

const tripla = (texto:unknown) => String(texto||"").match(/\\b(\\d{3,4})\\s*[xX×]\\s*(\\d{2,4})\\s*[xX×]\\s*(\\d{1,3})\\b/)?.slice(1).join("x") || "";

/** Em código conflitante, selecionar apenas se a tripla técnica da linha for inequívoca. */
export function resolverNarrativaConflitante(p:Produto, variantes:readonly string[]) {
  const medidaFonte=tripla(p.medida)||tripla(p.descricao);
  if(!medidaFonte) return null;
  const candidatas=[...new Set(variantes.filter(v=>tripla(v)===medidaFonte).map(v=>v.trim()))];
  // Mesmo perfil dimensional pode ter cor/material/acabamento diferente:
  // nunca selecionar automaticamente se houver duas descrições distintas.
  const unicas=new Map(candidatas.map(v=>[chaveNarrativa(v),v]));
  return unicas.size===1 ? [...unicas.values()][0] : null;
}

export function enriquecerProdutoPeloRegistro(p: Produto, ref: RegistroCatalogo): Produto {
  if(ref.conflito || ref.vazio || !ref.narrativa) return p;
  const narrativa=ref.narrativa;
  // Catálogo cadastrado por código exato é a fonte de descrição técnica.
  // O Consistem continua responsável por pedido, OF, quantidade e rota.
  const base={...p, descricao:narrativa, medida:"",material:"",cor:"",acabamento:"",rebaixo:"",canal:""};
  const preenchido=completarPorRegras(base).produto;
  const copy={...p, descricao:narrativa};
  const campos=("tipo material cor acabamento rebaixo canal").split(" ") as Array<keyof Produto>;
  for (const campo of campos) {
    if(!String(copy[campo]??"").trim() && String(preenchido[campo]??"").trim()) {
      (copy as any)[campo]=preenchido[campo];
    }
  }
  // Exigir as três dimensões. Um valor 2110x50 vindo do filtro não
  // pode ter precedência sobre o 2110x50x9 do catálogo.
  const medidaCompleta=narrativa.match(/\b(\d{2,4}(?:[.,]\d+)?)\s*[xX×]\s*(\d{2,4}(?:[.,]\d+)?)\s*[xX×]\s*(\d{1,3}(?:[.,]\d+)?)\b/);
  if(medidaCompleta) {
    copy.medida=medidaCompleta.slice(1,4).map(v=>v.replace(",",".")).join("x");
  } else if(!String(copy.medida||"").trim() && String(preenchido.medida||"").trim()) {
    copy.medida=preenchido.medida;
  }
  // O material vem preferencialmente da narrativa completa se a
  // descrição truncada produzir um código incompleto ou genérico.
  const materialCatalogo=String(preenchido.material||"").trim();
  const materialAtual=String(copy.material||"").trim();
  if(materialCatalogo && (!materialAtual || /^(?:U|UL|ULT|ULTR|MDF)$/i.test(materialAtual))) {
    copy.material=materialCatalogo;
  }
  return copy;
}

export async function enriquecerComCatalogo(produtos: Produto[], db = sql()) {
  const codigos = [...new Set(produtos.map(p=>normalizarCodigo(p.produto)).filter(Boolean))];
  if (!codigos.length) return {produtos, correspondencias:0, conflitos:[], naoEncontrados:codigos};
  await ensureCatalogo(db);
  const rows = await db`
    select c.codigo,c.narrativa,c.conflito,c.vazio,c.variantes
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
    if(ref.conflito) {\n      const alternativa=resolverNarrativaConflitante(p,Array.isArray(ref.variantes)?ref.variantes:[]);\n      if (!alternativa) {conflitos.add(codigo);return p;}\n      correspondencias++;\n      return enriquecerProdutoPeloRegistro(p,{...ref,conflito:false,narrativa:alternativa});\n    }\n    if(ref.vazio || !ref.narrativa) {conflitos.add(codigo);return p;}
    correspondencias++;
    return enriquecerProdutoPeloRegistro(p,ref);
  });
  return {produtos:atualizados, correspondencias, conflitos:[...conflitos], naoEncontrados:[...naoEncontrados]};
}
