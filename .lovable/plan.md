Diagnóstico confirmado: o erro acontece porque o webhook tenta salvar o agendamento com status `confirmado`, mas a tabela `appointments` só aceita `agendado`, `concluido`, `cancelado` e `no_show`.

Plano de correção:

1. Ajustar o webhook de WhatsApp
   - Em `supabase/functions/whatsapp-webhook/index.ts`, trocar o status enviado no insert de `confirmado` para `agendado`.
   - Manter a mensagem para o cliente como “Confirmado”, porque isso é só texto no WhatsApp; o status interno ficará compatível com o banco.

2. Preservar compatibilidade com o app
   - O agendamento online em `src/pages/Booking.tsx` já usa o padrão correto, que vira `agendado` automaticamente.
   - A tela de agenda já reconhece `agendado`, `concluido`, `cancelado` e `no_show`, então não precisa mudar a interface.

3. Publicar a função corrigida
   - Fazer deploy da função `whatsapp-webhook` após o ajuste.
   - Depois disso, repetir o fluxo pelo WhatsApp deve criar o agendamento sem cair em “Erro ao agendar”.

Detalhe técnico:

```text
Erro atual:
appointments_status_check rejeita status = "confirmado"

Correção:
status = "agendado"
```