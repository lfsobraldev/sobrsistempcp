# Plano: o que acrescentar, ajustar e mudar (referência: SAP Business One / S4 para manufatura)

## Decisões já tomadas
1. Primeira unidade: **Nordeste**. Cada unidade com sua tela e seu login: login do Sul só vê o Sul, login do Nordeste só vê o Nordeste, sem misturar dados (bancos separados; a base já isola por unidade).
2. Cargos novos acima de gerente (Diretor e demais).
3. Alertas/webhooks: não precisa de frequência de 15 min; fica diário.
4. "Famossul" é o nome da empresa; mantê-lo (usar na tela de login, loading e cabeçalho).

## A. Ajustar (o que já existe)
- **Isolamento por unidade**: conferir de ponta a ponta que um login com acesso a uma só unidade nunca enxerga a outra (tela, API, exportação, link público, relatórios consolidados). Hoje só PCP/GERENTE com as duas unidades têm visão consolidada; a regra passa a ser: consolidado só para Diretor e quem tiver as duas unidades concedidas.
- **Nordeste**: aplicar as migrações 14 a 26 em ordem (roteiro único), homologar a identidade do banco e criar os logins da unidade.
- **Nome da empresa** na identidade visual (login, carregamento, topo da tela).
- **Telas novas**: passada visual e de usabilidade em celular.
- **Rotina agendada** diária (já configurada).

## B. Acrescentar (lacunas frente ao SAP)
Prioridade alta
1. **Hierarquia de cargos e alçadas**: Diretor > Gerente > Coordenador/Supervisor > Encarregado > Líder > Apontador, mais funcionais (Comprador, Financeiro, Fiscal, Almoxarife, Manutenção). Aprovações por valor e por cargo (compras, descontos, ajustes de estoque, baixas).
2. **Matriz de permissões por cargo e por tela** editável pelo Diretor (hoje fixa no código).
3. **Aprovação em fluxo** (solicitar, aprovar, rejeitar, delegar) com histórico, comum a compras, descontos, ajustes e documentos.
4. **Cadastros mestres completos** (parceiros de negócio, itens, depósitos, centros de custo) com importação por planilha.
5. **Relatórios padrão e exportação** (Excel/PDF) em todas as telas, com filtros salvos.
Prioridade média
6. **Configurador de produto** (porta por medida/opção gerando estrutura e roteiro).
7. **Plano de corte** e aproveitamento de material.
8. **Planejamento de capacidade finita (APS)** integrado ao MRP com replanejamento.
9. **Notificações** (e-mail/WhatsApp) para aprovações, atrasos e portal do fornecedor.
10. **Fiscal e cobrança reais** (NF-e, boleto/PIX) quando houver provedor contratado.
Prioridade baixa
11. Coletor de código de barras em estoque e expedição; picking por endereço.
12. Auditoria consultável (quem mudou o quê) em tela única; trilha para o Diretor.
13. Painel executivo do Diretor (OTIF, OEE, margem, caixa) por unidade e consolidado.

## C. Mudar
- Perfil passa de lista fixa para **cargo + permissões**; os 10 perfis atuais continuam funcionando como cargos iniciais.
- Aprovação de compras hoje tem 2 alçadas (PCP e Gerente); passa a seguir o cargo configurado, incluindo Diretor acima de um valor a definir.

## D. Ordem sugerida
1. Nordeste no ar (migrações, logins, isolamento conferido).
2. Cargos, permissões e fluxo de aprovação.
3. Cadastros mestres e relatórios/exportação.
4. Configurador e plano de corte.
5. Notificações, fiscal e cobrança reais.

## E. Dúvida que ainda preciso de você
- Quais cargos existem de fato na empresa acima de Gerente e quais funcionais (nomes exatos), e a partir de que valor o Diretor aprova compras.

Referências consultadas: SAP Business One manufacturing (SEIDOR, ERP Research, Tipalti).
