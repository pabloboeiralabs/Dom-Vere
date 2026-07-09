-- Migration: Financial Control (Caixa e Fluxo de Caixa)

-- 1) Create financial_entries table
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  category TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  product_sale_id UUID REFERENCES public.product_sales(id) ON DELETE SET NULL,
  credit_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists and recreate
DROP POLICY IF EXISTS "Users manage own financial entries" ON public.financial_entries;
CREATE POLICY "Users manage own financial entries" ON public.financial_entries FOR ALL USING (auth.uid() = user_id);

-- 2) Trigger to sync appointment completion to cash flow
CREATE OR REPLACE FUNCTION public.sync_appointment_to_cash_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_name text;
  v_client_name text;
  v_prof_name text;
BEGIN
  -- Concluiu agora: insere lançamento de entrada se ainda não existir
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    SELECT COALESCE(price, 0), name INTO v_price, v_name
      FROM services WHERE id = NEW.service_id;
      
    SELECT name INTO v_client_name FROM customers WHERE id = NEW.customer_id;
    SELECT name INTO v_prof_name FROM professionals WHERE id = NEW.professional_id;

    IF NOT EXISTS (
      SELECT 1 FROM financial_entries
      WHERE appointment_id = NEW.id
    ) THEN
      INSERT INTO financial_entries (
        user_id, type, category, amount, description, payment_method, date, professional_id, appointment_id, created_at
      )
      VALUES (
        NEW.user_id,
        'entrada',
        'Serviço',
        COALESCE(v_price, 0),
        'Serviço: ' || COALESCE(v_name, '—') || ' | Cliente: ' || COALESCE(v_client_name, 'Anônimo') || ' | Profissional: ' || COALESCE(v_prof_name, '—'),
        'pix', -- Default to pix, user can adjust manually
        NEW.date,
        NEW.professional_id,
        NEW.id,
        NEW.created_at
      );
    END IF;
  END IF;

  -- Saiu de concluido: remove lançamento correspondente
  IF TG_OP = 'UPDATE' AND OLD.status = 'concluido' AND NEW.status <> 'concluido' THEN
    DELETE FROM financial_entries WHERE appointment_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointment_to_cash_flow ON public.appointments;
CREATE TRIGGER trg_sync_appointment_to_cash_flow
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_to_cash_flow();

-- 3) Trigger to sync product sales to cash flow
CREATE OR REPLACE FUNCTION public.sync_product_sale_to_cash_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod_name text;
  v_client_name text;
  v_prof_name text;
BEGIN
  IF NEW.sale_type = 'venda' THEN
    SELECT name INTO v_prod_name FROM products WHERE id = NEW.product_id;
    SELECT name INTO v_client_name FROM customers WHERE id = NEW.customer_id;
    SELECT name INTO v_prof_name FROM professionals WHERE id = NEW.professional_id;

    IF NOT EXISTS (
      SELECT 1 FROM financial_entries WHERE product_sale_id = NEW.id
    ) THEN
      INSERT INTO financial_entries (
        user_id, type, category, amount, description, payment_method, date, professional_id, product_sale_id, created_at
      )
      VALUES (
        NEW.user_id,
        'entrada',
        'Produto',
        NEW.total_price,
        'Venda de ' || COALESCE(v_prod_name, 'Produto') || ' x' || NEW.quantity || ' | Cliente: ' || COALESCE(v_client_name, 'Anônimo') || ' | Vendedor: ' || COALESCE(v_prof_name, '—'),
        'pix',
        DATE(NEW.created_at),
        NEW.professional_id,
        NEW.id,
        NEW.created_at
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_sale_to_cash_flow ON public.product_sales;
CREATE TRIGGER trg_sync_product_sale_to_cash_flow
  AFTER INSERT ON public.product_sales
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_sale_to_cash_flow();

-- 4) Trigger to sync credit transaction (purchase) to cash flow
CREATE OR REPLACE FUNCTION public.sync_credit_purchase_to_cash_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
BEGIN
  -- We only record actual purchases that generate positive revenue
  IF NEW.type = 'purchase' AND COALESCE(NEW.total, 0) > 0 THEN
    SELECT name INTO v_client_name FROM customers WHERE id = NEW.customer_id;

    IF NOT EXISTS (
      SELECT 1 FROM financial_entries WHERE credit_transaction_id = NEW.id
    ) THEN
      INSERT INTO financial_entries (
        user_id, type, category, amount, description, payment_method, date, professional_id, credit_transaction_id, created_at
      )
      VALUES (
        NEW.user_id,
        'entrada',
        'Planos/Créditos',
        COALESCE(NEW.total, 0),
        COALESCE(NEW.notes, 'Compra de Créditos/Planos') || ' | Cliente: ' || COALESCE(v_client_name, 'Anônimo'),
        'pix',
        DATE(NEW.created_at),
        NEW.professional_id,
        NEW.id,
        NEW.created_at
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_credit_purchase_to_cash_flow ON public.transactions;
CREATE TRIGGER trg_sync_credit_purchase_to_cash_flow
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_credit_purchase_to_cash_flow();

-- 5) Retrocompatibilidade: Backfill de dados existentes para financial_entries
-- Backfill de agendamentos concluídos
INSERT INTO financial_entries (user_id, type, category, amount, description, payment_method, date, professional_id, appointment_id, created_at)
SELECT
  a.user_id,
  'entrada',
  'Serviço',
  COALESCE(s.price, 0),
  'Serviço: ' || COALESCE(s.name, '—') || ' | Cliente: ' || COALESCE(c.name, 'Anônimo') || ' | Profissional: ' || COALESCE(p.name, '—'),
  'pix',
  a.date,
  a.professional_id,
  a.id,
  a.created_at
FROM appointments a
JOIN services s ON a.service_id = s.id
LEFT JOIN customers c ON a.customer_id = c.id
LEFT JOIN professionals p ON a.professional_id = p.id
WHERE a.status = 'concluido'
  AND NOT EXISTS (SELECT 1 FROM financial_entries WHERE appointment_id = a.id);

-- Backfill de vendas de produtos
INSERT INTO financial_entries (user_id, type, category, amount, description, payment_method, date, professional_id, product_sale_id, created_at)
SELECT
  ps.user_id,
  'entrada',
  'Produto',
  ps.total_price,
  'Venda de ' || COALESCE(pr.name, 'Produto') || ' x' || ps.quantity || ' | Cliente: ' || COALESCE(c.name, 'Anônimo') || ' | Vendedor: ' || COALESCE(prof.name, '—'),
  'pix',
  DATE(ps.created_at),
  ps.professional_id,
  ps.id,
  ps.created_at
FROM product_sales ps
JOIN products pr ON ps.product_id = pr.id
LEFT JOIN customers c ON ps.customer_id = c.id
LEFT JOIN professionals prof ON ps.professional_id = prof.id
WHERE ps.sale_type = 'venda'
  AND NOT EXISTS (SELECT 1 FROM financial_entries WHERE product_sale_id = ps.id);

-- Backfill de compras de planos/créditos
INSERT INTO financial_entries (user_id, type, category, amount, description, payment_method, date, professional_id, credit_transaction_id, created_at)
SELECT
  t.user_id,
  'entrada',
  'Planos/Créditos',
  COALESCE(t.total, 0),
  COALESCE(t.notes, 'Compra de Créditos/Planos') || ' | Cliente: ' || COALESCE(c.name, 'Anônimo'),
  'pix',
  DATE(t.created_at),
  t.professional_id,
  t.id,
  t.created_at
FROM transactions t
LEFT JOIN customers c ON t.customer_id = c.id
WHERE t.type = 'purchase' AND COALESCE(t.total, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM financial_entries WHERE credit_transaction_id = t.id);
