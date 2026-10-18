# FinOps AI — instruções do projeto

## Antes de mudar código
- Mudanças que envolvam vários arquivos, fluxos ou decisões técnicas passam antes pelo agente `arquiteto` (`.claude/agents/arquiteto.md`). Não alterar arquivos antes de receber o plano dele.

## Como cada módulo é organizado
1. **Lógica pura** em `src/lib/<modulo>.ts`: sem acesso ao banco nem ao Next. Recebe dados e devolve resultado.
2. **Teste antes de ligar na tela**: casos em `tests/modulos.test.mts`, usando os arquivos de `public/demo/` como entrada real.
3. **Server action fina** (`src/app/actions-<modulo>.ts`): só autentica (`requireSession` com os perfis certos), filtra por `orgId` da sessão, valida a entrada e chama a lib. Sem regra de negócio.
4. **Página por último.**

## Segurança (base de tudo)
- Toda consulta por ID filtra pelo `orgId` da sessão (`findFirst({ where: { id, orgId: s.orgId } })`), nunca só pelo ID.
- Ações que escrevem exigem `ADMIN` ou `ANALISTA`; `AUDITOR` só lê.
- Ações relevantes gravam auditoria (`audit` / `auditRaw`).

## Fechar um módulo
`npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build` (com o servidor de dev parado) e um commit.
