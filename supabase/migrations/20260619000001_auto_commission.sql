-- Auto-create commission record when appointment is marked "concluido"
CREATE OR REPLACE FUNCTION public.auto_create_commission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'concluido' AND OLD.status != 'concluido' THEN
    -- Get the professional's commission percentage
    DECLARE
      v_commission_percent INTEGER;
      v_service_price NUMERIC(10,2);
      v_commission_amount NUMERIC(10,2);
    BEGIN
      SELECT p.commission_percent INTO v_commission_percent
      FROM professionals p
      WHERE p.id = NEW.professional_id AND p.user_id = NEW.user_id;

      IF v_commission_percent IS NULL THEN
        v_commission_percent := 0;
      END IF;

      -- Get service price
      SELECT COALESCE(price, 0) INTO v_service_price
      FROM services
      WHERE id = NEW.service_id;

      v_commission_amount := (v_service_price * v_commission_percent) / 100.0;

      -- Insert commission record
      INSERT INTO product_sales (
        user_id,
        professional_id,
        customer_id,
        service_id,
        quantity,
        total_price,
        commission_amount,
        sale_type,
        created_at
      ) VALUES (
        NEW.user_id,
        NEW.professional_id,
        NEW.customer_id,
        NEW.service_id,
        1,
        v_service_price,
        v_commission_amount,
        'comissao',
        NOW()
      );
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on appointments table
DROP TRIGGER IF EXISTS trg_auto_commission ON public.appointments;
CREATE TRIGGER trg_auto_commission
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  WHEN (NEW.status = 'concluido' AND OLD.status != 'concluido')
  EXECUTE FUNCTION public.auto_create_commission();

-- Add index for faster report queries
CREATE INDEX IF NOT EXISTS idx_product_sales_commission ON public.product_sales(sale_type, user_id, created_at);
