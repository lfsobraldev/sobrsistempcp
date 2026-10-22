import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {ordenarMigracoes} from './migration-order';
export type MigrationSource={name:string;checksum:string;up:string;down:string|null;reverse:boolean;dependencies:string[];scope:'identity'|'operational'|'unspecified'};
export function parseMigration(name:string,source:string):MigrationSource{
 if(!/^\d{4}-\d{2}-\d{2}_[a-zA-Z0-9_]+\.sql$/.test(name))throw new Error('Nome de migração inválido.');
 const marker=/--\s*migrate:up\s*\n([\s\S]*?)(?:\n--\s*migrate:down\s*\n|$)/i;
 const up=source.match(marker)?.[1]?.trim()??source.split(/--\s*migrate:down/i)[0].trim();
 const down=source.match(/--\s*migrate:down\s*\n([\s\S]*)$/i)?.[1]?.trim()||null;
 const sqlDown=down?.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'').trim();
 const scope=source.match(/^--\s*scope:\s*(identity|operational)\s*$/m)?.[1] as 'identity'|'operational'|undefined;
 return {name,checksum:createHash('sha256').update(source).digest('hex'),up,down,reverse:Boolean(sqlDown),dependencies:[...source.matchAll(/^--\s*depends-on:\s*(\S+)\s*$/gm)].map(m=>m[1]),scope:scope??'unspecified'};
}
/** Leitura pura de arquivos. Não importa driver, .env, nem consulta banco. */
export async function readMigrationSources(root=process.cwd()):Promise<MigrationSource[]>{
 const dir=path.join(root,'database','migrations'),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
 const files=await Promise.all(names.map(async n=>parseMigration(n,await readFile(path.join(dir,n),'utf8'))));
 return ordenarMigracoes(files,new Map(files.map(f=>[f.name,f.dependencies])));
}
