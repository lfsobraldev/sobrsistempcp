# Implantação presencial do banco — 22/10/2026

**Não houve conexão nem comando contra Neon/banco remoto.** Este pacote prepara conferência e execução pelo administrador; não autoriza aplicar todos os arquivos indiscriminadamente. O ERP completo ainda possui módulos pendentes em RELATORIO_FINAL. Homologar os fluxos disponíveis antes de produção.

## 1. Inventário e arquivos

Lista única: [banco/INVENTARIO.md](banco/INVENTARIO.md). Manifesto de 23 arquivos com SHA-256, dependências, escopo, risco, alterações e nomes dos roteiros: [banco/MANIFESTO.json](banco/MANIFESTO.json). Cada migração tem `.up.sql`, `.verify.sql`, `.down.sql` e `.baseline.sql`, numerados na ordem do catálogo. Fontes canônicas permanecem em `database/migrations`; nenhum arquivo histórico foi modificado. Regerar com `npm run db:package` não conecta ao banco.

Pré-requisito da instalação vazia: `00_schema_base.sql`, derivado do schema canônico. Migrações incrementais não substituem o schema inicial. Banco existente: conferir equivalência, não aplicar schema-base cegamente.

A ordem topológica move Fundação antes da 03 mesmo que o nome alfabético sugira outra ordem. A migração 02 fornece o registro; `00_registro.sql` prepara essas mesmas tabelas antes dos demais roteiros, sem registrar aplicação de SQL antigo.

## 2. Validação local feita

`npm run db:validate:local` usa exclusivamente `new PGlite()` em memória: nenhum driver Neon, dotenv ou DATABASE_URL. Cada instância fecha em `finally`. Resultado em [banco/VALIDACAO_LOCAL.json](banco/VALIDACAO_LOCAL.json):

- Banco vazio → schema-base → todas as 23 migrações → reaplicação de todas: passou.
- Schema-base com usuário PCP, programação encerrada, produto com 12,345 unidades e operação → todas as 23 → reaplicação: passou; quantidade e cliente originais preservados.
- Teste adicional executa os 23 roteiros up gerados, checagens de objetos/colunas, histórico/checksums, seed duas vezes e confirma bloqueio de reaplicação e baseline sem confirmação.

Limites: `pgcrypto` é omitida **somente no teste PGlite**, que tem `gen_random_uuid` nativa. Isso não valida instalação da extensão no servidor. Legado é sintético, não representa todas as variações do banco real. Não foram testados Neon, restauração real, concorrência multi-conexão remota, câmera/dispositivo nem todos os fluxos Playwright. Um legado com perfil comercial já presente não deve reaplicar a antiga `quality_user`: sua constraint histórica permite apenas seis perfis. Usar baseline após inspeção integral.

## 3. Pré-checagem presencial (somente leitura)

Executar `00_precheck.sql` em CADA destino (identidade, Sul e Nordeste). Salvar resultado com data, operador e nome do banco, sem credenciais. Lista tabelas/views, colunas, índices, constraints, funções e presença do registro.

Se ambas as tabelas de migração existirem, executar `00b_historico.sql`; caso contrário, não executar esse segundo arquivo. Ausência de registro não prova ausência da estrutura: pode haver SQL manual ou bootstrap antigo.

Após confirmar o schema-base, `01_impacto_legado.sql` mostra meses, clientes/pedidos, perfis e totais. `02_impacto_fundacao.sql` só deve ser usado quando todas as estruturas nele referenciadas já existirem. Conferir o destino de cada migração antes de preparar baseline/up.

## 4. Backfills e suposições a confirmar

| Tema | Conferência / impacto | Decisão necessária | Reversão |
| --- | --- | --- | --- |
| Unidade do legado | Totais de `01_impacto_legado.sql`, origem dos arquivos e identidade em `02_impacto_fundacao.sql` | Confirmar Sul OU Nordeste. A 03 cria projeção temporária Sul; a 04 a substitui por identidade homologada. Não abrir aplicação entre essas etapas | Identidade é protegida: restaurar backup em nova branch, não trocar valor nem desativar proteção |
| Empresa | Empresa técnica PCP_LEGADO e suas duas filiais no impacto de Fundação | Confirmar vínculo e dados cadastrais reais; não inferir CNPJ/nome jurídico nem fundir empresas automaticamente | Preservar IDs; correção futura auditada, sem remover vínculos usados |
| Competência | Agrupamento por data real em `01_impacto_legado.sql` | Confirmar mês dos dados. Homologar identidade com `04_homologar_unidade.sql` **antes da 08**; sem identidade, a projeção não gera competências legadas | Corrigir status pela ação auditada do módulo; não alterar datas históricas silenciosamente |
| Cliente/representante | Pedido/nome por programação, código/documento no CRM e vínculos do controle | Vínculo por ID ou código/documento único; ambiguidades exigem revisão humana | Reverter vínculo com evento auditado; nunca apagar cadastro/documentos |
| Estoque de abertura/custo | Inventário por depósito, lotes e ledger; comparar saldos antes/depois | Classificar itens, conferir unidade/conversões e custo de abertura; valores legados desconhecidos podem estar zero | Movimento compensatório/aprovação; não editar ledger |
| Perfis antigos | `select perfil,count(*)` do impacto | Registrar baseline de SQL já refletido; não restringir perfis novos reaplicando migration antiga | Restaurar constraint correta por migração nova; não editar checksum de arquivo aplicado |

Não existe CSV de programação/planilha operacional de medições completo versionado que comprove todas as colunas de produção. Administrador deve fornecer/amostrar arquivos na homologação; não houve mapeamento inventado.

## 5. Plano de execução e falha

1. Administrador identifica projeto/branch/bancos e gera **branch de backup no Neon** antes de DDL. Registrar hora, IDs e janela de retenção; também exportar backup conforme política da empresa. Agente não criou backup remoto. Validar restauração numa branch de homologação pelo administrador antes de produção.
2. Planejar janela sem importação, apontamento ou movimentação. Reservar inicialmente 2–4 horas para conferência/homologação; duração real depende do volume e deve ser medida. Suspender jobs e sessões de escrita pelos meios normais, sem desligar proteções do banco.
3. Usar conexão direta do destino correto no cliente SQL do administrador. Nunca copiar senhas para docs/git. Aplicação usa conexões próprias por unidade.
4. Conferir baseline, preparar `00_registro.sql` se necessário e aplicar apenas os up realmente pendentes, em ordem. Cada roteiro faz transação, advisory lock, registro de checksum e evento. Em sequência 03→04, manter aplicação fechada. Homologar identidade antes da 08.
5. Banco central: usuários/Fundação/acessos e documento de transferência 11 conforme arquitetura. Operacionais: schema-base correspondente, Fundação/projeções, estoque/engenharia/ciclo/identidades/controle da OF. **Não copiar produção/senhas entre unidades.** A dependência 10 da 11 é funcional entre destinos: confirmar ciclo nas duas unidades, não criar um ledger central para satisfazê-la.
6. Executar `.verify.sql` após cada up. Coluna `aplicavel=false` indica ALTER condicional de tabela que ainda não existia; não equivale a falha nem dispensa revisão da fonte. Verificação inicial não comprova todas as regras/triggers/índices: comparar também o precheck e checksum.
7. Na primeira falha, parar. Transação não confirmada: `ROLLBACK`; guardar mensagem, arquivo, checksum, destino e hora em registro de incidente. Não continuar, não mudar arquivo aplicado nem marcar BASELINE para esconder falha.
8. Retomar após corrigir causa e comparar catálogo/histórico. Arquivo já APLICADA/BASELINE é bloqueado por segurança. Alteração de versão exige migração corretiva nova, nunca substituir checksum.
9. Down: revisar dependentes e uso de dados. Muitos downs são conservadores e não desfazem estrutura. Down destrutivo não recupera registros. Controle 02 não tem reversão automática no pacote para preservar auditoria. Depois de down real, conferir estrutura e registrar REVERTIDA/evento pelo procedimento administrativo antes de reaplicar; não apagar histórico.
10. Restauração de desastre: restaurar backup em outra branch/banco, validar contagens e apontar configuração da aplicação ao destino recuperado durante janela controlada. Não reescrever ledger nem remover proteções para forçar retorno.

## 6. Baseline e painel/CLI

Não existe baseline automático por mera presença de tabela. Conferir fonte completa: objetos, colunas, constraints, índices, funções, dados/cadastros inseridos e comportamento. O `.verify.sql` é só a primeira camada. Após conferir, usar o `.baseline.sql` daquele arquivo: acrescentar a confirmação específica indicada no comentário. Sem confirmação, o SQL aborta. Registra SHA-256 exato do arquivo e evento BASELINE, sem executar o up. Repetição não altera registro já existente; conferir divergências.

`/admin/migracoes` agora exige **administrador central**, mostra status real do catálogo quando o registro está legível e informa estado desconhecido se faltar o controle. É catálogo de conferência: o executor remoto anterior não estava implementado. O botão/endpoint de aplicação permanece bloqueado mesmo com `ALLOW_ADMIN_MIGRATIONS=true`; não retorna sucesso fictício.

`npm run migrate -- --plan` lista arquivos/checksums/dependências, sem consultar banco. `npm run migrate` sem `--plan` aborta com orientação. Aplicação/reversão automática via painel/CLI permanece pendente de executor homologado e seleção explícita do destino; **o procedimento disponível é o pacote SQL presencial**. Não usar o painel como evidência de que o banco foi migrado.

## 7. Flags e configuração — ordem segura

Nenhuma variável nova foi introduzida neste incremento; as abaixo já pertencem ao código consolidado.

| Ordem | Variável | Padrão / finalidade | Quando configurar/ligar |
| --- | --- | --- | --- |
| 1 | DATABASE_URL | Sem padrão; banco central/legado | Após confirmar destino e credenciais do administrador |
| 2 | AUTH_SECRET | Obrigatória; assinatura de sessão/QR | Segredo forte no ambiente; nunca compartilhar no repositório; não rotacionar sem avaliar links existentes |
| 3 | ADMIN_USER / PCP_USER e credenciais existentes | Sem senha padrão; conta central autorizada | Provisionamento seguro e teste de login; não criar senha em seed |
| 4 | DATABASE_URL_SUL / DATABASE_URL_NORDESTE | Sem padrão; bancos distintos | Depois de migrações/identidades homologadas e inventário independente |
| 5 | ERP_LEGACY_UNIT | Ausente; confirma unidade quando legado compartilha conexão com uma unidade | Só depois da decisão formal de origem dos dados |
| 6 | ERP_ADMIN_UNITS | Vazio; grants de bootstrap administrativos | Somente unidades explicitamente permitidas; restante por vínculos de usuários |
| 7 | ERP_MULTIUNIDADE | Desligada; liga seleção/isolamento por fonte | Após 03/04/05, cadastro/grants e login testado em ambas as fontes |
| 8 | ERP_PROGRAMACAO_STATUS | Desligada; ATIVO/PLANEJADO/ENCERRADO | Depois da 08 e confirmação das competências iniciais |
| 9 | ERP_CICLO_INDUSTRIAL | Desligada; execução integrada | Depois de 06/09/10/11/12/13 nos destinos corretos, engenharia/classificação e smoke local/homologação aprovados |
| 10 | ALLOW_ADMIN_MIGRATIONS | false; intenção administrativa | Manter false; não habilita executor inexistente. SQL presencial é o fluxo desta versão |

Valor de ativação das três flags ERP é `enabled`. Não ligar todas de uma vez. Validar cada passo, registrar horário e ter retorno da configuração anterior.

| Migração ausente | Telas/ações afetadas e estado |
| --- | --- |
| Fundação / 03 / 04 / 05 | Programação mensal, unidades/acessos e consolidado: cadastro/escopo indisponível; confirmar mensagem e recusa no servidor |
| 08 | Programação com flag de status ligada: aguardando migração |
| 09 | Arquivar programação/histórico: aguardando migração; nada apagado |
| 10 / 11 | Engenharia/OF/apontamento/estoque do ciclo e transferências: controles sob flag; aguardando migração quando schema faltar |
| 12 | Opções por cliente/representante e identidade completa indisponíveis; legado tem fallback; seleção dependente sem view devolve aguardando migração |
| 13 | Controle de bloqueio/cancelamento da OF informa aguardando migração |
| 02 | Painel mostra registro indisponível/estado desconhecido; sem aplicação automática |

## 8. Smoke test presencial

1. Login PCP, gerente, apontador e usuário com uma unidade. Sem setor: apontador não vê nem grava operação. Consolidado exige ambas as unidades. Trocar unidade deve descartar dados/formulário antigo.
2. Conferir cliente por fantasia/razão social e código no apontamento, programação, OF, carteira, pallet e rastreio; representante em documentos privados. Pedido ambíguo deve exigir saneamento, não mostrar nome inventado.
3. Combinar unidade+mês+filtro+pedido+cliente+representante; conferir cartões, datas, listas e gráficos; limpar filtros; navegar entre telas; testar virada do mês.
4. Importar programação de **10/2026**: unidade/mês → CSV/XLSX → prévia → confirmar. Repetir mesmo arquivo sem duplicar. Testar acrescentar, substituir, desfazer e planejado fora do total ativo.
5. Pedido comercial completo/ATP/alçada/comissão: **bloqueado para homologação integral enquanto 2.2 não implementada**. Testar CRM/proposta/carteira existentes separadamente; não considerá-los pedido completo.
6. Classificar insumo/semi/acabado; montar BOM multinível e tentar ciclo (deve bloquear); aprovar roteiro/versão válida; gerar OF com filha; confirmar reservas. BOM/roteiro ausentes devem dar erro claro.
7. Apontar parcialmente filha; conferir baixa proporcional e entrada do semi, lote, custo e reserva. Apontar pai; conferir entrada do acabado e pallet pendente de qualidade. Reenviar mesma chave: sem duplicação.
8. Testar falta de saldo com bloqueio e com fila pendente; abastecer e reprocessar; estornar em ordem inversa e conferir saldo/reserva/pallet/auditoria. Bloquear OF pai e tentar filha; cancelar árvore sem execução libera reservas.
9. Transferir Sul→Nordeste por mapeamento explícito de SKU/depósito. Conferir EM_TRANSITO entre saída e recebimento; reenvio não duplica movimentos. Repetir sentido inverso.
10. Medição/revisão/aprovação e liberação Qualidade/MSAC existentes. Planos/SPC/instrumento vencido/CAPA/planilha operacional completa: **pendentes de 2.3**; não homologar por aproximação.
11. Rastreio QR somente de pallet liberado, token inválido e troca de unidade recusados. Revogação individual e rate limit persistente ainda pendentes de 2.8; limitar exposição até fechamento.
12. Abrir painel como administrador e usuário comum; comum não acessa SQL. Conferir checksum/baseline sem supor execução. Testar PWA/câmera/offline no dispositivo físico e fila por usuário/unidade.
13. Financeiro/fiscal/comissão, compras completas e manutenção: **não disponíveis como ciclo completo**. Homologação fiscal com contador/provedor antes de qualquer emissão/transmissão; não há motor fiscal próprio.

Registrar resultado, operador, unidade, data, evidências e falha de cada passo; não ativar produção completa com passos críticos pendentes.

## 9. Dados iniciais

`03_seed_minimo.sql` é idempotente para ambiente novo com Fundação/06: empresa técnica, filiais e catálogo básico de permissões, sem login/senha/grant de unidade automático. Evento único na auditoria. Unidades de medida são preenchidas pela 06; classificações/papéis já são restrições do modelo. `DADOS_INICIAIS.csv` lista papéis/classificações/motivos existentes e propostas de condições de pagamento/refugo. Não foi criada uma tabela paralela para fingir seed de módulos ausentes: condições de pagamento e catálogo persistente de refugo dependem da implementação comercial/produção.
