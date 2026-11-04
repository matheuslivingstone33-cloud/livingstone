# Esteira de pedidos: do pedido ao PR

Quando alguém confirma um pedido na Livingstone, o sistema abre uma issue no GitHub com as labels `pedido` e `claude`.
O Claude, rodando no GitHub Actions, lê a issue, implementa numa branch `pedido/<número>` e abre um PR.
**Nada vai para produção sozinho:** você revisa e faz o merge. Depois do merge, a Vercel publica e as migrations rodam no Neon.

Repositório: https://github.com/matheuslivingstone33-cloud/livingstone (privado).
Faça tudo logado na conta **matheuslivingstone33-cloud**: o workflow só aceita issues abertas e rotuladas por ela.

---

## 1. Token da sua assinatura do Claude no GitHub

A esteira usa a sua assinatura do Claude (a mesma do Claude Code), não créditos de API.

1. No terminal do seu computador, com o Claude Code instalado, rode: `claude setup-token`
2. Faça login na conta do Claude que deve ser usada. Copie o token que aparece (começa com `sk-ant-oat`).
3. Abra https://github.com/matheuslivingstone33-cloud/livingstone/settings/secrets/actions
4. Clique em **New repository secret**.
   - Name: `CLAUDE_CODE_OAUTH_TOKEN`
   - Secret: cole o token.
5. Clique em **Add secret**.

O uso conta nos limites da sua assinatura. O secret antigo `ANTHROPIC_API_KEY` não é mais usado e pode ser apagado.

## 2. Instalar o app do Claude no GitHub

1. Abra https://github.com/apps/claude e clique em **Install** (ou **Configure**).
2. Escolha **Only select repositories** e marque só `livingstone`.
3. Confirme.

## 3. Token para a Livingstone abrir issues (Vercel)

1. Abra https://github.com/settings/personal-access-tokens/new (token *fine-grained*).
2. Preencha:
   - Token name: `livingstone-pedidos`
   - Expiration: **90 days** (anote a data para renovar)
   - Repository access: **Only select repositories** -> `matheuslivingstone33-cloud/livingstone`
   - Permissions -> Repository permissions -> **Issues: Read and write** (nada mais)
3. Clique em **Generate token** e copie o valor (ele só aparece uma vez).
4. Na Vercel, abra o projeto -> **Settings** -> **Environment Variables** (https://vercel.com/dashboard -> seu projeto -> Settings -> Environment Variables).
5. Adicione, marcando só **Production**:
   - `GITHUB_TOKEN_PEDIDOS` = o token copiado
   - `GITHUB_REPO_PEDIDOS` = `matheuslivingstone33-cloud/livingstone`
6. Faça um redeploy para as variáveis valerem: aba **Deployments** -> último deploy de produção -> menu `...` -> **Redeploy**.

Sem essas duas variáveis, a confirmação de pedidos continua funcionando normalmente; só a issue não é criada (e o erro fica visível para o operador na página do pedido).

## 4. Ambiente `producao` com as URLs do Neon

Usado só pelo workflow que aplica as migrations depois do merge.

1. No Neon (https://console.neon.tech), abra o projeto -> **Dashboard** -> **Connect**.
   - Com **Connection pooling** ligado: copie a URL (tem `-pooler` no endereço). Esta é a `NEON_DATABASE_URL`.
   - Com **Connection pooling** desligado: copie a URL. Esta é a `NEON_DIRECT_URL`.
2. Abra https://github.com/matheuslivingstone33-cloud/livingstone/settings/environments e clique em **New environment**.
   - Name: `producao` -> **Configure environment**.
   - (Opcional, recomendado) **Deployment branches and tags** -> **Selected branches** -> adicione `main`.
3. Em **Environment secrets** -> **Add environment secret**:
   - `NEON_DATABASE_URL` = URL com pooler
   - `NEON_DIRECT_URL` = URL direta

Regra da casa: migrations são sempre **aditivas** (colunas novas anuláveis ou com default), porque a Vercel publica o código ao mesmo tempo em que a migration roda.

## 5. Criar as labels

O GitHub pode não criar labels automaticamente a partir do token da Livingstone, então crie as três uma vez:

1. Abra https://github.com/matheuslivingstone33-cloud/livingstone/labels
2. Clique em **New label** e crie, uma de cada vez:
   - `pedido`
   - `claude`
   - `melhoria-agentes`

(As cores não importam.)

## 6. Proteger a `main`

1. Abra https://github.com/matheuslivingstone33-cloud/livingstone/settings/branches
2. **Add branch ruleset** (ou **Add classic branch protection rule**) para `main`:
   - **Require a pull request before merging**
   - **Require status checks to pass** -> marque `verificar` (o job do workflow CI; ele aparece na lista depois de rodar a primeira vez)
   - **Block force pushes**
3. Salve.

Observação: em repositório privado no plano gratuito, algumas regras de proteção podem exigir plano pago. Se a tela avisar isso, siga sem elas e revise cada PR com atenção.

## 7. Testar com o botão "Reenviar ao GitHub"

1. Entre na Livingstone como operador da plataforma.
2. Abra **Pedidos** e escolha um pedido com status **Consenso** que ainda não tenha issue.
3. Clique em **Reenviar ao GitHub**.
   - Deu certo: aparece o link **Issue #n** no topo do pedido.
   - Deu errado: aparece "Última falha: ..." com o motivo (por exemplo, `GitHub respondeu 401` = token errado ou vencido; `404` = repo errado ou token sem acesso).
4. Abra a aba **Actions** do repositório (https://github.com/matheuslivingstone33-cloud/livingstone/actions) e acompanhe o workflow **Pedido -> Claude**.
5. Ao terminar, o PR aparece em https://github.com/matheuslivingstone33-cloud/livingstone/pulls. Se estiver como **draft**, o corpo lista o que falhou.
6. Revise e faça o merge você mesmo. O workflow **Migrate deploy (produção)** roda se houver migration nova.

O botão só tenta de novo se a última tentativa tiver mais de 2 minutos (evita issue duplicada).
