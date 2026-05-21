## Problema

Hoje, quando o profissional marca um agendamento como **Concluído**, nada é registrado financeiramente para a barbearia. O relatório de Faturamento (`get_report_summary`) só lê a tabela `transactions` (compras de crédito). Da mesma forma, as vendas de produtos vão para `product_sales`, mas não entram no faturamento da loja nem na comissão exibida no painel do barbeiro.

## Objetivo

Quando o profissional confirmar o comparecimento (status = `concluido`), o valor do serviço deve entrar automaticamente:
- no **faturamento da barbearia** (relatórios)
- na **comissão do barbeiro** (painel do profissional)

E o mesmo deve valer para **produtos vendidos**.

## Mudanças

### 1. Trigger no banco para agendamentos concluídos
Criar um trigger em `appointments` que, ao mudar status para `concluido`:
- insere uma linha em `transactions` com `type = 'service'`, `total = services.price`, `professional_id`, `customer_id`, `notes = 'Serviço: <nome>'`
- evita duplicar se o trigger disparar novamente (chave: appointment_id em notes, ou flag de idempotência)
- se voltar de `concluido` para outro status, remove a transação correspondente

### 2. Atualizar `get_report_summary`
Passar a somar receita de:
- `transactions` (compras de crédito + serviços concluídos)
- `product_sales` onde `sale_type = 'venda'`

### 3. Atualizar `get_professional_stats`
Incluir na receita/comissão do barbeiro:
- serviços concluídos (já contabiliza)
- `product_sales.commission_amount` do profissional no período

### 4. Atualizar `get_sales_chart`
Incluir vendas de produtos no gráfico de faturamento diário.

## Detalhes técnicos

```text
appointments.status: agendado → concluido
        │
        ▼ (trigger AFTER UPDATE)
   INSERT transactions {
     type='service', total=service.price,
     professional_id, customer_id, user_id
   }
```

- Tipo novo de transação: `'service'` (mantém `'purchase'` para créditos)
- Idempotência: armazenar `appointment_id` em `transactions.notes` (ex.: `appt:<uuid>`) e checar antes de inserir
- Revertendo o status: `DELETE FROM transactions WHERE notes LIKE 'appt:<id>%'`
- `get_report_summary.revenue` passa a somar `transactions.total` (qualquer tipo de receita) + `product_sales.total_price` no período
- `get_professional_stats.revenue` soma serviços concluídos + product_sales do profissional; comissão usa `commission_percent` para serviços e `commission_amount` direto de product_sales

## Perguntas

1. O valor a ser registrado no faturamento ao concluir o agendamento deve ser o **preço do serviço cadastrado** (`services.price`) — ok?
2. Se o profissional clicar em "Concluir" por engano e desfizer, devo **remover** a receita gerada? (recomendo sim)
3. Para produtos: devo contabilizar como receita da barbearia somente vendas (`sale_type = 'venda'`) e ignorar consumo interno?
