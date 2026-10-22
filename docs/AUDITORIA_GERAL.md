# Auditoria geral — rodada de 22/10/2026

Inspeção estática de 44 páginas e 73 arquivos de API. Foram lidos os contratos centrais e os caminhos críticos de produção, cliente e autorização. A tabela abaixo é a matriz de cobertura por arquivo; não significa teste de navegação com dados reais. Banco de produção não consultado.

## Problemas confirmados e backlog

| Prioridade | Problema | Estado / destino |
| --- | --- | --- |
| P0 | Apontador/líder sem setores era tratado como sem restrição | Corrigido no leitor/histórico de operações e no apontamento legado; ciclo já recusava |
| P1 | Nome do cliente não selecionado no apontamento e precedências diferentes entre telas | Resolução única pelo CRM, com fallback de programação e código explícito; sem dedução por nome |
| P1 | Cliente/representante não existiam no recorte compartilhado | Contrato URL/SQL ampliado, opções vindas da projeção do mestre; migração 12 somente gerada |
| P1 | Schema ausente podia gerar 500 com erro interno | Normalização na barreira operacional: 503 aguardando migração |
| P1 | Código mestre não disponível em cadastros antigos | Campo aditivo 12; não inventar código nem preencher automaticamente; manutenção do cadastro na etapa C |
| P2 | DDL de bootstrap em rotas legadas (CRM, medições, entregas, estoque) | Backlog de retirar por módulo quando houver migração completa equivalente; não executar nesta rodada |
| P2 | Listas antigas usam limites fixos ou carregam programação inteira | Paginação medida por módulo nas próximas etapas; não afirmar lentidão sem perfil de execução |
| P2 | Cadastros/metas sem pedido não podem reagir por cliente sem regra de alocação | Mostrar escopo da unidade; não inventar rateio; revisar em F/H |
| P2 | Homologação de câmera, PWA, concorrência multi-conexão e dados reais | Exige ambiente de homologação, fora do banco produtivo; nenhum teste real alegado |
| P2 | Funcionalidades amplas C–H ainda parciais/ausentes conforme inventário | Implementar nas etapas correspondentes, sem duplicar entidades |

## Matriz de arquivos inspecionados

| Arquivo | Tipo | Evidência de autorização/escopo | Observações estáticas |
| --- | --- | --- | --- |
| `app/(erp)/acessos/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/andon/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/apontamento/[unidade]/page.tsx` | tela | entrada unidade | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/apontamento-entregas/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/apontamento-operacoes/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/apontamentos/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/carteira/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/comercial/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/configuracoes/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/consolidado/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/criticos/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/dashboard/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/engenharia/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/estoque/[unidade]/page.tsx` | tela | entrada unidade | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/estoque/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/excecoes/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/fluxo/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/gestao-pedidos/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/historico/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/inspecao-pallets/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/integracao-consistem/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/lideres/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/marketing/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/medicoes/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/ordens-fabricacao/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/pcp/[unidade]/page.tsx` | tela | entrada unidade | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/pcp-painel/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/perdas/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/performance/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/planejamento-mensal/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/prioridades/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/programacao/consolidado/page.tsx` | tela | entrada unidade | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/programacao/nordeste/page.tsx` | tela | entrada unidade | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/programacao/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/programacao/sul/page.tsx` | tela | entrada unidade | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/programacao-gerente/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/romaneios/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/sac/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/sequenciamento/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/(erp)/sobral-ia/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/admin/migracoes/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/login/page.tsx` | tela | indireta / revisar | tipos legados amplos; navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/rastreio/pallet/page.tsx` | tela | indireta / revisar | navegação/dados reais pendentes; proteção pode estar no layout/API |
| `app/api/admin/migracoes/route.ts` | API | RBAC | sem alerta automático; não equivale a homologação |
| `app/api/admin/usuarios/route.ts` | API | identidade central | limite SQL presente; paginação requer revisão funcional |
| `app/api/andon/route.ts` | API | barreira unidade, RBAC, sessão | tipos legados amplos |
| `app/api/auditoria/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/auth/login/route.ts` | API | identidade central | limite SQL presente; paginação requer revisão funcional |
| `app/api/auth/logout/route.ts` | API | indireta / revisar | revisar exceção pública ou autorização indireta |
| `app/api/capacidades/route.ts` | API | barreira unidade, RBAC, sessão | tipos legados amplos |
| `app/api/carteira/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/catalogo-produtos/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/comercial/crm/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/comercial/usinagem/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/controle-entregas/carregamentos/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/controle-entregas/etapas/route.ts` | API | barreira unidade, RBAC, identidade central | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/controle-entregas/importar/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/controle-entregas/prazos/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; tipos legados amplos |
| `app/api/controle-entregas/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/controle-entregas/usuarios/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/engenharia/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional |
| `app/api/estoque/cadastros/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/estoque/inventarios/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/estoque/movimentos/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/estoque/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/gestao-entregas/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/gestao-producao/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/ia/acao/route.ts` | API | barreira unidade, sessão | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/ia/aps/route.ts` | API | barreira unidade, sessão | tipos legados amplos |
| `app/api/ia/arquivos/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional |
| `app/api/ia/centro/route.ts` | API | barreira unidade, sessão | sem alerta automático; não equivale a homologação |
| `app/api/ia/chat/route.ts` | API | barreira unidade, sessão | tipos legados amplos |
| `app/api/ia/conhecimento/historico/route.ts` | API | barreira unidade, sessão | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/ia/conhecimento/route.ts` | API | barreira unidade, sessão | bootstrap DDL a revisar; tipos legados amplos |
| `app/api/ia/feedback/route.ts` | API | barreira unidade, sessão | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/ia/romaneio/exportar/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/ia/romaneio/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/ia/whatsapp/route.ts` | API | identidade central | bootstrap DDL a revisar; tipos legados amplos |
| `app/api/importar/complementar/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/importar/filtro/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/importar/pedido/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/industrial/overview/route.ts` | API | barreira unidade, sessão | tipos legados amplos |
| `app/api/integracao-consistem/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/inteligencia/resumo/route.ts` | API | barreira unidade, sessão | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/marketing/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional |
| `app/api/me/route.ts` | API | sessão | sem alerta automático; não equivale a homologação |
| `app/api/medicoes/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional |
| `app/api/operacoes/[id]/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/ordens-fabricacao/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/pallets/fotos/route.ts` | API | barreira unidade, RBAC, sessão | tipos legados amplos |
| `app/api/pallets/public-link/route.ts` | API | barreira unidade, RBAC | sem alerta automático; não equivale a homologação |
| `app/api/pallets/public-tracking/route.ts` | API | token assinado, identidade central | limite SQL presente; paginação requer revisão funcional |
| `app/api/pallets/route.ts` | API | barreira unidade, RBAC, sessão | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/pcp/operacoes/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/pcp/painel/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/pcp/recursos-regras/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/pedidos/local-montagem/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; tipos legados amplos |
| `app/api/pedidos/tipo/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/perdas/route.ts` | API | barreira unidade, RBAC, sessão | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/prioridades/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/producao-diaria/route.ts` | API | barreira unidade, RBAC, sessão | bootstrap DDL a revisar; tipos legados amplos |
| `app/api/programacao-mensal/route.ts` | API | barreira unidade | sem alerta automático; não equivale a homologação |
| `app/api/programacoes/ativa/route.ts` | API | barreira unidade, sessão | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/programacoes/historico/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/programacoes/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/realtime/auth/route.ts` | API | barreira unidade | sem alerta automático; não equivale a homologação |
| `app/api/romaneios/etiquetas/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/romaneios/gerar/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/romaneios/preparados/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/romaneios/processar/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/romaneios/processar-filtro/route.ts` | API | barreira unidade, RBAC | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional; tipos legados amplos |
| `app/api/sac/cadastros/route.ts` | API | barreira unidade, RBAC | limite SQL presente; paginação requer revisão funcional |
| `app/api/sac/route.ts` | API | barreira unidade, RBAC, sessão | bootstrap DDL a revisar; limite SQL presente; paginação requer revisão funcional |
| `app/api/sequenciamento/route.ts` | API | barreira unidade, RBAC | tipos legados amplos |
| `app/api/unidades/consolidado/route.ts` | API | indireta / revisar | limite SQL presente; paginação requer revisão funcional; revisar exceção pública ou autorização indireta |
| `app/api/unidades/route.ts` | API | identidade central | sem alerta automático; não equivale a homologação |
