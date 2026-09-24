# Publicação segura

Guia de atualização e publicação da v2.30.0.

## 1. Segredos e ambiente

Copie `.env.example` para `.env` e substitua todos os exemplos. Nunca envie `.env`, dumps, chaves ou tokens para Git, ZIP público ou variáveis `VITE_*`.

Use um `JWT_SECRET` aleatório com pelo menos 32 caracteres. A senha do banco deve ser longa, exclusiva e codificada na URL quando possuir caracteres especiais.

No Neon, copie as duas conexões no painel:

```env
DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require&connection_limit=5&pool_timeout=30&connect_timeout=10"
DIRECT_URL="postgresql://.../neondb?sslmode=require"
```

O projeto não tenta adivinhar a URL direta a partir do hostname pooled.
O limite acima combina com o carregamento controlado desta versão e evita rajadas de conexões; não aumente indiscriminadamente, pois vários processos somam seus pools.

## 2. Banco de dados

Em uma instalação nova, o backend aplica as migrations automaticamente:

```bash
docker compose up --build -d
```

Para conferir ou aplicar manualmente:

```bash
docker compose run --rm backend npm run prisma:status
docker compose run --rm backend npm run prisma:migrate
```

Não use `prisma db push` nem `migrate reset` no banco real. Faça backup antes de atualizar e valide a restauração em um banco separado.

A migration `20260911000000_payment_methods_and_data_retention` é obrigatória para os pagamentos personalizados e a limpeza automática. Ela adiciona colunas, tabelas de arquivo/log e índices sem apagar os dados existentes durante a instalação.

Na v2.28.0, aplique também `20260912000000_operational_orders_and_combos`. Ela adiciona `Product.isCombo`, a tabela `ComboItem`, os registros de composição e estoque nos pedidos e altera somente os padrões de novas configurações de entrega. Valores já cadastrados em `BusinessSettings` são preservados.

Na v2.29.0, aplique `20260915000000_central_flavor_catalog`, `20260916000000_configurable_combo_slots` e `20260917000000_growth_white_label`. As migrations criam o catálogo central de sabores, convertem os sabores legados quando possível, adicionam pizzas configuráveis aos combos e incluem identidade, SEO, avaliações, favoritos, recompensas, campanhas e o wizard inicial. Instalações já configuradas são marcadas como concluídas e não voltam ao wizard.

Na v2.30.0, aplique `20260923000000_compre_sem_fila_integration`. Ela adiciona somente tabelas e vínculos da integração com o Compre Sem Fila; pedidos e produtos existentes são preservados.

Para atualização sem Docker, com `backend/.env` configurado:

```bash
cd backend
npm ci
npm run prisma:migrate
npm run prisma:generate
npm run prisma:status
npm start
```

Republique frontend e backend da mesma versão. O frontend novo consulta campos de combos e o backend deve usar o Prisma Client gerado para o schema novo. Não é necessário executar o seed para atualizar uma instalação existente.

Se a Gestão 360° informar `DATABASE_SCHEMA_OUTDATED`, confira as migrations e regenere o Prisma Client. Erros de conexão ou tempo limite exigem conferir disponibilidade e limite de conexões do banco; não são resolvidos por reset. A tela mostra a área afetada e permite tentar novamente.

## 3. Administrador inicial

O seed não possui senha padrão e não inicia automaticamente:

```bash
docker compose run --rm \
  -e ADMIN_SEED_NAME="Administrador" \
  -e ADMIN_SEED_EMAIL="admin@seu-dominio.com" \
  -e ADMIN_SEED_PHONE="79999999999" \
  -e ADMIN_SEED_PASSWORD="uma-frase-senha-longa-2026" \
  backend npm run seed
```

Reexecutar o seed preserva senha, catálogo, horários, taxas e configurações. Para trocar a senha, use `ADMIN_SEED_ROTATE_PASSWORD=true`; isso revoga as sessões anteriores.

## 4. Rede e serviços

- Publique somente o frontend atrás de HTTPS; banco e backend permanecem internos.
- Defina `PUBLIC_SITE_URL` com a origem HTTPS exata.
- Se hospedar o frontend separado no Netlify, defina `VITE_API_URL` durante o build com a URL HTTPS do backend terminada em `/api` e inclua a origem do Netlify em `CORS_ORIGIN`.
- Configure firewall, atualizações automáticas do host e logs com alerta.
- No Mercado Pago, crie uma aplicação de **Checkout Transparente**, copie `MERCADOPAGO_PUBLIC_KEY` e `MERCADOPAGO_ACCESS_TOKEN`, configure a assinatura secreta em `MERCADOPAGO_WEBHOOK_SECRET` e cadastre `https://seu-dominio.com/api/payments/mercadopago/webhook` para eventos de pagamento. O cartão é tokenizado pelo componente oficial no navegador; o backend calcula o valor final e nunca aceita o valor enviado pelo cliente.
- Para recuperação de senha, valide seu domínio no Resend, crie `RESEND_API_KEY` com permissão de envio e use um remetente do mesmo domínio em `EMAIL_FROM`, por exemplo `Master Pizzaria <contato@seudominio.com.br>`. O link é de uso único e expira em 30 minutos.
- Em `/api/admin/health`, confirme `mercadoPago: true` e `passwordEmail: true` antes de liberar esses recursos.
- Para o Compre Sem Fila, mantenha `CSF_ENABLED=false` até receber `CSF_STORE_ID` e `CSF_API_KEY` de homologação. Ative primeiro a sincronização manual de produtos, confira preços, estoque, códigos e vínculos no painel e somente então habilite `CSF_PRODUCT_SYNC_ENABLED`. Habilite `CSF_ORDER_SYNC_ENABLED` depois de validar um JSON real de pedido. Em `/api/admin/health`, confirme `compreSemFila: true`.

## 5. Antes de publicar

```bash
cd backend
npm ci
npm test
npx prisma validate
npm audit

cd ../frontend
npm ci
npm run build
npm audit
```

Também teste cadastro, login, recuperação de senha, pedido em dinheiro, pagamento online em ambiente de teste, cancelamento, baixa/restauração de estoque e permissões de cada função administrativa.

Para o Compre Sem Fila, teste com credenciais de homologação: limite de 20 minutos dos produtos, produto simples, produto com tamanho, promoção ativa, estoque zerado, vínculo de ID, pedido repetido, pedido com produto não vinculado, payload incompleto e propagação dos status `accept`, `preparing`, `ready`, `retreat`, `finalize` e `cancel`.

Para o atendimento presencial, valide ainda: criação e reativação de mesas, bloqueio de abertura duplicada, várias rodadas na mesma comanda, impressão e avanço pela cozinha, confirmação pelo garçom, cancelamento com motivo, pagamento em dinheiro com troco e liberação automática da mesa. Confirme com uma conta de entregador que nenhum pedido `DINE_IN` aparece na fila.

Na v2.28.0, confira também:

- o garçom só vê pedidos **Pronto para servir** em **Pedidos**, inclusive ao consultar um pedido pelo identificador;
- garçom e entregador recebem HTTP 403 ao tentar atribuir uma corrida pelas rotas administrativas; o entregador deve aceitar somente pelo fluxo próprio;
- uma mesa com rodada recebida, em preparo ou ainda pronta para servir não pode ser encerrada;
- combos aparecem no cardápio e nas mesas, com composição correta no pedido e estoque dos componentes; edição posterior do combo não altera a composição do pedido anterior;
- dois combos diferentes que usem o mesmo componente têm a quantidade total validada antes da confirmação do pedido;
- promoções de combos são aplicadas pelo servidor e o cancelamento restaura o estoque registrado;
- cartões recebidos/preparando, avisos de equipe e relógio da cozinha ficam legíveis nos dois temas;
- impressão de comprovante em **Atendimento** e **Pedidos**, e atualização automática com a API lenta, sem acúmulo de consultas;
- o botão de instalação funciona num navegador compatível, servido por HTTPS, com PWA habilitado.
