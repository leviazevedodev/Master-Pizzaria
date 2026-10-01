# Revisão técnica Master Pizzaria — 30/09/2026

Alterações implementadas no checkout existente, backend Express/Prisma e frontend React/PWA. Base local: commit f6c9ee0, branch main. Nesta revisão não houve push ao GitHub, deploy ou execução de migration no banco de produção.

Validação final: 133 testes backend e 81 frontend passaram. Build padrão de produção do frontend passou. Há pendências de homologação com serviços externos e aparelhos reais, descritas abaixo.

## 1. Problemas encontrados

| Tópico | Diagnóstico e correção |
| --- | --- |
| 1. Cartão | O código inicializava o Mercado Pago em dois pontos e marcava o SDK como pronto imediatamente, sem aguardar o carregamento. A criação do wrapper podia rejeitar fora do callback e o timer genérico ocultava a etapa que falhou. A integração passou a aguardar o SDK oficial e o container, tratar rejeições, desmontar o controlador e serializar remontagens. A causa específica do incidente em produção ainda não foi confirmada por console/rede. |
| 2. Histórico navegador/PWA | Visitantes dependiam dos códigos no localStorage, que pode ser isolado entre navegador e PWA. Novos pedidos guardam e-mail no servidor; o visitante verifica a posse desse e-mail com código de uso único. Login continua consultando userId. Códigos completos antigos permitem vincular pedidos legados. |
| 3. Impressão do entregador | A interface compartilhava callbacks de impressão e a autorização da rota dependia só de acesso à cozinha. O callback e os botões foram removidos do entregador, e a API nega esse perfil explicitamente. |
| 4. Mesas mobile | A grade continuava vertical. No breakpoint mobile, tornou-se um trilho horizontal com overflow e scroll-snap. |
| 5. Entregadores | Não existia visão da nota específica da entrega. A média considera deliveryRating, sem notas ausentes como zero. |
| 6. Comida por período | Faltavam as janelas de qualidade. Total/3h/6h/12h usam order.readyAt, o término real registrado pela cozinha. Pedidos sem readyAt não recebem horário inventado. |
| 7. Aprovação | As consultas públicas exigem APPROVED; analytics interno utiliza avaliações vinculadas a pedidos independentemente de PENDING/APPROVED/HIDDEN. |
| 8. Avaliação no pedido | O include e o detalhe administrativo não exibiam review. Agora apresentam notas, comentário, data e entregador; ausência mostra Ainda não avaliado. |
| 9. Histórico do entregador | O filtro não limitava a idade de DELIVERED. A lista e o detalhe aplicam deliveredAt maior que agora menos sete dias e vínculo com o entregador. |
| 10. Atendimento | Entregues não estava entre as opções da visão de Atendimento. O filtro foi incluído e a gestão pode consultar entregues antigos ao abrir essa fila. |
| 11. Desmarcar sabor | Checkboxes de sabores de origem automática eram bloqueados; a sincronização apagava/recriava links e repunha seleções. Agora enabled=false remove o sabor do conjunto permitido no banco e impede que a sincronização o reative. O registro inativo retém preço para futura reativação. |
| 12. Preço por sabor | ProductFlavor não guardava modo/acréscimo. A relação passou a armazenar BASE_PRICE/HIDDEN_PRICE/SURCHARGE, com default BASE_PRICE para os dados existentes. |
| 13. Cálculo | Frontend, backend, combos e pedir novamente precisavam usar a regra da relação. Checkout recalcula com dados do banco e grava preços/snapshot no pedido. HIDDEN_PRICE mantém a regra de cálculo base e oculta o rótulo; SURCHARGE substitui o preço efetivo do sabor por base do produto + acréscimo, respeitando MAX/AVERAGE. Regras explícitas do combo continuam tendo prioridade sobre NORMAL. |
| 14. Notificações cozinha | Removido o toggle manual e sua persistência exclusiva. Atualização automática e notificações previamente autorizadas do sistema continuam. |
| 15. Servir fullscreen | Retirada a ação do fullscreen do salão; o fluxo de serviço nas mesas permanece. |
| 16. Tema fullscreen | CSS de focus-screen impunha paleta escura. A classe clara/escura vem da mesma chave do painel, lida antes da renderização. |
| 17. Contador | O número era exibido integralmente. compactCount abrevia somente a apresentação. O contador existente no projeto representa clientes/pedidos entregues; não há contador público separado de visualizações. |
| 18. UX sabores | Configurações por sabor aparecem em expansão, apenas quando selecionado; o campo de acréscimo aparece apenas no modo correspondente. |

## 2. Arquivos alterados

Raiz: C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria

| Arquivo | Motivo |
| --- | --- |
| [backend/prisma/schema.prisma](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/prisma/schema.prisma>) | Campos de preço/ativação por Produto × Sabor, e-mail do pedido e verificação de visitante. |
| [backend/prisma/migrations/20260930000000_product_flavor_pricing/migration.sql](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/prisma/migrations/20260930000000_product_flavor_pricing/migration.sql>) | Migration expansiva com defaults, índices e constraints; mantém registros existentes. |
| [backend/src/server.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/src/server.js>) | Histórico verificado, serializers, analytics, revisão nos pedidos, impressão, vínculos de sabores, checkout e pedir novamente. |
| [backend/src/guest-order-access.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/src/guest-order-access.js>) | Hash do código, token de escopo exclusivo e filtro por e-mail verificado. |
| [backend/src/product-flavors.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/src/product-flavors.js>) | Persistência dos sabores permitidos e regras de preço por vínculo. |
| [backend/src/review-analytics.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/src/review-analytics.js>) | Médias internas de comida e entrega; janelas baseadas em readyAt. |
| [backend/src/order-access.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/src/order-access.js>) | Restrição do entregador por deliveredAt e bloqueio de impressão. |
| [backend/src/flavor-pricing.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/src/flavor-pricing.js>) | BASE_PRICE, HIDDEN_PRICE e SURCHARGE na cotação central e correção do sabor obrigatório. |
| [backend/src/combos.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/src/combos.js>) | Sabores habilitados e acréscimos por vínculo na regra NORMAL do combo. |
| [frontend/public/sw.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/public/sw.js>) | Versão do cache atualizada para carregar o frontend corrigido. |
| [frontend/src/components/CardPaymentBrick.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/CardPaymentBrick.jsx>) | Ponte React para montagem/desmontagem do Brick. |
| [frontend/src/lib/mercadoPagoCard.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/lib/mercadoPagoCard.js>) | Carregamento único do SDK oficial, erros explícitos e fila de ciclo de vida do Brick. |
| [frontend/src/pages/CheckoutPage.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/pages/CheckoutPage.jsx>) | Inicialização do cartão, mensagens seguras, nova tentativa e e-mail do histórico. |
| [frontend/src/pages/GuestOrdersPage.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/pages/GuestOrdersPage.jsx>) | Verificação por e-mail, histórico do servidor e recuperação de códigos antigos. |
| [frontend/src/pages/AdminPage.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/pages/AdminPage.jsx>) | Tema compartilhado, impressão por perfil, configurações de sabores e carregamento do histórico de entregues. |
| [frontend/src/components/admin/OrderWorkspace.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/admin/OrderWorkspace.jsx>) | Entregues no Atendimento, avaliação no detalhe e ausência de impressão para entregador. |
| [frontend/src/components/admin/AdminDashboardSections.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/admin/AdminDashboardSections.jsx>) | Descrição da fila Entregues no Atendimento. |
| [frontend/src/components/admin/TeamAnalytics.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/admin/TeamAnalytics.jsx>) | Médias dos entregadores e comida nos períodos Total/3h/6h/12h. |
| [frontend/src/components/admin/ProductEditorModal.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/admin/ProductEditorModal.jsx>) | Checkboxes editáveis e configurações de preço em expansão por sabor. |
| [frontend/src/components/admin/advanced/KitchenAdmin.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/admin/advanced/KitchenAdmin.jsx>) | Remove controle manual de notificações e ação de servir do fullscreen; recebe o tema do painel. |
| [frontend/src/components/admin/MarketingAdmin.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/admin/MarketingAdmin.jsx>) | Prévia do contador usa a mesma abreviação do site. |
| [frontend/src/components/PizzaBuilderModal.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/PizzaBuilderModal.jsx>) | Prévia por vínculo, oculta rótulos HIDDEN_PRICE e bloqueia inclusão sem sabores disponíveis. |
| [frontend/src/components/ConfigurableComboFlow.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/components/ConfigurableComboFlow.jsx>) | Exibição de preços por vínculo e ocultação de rótulos HIDDEN_PRICE. |
| [frontend/src/lib/comboConfigurator.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/lib/comboConfigurator.js>) | Prévia coerente dos acréscimos no combo. |
| [frontend/src/lib/productCustomizer.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/lib/productCustomizer.js>) | Sabor original obrigatório somente quando permitido e validação de catálogo vazio. |
| [frontend/src/lib/adminTheme.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/lib/adminTheme.js>) | Reutiliza a chave de tema existente e define a classe do fullscreen. |
| [frontend/src/lib/format.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/lib/format.js>) | Utilitário compactCount em pt-BR. |
| [frontend/src/pages/HomePage.jsx](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/pages/HomePage.jsx>) | Contador público abreviado. |
| [frontend/src/styles.css](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/src/styles.css>) | Trilho horizontal de mesas, fullscreen claro e layout de avaliações, sabores e verificação. |
| [backend/test/flavor-pricing.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/test/flavor-pricing.test.js>) | Modos de preço, acréscimos por produto e sabor original desmarcado. |
| [backend/test/order-access.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/test/order-access.test.js>) | Limite de 6/7 dias, histórico administrativo e bloqueio da impressão. |
| [backend/test/guest-order-access.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/test/guest-order-access.test.js>) | Escopo do token, consulta do mesmo cliente e rejeição de códigos de outro e-mail. |
| [backend/test/product-flavors.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/test/product-flavors.test.js>) | Marcar/desmarcar/reativar, retenção de preço, dois produtos e valores inválidos. |
| [backend/test/review-analytics.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/backend/test/review-analytics.test.js>) | Pendentes internamente, aprovação pública, médias e período por preparo. |
| [frontend/test/card-payment-integration.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/test/card-payment-integration.test.js>) | Montagem, falha do SDK, carregamento único/retry e remontagem assíncrona. |
| [frontend/test/combo-configurator.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/test/combo-configurator.test.js>) | Prévia do acréscimo específico do produto. |
| [frontend/test/product-customizer.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/test/product-customizer.test.js>) | Bloqueio do sabor original e ausência de sabores disponíveis. |
| [frontend/test/requested-adjustments.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/test/requested-adjustments.test.js>) | Atualiza o contrato de apresentação do contador. |
| [frontend/test/admin-theme.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/test/admin-theme.test.js>) | Tema claro/escuro recuperado pela mesma chave. |
| [frontend/test/compact-count.test.js](<C:/Users/levia/Documents/ChatGPT/Master Pizzaria/_review_master_pizzaria_2026-09-23/master-pizzaria/frontend/test/compact-count.test.js>) | Exemplos de abreviação sem alterar os números originais. |

Este relatório é o artefato adicional de entrega.

## 3. Banco de dados

Migration: 20260930000000_product_flavor_pricing.

- ProductFlavor: enabled boolean default true, priceMode default BASE_PRICE e surcharge decimal default zero.
- Constraints: modos reconhecidos e acréscimo não negativo; execução dentro de BEGIN/COMMIT para evitar aplicação parcial.
- Order: customerEmail opcional com índice por e-mail/data.
- GuestOrderVerification: hash HMAC do código, expiração, tentativas e marca de uso único, com índices.
- Nenhum pedido/produto é apagado pela migration. Não foi usado reset ou db push.
- Prisma validate e prisma generate passaram. A diferença entre schema anterior e novo foi conferida com prisma migrate diff.
- A migration ainda não foi aplicada a um PostgreSQL de homologação/produção: não há arquivo backend/.env nem conexão de banco disponível nesta sessão.
- Antes de executar o backend novo no ambiente publicado, aplicar a migration com o mecanismo existente: npm run prisma:migrate. Ele usa DIRECT_URL. Confirmar depois com npm run prisma:status.
- A política de retenção já existente passa a anonimizar customerEmail junto aos demais dados pessoais. Após a anonimização, esse pedido deixa de ser recuperável por e-mail; a retenção não foi ampliada.

## 4. APIs

Criadas:

- POST /api/guest-orders/request-access: envia código de acesso via Resend.
- POST /api/guest-orders/verify: verifica código, expiração, até cinco tentativas e uso único; emite token exclusivo de histórico.
- GET /api/guest-orders: recupera somente pedidos de visitante associados ao e-mail verificado.
- POST /api/guest-orders/claim: vincula pedido antigo sem e-mail mediante posse do código completo de acompanhamento.

Modificadas:

- POST /api/orders: valida/persiste e-mail e recalcula sabores com regras por vínculo.
- GET /api/me/orders e GET /api/me/orders/:id/reorder: histórico por usuário e cotação atual dos sabores.
- GET /api/admin/orders: filtro por perfil; status=DELIVERED permite consultar o histórico da fila sob a mesma autorização. Consulta automática padrão permanece limitada aos 250 recentes.
- GET /api/admin/orders/:id e PATCH de status: aplicam visibilidade do entregador e serializer por perfil.
- GET /api/admin/team-analytics: agrega quality.food e quality.couriers.
- PATCH /api/admin/kitchen/orders/:id/printed: entregador recebe 403.
- POST/PATCH /api/admin/products: configurações de preço/seleção persistidas por ProductFlavor.
- Cotação de combos usa vínculos permitidos e seus preços; a API de cartão existente e o PIX continuam usando seus fluxos originais de cobrança.

## 5. Frontend

- Cartão usa o SDK JavaScript oficial e um componente React com limpeza e remontagem controladas.
- Checkout exige e-mail para recuperação do histórico. No navegador/PWA novo, visitante confirma esse e-mail uma vez para carregar o servidor.
- Meus pedidos preserva códigos locais como fallback e tenta vincular códigos antigos ao e-mail verificado.
- Entregues no Atendimento; detalhe administrativo apresenta a avaliação, inclusive pendente.
- Gestão exibe qualidade da comida por período e notas específicas dos entregadores.
- Editor permite desmarcar sabores de origem em produtos e configurar preço por vínculo.
- Configurador, combos e carrinho recebem a prévia correta; backend confirma o valor final.
- Mobile usa trilho horizontal nas mesas. Fullscreen cozinha/salão recebe tema claro/escuro.
- Contador público e sua prévia administrativa usam abreviação; o campo numérico de configuração continua com o valor inteiro.

## 6. Segurança

- Nenhuma busca pública de histórico por telefone.
- Token de visitante exige audience/issuer exclusivos e assinatura HS256; não substitui token de conta.
- Código de acesso guardado como HMAC, expira em dez minutos e só pode ser usado uma vez.
- Consumo do código é condicional/atômico e ligado ao hash atual, evitando aceitar uma tentativa substituída durante reenvio.
- Recuperação legada exige o código completo aleatório; não sobrescreve vínculo de e-mail já existente.
- E-mail de recuperação não é incluído nos serializers de pedidos. Avaliação interna é retirada da resposta do entregador.
- Impressão negada no servidor ao entregador; histórico de sete dias também vale para acesso direto ao detalhe.
- Regras de preço/modo/acréscimo validadas; valores negativos, não finitos e frações menores que centavos são rejeitados.
- Cliente envia IDs/seleções; backend utiliza valores do banco. Logs adicionados do cartão não incluem PAN, CVV, token ou payload de pagamento.

## 7. Testes

- Backend: npm test — 133/133, zero falhas.
- Frontend: npm test — 81/81, zero falhas.
- Cobertura nova: inicialização e rejeição do SDK, carregamento único/retry, desmontagem e remontagem assíncrona; isolamento de histórico/token/código; 6 versus 7 dias e impressão; pendentes internos versus aprovação pública; deliveryRating e readyAt; marcar/desmarcar/reativar e modos/acréscimos por produto; tema e abreviação.
- Alguns testes de API/UI são verificações de contrato do código e testes de lógica com doubles. Não equivalem a teste integrado com PostgreSQL, SDK externo, aparelho ou pagamento real.
- git diff --check não encontrou erro de whitespace. Avisos de conversão LF/CRLF do Git refletem a configuração Windows.

## 8. Build

- Frontend: npm.cmd run build — PASSOU, Vite, 2025 módulos; sem warning de build.
- O sandbox inicialmente negou acesso ao Vite ao carregar a configuração; o comando padrão passou ao executar fora do sandbox. A configuração de build do projeto foi preservada.
- Backend: não existe script build; é JavaScript executado por Node. node --check src/server.js, testes e geração do Prisma Client PASSARAM.
- Prisma validate — PASSOU.
- Lint/typecheck: não existem scripts/configuração correspondentes no projeto; não foram apresentados como executados.
- Console do navegador: não conferido. A ferramenta Computer Use encerrou a captura porque não identificou a URL do Edge com segurança.

## 9. Pendências

1. Homologar o formulário e uma cobrança de cartão com credenciais de teste do Mercado Pago e verificar PIX no mesmo ambiente.
2. Aplicar e testar a migration em PostgreSQL de homologação antes da publicação coordenada de backend/frontend.
3. Para recuperação por e-mail, configurar RESEND_API_KEY e EMAIL_FROM com remetente válido no backend. Sem isso, a API informa indisponibilidade e permanece o acompanhamento por código.
4. Testar navegador → PWA e PWA → navegador, conta e visitante, recarga/reabertura, Chrome/Android e Safari/iPhone.
5. Conferir toque/scroll das mesas e fullscreen claro/escuro em aparelho real; a captura do Edge foi bloqueada pela ferramenta.
6. Esta revisão permanece local. Não há confirmação de publicação no GitHub, Netlify ou backend, e o site ativo não foi declarado atualizado.

## 10. Checklist final

“Concluído no código” significa implementação e verificações possíveis no repositório. Não significa homologação em produção.

| # | Solicitação | Estado |
| --- | --- | --- |
| 1 | Cartão | Código concluído; aceite de pagamento real pendente. |
| 2 | Histórico navegador/PWA | Código concluído; migration, Resend e teste entre instalações pendentes. |
| 3 | Entregador sem impressão | Concluído no código e testes de autorização. |
| 4 | Mesas com scroll horizontal | Código concluído; teste de toque em aparelho pendente. |
| 5 | Média dos entregadores | Concluído no código e testes. |
| 6 | Comida Total/3h/6h/12h por preparo | Concluído no código e testes. |
| 7 | Analytics sem exigir aprovação | Concluído no código e testes; política pública preservada. |
| 8 | Avaliação no pedido entregue | Concluído no código. |
| 9 | Entregues do entregador por sete dias | Concluído no código e testes. |
| 10 | Entregues no Atendimento | Concluído no código. |
| 11 | Desmarcar sabores e persistir | Concluído no código e testes; vínculo desabilitado retém configuração. |
| 12 | Preço por Produto × Sabor | Código/migration concluídos; aplicação no banco pendente. |
| 13 | Cálculo consistente | Concluído no código e testes; inclui pedir novamente/combos. |
| 14 | Remover toggle da cozinha | Concluído no código. |
| 15 | Remover servir do fullscreen do salão | Concluído no código. |
| 16 | Tema do fullscreen | Código/testes concluídos; conferência visual em navegador pendente. |
| 17 | Contador abreviado | Concluído no código e testes. |
| 18 | UX dos sabores | Concluído no código. |
