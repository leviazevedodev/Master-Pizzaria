# Master Pizza Profissional v2.22.0

Aplicação de cardápio e gestão de pizzaria com React, Express, PostgreSQL e Prisma. Inclui pedidos, entrega/retirada, atendimento em mesas, agendamento, pagamento pelo Mercado Pago, painel administrativo, cozinha, garçons, entregadores, estoque, promoções, cupons e relatórios.

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

1. O garçom abre uma mesa e informa quantidade de pessoas e observações.
2. Adiciona produtos, tamanhos, sabores e adicionais; cada envio vira uma nova rodada na cozinha.
3. A cozinha inicia o preparo e marca a rodada como pronta.
4. O garçom marca a rodada como servida.
5. No fechamento, escolhe a forma de pagamento e informa o valor recebido quando for dinheiro.
6. A baixa conclui os pedidos, registra o responsável e libera a mesa automaticamente.

Pedidos presenciais não aparecem para entregadores. A mesma mesa não pode ter duas comandas abertas simultaneamente, e cancelamentos ficam registrados com motivo e restauração de estoque quando aplicável.

No painel do administrador, as comandas do salão também aparecem em **Atendimento**, identificadas como **Presencial** e com o nome da mesa. Elas acompanham as filas **Recebidos** e **Em preparação** e, quando a cozinha conclui a rodada, ficam separadas em **Pronto para servir**. Em celulares, tocar numa mesa ocupada leva diretamente à seção **Adicionar itens**.

## Pagamentos personalizados e retenção

Em **Loja → Pagamento**, o administrador pode cadastrar até 20 formas de pagamento próprias, escolher se cada uma aparece no site e/ou nas mesas e desativá-las sem alterar pedidos antigos. Dinheiro, Mercado Pago, Pix e cartões do atendimento presencial continuam como opções padrão.

A limpeza automática roda em segundo plano com os seguintes prazos:

- comandas encerradas deixam a tela e são removidas após 12 horas; antes da exclusão, um resumo financeiro da baixa é preservado;
- carrinhos e sessões locais abandonados expiram em 2 semanas;
- logs técnicos e de integração expiram em 1 semana;
- telefone e endereço de pedidos antigos são anonimizados, e endereços favoritos inativos são removidos, após 6 meses;
- pedidos, faturamento, pagamentos e fechamentos são removidos após 5 anos.

Os pedidos permanecem independentes da comanda encerrada, portanto continuam em **Desempenho**, **Relatórios** e **Gestão 360°** até completar o prazo financeiro de 5 anos.

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
