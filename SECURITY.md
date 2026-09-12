# Segurança

- Segredos pertencem somente ao backend e ao ambiente de publicação. Nunca envie `.env`, tokens do Mercado Pago, credenciais do banco ou chaves de webhook ao repositório.
- A aplicação exige JWT forte em qualquer ambiente, restringe CORS, valida sessões no banco, limita requisições sensíveis e verifica a assinatura de webhooks do Mercado Pago.
- Uploads aceitam apenas JPG, PNG e WebP com assinatura binária compatível. Respostas públicas não incluem custo, ficha técnica, quantidade interna de estoque ou identificadores do provedor de pagamento.
- O access token fica somente em memória e dura 1 hora. O refresh token usa cookie `HttpOnly`, `SameSite` e `Secure` em HTTPS; clientes podem renovar por até 30 dias e administradores/funcionários por até 12 horas. Trocas de senha, bloqueios, desativação e logout geral revogam as sessões existentes.
- Relate uma vulnerabilidade de forma privada ao responsável pela implantação, sem incluir dados reais de clientes em capturas ou provas de conceito.

Antes de cada publicação, execute os testes, o build e `npm audit` nos dois pacotes. Dependências devem permanecer fixadas pelo `package-lock.json` e instaladas com `npm ci`.
