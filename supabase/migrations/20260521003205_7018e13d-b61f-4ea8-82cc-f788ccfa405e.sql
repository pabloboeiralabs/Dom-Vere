ALTER TABLE public.product_sales ADD COLUMN sale_type TEXT NOT NULL DEFAULT 'venda' CHECK (sale_type IN ('venda', 'consumo_colaborador'));
