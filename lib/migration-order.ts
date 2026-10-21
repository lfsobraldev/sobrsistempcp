/** Ordena dependências explícitas sem alterar a ordem histórica dos demais arquivos. */
export function ordenarMigracoes<T extends {name:string}>(files:T[],dependencies:Map<string,string[]>):T[]{
 const byName=new Map(files.map(f=>[f.name,f]));const visiting=new Set<string>(),done=new Set<string>();const result:T[]=[];
 function visit(name:string){
  if(done.has(name))return;
  if(visiting.has(name))throw new Error(`Dependência circular de migração: ${name}`);
  const file=byName.get(name);if(!file)throw new Error(`Dependência de migração não encontrada: ${name}`);
  visiting.add(name);for(const dep of dependencies.get(name)||[])visit(dep);
  visiting.delete(name);done.add(name);result.push(file);
 }
 for(const file of files)visit(file.name);return result;
}
