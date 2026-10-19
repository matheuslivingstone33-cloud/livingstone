---
name: benchmark-sites-conversao
description: "Use para pesquisar e analisar sites de concorrentes ou produtos parecidos, páginas que convertem e experiências digitais inovadoras. Investigue como o site apresenta o produto, fala com o público, demonstra valor e conduz à ação; valide sinais de desempenho com fontes."
---

# Benchmark de sites, produto e conversão

Pesquise referências úteis para decisões de produto, posicionamento, copy e front-end da Livingstone. O objetivo não é colecionar sites bonitos: é entender como cada experiência comunica valor a um público específico, reduz dúvidas e orienta uma ação, e o que pode ser adaptado ao produto sem copiar.

## 1. Defina o benchmark

Antes de pesquisar, identifique:
- a decisão que o benchmark deve apoiar: narrativa, landing page, homepage, página de produto, demo, formulário, visual ou fluxo;
- o módulo e público em foco, como cooperativas de crédito, financeiras, fintechs, equipes de operações, crédito, cobrança ou compliance;
- o mercado e idioma relevantes (Brasil, América Latina ou global);
- se a prioridade é comparar concorrentes diretos, produtos adjacentes ou referências inovadoras de outros setores.

Comece pelo site atual da Livingstone e pelo contexto relevante do repositório para ter uma base de comparação. Não misture referências sem explicar por que cada uma é relevante. Se a solicitação não especificar os critérios e isso puder mudar significativamente a seleção, pergunte; caso contrário, declare critérios razoáveis e prossiga.

## 2. Encontre referências verificáveis

Use ferramentas de pesquisa e navegação web disponíveis para encontrar sites atuais. Inclua, conforme fizer sentido:
- concorrentes diretos e alternativas usadas pelo mesmo público;
- produtos adjacentes com problemas de confiança, risco ou complexidade parecidos;
- referências de outros setores reconhecidas por uma abordagem específica de experiência, não apenas por estética.

Verifique os sites diretamente quando possível. Registre URL, nome da empresa/produto, mercado e data de acesso. Procure também evidência independente ou primária sobre adoção e desempenho comercial: estudos de caso com métricas e contexto, relatórios publicados, dados financeiros ou de clientes divulgados por fontes confiáveis e reconhecimentos com critérios verificáveis.

## 3. Trate “vende bem” como uma hipótese que precisa de evidência

Não afirme que um site converte ou vende bem somente porque parece profissional, aparece no topo de busca, tem tráfego estimado, prêmios, depoimentos ou logotipos de clientes.

Classifique o que encontrou:
- **Resultado documentado:** fonte identificável publica uma métrica comercial ou de conversão, com contexto suficiente para entender a afirmação. Informe quem publicou, período, escopo e limitações.
- **Sinal de tração:** evidência verificável de clientes, adoção, receita, expansão ou investimento. É indício de sucesso do negócio, mas não prova que o site causou as vendas.
- **Sinal indireto:** tráfego estimado, prêmio, presença em rankings, testemunho ou impressão visual. Não prova conversão.
- **Sem evidência pública suficiente:** não foi possível verificar desempenho comercial ou conversão.

Separe sempre:
- fatos observados no site;
- afirmações feitas pela própria empresa;
- evidências de terceiros;
- interpretações e hipóteses sobre por que a experiência pode funcionar.

Não invente taxas de conversão, receita atribuída à página, resultados ou causalidade. Não prometa que uma referência produzirá o mesmo resultado para a Livingstone.

## 4. Analise a experiência, não só a aparência

Para cada site, avalie o que é relevante à pergunta:
- público aparente e situação de uso a que a página responde;
- proposta de valor, headline, linguagem e diferenciação;
- ordem e hierarquia da narrativa: problema, solução, benefícios, prova e objeções;
- como o produto é demonstrado: interface, vídeo, ilustração, fluxo ou caso de uso;
- confiança: clientes, evidências, segurança, transparência e sinais regulatórios;
- chamada para ação, intenção prometida, fricção e próximos passos;
- estrutura visual, legibilidade, acessibilidade e comportamento mobile, se puder verificar;
- alinhamento entre a promessa, o produto demonstrado e as provas disponíveis.

Não deduza conversão a partir de uma observação visual. Se não conseguir carregar ou verificar uma página, declare a limitação e use somente informações que as fontes consultadas sustentam.

## 5. Traduza em recomendações próprias para a Livingstone

Para cada recomendação, explique:
1. qual padrão observável da referência inspirou a ideia;
2. qual necessidade do público da Livingstone ela pode atender;
3. como adaptar a ideia à capacidade real e ao tom de confiança do produto;
4. qual risco ou hipótese precisa ser validado.

Distinga princípios transferíveis de elementos que não devem ser copiados. Não reproduza textos, identidade visual, layouts distintivos ou ativos de terceiros. Não recomende exagero de urgência, provas sociais não verificadas ou promessas financeiras, regulatórias e de IA sem comprovação.

## 6. Formato de entrega

Adapte o tamanho ao pedido. Para uma pesquisa completa, entregue:

1. **Resumo:** decisão, público e critérios usados.
2. **Tabela de referências:** produto/site, URL, relevância, padrão observado e categoria da evidência de desempenho.
3. **Análise por referência:** narrativa, produto demonstrado, confiança, chamada para ação, experiência visual e limitações.
4. **Padrões comparados:** o que se repete, o que diferencia e o que parece inadequado à Livingstone.
5. **Recomendações priorizadas:** mudança sugerida, justificativa, evidência, hipótese e forma de validar.
6. **Fontes e data de consulta:** links diretos e identificação clara do que cada fonte comprova.

Para uma pergunta pontual, responda diretamente, mantendo links, distinção entre evidência e inferência, e uma recomendação aplicável. Se pesquisa ou navegação não estiver disponível, informe isso explicitamente em vez de apresentar referências não verificadas como atuais.

## 7. Regras aprendidas na prática

- **Base de comparação:** a landing está em `src/app/page.tsx` e o tour público em `src/app/tour/page.tsx`. Se o servidor de dev estiver rodando, use `http://localhost:3000` e `/tour`; sem URL pública, compare pelo código.
- **Orçamento de pesquisa:** até ~6 buscas e ~8 páginas por pergunta. Declare o que ficou de fora.
- **Quando o WebFetch falha** (página vazia ou genérica): marque "não verificado" e não use o conteúdo; tente o PDF, a versão oficial ou outra fonte primária.
- **WebFetch não vê o visual:** ele devolve texto/HTML, sem CSS nem página renderizada. Para afirmar algo sobre fundo, animação ou layout, tire um print renderizado (ex.: Edge headless) ou declare que a observação é dedução pelo HTML.
- **Categoria intermediária de evidência:** "Afirmação do fornecedor com case identificável" — cliente nomeado + métrica publicada pela própria empresa. Mais forte que sinal indireto, mas não é resultado independente.
- **Antes de apontar lacuna da Livingstone** em relação a um concorrente, confirme no `src/lib/` que a capacidade realmente não existe.
- **Formato curto** (quando o pedido for limitado): uma tabela única + recomendação + lacunas, em vez das seis seções.
