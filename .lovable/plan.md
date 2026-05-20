# Corrigir bot do WhatsApp deslizando o horário pedido

## Problema

Quando o cliente pede um horário (ex.: "10 horas dia 17"), o bot confirma que está disponível e manda o carrossel de profissionais. Após o cliente clicar no profissional, a IA refaz a conversa do zero e às vezes "esquece" o horário original, propondo/confirmando um horário diferente (no caso real: 10:30 em vez de 10:00) — mesmo com 10:00 livre na agenda.

## Causa

No handler `PROF_` em `supabase/functions/whatsapp-webhook/index.ts`, a hora e a data são extraídas pela IA a partir do histórico. Se a IA chamar `create_appointment` direto, ou passar argumentos diferentes para `check_availability`, nada valida que a hora bate com a que o cliente pediu antes.

## Solução

Travar o horário detectado do contexto antes de qualquer chamada da IA no fluxo pós-seleção do profissional:

1. Extrair `ctx.detectedTime` e `ctx.resolvedDate` do histórico (já existe).
2. Antes de aceitar uma `tool_call` da IA:
   - Se for `check_availability`: sobrescrever `time` e `date` com os valores do contexto quando existirem.
   - Se for `create_appointment`: idem — forçar `time`/`date` do contexto.
3. Validar contra `slots`: se o horário pedido está disponível com aquele profissional, prosseguir; senão, sugerir o mais próximo (já existe `findClosestSlot`).
4. Aplicar a mesma trava no segundo fluxo (linhas ~1620-1700) que trata respostas livres.

## Detalhes técnicos

- Arquivo: `supabase/functions/whatsapp-webhook/index.ts`
- Handler `PROF_` (linhas ~1090-1290) e fluxo principal (linhas ~1620-1700)
- Reaproveitar `extractContextFromHistory`, `findClosestSlot` e a lista `slots` já carregada
- Nenhuma alteração de schema/RLS/frontend
