# Publicação segura

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
- No Mercado Pago, defina Access Token e segredo do webhook e cadastre `https://seu-dominio.com/api/payments/mercadopago/webhook`.
- Use domínio autenticado no provedor de e-mail para recuperação de senha.

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

Para o atendimento presencial, valide ainda: criação e reativação de mesas, bloqueio de abertura duplicada, várias rodadas na mesma comanda, impressão e avanço pela cozinha, confirmação pelo garçom, cancelamento com motivo, pagamento em dinheiro com troco e liberação automática da mesa. Confirme com uma conta de entregador que nenhum pedido `DINE_IN` aparece na fila.
