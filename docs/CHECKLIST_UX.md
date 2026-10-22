# Checklist de UX responsivo

Breakpoints: celular < 600px · tablet 600–1023px · desktop ≥ 1024px. Camada em `app/erp-responsive.css`; tabelas viram cartões via `components/responsive-tables.tsx` (preenche `data-label` a partir do `<thead>`).

Testar em **360px**, **768px** e **1440px** nas telas: Pedidos de Venda (`/vendas`), Comissões (aba), Rastreio e Onde é Usado (`/producao-consultas`), Ordens de Fabricação, Apontamento de Operações, Estoque, Programação.

Para cada tela e largura:
- [ ] Sem rolagem horizontal da página.
- [ ] Tabela vira cartões no celular (rótulo à esquerda, valor à direita).
- [ ] Todo botão tem ação; só um botão primário por tela.
- [ ] Alvos de toque ≥ 44px (celular/tablet).
- [ ] Modal ocupa a tela toda no celular, rodapé de ações visível.
- [ ] Botão desabilitado mostra o motivo (texto de apoio ou alerta).
- [ ] Ação destrutiva (cancelar, devolver) pede confirmação/motivo.
- [ ] Nome do cliente e do representante visíveis nas listas.
- [ ] Teclado (desktop): Tab percorre na ordem, foco visível, Esc fecha modal, Ctrl+K foca a busca de módulos.
- [ ] Estados: carregando, vazio e erro mostram mensagem clara.
