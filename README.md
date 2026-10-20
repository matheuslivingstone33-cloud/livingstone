# FinOps AI

Plataforma de operações bancárias com IA para cooperativas de crédito, financeiras e fintechs.

## Módulos

| Módulo | O que faz |
|---|---|
| **Conciliação bancária** | Lê retorno CNAB 400, extrato OFX ou CSV e cruza com os títulos esperados: conciliados, divergentes (juros/desconto), não pagos e créditos não esperados. Exporta CSV. |
| **Análise de crédito** | Lê holerite e extrato, extrai renda, despesas, CPF e empregador, aponta riscos (cheque devolvido, apostas, CPF divergente) e aplica regras de comprometimento de renda (limite 35%). Gera score, sugestão e parecer. |
| **Cobrança e renegociação** | Importa a carteira de inadimplentes, atualiza a dívida (multa 2% + juros de 1% a.m.), gera propostas por faixa de atraso (à vista com desconto ou parcelado), mensagem pronta para WhatsApp e link público onde o devedor escolhe a condição, aceita e paga por Pix (QR Code e copia e cola). Acompanha parcelas pagas e valor recuperado. |
| **PLD / COAF** | Analisa transações e abre casos por cliente com 8 regras (espécie ≥ R$ 50 mil, fracionamento, incompatibilidade com a renda, conta de passagem, muitos remetentes, valores redondos, lista restritiva, PEP), com pontuação de risco e prazo de análise de 45 dias. Gera dossiê com evidências e enquadramento normativo, e registra a decisão (arquivar ou comunicar ao COAF) com justificativa obrigatória e protocolo do SISCOAF. Casos de comunicação obrigatória não podem ser arquivados; casos de PEP exigem Administrador. |
| **Código legado** | Recebe COBOL, Delphi ou VB6, explica o programa, extrai as regras de negócio e gera a versão moderna. |
| **Base comum** | Login, perfis (Administrador, Analista, Auditor), separação por organização e trilha de auditoria de todas as ações. |

## IA

- **Sem chave:** leitura local de .txt, .csv e PDFs digitais (com texto). Fotos e PDFs escaneados exigem a IA. A conversão de legado cobre COBOL → TypeScript.
- **Com chave:** preencha `ANTHROPIC_API_KEY` no `.env` (crie em https://console.anthropic.com) e reinicie. O Claude passa a ler PDFs e imagens, analisar Delphi/VB6 e converter para Java, C# e Python.

As regras de decisão de crédito são sempre determinísticas (iguais nos dois modos), para o resultado ser auditável.

## Como rodar

Requisitos: Node.js 22+ e PostgreSQL 17 (rodando em `localhost:5432`).

```bash
npm install
npm run setup   # cria as tabelas, usuários de demonstração e arquivos de exemplo
npm run dev     # http://localhost:3000
```

Usuários de demonstração: veja `prisma/seed.ts` (admin, analista e auditor `@demo.local`).

Arquivos de exemplo ficam em `public/demo` e têm links em cada tela. Para testar a lógica pelo terminal:

```bash
npx tsx scripts/testar-modulos.mts
npx tsx scripts/testar-cobranca.mts
npx tsx scripts/testar-pld.mts
```

Deploy na Vercel: veja [docs/DEPLOY.md](docs/DEPLOY.md).

## Estrutura

```
src/lib/reconcile.ts   leitura de CNAB 400 / OFX / CSV e conciliação
src/lib/credit.ts      extração de documentos e regras de crédito
src/lib/legacy.ts      análise e conversão de código legado
src/lib/ai.ts          integração com o Claude
src/lib/auth.ts        sessão (JWT em cookie) e auditoria
src/app/actions.ts     ações do servidor (uploads e cadastros)
prisma/schema.prisma   modelo de dados
```

## Configuração por instituição

Tudo o que muda de cliente para cliente fica em **Configurações** (perfil Administrador), sem mexer no código: chave Pix, layout CNAB 400 do banco, política de crédito, multa/juros/faixas de desconto da cobrança, limites das regras de PLD, webhook Pix e listas restritivas (CSNU, OFAC, PEP da CGU e lista interna). Cada alteração é validada (ex.: multa ≤ 2%, prazo de PLD ≤ 45 dias) e registrada na auditoria.

## Segurança

| Camada | Proteção |
|---|---|
| Login | bcrypt; bloqueio de 15 min após 5 falhas; mensagem única (não revela e-mails); senha ≥ 12 caracteres com letras e números |
| Sessão | cookie httpOnly/secure; perfil e status lidos do banco a cada requisição; desativar, mudar perfil ou trocar senha derruba as sessões na hora |
| Segredos | `AUTH_SECRET` obrigatório (≥ 32 caracteres): sem ele ninguém entra |
| Dados entre clientes | toda consulta filtra pela organização do usuário |
| Auditoria | registros encadeados por SHA-256 com IP; a tela de auditoria detecta qualquer alteração ou exclusão feita direto no banco |
| Navegador | CSP, HSTS, anti-iframe, nosniff, sem source maps; páginas com dados pessoais sem cache |
| Uploads | tipo validado pelo conteúdo (não pela extensão), limite de 10 MB |
| IA | documentos tratados como dado não confiável; valores conferidos contra a leitura direta do arquivo |
| Exportação | CSV protegido contra injeção de fórmula no Excel |
| Pix | webhook com segredo comparado em tempo constante; cada Pix (endToEndId) baixado uma única vez; links usam `APP_URL`, nunca o cabeçalho Host |
| Concorrência | aceite de acordo, pagamentos e decisões de PLD com travas: cliques simultâneos não duplicam |

O código enviado ao navegador foi analisado por engenharia reversa (REA): ele contém só a interface. Regras de negócio, limites, chaves e listas ficam no servidor.

## Antes de usar com dados reais

- Defina `AUTH_SECRET` novo, `APP_URL` com o domínio real (HTTPS) e uma senha forte no banco (usuário do banco só com acesso a este schema).
- Não use os usuários de demonstração; crie os reais em Usuários e defina `DEMO_PASSWORD` se rodar o seed online.
- Em Configurações: chave Pix real, layout CNAB do banco (teste com um retorno real), importe CSNU/OFAC/PEP e ative o webhook no PSP (preferencialmente com mTLS).
- Calibre os limites de PLD com a carteira do cliente e documente na Avaliação Interna de Risco.
- Faça backup diário do banco e teste a restauração.
- Defina com o cliente onde os dados ficam hospedados (LGPD) e se documentos podem ser enviados à API da IA.
- Rode `npm test`, `npm run lint` e `npm audit --omit=dev` antes de cada versão.
