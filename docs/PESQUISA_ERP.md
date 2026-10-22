# Pesquisa ERP — rodada completa

Consulta em **22/10/2026**. Pesquisa por módulo será ampliada no início de cada etapa. Fontes oficiais de fabricantes; funcionalidades são referências de produto, não regras tributárias do sistema.

| Módulo | Funcionalidades de mercado | O sistema já tem | Falta identificada | Decisão |
| --- | --- | --- | --- | --- |
| A — cadastro compartilhado e identificação em documentos | Business Central usa ficha de cliente nos documentos de venda; contatos, modelos e políticas comerciais associados. Protheus mantém cadastro comum com código, loja, nome/fantasia e dados complementares. Odoo centraliza contatos e vínculos comerciais | CRM com clientes/representantes, vínculo por ID no controle de entregas, nomes textuais no legado | Apontamento não selecionava cliente; precedências divergentes; filtros sem cliente/representante e códigos mestres ausentes | Reusar CRM e vínculo existente; projeção operacional única, fallback explícito e filtro por identidade/código. Não criar outro cadastro nem identificar pessoas por semelhança de nome |

Fontes consultadas:

- Microsoft Learn: [Register new customers](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-register-new-customers) — ficha comum, modelos e condições comerciais. Consulta 22/10/2026.
- TOTVS: [SIGAFAT — nota sobre pré-cadastro de cliente](https://centraldeatendimento.totvs.com/hc/pt-br/articles/4414131689239-Cross-Segmento-TOTVS-Backoffice-Linha-Protheus-SIGAFAT-Nota-sobre-pr%C3%A9-cadastro-de-cliente) — cadastro comum, identificação e complementação. Consulta 22/10/2026.
- Odoo: [Contacts — documentação 19](https://www.odoo.com/documentation/19.0/applications/essentials/contacts.html) — referência localizada na pesquisa; abertura integral indisponível nesta consulta. Não foram inferidos detalhes não verificados.

Etapas B–H: pesquisa específica ainda pendente; nenhuma regra fiscal foi pesquisada ou implementada nesta etapa A. Na G, consultar Portal NF-e, Receita Federal, CGIBS e Sefaz e registrar versão/data e necessidade de homologação fiscal.
