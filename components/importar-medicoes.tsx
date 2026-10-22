'use client';
import {useState} from 'react';
import {Field} from '@/components/ui';
type Instr={id:string;codigo:string};
/** Importa medições de uma planilha (xlsx/csv) com colunas "característica" (nº da linha do plano) e "valor". Tudo ou nada. */
export default function ImportarMedicoes({instrumentos,busy,onImportar}:{instrumentos:Instr[];busy:boolean;onImportar:(medicoes:{linha:number;valor:number}[],instrumentoId:string)=>Promise<boolean>}){
 const [instr,setInstr]=useState(''),[linhas,setLinhas]=useState<{linha:number;valor:number}[]>([]),[nome,setNome]=useState(''),[aviso,setAviso]=useState('');
 async function ler(f:File|undefined){
  setLinhas([]);setAviso('');setNome('');if(!f)return;
  try{
   const {loadRobustTable,parseImportNumber}=await import('@/lib/import-reader');
   const t=await loadRobustTable(f,{linha:['linha','caracteristica','característica','item','car'],valor:['valor','medida','medicao','medição','resultado']});
   const out:{linha:number;valor:number}[]=[];let ignoradas=0;
   for(const r of t.rows){const l=Number(String(r.linha??'').replace(/\D/g,'')),v=parseImportNumber(r.valor);if(!Number.isInteger(l)||l<1||v==null){ignoradas++;continue;}out.push({linha:l,valor:v});}
   if(!out.length){setAviso('Nenhuma medição válida. A planilha precisa das colunas "característica" (número da linha do plano) e "valor".');return;}
   if(out.length>2000){setAviso('Máximo de 2000 medições por importação.');return;}
   setNome(f.name);setLinhas(out);if(ignoradas)setAviso(`${ignoradas} linha(s) ignorada(s) por estarem incompletas.`);
  }catch(e){setAviso(e instanceof Error?e.message:'Não foi possível ler a planilha.');}
 }
 return <div className="panel" style={{padding:10,display:'grid',gap:8}}>
  <b>Importar medições por planilha</b>
  <small>Colunas: característica (nº da linha do plano) e valor. Se uma medição for recusada, nenhuma é gravada.</small>
  <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>void ler(e.target.files?.[0])}/>
  <Field label="Instrumento calibrado"><select value={instr} onChange={e=>setInstr(e.target.value)}><option value="">Selecione</option>{instrumentos.map(i=><option key={i.id} value={i.id}>{i.codigo}</option>)}</select></Field>
  {aviso&&<small>{aviso}</small>}
  <button className="primary" disabled={busy||!instr||!linhas.length} onClick={async()=>{if(await onImportar(linhas,instr)){setLinhas([]);setNome('');}}}>Importar {linhas.length?`${linhas.length} medição(ões)${nome?` de ${nome}`:''}`:''}</button>
 </div>;
}
