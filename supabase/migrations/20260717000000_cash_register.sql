-- ============================================================
-- CASH REGISTER SYSTEM (Sistema de Caixa)
-- ============================================================

-- 1. CASH REGISTER SESSIONS (abertura/fechamento de caixa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  expected_closing_balance NUMERIC(10,2),
  closing_balance NUMERIC(10,2),
  difference NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions" ON public.cash_register_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Garante no máximo 1 caixa aberto por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_user
  ON public.cash_register_sessions (user_id)
  WHERE status = 'open';

-- 2. CASH MOVEMENTS (cada movimentação física do caixa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_register_id UUID NOT NULL REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  category TEXT NOT NULL CHECK (category IN (
    'recebimento',    -- dinheiro recebido do cliente
    'troco',           -- troco devolvido ao cliente
    'sangria',         -- retirada de dinheiro do caixa
    'suprimento',      -- adição de dinheiro ao caixa
    'ajuste'           -- ajuste manual na reconciliação
  )),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')),
  payment_split_id UUID,
  financial_entry_id UUID REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cash movements" ON public.cash_movements
  FOR ALL USING (auth.uid() = user_id);

-- 3. PAYMENT SPLITS (divisão de pagamento em múltiplos métodos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_entry_id UUID NOT NULL REFERENCES public.financial_entries(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')),
  amount NUMERIC(10,2) NOT NULL,
  cash_received NUMERIC(10,2),
  cash_change NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- FK de cash_movements para payment_splits
ALTER TABLE public.cash_movements
  ADD CONSTRAINT IF NOT EXISTS fk_cash_movements_payment_split
  FOREIGN KEY (payment_split_id) REFERENCES public.payment_splits(id) ON DELETE SET NULL;

-- RLS via financial_entry ownership
ALTER TABLE public.payment_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own payment splits" ON public.payment_splits
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM financial_entries WHERE id = financial_entry_id)
  );

-- 4. NOVAS COLUNAS EM TABELAS EXISTENTES
-- ============================================================
ALTER TABLE public.product_sales
  ADD COLUMN IF NOT EXISTS payment_method TEXT
  DEFAULT 'pix'
  CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT
  DEFAULT 'pix'
  CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro'));

-- 5. ATUALIZAR TRIGGERS PARA USAR payment_method CORRETO
-- ============================================================

-- 5a. sync_product_sale_to_cash_flow (atualizado)
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
        'Venda de ' || COALESCE(v_prod_name, 'Produto') || ' x' || NEW.quantity ||
        ' | Cliente: ' || COALESCE(v_client_name, 'Anônimo') ||
        ' | Vendedor: ' || COALESCE(v_prof_name, '—'),
        COALESCE(NEW.payment_method, 'pix'),
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

-- 5b. sync_credit_purchase_to_cash_flow (atualizado)
CREATE OR REPLACE FUNCTION public.sync_credit_purchase_to_cash_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
BEGIN
  IF NEW.type = 'purchase' THEN
    SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;

    IF NOT EXISTS (
      SELECT 1 FROM financial_entries WHERE credit_transaction_id = NEW.id
    ) THEN
      INSERT INTO financial_entries (
        user_id, type, category, amount, description, payment_method, date, credit_transaction_id, created_at
      )
      VALUES (
        NEW.user_id,
        'entrada',
        'Planos/Créditos',
        NEW.amount,
        'Créditos: ' || COALESCE(v_customer_name, 'Cliente'),
        COALESCE(NEW.payment_method, 'pix'),
        DATE(NEW.created_at),
        NEW.id,
        NEW.created_at
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. FUNCTIONS
-- ============================================================

-- 6a. Abrir caixa
CREATE OR REPLACE FUNCTION public.open_cash_register(p_initial_balance NUMERIC DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  IF EXISTS (SELECT 1 FROM cash_register_sessions WHERE user_id = v_user_id AND status = 'open') THEN
    RAISE EXCEPTION 'Já existe um caixa aberto para este usuário';
  END IF;

  INSERT INTO cash_register_sessions (user_id, opening_balance, expected_closing_balance)
  VALUES (v_user_id, p_initial_balance, p_initial_balance)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- 6b. Fechar caixa
CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_session_id UUID,
  p_actual_balance NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected NUMERIC;
BEGIN
  SELECT expected_closing_balance INTO v_expected
  FROM cash_register_sessions
  WHERE id = p_session_id AND user_id = auth.uid() AND status = 'open';

  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada ou já fechada';
  END IF;

  UPDATE cash_register_sessions
  SET
    closed_at = now(),
    closing_balance = p_actual_balance,
    difference = p_actual_balance - v_expected,
    status = 'closed',
    notes = p_notes
  WHERE id = p_session_id;
END;
$$;

-- 6c. Recalcular saldo esperado
CREATE OR REPLACE FUNCTION public.recalculate_expected_balance(p_session_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening NUMERIC;
  v_cash_in NUMERIC;
  v_cash_out NUMERIC;
  v_expected NUMERIC;
BEGIN
  SELECT opening_balance INTO v_opening
  FROM cash_register_sessions
  WHERE id = p_session_id AND user_id = auth.uid();

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_in
  FROM cash_movements
  WHERE cash_register_id = p_session_id AND type = 'entrada';

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_out
  FROM cash_movements
  WHERE cash_register_id = p_session_id AND type = 'saida';

  v_expected := v_opening + v_cash_in - v_cash_out;

  UPDATE cash_register_sessions
  SET expected_closing_balance = v_expected
  WHERE id = p_session_id;

  RETURN v_expected;
END;
$$;

-- 7. INDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON public.cash_movements(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON public.cash_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_splits_financial ON public.payment_splits(financial_entry_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_user ON public.cash_register_sessions(user_id, status);
