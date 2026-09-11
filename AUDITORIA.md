# Auditoria técnica e de segurança — v2.19.18

> Atualização funcional v2.20.0 (10 de setembro de 2026): foi acrescentado o módulo de salão com mesas e comandas, perfil de garçom, rodadas integradas à cozinha, baixa de pagamento, troco, cancelamento auditado, restauração de estoque e isolamento da fila de entregadores. O schema Prisma e a migration versionada foram validados; 18 testes de backend, 3 testes de frontend e o build de produção passaram. A validação integrada com um banco PostgreSQL real continua fazendo parte do roteiro de implantação abaixo.

> Hotfix v2.20.1 (10 de setembro de 2026): o teste conectado ao Neon identificou que `pg_advisory_xact_lock` retorna `void`, tipo que o Prisma 6.12 não desserializa em `$queryRaw`. As 15 travas consultivas foram migradas para `$executeRaw`; a abertura foi reproduzida com sucesso em transação revertida e um teste de regressão foi adicionado.

> Hotfix v2.20.2 (10 de setembro de 2026): erros temporários do Neon deixaram de ser tratados como JWT inválido, eliminando a falsa mensagem de sessão expirada. As rajadas de consultas públicas e administrativas foram controladas, leituras frequentes receberam cache curto e foram adicionados testes de regressão.

> Hotfix v2.20.3 (10 de setembro de 2026): o fluxo de inclusão de pizzas em comandas ganhou seleção padrão segura, mensagem explícita para campos ainda pendentes e confirmação da inclusão. O tema escuro passou a cobrir integralmente o personalizador e os logs administrativos.

> Hotfix v2.20.4 (10 de setembro de 2026): corrigido o filtro que ocultava pizzas marcadas como opções de sabor nas comandas. Transações lentas do Neon receberam limites adequados, autenticações simultâneas foram deduplicadas e consultas da tela de mesas e automações passaram a respeitar pools pequenos.

> Versão v2.21.0 (11 de setembro de 2026): adicionados meios de pagamento personalizados com validação no backend e identificação preservada nos pedidos. Implantada retenção automática por finalidade: comandas 12 horas com arquivo financeiro mínimo, carrinho/sessão 2 semanas, logs técnicos 1 semana, telefone/endereço 6 meses e dados financeiros 5 anos. A rotina usa lotes, execução serial e índices próprios para não pressionar o pool do Neon.

Data da revisão final: 4 de setembro de 2026.

Arquivo de origem analisado: `master-pizza-profissional-v2.19.16-darkmode-adicionais-preco-dinamico.zip`.

SHA-256 da origem: `52BF7A32A79BC71DB7EA7BBA70457E672E2167D2105B10BC765D3D41BB052043`.

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
| Senhas            | Novas senhas aceitavam apenas oito caracteres                                                               | Mínimo elevado para 12 caracteres no backend e na interface                                                |
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
| PWA               | A opção existia no banco, mas o navegador registrava o service worker sempre                                | A opção agora registra ou remove service worker e caches; controle foi incluído na gestão                  |
| CSP               | A política do Netlify bloqueava as fontes usadas pelo próprio layout                                        | Políticas de Nginx e Netlify foram alinhadas e conexões do container foram restringidas à mesma origem     |
| Consultas         | Metas, segmentos e detalhes de clientes carregavam mais linhas do que o necessário                          | Contagens e somas passaram para agregações do PostgreSQL e respostas detalhadas receberam limite           |

## Verificações executadas

- `prisma format`, geração do Prisma Client e validação do schema: aprovados.
- Verificação sintática de todos os arquivos JavaScript do backend: aprovada.
- Dezesseis testes automatizados: 13 do backend e 3 do frontend, todos aprovados e sem falhas.
- Build de produção do frontend com Vite: aprovado, 1.672 módulos transformados.
- Inicialização da API e comportamento de CORS foram aprovados na primeira etapa desta mesma auditoria.
- Inicialização final sem banco: aprovada; `/health` respondeu 503 corretamente para banco indisponível, com `X-Request-Id` e cabeçalhos de proteção.
- Origem CORS permitida recebeu o cabeçalho esperado; origem não autorizada foi bloqueada com HTTP 403.
- Sintaxe do `docker-compose.yml`: aprovada por `docker compose config --quiet` com variáveis fictícias.
- `npm audit --omit=dev` encontrou 0 vulnerabilidades conhecidas nos dois pacotes na primeira etapa. A consulta final ao registro ficou indisponível; os `package-lock.json` não tiveram dependências alteradas depois dela.
- Varredura do código-fonte por segredos, chaves privadas e APIs perigosas: nenhum segredo real encontrado.

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
- Pipeline de CI para repetir testes, build e auditoria em cada alteração.
- Ampliar testes integrados e, depois, dividir gradualmente o arquivo principal do backend em módulos de rotas e serviços. Isso melhora a manutenção, mas deve ser feito em etapas para não introduzir regressões.
- Teste de invasão externo antes de armazenar volume relevante de dados ou pagamentos reais.
- Rate limiting centralizado somente se houver mais de uma instância do backend.

## O que seria desnecessário agora

Sem uma necessidade comprovada de escala, não é recomendável reescrever a aplicação, dividi-la em microserviços, adotar Kubernetes, criar um aplicativo nativo ou adicionar Redis apenas por precaução. Essas mudanças aumentariam custo e complexidade sem corrigir uma falha atual. Primeiro devem ser concluídos os testes integrados, backups, monitoramento e validações operacionais acima.
