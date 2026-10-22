import {readMigrationSources,type MigrationSource} from '../lib/migration-files';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const descricoes:Record<string,string>={
 'pallet_quality_msac':'Pallets, inspeções Qualidade/MSAC, fotos e eventos',
 'pallet_quality_v2':'Não conformidades e medições de pallets',
 'operational_excellence':'Andon, perdas, capacidades, metas, setups e ações operacionais',
 'quality_user':'Usuários e restrição de perfis; pode conflitar com perfis comerciais já cadastrados',
 'tipo_pedido_embalagem':'Tipo de pedido e montagem para embalagem; normaliza valores existentes',
 'ia':'Logs de IA e histórico de romaneios',
 'local_montagem':'Local de montagem por pedido',
 'sac_industrial':'SAC, eventos e ampliação de perfis',
 'crm_comercial':'Clientes, representantes, oportunidades, propostas e vínculos de entregas',
 'medicoes_engenharia':'Medições/revisões/aprovação técnica vinculadas ao CRM',
 '02_schema_migrations':'Controle de checksum, aplicação, baseline e eventos de migração',
 'fundacao_multiempresa':'Empresas, filiais, vínculos, permissões e auditoria imutável',
 '03_programacao_multimes':'Lotes/itens mensais, acessos e projeção legada; cadastros técnicos PCP_LEGADO/SUL/NORDESTE',
 '04_unidades_globais':'Identidade homologada do banco e projeção legada por unidade',
 '05_acessos_centrais':'Perfis e grants centrais por unidade, etapa e turno',
 '06_engenharia_of':'Bootstrap do estoque existente, classificações, BOM, explosão e OF',
 '07_marketing':'Campanhas, despesas imutáveis e vínculo com CRM',
 '08_competencias_programacao':'Competências ativas/planejadas/encerradas, preenchimento inicial e proteção de lotes',
 '09_historico_seguro':'Arquivamento auditado sem apagar programações',
 '10_ciclo_industrial':'Roteiros/versões, OF filhas/snapshot/reservas, apontamentos, ledger, lotes e custos',
 '11_transferencias_unidades':'Documento central de transferência em trânsito entre bancos',
 '12_identidades_operacionais':'Códigos mestres e resolução unificada de cliente/representante nos documentos',
 '13_controle_of':'Bloqueio herdado e cancelamento da árvore com liberação de reservas',
 '14_vendas_comissoes':'Pedidos de venda, aprovação/crédito, regras e ledger imutável de comissões',
 '15_vendas_producao':'Necessidade do pedido, disponibilidade de componentes, onde-é-usado e rastreio (somente leitura)',
 '16_compras_terceiros':'Compras (solicitação, cotação, pedido com alçada, recebimento/NF-e), terceirização, ABC/XYZ e sugestão de compra',
 '17_qualidade_inspecao':'Planos de inspeção, instrumentos/calibração, medições com tolerância, quarentena, NC/CAPA e PPM',
 '18_mrp_aps':'MRP líquido, operações abertas (carga), agenda fixa de OF e geração de OF pela sugestão'
};
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
function objetos(m:MigrationSource){return [...new Set([...m.up.matchAll(/create\s+(?:or\s+replace\s+)?(?:table\s+(?:if\s+not\s+exists\s+)?|view\s+)([a-z_][a-z0-9_]*)/gi)].map(x=>x[1]))];}
async function main(){
 const files=await readMigrationSources(),dir='docs/banco';await mkdir(dir,{recursive:true});
 const rows=[];
 for(const [i,m] of files.entries()){
  const n=String(i+1).padStart(2,'0'),slug=m.name.replace('.sql',''),prefix=n+'_'+slug;
  const descricao=descricoes[m.name.slice(11,-4)]||m.name;
  const dados=/\b(?:insert\s+into|update\s+[a-z_])\b/i.test(m.up.replace(/create\s+or\s+replace\s+function[\s\S]*?end\s*\$\$\s*;/gi,''));
  const risco=/quality_user|fundacao|03_|04_|05_|06_|08_|10_|11_|12_|13_/.test(m.name)?'alto':/sac|crm|medicoes|09_/.test(m.name)?'médio':'baixo';
  const destino=m.name.includes('_05_')||m.name.includes('_11_')?'identidade':m.name.includes('fundacao')||m.name.includes('_02_')||m.name.includes('quality_user')?'compartilhado (conferir arquitetura)':'operacional (Sul/Nordeste)';
  const tabelas=objetos(m);
  const ver=tabelas.length?tabelas.map(t=>`select ${literal(t)} objeto,to_regclass(${literal('public.'+t)}) is not null existe;`).join('\n'):'-- Conferir as colunas/funções alteradas no arquivo fonte e no precheck.';
  const colunas=[...m.up.matchAll(/alter\s+table\s+(\w+)\s+add\s+column\s+if\s+not\s+exists\s+(\w+)/gi)].map(x=>({tabela:x[1],coluna:x[2]}));
  const verify=ver+'\n'+colunas.map(c=>`select ${literal(c.tabela+'.'+c.coluna)} coluna,to_regclass(${literal("public."+c.tabela)}) is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name=${literal(c.tabela)} and column_name=${literal(c.coluna)}) existe;`).join('\n');
  const guard=`do $pacote$ begin
 if exists(select 1 from schema_migrations where name=${literal(m.name)} and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name=${literal(m.name)} and checksum<>${literal(m.checksum)}) then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;`;
  const audit=`insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values(${literal(m.name)},${literal(m.checksum)},now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values(${literal(m.name)},${literal(m.checksum)},'APLICAR',current_user,'APLICADA');`;
  await writeFile(path.join(dir,prefix+'.up.sql'),`-- GERADO do arquivo canônico ${m.name}; SHA256 ${m.checksum}\n-- Destino: ${destino}. Dependências: ${m.dependencies.join(', ')||'schema-base/pré-requisitos legados'}.\n-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.\nBEGIN;\nselect pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));\n${guard}\n${m.up}\n${audit}\nCOMMIT;\n`);
  await writeFile(path.join(dir,prefix+'.verify.sql'),'-- Somente leitura; executar após up ou antes de baseline.\nBEGIN TRANSACTION READ ONLY;\n'+verify+'\nCOMMIT;\n');
  const down=m.reverse&&!m.name.includes('_02_')?m.down:`do $pacote$ begin raise exception 'Sem reversão automática segura: preservar dados e controle. Desligar flags e usar plano de restauração.';end $pacote$;`;
  await writeFile(path.join(dir,prefix+'.down.sql'),`-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.\n-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.\nBEGIN;\nselect pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));\n${down}\nCOMMIT;\n`);
  await writeFile(path.join(dir,prefix+'.baseline.sql'),`-- Só registrar após conferir TODOS os objetos, colunas, constraints, índices, funções e dados.\n-- verify.sql é checagem inicial, não prova completa de equivalência.\nBEGIN;\nselect pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));\n-- Administrador: acrescente SET LOCAL app.baseline_confirmado = ${literal(m.name)}; abaixo, após conferência presencial.\ndo $pacote$ begin
 if current_setting('app.baseline_confirmado',true) is distinct from ${literal(m.name)} then raise exception 'Baseline não confirmado pelo administrador';end if;
 if exists(select 1 from schema_migrations where name=${literal(m.name)} and checksum<>${literal(m.checksum)}) then raise exception 'Checksum divergente';end if;
end $pacote$;\ninsert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values(${literal(m.name)},${literal(m.checksum)},now(),current_user,'BASELINE') on conflict(name) do nothing;\ninsert into schema_migration_events(migration_name,checksum,acao,actor,status) select ${literal(m.name)},${literal(m.checksum)},'BASELINE',current_user,'BASELINE' where exists(select 1 from schema_migrations where name=${literal(m.name)} and status='BASELINE');\nCOMMIT;\n`);
  rows.push({ordem:i+1,arquivo:m.name,descricao,dependenciasDeclaradas:m.dependencies,destino,checksum:m.checksum,reversao:m.reverse?'down disponível; revisar alcance e destrutividade':'sem down automático; conservar dados',alteraDadosOuCadastros:dados,risco,objetos:tabelas,colunasAdicionadas:colunas,up:prefix+'.up.sql',verificacao:prefix+'.verify.sql',down:prefix+'.down.sql',baseline:prefix+'.baseline.sql'});
 }
 await writeFile(path.join(dir,'MANIFESTO.json'),JSON.stringify({data:'2026-10-22',aplicacaoRemota:'não verificada',migracoes:rows},null,2)+'\n');
 await writeFile(path.join(dir,'INVENTARIO.md'),'# Inventário único de migrações\n\nOrdem topológica do catálogo. Pré-requisito: schema-base e controle 00_registro.sql. Escopo deve ser conferido por banco. Risco é estimativa estática, não autorização.\n\n| Ordem | Arquivo | O que faz | Dependências declaradas | Reversão | Dados/cadastros | Risco |\n| --- | --- | --- | --- | --- | --- | --- |\n'+rows.map(r=>`| ${r.ordem} | ${r.arquivo} | ${r.descricao} | ${r.dependenciasDeclaradas.join(', ')||'Schema-base/legado'} | ${r.reversao} | ${r.alteraDadosOuCadastros?'Sim/avaliar fonte':'Estrutura/funções; conferir fonte'} | ${r.risco} |`).join('\n')+'\n\nDependências implícitas: qualidade_v2 depende de pallets/MSAC; medições depende do CRM; 10 usa capacidades (operational_excellence), pallets e estoque. Fundação depende de usuários. A 11 fica no banco central, mas depende funcionalmente da 10 em ambas as unidades — não copiar ledger operacional para satisfazer o catálogo. Não aplicar a 03 isolada da 04: a projeção temporária anterior assume Sul.\n');
 const registro=files.find(m=>m.name.includes('_02_'))!;await writeFile(path.join(dir,'00_registro.sql'),'-- Preparação do controle, derivada da migração 02. Não marca migrações como aplicadas.\nBEGIN;\n'+registro.up+'\nCOMMIT;\n');
 await writeFile(path.join(dir,'00_schema_base.sql'),'-- Apenas ambiente NOVO E VAZIO. Banco existente: usar baseline e precheck, não aplicar cegamente.\n'+await readFile('database/schema.sql','utf8'));
 console.log(`Pacote gerado: ${rows.length} migrações, sem conexão a banco.`);
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
