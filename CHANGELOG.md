# Histórico de versões

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
