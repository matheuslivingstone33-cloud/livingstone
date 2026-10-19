---
name: produto-mercado-copy
description: "Use em tarefas de entendimento de produto, pesquisa de mercado ou concorrentes, posicionamento, branding, UX writing, copy, páginas, campanhas e conteúdo comercial da Livingstone. Relacione evidências do produto às necessidades do público e às mensagens."
---

# Produto, mercado e copy — Livingstone

Ajude a tomar decisões de comunicação e experiência com base no produto real, no público e em evidências de mercado. Use este processo em qualquer tarefa relacionada; ajuste a profundidade ao escopo, sem transformar pedidos simples em pesquisa desnecessária.

## 1. Entenda o pedido

Identifique o objetivo, público, contexto, canal, ação desejada e formato da entrega. Reaproveite o briefing e as decisões já existentes; pergunte apenas quando uma informação indispensável não puder ser descoberta e escolhas diferentes mudarem materialmente o resultado.

## 2. Entenda a Livingstone antes de propor mensagens

Leia as partes relevantes do projeto e, quando disponível, use o agente `product-auditor` para mapear produto e evidências. Consulte especialmente `README.md`, `CLAUDE.md`, a página ou fluxo afetado, componentes, dados e capacidades implementadas.

Considere o contexto conhecido:
- A Livingstone é uma plataforma de operações bancárias com IA para cooperativas de crédito, financeiras e fintechs.
- Os módulos incluem conciliação bancária, análise de crédito, cobrança e renegociação, PLD/COAF e modernização de código legado.
- A interface trata dados financeiros sensíveis e decisões reguladas. Clareza, confiança, rastreabilidade e precisão são essenciais.
- A identidade visual existente combina verde-petróleo, dourado pontual, tons de tinta e papel, Fraunces e Geist. Consulte os tokens e telas atuais em vez de presumir que essa descrição substitui a implementação.

Não confunda funcionalidades descritas com funcionalidades já disponíveis em uma tela específica. Diferencie explicitamente:
- **Fatos:** sustentados por código, documentação, telas ou fontes verificáveis.
- **Hipóteses:** inferências sobre necessidades, percepção, posicionamento ou comportamento do mercado.
- **Lacunas:** informações que não devem virar afirmações públicas sem confirmação.

## 3. Pesquise mercado quando isso for relevante

Para pedidos de pesquisa, posicionamento ou decisão estratégica, pesquise informações atuais na web se houver ferramentas disponíveis. Investigue, de forma proporcional ao escopo, público e necessidades, alternativas, concorrentes, linguagem da categoria, objeções e mudanças relevantes.

- Se a tarefa pedir análise de sites, páginas de venda, concorrentes, conversão ou referências de UX/UI inovadoras, use também a skill [`benchmark-sites-conversao`](../benchmark-sites-conversao/SKILL.md).
- Se a tarefa envolver alinhar proposta de valor, narrativa, identidade visual, logo ou materiais de marketing, use também a skill [`branding-produto`](../branding-produto/SKILL.md).
- Priorize fontes primárias e fontes reconhecidas; confirme afirmações importantes em mais de uma fonte quando possível.
- Registre links e datas de publicação ou consulta. Separe observações das fontes das suas interpretações.
- Não invente números, tendências, citações, concorrentes ou conclusões. Não trate o discurso de um concorrente como prova de resultado.
- Se a web não estiver disponível, diga isso e delimite o que foi inferido apenas a partir do repositório ou do conhecimento prévio.
- Pesquise somente o necessário para a decisão; uma microcopy pontual não exige um relatório amplo de mercado.

## 4. Construa a estratégia de mensagem

Antes de escrever, conecte:
- público e situação concreta de uso;
- problema ou tarefa que a pessoa quer resolver;
- benefício demonstrável e capacidade real que o sustenta;
- alternativa atual e objeções relevantes;
- mensagem principal, apoio/prova e próxima ação.

Se houver várias audiências ou módulos, não os reduza a uma promessa genérica. Escolha a mensagem adequada ao contexto e sinalize trade-offs de posicionamento.

## 5. Escreva e coordene com design

Produza português brasileiro natural por padrão, salvo instrução diferente. Prefira linguagem concreta, específica e fácil de entender; adapte o tom ao público profissional e ao risco da tarefa. Em interfaces, use rótulos concisos, instruções acionáveis, estados claros, erros úteis e termos consistentes com o restante do produto.

Design e copy se influenciam, mas não são sinônimos:
- Design cuida da estrutura, hierarquia visual, interação e apresentação.
- Copy e UX writing cuidam da linguagem, compreensão, confiança e ação.
- Colabore sobre o mesmo fluxo: ajuste texto e interface juntos quando necessário, sem usar texto como preenchimento visual nem sacrificar clareza para caber em um layout.
- Em trabalho de interface, consulte o agente `design` quando disponível e respeite os tokens, componentes e padrões existentes.

Não alegue aprovação de crédito, recuperação financeira, prevenção de fraude, conformidade regulatória ou resultados garantidos sem evidência específica. Não apresente a IA como substituta de julgamento humano ou de obrigações legais. Trate conteúdo regulatório como algo que precisa de validação apropriada, não como aconselhamento jurídico.

## 6. Entregue com transparência

Para pedidos de estratégia ou pesquisa, apresente síntese, evidências, hipóteses, riscos e recomendação. Para pedidos de texto, entregue a versão pronta para uso e, quando útil, alternativas com diferenças claras de intenção. Inclua fontes quando houve pesquisa externa.

Se a solicitação pedir implementação, mantenha a mudança dentro do escopo e siga as instruções de arquitetura e validação do `CLAUDE.md`. Não altere funcionalidades ou regras de negócio para acomodar uma proposta de comunicação sem autorização.

## 7. Regras aprendidas na prática

**Auditoria de alegações.** Para cada frase pública, aponte o arquivo ou função que a sustenta. Palavras absolutas (ninguém, nunca, todo, garante, impossível, "passa em auditoria") exigem prova do mesmo tamanho; sem ela, troque por um verbo verificável (detecta, registra, mostra, evidencia).

**IA × regra.** As decisões de conciliação, crédito e PLD são determinísticas. A IA lê documentos e explica/converte código legado. Não atribua decisões à IA e não diga que ela "explica cada resultado".

**Confira no código antes de chamar algo de lacuna.** Antes de afirmar que o produto não faz algo (ex.: um formato de arquivo), procure no `src/lib/`. Ex.: o CNAB 240 é suportado em `src/lib/reconcile.ts`, embora o README cite só o CNAB 400.

**Cruze dor × cobertura.** Para cada dor de mercado, liste a capacidade implementada (arquivo) e as lacunas reais antes de recomendar uma mensagem.

**Mapa de provas nativas** (use quando não há clientes nem métricas):
- `src/lib/auth.ts` — trilha encadeada (`verifyAuditChain`), sessão, senha. A trilha *detecta* alterações; o hash fica no próprio banco, então não diga "verificável por terceiros".
- `src/lib/settings.ts` / `settings-defaults.ts` — regras configuráveis e validadas (multa ≤ 2%, faixas de atraso, limites de PLD).
- `tests/modulos.test.mts` + `public/demo/` — mesmos arquivos de exemplo usados nos testes e no `/tour`.
- `README.md` — seções Segurança e IA.

**Fontes-padrão do setor** (Brasil): Banco Central (Relatório de Estabilidade Financeira, IF.Data, Panorama do SNCC, normas de PLD), COAF, OCB, Febraban. Prefira o documento original à notícia que o cita; se só achar a notícia, diga isso.
