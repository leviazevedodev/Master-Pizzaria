# Auditoria técnica e de segurança — v2.28.0

> Versão v2.28.0 (15 de setembro de 2026): foram adicionados combos completos, filas e permissões operacionais, pagamentos de mesa, impressão e novos estados de atendimento. A revisão final também endureceu idempotência e reconciliação do Mercado Pago, estoque agregado, restauração por snapshot, despacho de entregadores, resiliência de sessão e concorrência da Gestão 360°. O frontend foi dividido em módulos menores e carregamento sob demanda, e o projeto recebeu verificação contínua de testes, build, Prisma e dependências.

> Versão v2.27.0 (11 de setembro de 2026): o editor de promoções com tamanhos foi reorganizado, Cozinha recebeu telas cheias independentes para produção e salão, Atendimento passou a avançar todo o fluxo presencial e os relatórios financeiros passaram a separar vendas, cancelamentos, estornos e receita final por meio de agregações completas no banco.

> Atualização funcional v2.20.0 (10 de setembro de 2026): foi acrescentado o módulo de salão com mesas e comandas, perfil de garçom, rodadas integradas à cozinha, baixa de pagamento, troco, cancelamento auditado, restauração de estoque e isolamento da fila de entregadores. O schema Prisma e a migration versionada foram validados; 18 testes de backend, 3 testes de frontend e o build de produção passaram. A validação integrada com um banco PostgreSQL real continua fazendo parte do roteiro de implantação abaixo.

> Hotfix v2.20.1 (10 de setembro de 2026): o teste conectado ao Neon identificou que `pg_advisory_xact_lock` retorna `void`, tipo que o Prisma 6.12 não desserializa em `$queryRaw`. As 15 travas consultivas foram migradas para `$executeRaw`; a abertura foi reproduzida com sucesso em transação revertida e um teste de regressão foi adicionado.

> Hotfix v2.20.2 (10 de setembro de 2026): erros temporários do Neon deixaram de ser tratados como JWT inválido, eliminando a falsa mensagem de sessão expirada. As rajadas de consultas públicas e administrativas foram controladas, leituras frequentes receberam cache curto e foram adicionados testes de regressão.

> Hotfix v2.20.3 (10 de setembro de 2026): o fluxo de inclusão de pizzas em comandas ganhou seleção padrão segura, mensagem explícita para campos ainda pendentes e confirmação da inclusão. O tema escuro passou a cobrir integralmente o personalizador e os logs administrativos.

> Hotfix v2.20.4 (10 de setembro de 2026): corrigido o filtro que ocultava pizzas marcadas como opções de sabor nas comandas. Transações lentas do Neon receberam limites adequados, autenticações simultâneas foram deduplicadas e consultas da tela de mesas e automações passaram a respeitar pools pequenos.

> Versão v2.21.0 (11 de setembro de 2026): adicionados meios de pagamento personalizados com validação no backend e identificação preservada nos pedidos. Implantada retenção automática por finalidade: comandas 12 horas com arquivo financeiro mínimo, carrinho/sessão 2 semanas, logs técnicos 1 semana, telefone/endereço 6 meses e dados financeiros 5 anos. A rotina usa lotes, execução serial e índices próprios para não pressionar o pool do Neon.

> Hotfix v2.21.1 (11 de setembro de 2026): corrigidos os fundos claros e textos sem contraste no seletor de sabores, fechamento de comandas e cartões da cozinha. Os pares de cores críticos passaram a ser verificados automaticamente segundo o contraste mínimo WCAG AA.

> Versão v2.22.0 (11 de setembro de 2026): as comandas presenciais foram integradas à tela Atendimento com identificação de mesa nas filas operacionais e uma fila exclusiva Pronto para servir. O avanço usa as rotas protegidas do módulo de mesas, continua invisível para entregadores e ganhou navegação móvel direta até Adicionar itens.

> Versão v2.23.0 (11 de setembro de 2026): criada a impressão local de cardápio e QR Code em PDF, com URL validada, imagens tolerantes a falhas, preços base ou promocionais e separação por categoria/subcategoria. As três situações prontas deixaram a fila Em aberto sem desaparecer de suas filas operacionais.

> Versão v2.24.0 (11 de setembro de 2026): substituído o redirecionamento do Checkout Pro pelo checkout transparente com Pix e Card Payment Brick, validação de total exclusivamente no backend, idempotência e sincronização de pagamento. O cardápio impresso foi redesenhado em duas páginas escuras e sem fotos de produtos; o QR Code ficou restrito ao cardápio público. Foram adicionados a fila Aguardando fechamento, notificações operacionais persistentes, diagnóstico do e-mail de recuperação e a remoção da observação ao abrir mesa.

Data da revisão final: 15 de setembro de 2026.

Base evoluída: `master-pizzaria-profissional-v2.27.0`, preservada separadamente no workspace. Entrega auditada: `master-pizzaria-profissional-v2.28.0`.

## Resultado

As falhas encontradas no código foram corrigidas sem remover recursos do cardápio, pedidos, checkout, painel administrativo, cozinha, entregadores, estoque, promoções, cupons ou relatórios. Não foram encontrados bytes corrompidos, chaves privadas ou um arquivo `.env` real no código-fonte. A formatação foi padronizada para tornar a manutenção mais segura.

Nenhum sistema publicado na internet pode ser considerado perfeito para sempre. Esta versão está significativamente mais segura e consistente, mas a segurança de produção também depende da configuração, infraestrutura, atualização contínua e testes com os serviços reais.

## Correções principais

| Área              | Problema encontrado                                                                                         | Correção aplicada                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Banco             | `dev` e `setup` usavam `prisma db push`, ignorando o histórico de migrations                                | Fluxo alterado para migrations versionadas; scripts de status e deploy adicionados                         |
| Neon              | O script tentava adivinhar a conexão direta removendo `-pooler` do hostname                                 | `DIRECT_URL` explícita passou a ser obrigatória quando a URL de execução usa pooler                        |
| Seed              | Uma nova execução podia sobrescrever catálogo, preços, horários, promoções e senha                          | Seed preserva dados por padrão; alterações destrutivas exigem flags explícitas                             |
| Administrador     | Um e-mail de cliente existente podia ser promovido pelo seed sem confirmação específica                     | Promoção exige `ADMIN_SEED_PROMOTE_EXISTING=true`                                                          |
| Sessões           | Segredo JWT fraco ou de exemplo era aceito fora de produção                                                 | Segredo forte, com ao menos 32 caracteres, passou a ser obrigatório em qualquer ambiente                   |
| Senhas            | A política não distinguia contas de clientes e acessos administrativos                                     | Clientes usam mínimo de 8 caracteres; administradores e funcionários usam mínimo de 12                    |
| Pedidos agendados | Duas requisições simultâneas podiam ultrapassar a capacidade do horário                                     | Contagem final protegida por lock transacional no PostgreSQL                                               |
| Estoque           | Sabores que também são produtos eram verificados, mas não tinham estoque baixado/restaurado                 | Baixa, estorno e movimentos passaram a incluir esses itens                                                 |
| Catálogo          | Produto indisponível por dia, horário ou pausa podia ser incluído em pedido por chamada direta à API        | Disponibilidade é recalculada no servidor para o horário atual ou agendado                                 |
| Relações          | Produtos e adicionais aceitavam combinações inconsistentes de categoria, subcategoria, tamanho e grupos     | Validação transacional de IDs, limites, datas, horários e valores                                          |
| Autorização       | A edição administrativa de clientes não bloqueava explicitamente um ID de administrador                     | O alvo agora precisa existir e ter perfil de cliente                                                       |
| CORS              | Uma origem malformada podia permanecer na configuração                                                      | Origens são analisadas como URL HTTP(S) sem caminho, credenciais, consulta ou fragmento                    |
| Abuso             | O painel não tinha um limitador próprio                                                                     | Limite administrativo autenticado adicionado, mantendo os limites de login, pedido, pagamento e rastreio   |
| Integrações       | E-mail e webhook de WhatsApp podiam aguardar indefinidamente                                                | Timeout de dez segundos aplicado às chamadas externas                                                      |
| Desempenho        | Listagem de clientes e atribuição de entregador executavam consultas repetidas ou carregavam muitos pedidos | Agregações, consultas em lote e seleção do pedido mais recente no PostgreSQL                               |
| Docker            | O comando documentado de seed não recebia `ADMIN_SEED_*`                                                    | Variáveis do seed adicionadas ao serviço do backend                                                        |
| Checkout          | O complemento do endereço era tratado como obrigatório                                                      | Complemento passou a ser opcional no formulário, conta, favoritos e validação do servidor                  |
| Recomendações     | Produtos recomendados com divisão de sabores podiam abrir sem opções utilizáveis                            | Recomendações recebem sabores válidos da mesma categoria e respeitam horário, pausa e estoque              |
| Estoque visual    | O card do produto consultava campos internos que não fazem parte da resposta pública                        | Estado “esgotado” passou a usar somente `stockAvailable`, calculado pelo servidor                          |
| Armazenamento     | JSON inválido no armazenamento do navegador podia causar tela branca                                        | Sessão, carrinho, cache público e pedidos de visitante agora possuem leitura segura e validação de formato |
| Entradas da API   | Textos como `"false"`, ordens inválidas e quantidades decimais podiam ser normalizados incorretamente       | Booleanos, slugs, limites, relações, datas, ordens e quantidades receberam validação uniforme              |
| Endereços         | Tornar um favorito padrão fazia atualizações separadas                                                      | Limpeza do padrão anterior e criação/edição agora são transacionais                                        |
| Relatórios        | “Pedidos de hoje” dependia do fuso do servidor                                                              | Início do dia passou a usar o fuso configurado da loja, com teste automatizado                             |
| Relatório financeiro | Totais não distinguiam cancelamentos e estornos e dependiam da lista limitada usada no ranking            | Agregações completas separam total vendido, cancelado, devolvido, líquido, quantidade e ticket médio       |
| Atendimento presencial | A tela geral só permitia servir pedidos já prontos                                                        | Recebido e em preparo agora avançam pelas rotas transacionais da cozinha, uma etapa por vez                 |
| Tela operacional  | Cozinha não oferecia visualização dedicada ao salão                                                         | Modos de tela cheia separados; salão filtra apenas mesas e omite dados pessoais e financeiros               |
| Autorização da cozinha | Rotas operacionais aceitavam qualquer conta interna autenticada                                          | Acesso exige permissão de cozinha; garçom avança somente mesas e entregador permanece bloqueado             |
| Promoções         | Produtos com muitos tamanhos comprimiam e desalinhavam os campos                                            | Editor responsivo dividido em identidade, preços gerais, grade de tamanhos, período e ações                 |
| PWA               | A opção existia no banco, mas o navegador registrava o service worker sempre                                | A opção agora registra ou remove service worker e caches; controle foi incluído na gestão                  |
| CSP               | A política do Netlify bloqueava as fontes usadas pelo próprio layout                                        | Políticas de Nginx e Netlify foram alinhadas e conexões do container foram restringidas à mesma origem     |
| Consultas         | Metas, segmentos e detalhes de clientes carregavam mais linhas do que o necessário                          | Contagens e somas passaram para agregações do PostgreSQL e respostas detalhadas receberam limite           |
| Pagamentos        | Repetição com outro token de cartão e eventos atrasados podiam gerar cobrança duplicada ou regressão de estado | Idempotência passou a usar o pedido; aprovação e reembolso são monotônicos e o webhook confirma somente após sincronizar |
| Pix               | Uma falha local depois da criação no provedor podia apagar a referência do pedido                            | O identificador externo é vinculado antes da reconciliação e pode ser recuperado pela sincronização direta |
| Estoque de combos | Combos distintos que compartilhassem um componente eram validados separadamente                             | A necessidade de todo o carrinho é agregada; baixa e restauração usam snapshot e trava idempotente          |
| Despacho          | O perfil Entregador herdava `orders` e podia chamar rotas administrativas de atribuição                     | As rotas manual e automática exigem proprietário/equipe autorizada e negam Entregador/Garçom explicitamente |
| Sessão do painel  | Falha temporária do banco podia ser confundida com expiração autenticada                                     | Somente respostas 401 de sessão inválida encerram o acesso; indisponibilidade continua recuperável          |
| Gestão 360°       | Sete consultas simultâneas pressionavam o pool pequeno do Neon                                               | Consultas passaram a respeitar limite de concorrência e preservam a correspondência de cada área            |
| Tema operacional  | A paleta nova carregava apenas ao abrir uma seção administrativa lazy                                        | O CSS de estados passou a carregar com o painel e mantém Recebido verde/Preparo amarelo desde a entrada      |
| Arquitetura frontend | `AdminPage` e `AdvancedAdminSections` concentravam apresentação de muitas áreas                           | Seções foram extraídas, o arquivo avançado virou um barrel curto e áreas pesadas são carregadas sob demanda |
| Entrega contínua  | Não havia repetição automática das verificações em cada alteração                                           | Workflow executa testes, build, Prisma, sintaxe e auditoria; Dependabot verifica os dois pacotes semanalmente |

## Verificações executadas

- `prisma format`, geração do Prisma Client e validação do schema: aprovados.
- Verificação sintática de todos os arquivos JavaScript do backend: aprovada.
- Noventa e um testes automatizados: 61 do backend e 30 do frontend, todos aprovados e sem falhas.
- Build de produção do frontend com Vite: aprovado, 2.039 módulos transformados e seções administrativas separadas em chunks sob demanda.
- Inicialização da API e comportamento de CORS foram aprovados na primeira etapa desta mesma auditoria.
- Inicialização final sem banco: aprovada; `/health` respondeu 503 corretamente para banco indisponível, com `X-Request-Id` e cabeçalhos de proteção.
- Origem CORS permitida recebeu o cabeçalho esperado; origem não autorizada foi bloqueada com HTTP 403.
- Sintaxe do `docker-compose.yml`: aprovada por `docker compose config --quiet` com variáveis fictícias.
- `npm audit --omit=dev` encontrou 0 vulnerabilidades conhecidas nos dois pacotes nesta entrega.
- Varredura do código-fonte por segredos, chaves privadas e APIs perigosas: nenhum segredo real encontrado.
- Os PDFs de referência foram reabertos, tiveram contagem A4 e conteúdo conferidos e todas as três páginas foram renderizadas e inspecionadas visualmente, sem corte, sobreposição ou contraste ilegível.
- O workflow versionado repete testes, build, validação Prisma, sintaxe e auditoria de dependências em push e pull request.

O teste integrado completo com PostgreSQL em containers não pôde ser repetido porque o mecanismo local do Docker Desktop permaneceu inacessível (erro anterior `500 Internal Server Error` e, na checagem final, acesso negado ao named pipe). Nenhum container ou volume deste projeto foi criado durante a tentativa. Assim que o Docker estiver saudável, execute o roteiro abaixo antes de publicar.

## Validação final com banco

1. Copie `.env.example` para `.env` e troque todas as senhas e valores de exemplo.
2. Execute `docker compose up --build -d`.
3. Execute `docker compose run --rm backend npm run seed` uma única vez para criar os dados ausentes e o primeiro administrador.
4. Confirme `docker compose ps` e `docker compose logs --tail 100 backend`.
5. Teste cadastro, login, recuperação de senha, pedido imediato e agendado, pagamento em ambiente de testes, cancelamento com estorno de estoque e os perfis administrador, cozinha e entregador.
6. Faça backup e teste a restauração em outro banco antes da publicação.

## O que ainda é necessário para produção

- HTTPS e proxy reverso configurados corretamente.
- Senhas exclusivas e rotação inicial da senha administrativa se ela já existia no banco.
- Backup automático com teste periódico de restauração.
- Monitoramento de indisponibilidade, erros da API, espaço do banco e falhas de integração.
- Testes reais do webhook Mercado Pago, e-mail e WhatsApp usando credenciais de homologação.
- Política de privacidade, retenção/exclusão de dados e processo de atendimento à LGPD.
- Ativar o workflow já incluído no repositório remoto e proteger a branch de produção exigindo sua aprovação.
- Ampliar testes integrados com PostgreSQL e continuar dividindo gradualmente o arquivo principal do backend em módulos de rotas e serviços. A separação de pagamentos, estoque, combos e permissões já começou; as próximas extrações devem continuar em etapas para evitar regressões.
- Teste de invasão externo antes de armazenar volume relevante de dados ou pagamentos reais.
- Rate limiting centralizado somente se houver mais de uma instância do backend.

## O que seria desnecessário agora

Sem uma necessidade comprovada de escala, uma reescrita total e simultânea, microserviços, Kubernetes, aplicativo nativo ou Redis seriam desnecessários agora. A refatoração desta entrega foi incremental, com testes a cada extração, preservando o comportamento. Antes de aumentar a arquitetura, devem ser concluídos os testes integrados, backups, monitoramento e validações operacionais acima.
