# Sincronizador Consistem — implantação segura

O Consistem possui uma versão web e permite exportar o CSV em **Programação de Produção → Resumida → Detalhada**.

## Instalação no computador autorizado da fábrica

1. Instale Node.js LTS e tenha Chrome/Chromium disponível.
2. Na pasta do projeto, execute `npm install --no-save playwright` e `npx playwright install chromium`.
3. Configure a variável `CONSISTEM_URL` no terminal **local** (não salve credenciais no GitHub).
4. Execute `node scripts/consistem/exportador.cjs --configurar`.
5. Entre no Consistem, navegue para o filtro do mês (ex.: 10/2026, 54 até 54), selecione **Peças do Conjunto**, clique em Consultar e depois em Detalhada.
6. Ao chegar à tela Detalhada, pressione Enter no terminal e exporte CSV pelo menu do Consistem.
7. O arquivo ficará em `.consistem-local/csv/`. Confira número de linhas e importe pela aba **Integração Consistem** do Sobral PCP, primeiro em **Conferir CSV**.

## O que falta antes de agendar automaticamente

A interface do Consistem precisa ser calibrada com seletores reais em um computador autorizado. O script não automatiza login nem coleta senhas. O modo sem `--configurar` para intencionalmente com erro até essa calibração. Não agende no Windows ainda.

Também falta configurar autenticação própria e rastreabilidade para envio automatizado ao PCP. Não usar a senha do PCP em script nem expor token no navegador. A sincronização oficial deve ser habilitada apenas depois de testar um CSV completo, garantir a correspondência das OFs e impedir que importações antigas sobrescrevam informações recentes.

**Regra:** nunca alterar romaneios, programação-base, quantidades planejadas, nem distribuir porcentagens de uma coluna agregada entre múltiplos setores sem mapeamento comprovado.
