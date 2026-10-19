---
name: branding-produto
description: "Use para alinhar o produto Livingstone à marca e ao marketing: posicionamento de marca, proposta de valor, logo, identidade visual e verbal, tom de voz, sistema gráfico e peças ou campanhas. Conecte tudo a capacidades reais do produto e evidências do projeto."
---

# Branding conectado ao produto — Livingstone

Ajude a garantir que a marca e os materiais de marketing expressem o produto real da Livingstone, façam sentido para seu público e sejam consistentes entre si. Branding não é apenas desenhar um logo: é alinhar estratégia, linguagem e expressão visual em todos os pontos de contato.

## 1. Delimite a decisão

Entenda se o pedido é sobre:
- posicionamento, personalidade ou narrativa da marca;
- logo, símbolo, tipografia, cores ou sistema visual;
- voz, mensagens, slogan ou identidade verbal;
- site, apresentação, anúncio, vídeo, rede social ou outra peça de marketing;
- auditoria de coerência entre produto, marca e comunicação.

Identifique público, objetivo, canal, formato e ação desejada. Se uma decisão essencial estiver em aberto e várias opções levarem a resultados significativamente diferentes, pergunte; caso contrário, explicite as premissas adotadas.

## 2. Parta do produto e das evidências

Leia o `README.md`, `CLAUDE.md` e os arquivos relevantes à solicitação. Para uma auditoria ampla do produto, use o agente `product-auditor` quando disponível. Verifique capacidades reais, telas e fluxos que a comunicação pretende representar.

Para contexto visual, examine os componentes de marca, tokens, estilos globais, metadados, landing page e assets existentes. Nesta aplicação, comece por `src/lib/brand.ts`, `src/components/Logo.tsx`, `src/app/globals.css`, `src/app/page.tsx` e `public/`. Confirme o estado atual nos arquivos em vez de tratar esta lista como inventário completo ou presumir que o site público e os materiais externos são iguais à aplicação.

Separe com clareza:
- **Fatos:** evidência no produto, repositório, briefing ou fonte verificável.
- **Hipóteses:** interpretações sobre público, personalidade, diferenciação ou percepção.
- **Lacunas:** atributos, resultados, credenciais, clientes ou provas que precisam ser confirmados.

Considere que a Livingstone atua em operações bancárias com IA para cooperativas de crédito, financeiras e fintechs, com módulos de conciliação, crédito, cobrança, PLD/COAF e modernização de legado. Confirme quais desses módulos e alegações são pertinentes à peça em questão. Como há dados financeiros e operações reguladas, a identidade precisa equilibrar inovação com clareza, confiança e seriedade.

## 3. Avalie o encaixe produto–marca–marketing

Para cada elemento relevante, verifique:
- **Produto:** o que é oferecido, o que realmente faz e quais provas existem.
- **Público:** a quem se dirige e qual necessidade ou preocupação está sendo atendida.
- **Promessa:** o benefício comunicado e se a capacidade real o sustenta.
- **Marca:** que atributos a linguagem, o logo, as cores, a tipografia e as imagens transmitem.
- **Experiência:** se a primeira impressão, a demonstração e a chamada para ação contam a mesma história.
- **Confiança:** se há evidências, limites e sinais de segurança proporcionais às alegações.
- **Consistência:** se os pontos de contato mantêm uma identidade reconhecível, sem impedir adaptação ao canal.

Mostre desalinhamentos concretos e sua consequência provável. Não classifique uma preferência estética como fato de mercado nem diga que a marca “converte” sem evidência.

## 4. Pesquise referências apenas quando agregar

Para decisões de posicionamento ou identidade, use fontes e referências atuais quando isso puder melhorar a recomendação. Quando a tarefa envolver sites, benchmarking, concorrentes ou páginas de venda, combine com a skill [`benchmark-sites-conversao`](../benchmark-sites-conversao/SKILL.md). Registre URLs e datas, diferencie observação de interpretação e não copie marcas, logos, slogans, layouts distintivos ou ativos de terceiros.

Não confunda estética apreciada, prêmio, notoriedade ou presença de clientes com prova de conversão. Atribua cada evidência à fonte correta e declare quando desempenho comercial não puder ser confirmado.

## 5. Recomende ou crie com coerência

Ao propor uma direção, explique a conexão entre:
1. verdade do produto;
2. necessidade do público;
3. atributo ou percepção de marca desejada;
4. escolha visual/verbal;
5. aplicação no canal;
6. forma de verificar se a comunicação foi compreendida.

Se o pedido for execução, respeite a identidade e os componentes já existentes ou explique por que uma mudança de sistema é necessária. Considere legibilidade, contraste, acessibilidade, responsividade e uso real do logo em diferentes tamanhos e fundos. Não invente provas sociais, clientes, certificações, métricas ou garantias. Não sugira símbolos ou mensagens que insinuem aprovação de crédito, resultados financeiros ou conformidade sem suporte.

Design e copy são parceiros, não sinônimos: o design organiza a expressão visual e a interação; copy define as mensagens e a linguagem. Avalie-os juntos para que forma e conteúdo reforcem a mesma proposta de valor.

Para implementação visual, consulte o agente `design` quando disponível. Siga as regras de arquitetura, aprovação e validação descritas no `CLAUDE.md` e no agente de design; não altere regras de negócio para acomodar uma peça de marketing.

## 6. Formato de entrega

Adapte a resposta ao escopo. Para uma auditoria, apresente:
- síntese do que a marca comunica hoje e do que o produto comprova;
- pontos de alinhamento e desalinhamento com exemplos e caminhos de arquivo ou fontes;
- hipóteses e informações ainda necessárias;
- recomendações priorizadas e justificativa;
- aplicações sugeridas para os canais solicitados e critérios de validação.

Para uma peça específica, entregue o material pronto, a justificativa de alinhamento e as limitações de evidência relevantes. Inclua fontes e datas quando houver pesquisa externa.

## 7. Regras aprendidas na prática

- **Contexto da empresa:** para fatos do produto, provas nativas e a regra "IA × regra", siga a seção 7 de `produto-mercado-copy` em vez de repetir aqui.
- **Critérios para avaliar um símbolo/logo:**
  1. distintividade frente à categoria (bússola, escudo e cadeado são comuns em finanças);
  2. conexão com uma capacidade real (ex.: conciliação = duas partes que se encaixam);
  3. leitura em 16, 32 e 64 px, em fundo claro e escuro;
  4. risco de associação indevida (cripto/blockchain, "aprovação garantida");
  5. custo de troca: `src/components/Logo.tsx`, favicon, metadados, vídeo em `video/`.
- **Prioridade:** promessas exageradas na copy são risco maior que um símbolo pouco distintivo. Corrija a linguagem antes de redesenhar a marca.
- **Estado atual (out/2026):** símbolo de bússola em `Logo.tsx`; direção recomendada para evolução: "Encaixe" (duas peças em L que formam o quadrado). Ainda não implementada.
