# Módulo de Inspeção, Qualidade e MSAC de Pallets — V8.2

## Fluxo implantado
1. Cadastro do pallet com Pedido, Cliente, Filtro, Pallet, Tipo, Quantidade, Jogos, Turno, Destino, Montador e Conferente.
2. Inspeção guiada com checklist e observação.
3. Evidências fotográficas pelo celular/tablet (câmera traseira), comprimidas no navegador antes do envio.
4. Qualidade pode LIBERAR ou BLOQUEAR.
5. MSAC recebe etapa própria. A liberação MSAC só pode ocorrer após a Qualidade liberar.
6. O pallet só fica LIBERADO quando Qualidade + MSAC estão LIBERADOS.
7. Qualquer bloqueio deixa o pallet em BLOQUEADO e exige motivo.
8. Ações e inspeções ficam rastreadas por usuário/data.
9. Etiqueta de pallet gerada para impressão, com status, pedido, filtro, quantidade, jogos e responsáveis.

## Referências funcionais estudadas
- Tulip Frontline QMS: inspeção digital, registro de não conformidade e evidências no chão de fábrica.
- TOTVS Controle de Qualidade / rastreabilidade: estados de inspeção, liberação/rejeição e bloqueio de lote.
- Siemens Opcenter/Teamcenter Quality: registro de não conformidade conectado à execução e contenção/rastreabilidade.

## Armazenamento de fotos
Nesta versão as fotos são comprimidas (máx. 1280 px, JPEG ~76%) e armazenadas no Neon para o módulo funcionar sem serviço externo adicional. Para grande volume histórico, migrar as imagens para armazenamento de objetos (S3/R2/Blob) e manter no Neon apenas URL/metadados.

## Banco
Execute uma vez:
`database/migrations/2026-10-02_pallet_quality_msac.sql`

A migração é idempotente (`create table/index if not exists`).

## Vercel
Nenhuma nova variável de ambiente é necessária nesta versão.
