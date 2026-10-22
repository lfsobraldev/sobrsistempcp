#!/usr/bin/env tsx
import {readMigrationSources} from '../lib/migration-files';
async function main(){
 if(!process.argv.includes('--plan'))throw new Error('Aplicação automática indisponível. Use npm run migrate -- --plan para conferir os arquivos, sem conectar ao banco; implantação presencial conforme docs/BANCO_IMPLANTACAO.md.');
 const files=await readMigrationSources();console.log(JSON.stringify({dryRun:true,bancoConsultado:false,arquivos:files.map(({name,checksum,dependencies,scope})=>({name,checksum,dependencies,scope})),aviso:'Não identifica migrações aplicadas. Conferir precheck no banco correto com o administrador.'},null,2));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
