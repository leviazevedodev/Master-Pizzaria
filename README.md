# Master Pizzaria Profissional v2.30.0

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

Depois de aplicar as migrations, entre no painel e abra a aba **Mesas**. O administrador pode cadastrar cada mesa manualmente ou criar de uma vez as mesas 1 a 10. A função **Garçom** tem acesso a **Mesas** e, em **Pedidos**, somente à fila **Pronto para servir**. A API também aplica essa restrição.

Fluxo operacional:

1. O garçom abre uma mesa e informa o cliente e a quantidade de pessoas.
2. Adiciona produtos, tamanhos, sabores e adicionais; cada envio vira uma nova rodada na cozinha.
3. A cozinha inicia o preparo e marca a rodada como pronta.
4. O garçom marca a rodada como servida.
5. No fechamento, escolhe a forma de pagamento e informa o valor recebido quando for dinheiro.
6. A baixa conclui os pedidos, registra o responsável e libera a mesa automaticamente.

Pedidos presenciais não aparecem para entregadores. A mesma mesa não pode ter duas comandas abertas simultaneamente, e cancelamentos ficam registrados com motivo e restauração de estoque quando aplicável.

No painel do administrador, pedidos online e presenciais aparecem em **Pedidos** e **Atendimento**. As rodadas do salão são identificadas como **Presencial** e com o nome da mesa. Elas acompanham as filas **Recebidos** e **Em preparação** e, quando a cozinha conclui a rodada, ficam separadas em **Pronto para servir**. Em celulares, tocar numa mesa ocupada leva diretamente à seção **Adicionar itens**.

Pedidos em **Pronto para servir**, **Pronto para entrega** ou **Pronto para retirada** deixam a contagem e a lista **Em aberto**, permanecendo disponíveis nas respectivas filas específicas.

Em **Atendimento** e **Pedidos**, o administrador pode iniciar o preparo presencial, marcar **Pronto para servir**, confirmar o serviço e receber o pagamento em **Aguardando fechamento**. O pagamento encerra a comanda inteira e somente é liberado quando todas as rodadas estão servidas. Para entregas, o administrador pode avançar de **Pronto para entrega** para **Entregando** e **Entregue**. As duas áreas permitem imprimir o comprovante do pedido; ele não substitui documento fiscal.

A aba **Cozinha** possui dois modos de tela cheia: produção e salão. A tela do salão mostra somente pedidos presenciais, sem telefone, endereço, pagamento ou valores. Os cartões usam verde para recebidos e amarelo para preparo, inclusive no tema escuro; a cozinha também exibe um relógio circular com o prazo previsto restante. As consultas operacionais são atualizadas a cada 5 segundos, sem sobreposição quando uma consulta demora.

O botão **Instalar**, ao lado do tema no painel, abre a instalação quando o navegador oferece suporte; nos demais casos, mostra as instruções para adicionar o site à tela inicial.

## Combos e promoções

Em **Cardápio → Combos**, cadastre o nome, a foto, o preço e os produtos que compõem cada combo, com quantidades e tamanho quando aplicável. Os combos são vendidos no cardápio e nas mesas. Sua composição é salva no pedido para preservar o que foi comprado mesmo após editar o catálogo.

**Promoções** possui uma seção de **Combos**. O servidor recalcula preço, disponibilidade e estoque dos componentes. Os campos e a composição compartilham componentes e regras com o restante do catálogo.

Novas configurações de entrega usam **Exceções fixas**, **Km da saída: 10**, **Valor da saída: R$ 4,00** e **Km excedente: R$ 1,00**. A atualização dos padrões não sobrescreve as taxas já configuradas na loja.

O QR Code impresso abre a rota pública isolada `/cardapio-digital`. Nela, o cliente escolhe os produtos, informa o próprio nome e vê somente mesas livres. O pedido entra como atendimento presencial nas filas **Recebidos**, **Em preparação**, **Pronto para servir** e **Aguardando fechamento**; o pagamento continua sendo baixado somente no fechamento da mesa. O acesso pode ser desativado em **Cardápio → Impressão**.

## Compre Sem Fila

A integração com o Compre Sem Fila fica desativada por padrão. Configure no backend:

```env
CSF_ENABLED=true
CSF_STORE_ID=identificacao-da-loja
CSF_API_KEY=chave-fornecida-pela-csf
CSF_PRODUCT_SYNC_ENABLED=false
CSF_ORDER_SYNC_ENABLED=false
CSF_PRODUCT_SYNC_INTERVAL_MINUTES=20
CSF_ORDER_SYNC_INTERVAL_SECONDS=60
CSF_LOG_SYNC_ENABLED=false
```

Depois de aplicar a migration `20260923000000_compre_sem_fila_integration`, abra **Loja → Compre Sem Fila** para consultar a situação, sincronizar o catálogo e vincular os IDs dos produtos.

Produtos com tamanhos são enviados como itens separados. Cada vínculo recebe um código interno numérico e um EAN-13 estável; um código de barras real pode ser informado pelo painel. Produtos sem controle de estoque usam `CSF_UNLIMITED_STOCK`, cujo padrão é 999.

A sincronização automática de produtos respeita o intervalo mínimo de 20 minutos descrito pela API v4. A importação de pedidos valida todos os campos antes de criar a venda. Respostas sem cliente, endereço de entrega, forma de pagamento, itens, preços ou totais ficam registradas como pendentes de mapeamento. Assim que o fornecedor disponibilizar o JSON completo, novos nomes de campos podem ser adicionados ao normalizador sem alterar o banco ou o fluxo operacional.

O endpoint opcional de logs permanece desligado até `CSF_LOG_SYNC_ENABLED=true`. As credenciais nunca são enviadas para esse domínio de logs. Payloads externos são removidos pela rotina de retenção após uma semana.

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

Para atualizar para a v2.28.0, aplique a migration `20260912000000_operational_orders_and_combos` e regenere o Prisma Client antes de iniciar o backend:

```bash
cd backend
npm ci
npm run prisma:migrate
npm run prisma:generate
npm run prisma:status
```

A migration adiciona a composição dos combos, seus registros nos pedidos, o registro de estoque e os novos padrões de entrega. Não apaga pedidos, contas ou produtos existentes. A Gestão 360° agora identifica a área que falhou e diferencia estrutura de banco desatualizada de indisponibilidade temporária; uma falha isolada não significa, por si só, erro de schema.

Para atualizar para a v2.29.0, o mesmo `npm run prisma:migrate` aplica, em ordem, `20260915000000_central_flavor_catalog`, `20260916000000_configurable_combo_slots` e `20260917000000_growth_white_label`. Elas migram sabores legados para o catálogo central, adicionam os slots configuráveis de combos e incluem white-label, avaliações, favoritos, recompensas, campanhas e implantação inicial. São expansivas e preservam produtos, pedidos e contas existentes.

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
- reconciliação idempotente de pagamentos: eventos antigos não revertem aprovação/reembolso e uma tentativa não cobra duas vezes o mesmo pedido;
- preços, promoções, adicionais, tamanhos, disponibilidade e estoque recalculados no servidor;
- necessidade de estoque agregada em todo o carrinho, inclusive entre combos que compartilham componentes;
- reservas de agendamento e baixas de estoque protegidas contra concorrência;
- uploads limitados e conferidos pela assinatura real JPG, PNG ou WebP;
- seed não destrutivo por padrão e migrations sem derivação automática de hostname;
- containers sem privilégios, filesystem somente leitura e cabeçalhos de segurança.
- comandas protegidas por trava transacional, autorização específica de garçom e trilha de auditoria de abertura, cancelamento, serviço e pagamento.
- despacho manual e automático protegido por função; entregadores aceitam apenas pelas transições atômicas destinadas ao próprio perfil.

Nenhum sistema conectado à internet é “perfeito” para sempre. Mantenha dependências, proxy HTTPS, backups, monitoramento e credenciais atualizados.
