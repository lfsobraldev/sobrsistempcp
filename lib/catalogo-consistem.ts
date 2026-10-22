import { sql } from "@/lib/db";
import type { Produto } from "@/types/pcp";
import { completarPorRegras } from "@/lib/ia/completar-filtro";
import { categoriaIndustrial } from "@/lib/domain/industrial";

export const normalizarCodigo = (v: unknown) => String(v ?? "").trim().replace(/\.0$/, "").toUpperCase();
const chaveNarrativa = (v:string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();

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
    total integer not null default 0, conflitos integer not null default 0,
    total_linhas integer not null default 0, linhas_sem_codigo integer not null default 0
  )`;
  await db`alter table pcp_catalogo_versoes add column if not exists total_linhas integer not null default 0`;
  await db`alter table pcp_catalogo_versoes add column if not exists linhas_sem_codigo integer not null default 0`;
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

const tripla = (texto:unknown) => String(texto||"").match(/\b(\d{3,4})\s*[xX×]\s*(\d{2,4})\s*[xX×]\s*(\d{1,3})\b/)?.slice(1).join("x") || "";

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
  const base={...p, descricao:narrativa, tipo:"",medida:"",material:"",cor:"",acabamento:"",rebaixo:"",canal:""};
  const preenchido=completarPorRegras(base).produto;
  const copy={...p, descricao:narrativa};
  // O código é a chave: dados técnicos da narrativa do catálogo têm prioridade
  // sobre classificações abreviadas ou incorretas da programação do Consistem.
  // Material escolhido no pedido: palavra inteira STD, ULTRA ou PINUS no campo material/tipo. Prevalece sobre o catálogo.
  const materialDoPedido=(()=>{const t=[p.material,p.tipo].map(v=>String(v??"")).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();const achados=new Set<string>();if(/\bPINUS\b/.test(t))achados.add("PINUS");if(/\bULTRA\b/.test(t))achados.add("MDF ULTRA");if(/\b(?:STD|STANDARD)\b/.test(t))achados.add("MDF STD");return achados.size===1?[...achados][0]:"";})();
  const campos=("tipo material cor acabamento rebaixo canal").split(" ") as Array<keyof Produto>;
  for (const campo of campos) {
    if(String(preenchido[campo]??"").trim()) (copy as any)[campo]=preenchido[campo];
  }
  // Classificação explícita da narrativa prevalece sobre MDF genérico e siglas truncadas.
  // A cor/revestimento PET ou TXT nunca representa o material estrutural.
  const evidenciaMaterial=narrativa.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  if (/\b(?:MADEIRA\s+DE\s+)?PINUS\b/.test(evidenciaMaterial)) copy.material="PINUS";
  else if (/\b(?:MDF\s+)?ULTRA\b/.test(evidenciaMaterial)) copy.material="MDF ULTRA";
  else if (/\b(?:MDF\s+)?(?:STD|STANDARD)\b/.test(evidenciaMaterial)) copy.material="MDF STD";
  else if (/\bMDF\b/.test(evidenciaMaterial)) copy.material="MDF";
  // Campos industriais extraídos da narrativa completa do mesmo código.
  const rebaixoExplicito=evidenciaMaterial.match(/\bREBAIXO\s*(?:DE\s*)?(\d{2}\s*[X×]\s*\d{1,2})(?:\s*MM)?/);
  if(rebaixoExplicito) copy.rebaixo="C/REB "+rebaixoExplicito[1].replace(/\s/g,"").replace("×","X");
  else if(/\bSEM\s+REBAIXO\b|\bS\/REB\b/.test(evidenciaMaterial)) copy.rebaixo="S/REB";
  const revestimento=evidenciaMaterial.match(/\b(?:RECOBERT[OA]|REVESTID[OA])\s+(?:EM\s+)?(PET|TXT|BP)(?:\s+(.+?))?(?=\s*\(|\s*\/|$)/);
  if(revestimento){
    const nome=(revestimento[2]||"").trim();
    copy.cor=[revestimento[1],nome].filter(Boolean).join(" ");
  }
  // O material informado no pedido nunca é trocado pelo do catálogo (ex.: pedido STD não vira ULTRA).
  if(materialDoPedido){copy.material=materialDoPedido;copy.tipo=materialDoPedido;}
  // PET/TXT/BP são revestimentos, não material estrutural.
  if(/^(?:PET|TXT|BP)(?:\s|$)/.test(String(copy.material||"").trim().toUpperCase())){
    copy.material="";
  }
  if (!String(copy.tipo || "").trim() && String(copy.material || "").trim()) copy.tipo=copy.material;
  // Reclassifica família pelo nome completo cadastrado no código.
  copy.categoria=categoriaIndustrial({...copy, categoria:""});
  // Exigir as três dimensões. Um valor 2110x50 vindo do filtro não
  // pode ter precedência sobre o 2110x50x9 do catálogo.
  const medidaCompleta=narrativa.match(/\b(\d{2,4}(?:[.,]\d+)?)\s*[xX×]\s*(\d{2,4}(?:[.,]\d+)?)\s*[xX×]\s*(\d{1,3}(?:[.,]\d+)?)(?=\s*MM\b|\b)/i);
  if(medidaCompleta) {
    const catalogoMedida=medidaCompleta.slice(1,4).map(v=>String(Number(v.replace(",",".")))).join("x");
    const medidaOriginal=String(p.medida || "").match(/^\s*(\d{2,4})\s*[xX×]\s*(\d{2,4})\s*[xX×]\s*(\d{1,3})\s*$/);
    // Se o filtro contém três dimensões completas, a narrativa do catálogo
    // nunca pode alterá-las silenciosamente (ex.: perfis 5260 vs 2130).
    // A divergência deve ser analisada em auditoria, sem inventar medidas.
    copy.medida=medidaOriginal
      ? medidaOriginal.slice(1).map(v=>String(Number(v))).join("x")
      : catalogoMedida;
  } else if(!String(copy.medida||"").trim() && String(preenchido.medida||"").trim()) {
    copy.medida=preenchido.medida;
  }
  // Campos sem evidência na narrativa ficam como estavam; não se inventa dado.
  // Pedido, OF, código, quantidade e operações sempre permanecem da linha original.
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
    if(ref.conflito) {
      const alternativa=resolverNarrativaConflitante(p,Array.isArray(ref.variantes)?ref.variantes:[]);
      if (!alternativa) {conflitos.add(codigo);return p;}
      correspondencias++;
      return enriquecerProdutoPeloRegistro(p,{...ref,conflito:false,narrativa:alternativa});
    }
    if(ref.vazio || !ref.narrativa) {conflitos.add(codigo);return p;}
    correspondencias++;
    return enriquecerProdutoPeloRegistro(p,ref);
  });
  return {produtos:atualizados, correspondencias, conflitos:[...conflitos], naoEncontrados:[...naoEncontrados]};
}
