# Master Pizzaria Profissional v2.27.0

Aplicação de cardápio e gestão de pizzaria com React, Express, PostgreSQL e Prisma. Inclui pedidos, entrega/retirada, atendimento em mesas, agendamento, Pix e cartões transparentes pelo Mercado Pago, recuperação de senha por e-mail, painel administrativo, cozinha, garçons, entregadores, estoque, promoções, cupons e relatórios.

## Requisitos

- Docker Desktop; ou Node.js 22+ e PostgreSQL 16+
- Uma senha longa e exclusiva para o PostgreSQL
- `JWT_SECRET` aleatório com pelo menos 32 caracteres

## Início rápido com Docker Desktop

1. Copie `.env.example` para `.env`.
2. Troque `POSTGRES_PASSWORD`, a senha dentro de `DATABASE_URL` e `DIRECT_URL`, `JWT_SECRET` e os dados `ADMIN_SEED_*`. Para o teste local, mantenha `PUBLIC_SITE_URL=http://localhost:5173`; na publicação, use a URL HTTPS real.
3. Inicie a aplicação:

```bash
docker compose up --build -d
```

4. Crie os dados iniciais e o primeiro administrador uma única vez:

```bash
docker compose run --rm backend npm run seed
```

5. Abra `http://localhost:5173`.

O backend aplica somente migrations versionadas ao iniciar. Ele não executa `prisma db push`.

## Mesas e atendimento presencial

Depois de aplicar as migrations, entre no painel e abra a aba **Mesas**. O administrador pode cadastrar cada mesa manualmente ou criar de uma vez as mesas 1 a 10. No cadastro de funcionário, a função **Garçom** recebe acesso exclusivo a essa área.

Fluxo operacional:

1. O garçom abre uma mesa e informa o cliente e a quantidade de pessoas.
2. Adiciona produtos, tamanhos, sabores e adicionais; cada envio vira uma nova rodada na cozinha.
3. A cozinha inicia o preparo e marca a rodada como pronta.
4. O garçom marca a rodada como servida.
5. No fechamento, escolhe a forma de pagamento e informa o valor recebido quando for dinheiro.
6. A baixa conclui os pedidos, registra o responsável e libera a mesa automaticamente.

Pedidos presenciais não aparecem para entregadores. A mesma mesa não pode ter duas comandas abertas simultaneamente, e cancelamentos ficam registrados com motivo e restauração de estoque quando aplicável.

No painel do administrador, as comandas do salão também aparecem em **Atendimento**, identificadas como **Presencial** e com o nome da mesa. Elas acompanham as filas **Recebidos** e **Em preparação** e, quando a cozinha conclui a rodada, ficam separadas em **Pronto para servir**. Em celulares, tocar numa mesa ocupada leva diretamente à seção **Adicionar itens**.

Pedidos em **Pronto para servir**, **Pronto para entrega** ou **Pronto para retirada** deixam a contagem e a lista **Em aberto**, permanecendo disponíveis nas respectivas filas específicas.

Na aba **Atendimento**, o administrador ou garçom pode iniciar o preparo de um pedido presencial, marcá-lo como **Pronto para servir** e, depois, como **Servido**. A aba **Cozinha** possui dois modos de tela cheia: a tela de produção reúne as filas da cozinha e a tela do salão mostra somente pedidos presenciais, sem telefone, endereço, pagamento ou valores.

O QR Code impresso abre a rota pública isolada `/cardapio-digital`. Nela, o cliente escolhe os produtos, informa o próprio nome e vê somente mesas livres. O pedido entra como atendimento presencial nas filas **Recebidos**, **Em preparação**, **Pronto para servir** e **Aguardando fechamento**; o pagamento continua sendo baixado somente no fechamento da mesa. O acesso pode ser desativado em **Cardápio → Impressão**.

## Cardápio para impressão

Em **Cardápio → Impressão**, escolha uma das ações:

- **Criar cardápio em PDF** organiza os produtos ativos por categoria e subcategoria, inclui logo, descrição, preços base ou promoções ativas e adiciona o QR Code ao final;
- **Imprimir apenas QR Code** cria uma folha A4 com o QR Code grande, nome da loja e endereço de acesso.

O endereço é montado pela API a partir do `FRONTEND_URL`, evitando QR Codes apontando para outro site. Produtos pausados ou arquivados ficam fora do material impresso. A logo configurada na loja é usada e, se estiver vazia, o sistema utiliza a logo padrão.

## Pagamentos personalizados e retenção

Em **Loja → Pagamento**, o administrador pode habilitar ou remover as opções padrão de mesa — Dinheiro, Pix, Cartão de crédito e Cartão de débito — e cadastrar até 20 formas próprias para o fechamento das comandas. Formas personalizadas nunca são aceitas no checkout público; dinheiro, Pix e cartões pelo Mercado Pago continuam como opções validadas do site.

## Sessões e senhas

- clientes usam senha de pelo menos 8 caracteres, com letra e número, e sessão renovável por até 30 dias;
- administradores e funcionários usam senha de pelo menos 12 caracteres e sessão de até 12 horas;
- o token de acesso dura 1 hora e fica somente em memória; o refresh token permanece em cookie `HttpOnly`, `Secure` em produção e `SameSite`;
- troca de senha, bloqueio/desativação de conta e **Sair de todos** incrementam a versão da sessão e invalidam os tokens anteriores;
- os formulários possuem controle para mostrar ou ocultar a senha.

As notificações de acompanhamento ficam em **Pedidos** do cliente e consultam atualizações a cada 20 segundos. A permissão do navegador só é solicitada após o cliente tocar em **Ativar notificações**.

A limpeza automática roda em segundo plano com os seguintes prazos:

- comandas encerradas deixam a tela e são removidas após 12 horas; antes da exclusão, um resumo financeiro da baixa é preservado;
- carrinhos e sessões locais abandonados expiram em 2 semanas;
- logs técnicos e de integração expiram em 1 semana;
- telefone e endereço de pedidos antigos são anonimizados, e endereços favoritos inativos são removidos, após 6 meses;
- pedidos, faturamento, pagamentos e fechamentos são removidos após 5 anos.

Os pedidos permanecem independentes da comanda encerrada, portanto continuam em **Desempenho**, **Relatórios** e **Gestão 360°** até completar o prazo financeiro de 5 anos.

Em **Relatórios**, o período selecionado apresenta separadamente o total vendido antes dos estornos, o valor de pedidos cancelados, o valor efetivamente devolvido aos clientes, a receita após estornos, os pedidos finalizados e a média por pedido. Os totais financeiros usam agregações completas no banco; o limite da lista analítica de produtos não limita esses valores.

No editor de **Promoções**, produtos com tamanhos possuem uma grade própria de preços. Cada campo identifica o tamanho, o preço normal e o valor promocional; quando o valor específico fica vazio, aplica-se o desconto geral da oferta.

## Desenvolvimento sem Docker

Crie `backend/.env` a partir de `backend/.env.example` e execute:

```bash
cd backend
npm ci
npm run prisma:migrate
npm run seed
npm run dev
```

Em outro terminal:

```bash
cd frontend
npm ci
npm run dev
```

## Banco e Neon

- `DATABASE_URL`: conexão usada durante o funcionamento normal. No Neon, normalmente é a URL com `-pooler`.
- `DIRECT_URL`: conexão direta fornecida pelo Neon, sem `-pooler`, usada nas migrations.
- `npm run prisma:status`: mostra quais migrations foram aplicadas.
- `npm run prisma:migrate`: aplica migrations pendentes sem apagar dados.
- `npm run seed`: cria dados ausentes e preserva alterações já feitas no painel.

Para o Neon, mantenha a conexão pooled e limite o pool por processo. Um exemplo de final da URL é `?sslmode=require&connection_limit=5&pool_timeout=30&connect_timeout=10` (use `&` no lugar de `?` se a URL já possuir parâmetros).

Não use `prisma db push` neste projeto: há histórico de migrations e o comando pode criar divergência entre o banco e os arquivos versionados. Também não use `migrate reset` em banco com dados reais.

O seed possui proteções adicionais:

- `ADMIN_SEED_ROTATE_PASSWORD=true`: troca conscientemente a senha do administrador e encerra sessões antigas.
- `ADMIN_SEED_PROMOTE_EXISTING=true`: permite promover uma conta de cliente que já usa o e-mail escolhido.
- `SEED_FORCE_DEFAULTS=true`: restaura dados padrão e pode sobrescrever edições do catálogo; use somente após backup.

Para restaurar os registros padrão do catálogo sem apagar contas e pedidos, faça backup e execute:

```bash
docker compose run --rm -e SEED_FORCE_DEFAULTS=true backend npm run seed
```

Esse comando altera somente dados do banco: restaura os itens fornecidos pelo seed, mas preserva o histórico e não remove automaticamente produtos extras criados no painel. Não use `migrate reset` para essa finalidade.

## Verificação

Backend:

```bash
cd backend
npm test
npx prisma validate
npm audit
```

Frontend:

```bash
cd frontend
npm test
npm run build
npm audit
```

Consulte `PRODUCAO.md` antes de publicar.

## Segurança desta versão

- segredo JWT obrigatório também fora de produção;
- tokens com emissor, público, expiração e revogação por versão de sessão;
- rate limiting em autenticação, pedidos, pagamentos, rastreamento e painel;
- assinatura do webhook Mercado Pago e URL de redirecionamento verificadas;
- preços, promoções, adicionais, tamanhos, disponibilidade e estoque recalculados no servidor;
- reservas de agendamento e baixas de estoque protegidas contra concorrência;
- uploads limitados e conferidos pela assinatura real JPG, PNG ou WebP;
- seed não destrutivo por padrão e migrations sem derivação automática de hostname;
- containers sem privilégios, filesystem somente leitura e cabeçalhos de segurança.
- comandas protegidas por trava transacional, autorização específica de garçom e trilha de auditoria de abertura, cancelamento, serviço e pagamento.

Nenhum sistema conectado à internet é “perfeito” para sempre. Mantenha dependências, proxy HTTPS, backups, monitoramento e credenciais atualizados.
