# FinOps AI — instruções do projeto

## Produto, mercado, design e copy
- Para qualquer tarefa de produto, posicionamento, pesquisa de mercado, branding, UX writing, copy ou conteúdo comercial, leia e siga `.claude/skills/produto-mercado-copy/SKILL.md`. Use o processo em profundidade proporcional ao pedido; não pule o entendimento do produto só porque a entrega solicitada parece pequena.
- Quando a tarefa pedir referências de sites, análise de concorrentes, benchmarking de páginas, conversão ou exemplos de experiências digitais inovadoras, leia e siga também `.claude/skills/benchmark-sites-conversao/SKILL.md`.
- Quando a tarefa envolver alinhamento do produto com a marca, logo, identidade visual/verbal, posicionamento de marca ou peças de marketing, leia e siga também `.claude/skills/branding-produto/SKILL.md`.
- Design e copy são disciplinas distintas que trabalham em conjunto: design organiza a experiência visual e interativa; copy define a linguagem e as mensagens. Alinhe ambos ao mesmo público, proposta de valor e contexto de uso.
- Para entender o produto a partir do repositório, aproveite o agente `product-auditor` (`.claude/agents/product-auditor.md`) quando disponível. Separe evidências de hipóteses e não prometa capacidades ou resultados sem comprovação.

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
