# Banco de dados

O schema oficial está em `backend/prisma/schema.prisma`; o histórico versionado está em `backend/prisma/migrations`.

Use somente:

```bash
cd backend
npm run prisma:status
npm run prisma:migrate
```

`prisma db push` não faz parte do fluxo deste projeto. Em produção, faça backup antes de migrations e teste periodicamente a restauração.

O seed é manual e preserva dados existentes. Consulte o `README.md` da raiz antes de usar qualquer opção `*_ROTATE`, `*_PROMOTE` ou `SEED_FORCE_DEFAULTS`.
