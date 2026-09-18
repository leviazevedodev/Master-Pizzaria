# Histórico de versões

## 2.28.0 — Combos, filas operacionais e diagnóstico do banco

- criada a área **Cardápio → Combos**, com foto própria, produtos, quantidades e tamanhos; **Promoções** separa ofertas de produtos e combos;
- composição do combo e movimentação de estoque são registradas no pedido, preservando o histórico e permitindo restaurar os componentes corretos no cancelamento;
- o administrador vê pedidos online e presenciais em **Pedidos**; garçons consultam nessa aba somente **Pronto para servir**, com filtro também no backend;
- adicionadas transições administrativas de entrega e fechamento presencial com escolha do pagamento; todas as rodadas precisam estar servidas antes de liberar a mesa;
- impressão de comprovantes disponível em **Atendimento** e **Pedidos**;
- cartões operacionais passam a seguir a cor da etapa nos temas claro e escuro: recebido em verde e preparo em amarelo; cozinha ganhou contagem regressiva circular;
- atualização operacional a cada 5 segundos, protegida contra consultas sobrepostas;
- atalho de instalação do site disponível junto ao controle de tema do painel;
- contraste das informações de garçom e entregador corrigido no modo escuro;
- Gestão 360° identifica as áreas que falharam e só orienta atualizar a estrutura do banco quando o erro é de schema; consultas de gestão receberam controle de concorrência;
- novos padrões de entrega: **Exceções fixas**, saída de 10 km por R$ 4,00 e quilômetro excedente de R$ 1,00, preservando configurações existentes;
- lógica compartilhada de pagamentos, combos e estados operacionais extraída para módulos menores, com testes das regras;
- o webhook do Mercado Pago agora só confirma o recebimento depois da reconciliação, pagamentos aprovados/reembolsados não regridem com eventos atrasados e a chave idempotente impede duas cobranças do mesmo pedido;
- a validação de estoque soma o carrinho inteiro, inclusive quando combos diferentes compartilham o mesmo componente, e a restauração usa o snapshot histórico uma única vez;
- rotas de atribuição automática/manual de entregadores agora negam explicitamente os perfis Entregador e Garçom, impedindo que contornem o aceite e o limite de corridas por chamada direta à API;
- sessão indisponível por falha temporária do banco deixou de ser apresentada como sessão expirada no painel;
- o painel foi dividido em componentes e seções carregadas sob demanda; `AdvancedAdminSections.jsx` deixou de concentrar milhares de linhas e as consultas da Gestão 360° são serializadas para respeitar pools pequenos;
- adicionados workflow de verificação contínua, atualização semanal de dependências e PDFs de referência renderizados para conferência visual;
- migration obrigatória: `20260912000000_operational_orders_and_combos`; aplicar migrations e regenerar o Prisma Client ao atualizar.

## 2.27.0 — Operação em tela cheia e relatórios financeiros claros

- editor de promoções reorganizado em blocos de produto, preços, tamanhos, período e ações, com campos monetários alinhados e responsivos;
- cada tamanho mostra seu preço normal e aceita um valor promocional próprio, mantendo o desconto geral como alternativa;
- a Cozinha ganhou modos de tela cheia para produção e salão, com alternância rápida e atualização automática;
- a tela do salão exibe somente pedidos presenciais e omite dados pessoais, valores e meios de pagamento;
- pedidos presenciais agora podem iniciar preparo, ficar prontos para servir e ser confirmados como servidos diretamente em Atendimento;
- rotas da cozinha passaram a exigir permissão própria; garçons podem avançar somente pedidos presenciais e entregadores não acessam essas filas;
- Relatórios separa total vendido, cancelamentos, valores devolvidos, receita após estornos, pedidos finalizados e média por pedido;
- totais financeiros passaram a usar agregações completas do PostgreSQL, sem depender do limite aplicado ao ranking de produtos;
- adicionados testes de regressão do fluxo presencial, das telas operacionais, do editor de promoções e dos cálculos financeiros.

## 2.26.0 — Pagamentos, cardápio público e acabamento do tema escuro

- pagamento transparente por cartão agora bloqueia valores abaixo do mínimo aceito pelo Mercado Pago e exibe a recusa real do provedor;
- cancelamento do cliente foi limitado a pedidos agendados/recebidos, com reembolso automático idempotente ao meio de pagamento aprovado;
- tentativas online pendentes deixaram de consumir o limite diário de pedidos;
- estados prontos para entrega ou mesa permanecem como **Em preparação** para o cliente até aceite do entregador ou confirmação de serviço;
- notificações usam o Service Worker quando disponível e possuem fallback direto do navegador;
- rota do cardápio presencial foi isolada em `/cardapio-digital`, lista somente mesas livres e pode ser desligada na impressão;
- garçons passaram a acessar também **Pedidos**, sempre limitados ao atendimento presencial;
- horário público foi movido para **Operação**, título do cardápio para o editor da fachada e localização ganhou link do Google Maps;
- pagamentos de mesa começam com Dinheiro, Pix, Crédito e Débito, podendo ser removidos ou combinados com métodos personalizados;
- contraste do modo escuro foi corrigido em cancelamentos, prazos, detalhes e capacidade dos entregadores;
- campos móveis usam tamanho seguro para impedir zoom automático, e o botão duplicado nativo de senha foi ocultado;
- PDF e QR Code usam a logo configurada ou a logo oficial de fallback, mantendo o cardápio escuro em duas páginas.

## 2.25.0 — Cardápio de mesa, sessões seguras e acabamento administrativo

- criada a primeira versão do cardápio de mesa, posteriormente isolada na rota pública `/cardapio-digital`, com escolha do cliente e lançamento direto nas filas presenciais;
- formas de pagamento personalizadas ficaram exclusivas das mesas e são rejeitadas pelo checkout público;
- autenticação passou a usar access token de 1 hora em memória e refresh token em cookie `HttpOnly`; clientes duram até 30 dias e equipe até 12 horas;
- troca de senha, bloqueio/desativação e logout geral invalidam todas as sessões anteriores;
- adicionados botões para visualizar senhas e mínimo de 8 caracteres para contas de clientes;
- notificações de atualização foram movidas ao acompanhamento de pedidos do cliente;
- menu lateral administrativo mantém usuário, tema e saída fixos, com rolagem própria das abas;
- o painel reduz consultas concorrentes no Neon e deixa itens prontos fora de **Em aberto**;
- promoções agora aceitam preço específico para cada tamanho de pizza, inclusive no cálculo seguro do pedido;
- PDF usa a logo da loja, QR Code do cardápio presencial e risco de preço antigo alinhado ao texto;
- identidade visível padronizada como **Master Pizzaria**.

## 2.24.0 — Checkout transparente, alertas e cardápio profissional

- Pix passa a ser gerado e exibido dentro do site, com QR Code, copia e cola e atualização automática da aprovação;
- cartões de crédito e débito usam o Card Payment Brick oficial do Mercado Pago sem redirecionar o cliente;
- o backend ignora valores enviados pelo navegador, usa o total calculado no pedido, idempotência, webhook assinado e sincronização de status;
- recuperação de senha por e-mail recebeu HTML profissional, versão em texto, diagnóstico de configuração e documentação do Resend;
- botão **Ativar notificações** em Pedidos, aviso operacional grande, som e notificação persistente do navegador a cada alteração;
- nova fila **Aguardando fechamento** para comandas já servidas; esses pedidos deixam **Em aberto**;
- removido o campo de observação ao ocupar uma mesa;
- cardápio de impressão redesenhado em fundo preto, sem fotos de produtos, com tamanhos e preços alinhados e exatamente duas páginas;
- o QR Code impresso aponta exclusivamente para `/cardapio` da própria pizzaria;
- incluídos PDFs de referência renderizados e revisados visualmente.

## 2.23.0 — Cardápio em PDF e QR Code

- pedidos prontos para servir, entrega ou retirada deixam a fila **Em aberto** e permanecem nas filas específicas;
- criada a seção **Cardápio → Impressão** no painel administrativo;
- geração local de PDF A4 com logo, fotos, descrições, categorias, subcategorias e preços por tamanho;
- opção para incluir somente valores base ou também promoções ativas;
- QR Code com o endereço informado aparece ao final do cardápio;
- geração separada de folha A4 contendo apenas o QR Code do cardápio;
- links são validados como HTTP/HTTPS sem credenciais e não são acessados pelo painel;
- falha isolada ao carregar uma imagem não interrompe a criação do documento;
- novos testes cobrem segurança do link, organização do conteúdo, promoções e separação das filas prontas.

## 2.22.0 — Atendimento presencial integrado

- pedidos presenciais agora aparecem na aba **Atendimento**, sem entrar na fila de entregadores;
- cartões do salão exibem selo **Presencial**, nome da mesa e identificação visual própria;
- as filas **Recebidos** e **Em preparação** passam a mostrar também as rodadas do salão;
- criada a fila **Pronto para servir**, com destaque e ação para o garçom confirmar o serviço;
- comandas servidas permanecem em aberto até a baixa do pagamento na mesa;
- no celular, tocar em uma mesa ocupada ou terminar de abri-la rola a tela diretamente para **Adicionar itens**;
- adicionados testes para garantir a separação entre atendimento presencial, pedidos comuns e entregas.

## 2.21.1 — Contraste das comandas e cozinha

- o seletor de quantidade de sabores deixou de manter fundo branco no modo escuro;
- corrigido o contraste do aviso de rodadas ainda em preparo e do botão de fechamento desabilitado;
- etiquetas **NOVO**, **EM PREPARO**, **PRONTO** e **ATENDIMENTO NO SALÃO** agora possuem fundos e textos próprios para o tema escuro;
- corrigidos horário, observações e botão de impressão dos cartões da cozinha;
- adicionada verificação automatizada de contraste mínimo WCAG AA nas cores corrigidas.

## 2.21.0 — Pagamentos configuráveis e retenção automática

- administrador pode cadastrar, ativar, desativar e remover formas de pagamento personalizadas;
- cada método próprio pode ser liberado separadamente no site e nas mesas;
- o nome escolhido é gravado no pedido e permanece correto em comandas, histórico e desempenho mesmo se a configuração mudar;
- comandas encerradas são removidas após 12 horas, preservando um resumo financeiro por 5 anos e os pedidos usados nos relatórios;
- pedidos e dados financeiros expiram em 5 anos;
- endereços e telefones antigos são anonimizados ou removidos após 6 meses;
- carrinhos e sessões locais abandonados expiram em 2 semanas;
- logs técnicos e de integração expiram em 1 semana;
- índices específicos reduzem o custo das rotinas de retenção no PostgreSQL/Neon;
- novos testes cobrem prazos, armazenamento expirável e autorização dos meios personalizados.

## 2.20.4 — Catálogo das mesas e resiliência transacional

- corrigido o filtro que escondia pizzas vendáveis da lista **Adicionar itens** apenas porque elas também podiam ser usadas como sabor;
- transações interativas passaram de 5 para 30 segundos, com espera máxima de 15 segundos, evitando `P2028` em conexões Neon lentas;
- validações simultâneas do mesmo usuário agora compartilham a mesma consulta e possuem cache de apenas 1 segundo, reduzindo `P2024` sem enfraquecer significativamente a revogação de sessão;
- consultas da tela de mesas passaram a ser sequenciais para respeitar pools pequenos;
- automações internas não rodam mais sobrepostas e usam consultas sequenciais;
- expiração transacional é classificada como indisponibilidade temporária (`503`), em vez de erro interno;
- logs temporários do banco ficaram concisos e mantêm o identificador da requisição.

## 2.20.3 — Inclusão na comanda e contraste escuro

- personalizador da comanda agora usa a ação clara **Adicionar à comanda** e confirma a inclusão na próxima rodada;
- quando o botão ainda não pode ser liberado, a tela informa exatamente qual tamanho, sabor ou opção precisa ser escolhido;
- borda tradicional, normal ou sem borda gratuita passa a ser reconhecida como seleção padrão segura;
- corrigido o contraste de cabeçalho, resumo, tamanhos, sabores, adicionais, observação, total e rodapé do personalizador no modo escuro;
- corrigidos os cartões brancos dos logs administrativos no modo escuro;
- adicionados testes de regressão para seleção padrão, mensagem de bloqueio e cobertura visual do tema escuro.

## 2.20.2 — Estabilidade da sessão e do Neon

- falhas temporárias `P1001`, `P1002`, `P1008`, `P1017` e `P2024` agora retornam `503` e não invalidam a sessão administrativa;
- carregamento inicial do site foi dividido em etapas e protegido contra execuções sobrepostas;
- painel administrativo passou a consultar suas áreas com concorrência controlada;
- atualização automática do painel deixou de combinar consultas pesadas em paralelo;
- configurações e horários receberam cache curto com deduplicação de consultas simultâneas;
- adicionados testes de classificação de erros do banco e do limitador de concorrência.

## 2.20.1 — Correção da abertura de comandas

- corrigido o erro Prisma `P2010` ao adquirir travas consultivas do PostgreSQL;
- chamadas de `pg_advisory_xact_lock` agora usam `$executeRaw`, pois a função retorna `void`;
- a mesma correção foi aplicada às travas de pedidos, agendamentos, cupons, entregadores e estoque;
- adicionado teste automatizado para impedir a regressão.

## 2.20.0 — Mesas e comandas presenciais

- nova aba **Mesas** no painel administrativo;
- cadastro, edição, desativação e criação rápida das mesas 1 a 10;
- perfil **Garçom** com acesso restrito ao atendimento presencial;
- abertura de comanda com cliente, quantidade de pessoas e observações;
- lançamentos em várias rodadas, com tamanhos, sabores, adicionais e observações;
- pedidos presenciais integrados à fila e à impressão da cozinha;
- estados “pronto para servir” e “servido na mesa”;
- fechamento em dinheiro, Pix, débito, crédito, Banese ou Pix na maquineta;
- cálculo de troco, baixa de todos os pedidos e liberação automática da mesa;
- cancelamento com motivo, trilha de auditoria e tratamento de estoque;
- histórico das últimas comandas;
- isolamento total da fila de entregadores;
- travas transacionais contra abertura duplicada e fechamento simultâneo;
- migration `20260910000000_table_service_system` sem uso de `db push`.

Para atualizar um banco existente, faça backup e execute:

```bash
cd backend
npm run prisma:migrate
```

Depois, entre como administrador, abra **Mesas** e cadastre o salão. Não execute `prisma migrate reset` nem `prisma db push`.
