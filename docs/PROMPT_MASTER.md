# Prompt Master — regras vigentes

Fonte: instruções do usuário nesta conversa. O arquivo não existia na retomada.

- Evoluir o ERP existente, sem módulos/tabelas/rotas paralelos para conceitos já existentes. Consultar INVENTARIO_EXISTENTE e PROGRESSO antes de alterar.
- Próxima entrega: Etapa A (fechar filtros, histórico, consolidado, RBAC e assistente mensal); depois Etapa B (engenharia, OF, produção e estoque como ciclo integrado). Parar após B.
- Uma branch e um commit por etapa, com testes, TypeScript e build aprovados. Enviar branch e informar link /pull/new/branch. Sem merge nem deploy. O terminal não possui credenciais de push; envio autenticado pelo conector GitHub foi autorizado nesta conversa.
- Bloquear auto-deploy nas branches antes do envio. Não modificar a produção.
- SQL: apenas gerar migrações sequenciais, idempotentes, com up/down e expand/contract. Nunca executar comandos contra o banco de produção. Testes SQL somente em banco local isolado.
- TypeScript estrito, Zod, paginação de consultas, RBAC no servidor, auditoria nas escritas e empresa/filial nos novos documentos. Sem segredos no repositório.
- Ausência de migração: mostrar “Módulo aguardando migração”. Funcionalidades de risco ficam sob flags desligadas por padrão.
- Preservar pallets, QR, qualidade/MSAC, programação e os ledgers existentes. Não apagar histórico de produção nem eventos.
- Registrar decisões em SUPOSICOES, bugs em BUGS_PCP, progresso/validação/links em PROGRESSO e inventário atualizado. Não declarar implementado o que não foi entregue/testado.
- A: recorte unidade/mês/filtro/pedido nas visões operacionais, URL compartilhada; arquivamento seguro do histórico; consolidados detalhados; assistente de importação em passos.
- B: roteiros/versionamento/centros/turnos, versão de produção, snapshot, filhos de semiacabados, reservas, consumo por operação, entradas/estornos, pendências, lotes/séries, rastreio, valorização, transferências em trânsito e PWA idempotente. Testar ciclo ponta a ponta em ambiente local.

## Rodada completa — instrução vigente de 22/10/2026
A regra anterior de parar após B foi substituída pelo usuário: executar A auditoria; B produção; C comercial; D medições/qualidade; E estoque/compras; F MRP/custos; G fiscal por adaptador; H financeiro/manutenção/transversal. Uma branch por etapa, com pesquisa atualizada antes de cada módulo, inventário e progresso; testes/tipos/build antes de publicar, sem merge/deploy nem banco real. Relatórios em RELATORIO_RODADA, PESQUISA_ERP e AUDITORIA_GERAL. Fiscal somente fontes oficiais, parâmetros versionados com vigência e homologação do contador; não fixar alíquotas ou cronogramas no código.

## Fechamento e implantação — instrução vigente

Nova rodada parte da main atualizada, sem encadear branches pendentes; reaproveitamento por diff deve ser registrado. Não acessar nenhum banco remoto, inclusive leitura. Validar SQL em PGlite local descartável; produzir pacote de implantação presencial, inventário/checagens/baseline/seed/smoke. Auditar todos os módulos e manter parcial/ausente até evidência funcional. Execução 2.1–2.8 continua solicitada; pacote não substitui módulos ainda ausentes. Nenhum merge/deploy. Publicação com branch enviada e link /pull/new.
