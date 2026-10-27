# Instruções para pedidos no projeto

- Use o agente `orquestrador` como ponto de entrada para classificar cada novo pedido e escolher o menor fluxo necessário. Se o agente ou a delegação não estiver disponível, faça essa triagem diretamente e não alegue que delegou.
- O orquestrador deve responder diretamente a dúvidas, explicações, consultas simples e mudanças pequenas; não deve chamar outros agentes sem necessidade.
- Antes de mudanças que envolvam vários arquivos, fluxos ou decisões técnicas, solicite o plano do `arquiteto` e só então implemente. Não acione o arquiteto para perguntas, pesquisas ou alterações simples.
- Preserve os encaminhamentos especializados definidos em `.claude/agents/orquestrador.md`, incluindo o `security-review` para pedidos explícitos de revisão de vulnerabilidades.
- Para economizar contexto e tokens, não repita análises, não carregue agentes sem necessidade, consulte apenas arquivos relevantes e mantenha a resposta proporcional ao pedido.
