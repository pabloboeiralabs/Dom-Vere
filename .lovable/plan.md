## Problema

O bot disse que 11h de amanhã não tinha vaga, mas a agenda mostra livre. A função `check_availability` no edge function `whatsapp-webhook` falha por 3 motivos combinados:

1. **System prompt não inclui os horários disponíveis** — a IA não sabe os slots reais e chuta data/hora.
2. **Match exato de string** — `slots.find(s => s.date === args.date && s.time === args.time)` falha se a IA mandar `"11"`, `"11h"`, `"11:00:00"`, `"22/05"` em vez de `YYYY-MM-DD` + `HH:MM`.
3. **Slots em buckets fixos de 30min a partir do start_time** — horários "redondos" como 11:00 podem nem ser gerados se o expediente não começa em hora cheia/meia.

## Correção (apenas no edge function `supabase/functions/whatsapp-webhook/index.ts`)

### 1. Normalizar entrada da IA
Helpers `normalizeDate(args.date)` e `normalizeTime(args.time)`:
- Data: aceita `YYYY-MM-DD`, `DD/MM/YYYY`, `DD/MM`, `DD-MM`; resolve "amanhã" no fuso de Brasília quando ambíguo.
- Hora: aceita `11`, `11h`, `11h00`, `11:00`, `11:00:00` → devolve `HH:MM`.

### 2. Verificação real contra o banco (substitui o `slots.find`)
Nova função `isSlotAvailable(supabase, userId, dateISO, timeHHMM, professionalName?)`:
- Calcula `day_of_week` da data.
- Busca `professional_schedules` ativas para esse dia (filtrando por profissional se informado).
- Retorna `true` se o horário cai dentro de alguma faixa `[start_time, end_time)` E não existe `appointments` (status ≠ cancelado) sobrepondo aquele minuto.

Assim 11:00 é validado contra a faixa real (ex.: 08:00–18:00), independente do bucket de 30min.

### 3. Mostrar slots à IA
Em `buildSystemPrompt`, listar os próximos ~12 slots agregados (data + horários por profissional) para a IA propor opções coerentes. Ex.:
```
DISPONIBILIDADE (próximos dias):
- 2026-05-22 (sex) João: 09:00, 09:30, 11:00, 14:00
- 2026-05-22 (sex) Pedro: 10:00, 10:30
```

### 4. Aplicar mesma normalização em `create_appointment`
`handleToolCall` chama `normalizeDate`/`normalizeTime` antes do `insert` e revalida via `isSlotAvailable` para evitar gravar horário fora do expediente.

### 5. Logs
Logar `args` recebidos da IA, valor normalizado e resultado de `isSlotAvailable` para diagnóstico futuro.

## Fora de escopo
- Mudanças de UI no painel `/reports` ou agenda.
- Alterações em schema do banco.
- Carrossel WhatsApp (já tratado em mensagem anterior).
