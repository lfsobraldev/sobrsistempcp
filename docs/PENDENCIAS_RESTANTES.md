# O que ainda falta (para retomar)

## Antes de usar em produção
- Aplicar as migrações 25 e 26 nas duas unidades; a unidade que falhou precisa antes das migrações 14 a 24 (conferir com `schema_migrations`).
- Merge do PR #69 e `CRON_SECRET` na Vercel (mín. 16 caracteres).
- Cadastros: plano de contas (semear), centros de custo, contas bancárias, depósitos, estoque mínimo, alçadas de compra, instrumentos e planos de qualidade, ativos de manutenção, regras fiscais.
- Telas novas nunca foram abertas em navegador neste ambiente; fazer uma passada visual (estoque-avancado, vendas, financeiro, compras, SAC, qualidade, engenharia).

## Funcional, ainda não feito
- Configurador de produto (porta por medidas/opções gerando BOM e roteiro).
- Plano de corte / aproveitamento de chapas e perfis.
- Portal do fornecedor: hoje só confirma a data de entrega (sem cotação nem envio de e-mail; o link é copiado e enviado manualmente).
- Envio automático de e-mail/WhatsApp (alertas, links do portal, cobrança).
- Inventário cíclico: sem coletor/leitor de código de barras e sem recontagem em duas etapas por pessoas diferentes.
- Endereçamento: sem sugestão automática de endereço no recebimento e sem separação por endereço (picking).
- Rotina agendada roda 1x ao dia; a cada 15 min exige plano Pro da Vercel.
- Substitutos: sem aviso na reserva/MRP de que o componente tem substituto disponível (a função `erp_substitutos_disponibilidade` existe, mas não está ligada a uma tela).
- Importação de medições: só xlsx/csv; sem leitura direta de paquímetro/instrumento.
- Fiscal real (NF-e) e cobrança real (boleto/PIX): continuam simulados até haver provedor contratado.

## Decisões suas pendentes
- Qual unidade entra primeiro (Sul ou Nordeste).
- Plano de contas vem de planilha ou fica o padrão do sistema.
- Quem aprova documentos e compras acima de R$ 5.000.
- Alertas e webhooks automáticos a cada 15 min ou só diário/por botão.
- Nome "Famossul": é o nome da empresa? (não foi colocado em nenhuma tela).

## Testes
- 7 falhas antigas de `xlsx` (pacote ausente neste ambiente), fora do escopo.
