# Deploy na Vercel

Passo a passo para o primeiro deploy (preview e depois produção). Nada aqui roda sozinho: migrações **não** fazem parte do `npm run build`.

## 1. Banco de dados (Neon ou Supabase)

Crie **dois bancos**: um para produção e outro para preview (o preview pode receber o seed de demonstração; a produção nunca).

Cada banco tem duas strings de conexão:

| Variável | Qual conexão | Exemplo |
|---|---|---|
| `DATABASE_URL` | **pooler** (PgBouncer / transaction mode) | `postgresql://user:senha@host-pooler:6543/db?pgbouncer=true&connection_limit=1&sslmode=require` |
| `DIRECT_URL` | **direta** (sem pooler), usada pelo `prisma migrate` | `postgresql://user:senha@host:5432/db?sslmode=require` |

- O projeto usa Prisma 6.19. Nessa versão, com pooler em modo transação, `?pgbouncer=true` é necessário (desliga prepared statements) e `connection_limit=1` evita que cada função serverless abra várias conexões.
- Neon: a string "Pooled connection" vai em `DATABASE_URL`, a "Direct" em `DIRECT_URL`. Supabase: porta 6543 (pooler) em `DATABASE_URL`, porta 5432 em `DIRECT_URL`.
- **Localmente**, `DIRECT_URL` deve ser igual a `DATABASE_URL` (veja `.env.example`). Sem ela, `prisma generate`, `next build` e a aplicação funcionam, mas `prisma migrate`, `prisma validate` e `prisma studio` falham com `P1012 Environment variable not found: DIRECT_URL`.

## 2. Aplicar as migrações

Com as variáveis do banco de destino no ambiente do seu terminal (nunca commitadas):

```bash
npx prisma migrate deploy   # ou: npm run db:deploy
```

Rode antes de promover cada deploy que traga migração nova. Seed (`npm run db:seed` / `npm run db:demo`) **só no banco de preview**.

## 3. Variáveis de ambiente na Vercel

Cadastre em **Production** e **Preview** (valores diferentes por ambiente):

| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | pooler do banco do ambiente |
| `DIRECT_URL` | sim | conexão direta do banco do ambiente |
| `AUTH_SECRET` | sim | ≥ 32 caracteres aleatórios; sem ele a aplicação falha fechada |
| `APP_URL` | sim | URL do ambiente (ex.: `https://finops.suaempresa.com.br` em produção, URL fixa do preview no preview). Usada em links de acordo e na URL do webhook |
| `CRON_SECRET` | sim | ≥ 32 caracteres; a Vercel envia `Authorization: Bearer <CRON_SECRET>` ao cron. Sem ele, `/api/cron/limpeza` responde 401 |
| `AUDIT_RECEIPT_SECRET` | não | segredo próprio do recibo da auditoria (≥ 32); sem ele, é derivado do `AUTH_SECRET`. Trocar invalida recibos emitidos |
| `ANTHROPIC_API_KEY` | não | única variável da IA necessária. Sem chave, a IA não derruba nada: os módulos seguem com as regras determinísticas e sem os textos de IA |
| `AI_MODEL_COBRANCA`, `AI_MODEL_PLD`, `AI_MODEL_CREDITO`, `AI_MODEL_LEGADO` | não | troca o modelo de uma tarefa (só aceita id `claude-...`). Padrão: Haiku 5.5 para cobrança, PLD e crédito; Sonnet 5.5 para legado. `ANTHROPIC_MODEL` não é mais lida |
| `PIX_KEY`, `PIX_MERCHANT`, `PIX_CITY` | não | padrão do Pix |
| `PIX_WEBHOOK_ALLOW_QUERY_SECRET` | não | deixe **desligado**. `1` aceita `?secret=` na URL do webhook, só para PSP que não envia header customizado (o segredo passa a aparecer em logs) |

**Atenção ao preview:** a Vercel roda o preview com `NODE_ENV=production`, então o acesso demo da tela de login fica escondido. Para testar no preview, rode o seed no banco de preview e entre com os usuários criados por ele.

## 4. Importar o repositório

1. Vercel → Add New → Project → importe o repositório do GitHub.
2. Framework: Next.js (detectado). Build command: o padrão (`npm run build` = `prisma generate && next build`).
3. Cadastre as variáveis (passo 3) antes do primeiro build.
4. O `vercel.json` registra o cron diário `0 4 * * *` (04:00 UTC) em `/api/cron/limpeza`.

## 5. Checklist de validação do preview

- [ ] `/tour` abre sem login; `/tour?lang=en` em inglês.
- [ ] Login com usuário do seed.
- [ ] Importar o PLD de demonstração (`public/demo/transacoes_pld.csv`) e abrir o resultado.
- [ ] Webhook Pix: com header `x-webhook-secret` correto → 200; com `?secret=` na URL e sem `PIX_WEBHOOK_ALLOW_QUERY_SECRET` → 401.
  ```bash
  curl -i -X POST "$APP_URL/api/pix/webhook/<orgId>" -H "x-webhook-secret: <segredo>" -H "content-type: application/json" -d '{"pix":[]}'
  curl -i -X POST "$APP_URL/api/pix/webhook/<orgId>?secret=<segredo>" -d '{"pix":[]}'   # espera 401
  ```
- [ ] `/docs/api` abre sem login.
- [ ] API v1: `POST /api/v1/conciliacoes` com `Authorization: Bearer <chave>` e `Idempotency-Key`; repetir a mesma chave devolve a mesma resposta.
- [ ] Cron: `curl -i $APP_URL/api/cron/limpeza` → 401; com `-H "Authorization: Bearer $CRON_SECRET"` → 200 com `removidos`.
- [ ] Logs da Vercel (Runtime Logs) sem segredos: nenhuma URL com `?secret=`, nenhum token ou chave.

## 6. Limites conhecidos

- **Uploads: resolvido.** A Vercel recusa corpos de função acima de ~4,5 MB (413) antes de chegar à aplicação. Por isso os limites ficam abaixo desse teto, com mensagem amigável: 4 MB por arquivo e 4 MB somando os arquivos de um envio (`src/lib/upload-limits.ts`, conferido no navegador por `FileSizeGuard` e de novo no servidor), `bodySizeLimit` = 4.5mb nas server actions (`next.config.ts`), corpo de 4 MB na API v1 (`API_MAX_BODY_BYTES`, `src/lib/api-http.ts`) e arquivo do banco de 2,9 MB na API (`API_LIMITS.arquivoBytes`, que em base64 cabe nos 4 MB). Um PLD de 100 mil linhas não cabe em 4 MB (~37 a 46 mil linhas): o usuário divide o período. Se arquivos maiores virarem necessidade, o caminho é upload assinado direto para um storage.
- **Tempo: 60 s por função** (`maxDuration = 60` nas rotas e páginas com ações longas). No plano Hobby o teto também é 60 s.
- **Webhook Pix com 500 eventos** num lote pode passar de 60 s (cada evento faz consultas e grava auditoria). Se o PSP mandar lotes grandes, considerar fila.
- **Cron no Hobby: no máximo diário** (e o horário pode variar dentro da hora).
- **Advisory locks só de transação** (`pg_advisory_xact_lock`): compatíveis com o pooler em modo transação; não use locks de sessão.
- `/tour` é dinâmica (lê `?lang=`); os arquivos de `public/demo/` entram no bundle via `outputFileTracingIncludes`.

## 7. Promoção para produção

1. Preview validado pelo checklist.
2. `npx prisma migrate deploy` contra o banco de **produção** (variáveis de produção no terminal).
3. Conferir variáveis de Production (`APP_URL` de produção, `CRON_SECRET` próprio, sem seed).
4. Promover o deploy (Vercel → Deployments → Promote to Production) ou fazer merge na branch de produção.
5. Repetir o checklist essencial em produção: `/tour`, login, webhook com header, cron sem Bearer → 401.
