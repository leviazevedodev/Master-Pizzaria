# Histórico de versões

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
