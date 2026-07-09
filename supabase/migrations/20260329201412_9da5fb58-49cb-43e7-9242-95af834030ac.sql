
-- Profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'barbearia' CHECK (role IN ('admin', 'barbearia')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'barbearia')
  );
  -- Auto-create settings row
  INSERT INTO public.settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  birth_date DATE,
  credit_balance INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own customers" ON public.customers FOR ALL USING (auth.uid() = user_id);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  professional_id UUID,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage')),
  amount INTEGER NOT NULL,
  unit_price NUMERIC(10,2),
  total NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id);

-- Cuts table
CREATE TABLE public.cuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  professional_id UUID,
  credits_used INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cuts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cuts" ON public.cuts FOR ALL USING (auth.uid() = user_id);

-- Settings table
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  credit_price NUMERIC(10,2) DEFAULT 25.00,
  min_purchase INTEGER DEFAULT 5,
  validity_days INTEGER DEFAULT 90,
  shop_name TEXT DEFAULT 'Dom Vere',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON public.settings FOR ALL USING (auth.uid() = user_id);

-- Services table
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own services" ON public.services FOR ALL USING (auth.uid() = user_id);

-- Plans table
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  period TEXT DEFAULT 'mensal',
  usage_limit INTEGER DEFAULT 4,
  validity_days INTEGER DEFAULT 30,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plans" ON public.plans FOR ALL USING (auth.uid() = user_id);

-- Plan services
CREATE TABLE public.plan_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1
);
ALTER TABLE public.plan_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plan_services" ON public.plan_services FOR ALL USING (
  EXISTS (SELECT 1 FROM public.plans WHERE id = plan_services.plan_id AND user_id = auth.uid())
);

-- Customer plans
CREATE TABLE public.customer_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE,
  usage_count INTEGER DEFAULT 0,
  usage_limit INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT 'mensal',
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(10,2) DEFAULT 0,
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.customer_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own customer_plans" ON public.customer_plans FOR ALL USING (auth.uid() = user_id);

-- Plan usage records
CREATE TABLE public.plan_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_plan_id UUID REFERENCES public.customer_plans(id) ON DELETE CASCADE,
  professional_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.plan_usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plan_usage_records" ON public.plan_usage_records FOR ALL USING (
  EXISTS (SELECT 1 FROM public.customer_plans WHERE id = plan_usage_records.customer_plan_id AND user_id = auth.uid())
);

-- Plan usage services
CREATE TABLE public.plan_usage_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_record_id UUID REFERENCES public.plan_usage_records(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.plan_usage_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plan_usage_services" ON public.plan_usage_services FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.plan_usage_records pur
    JOIN public.customer_plans cp ON cp.id = pur.customer_plan_id
    WHERE pur.id = plan_usage_services.usage_record_id AND cp.user_id = auth.uid()
  )
);

-- WhatsApp templates
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whatsapp_templates" ON public.whatsapp_templates FOR ALL USING (auth.uid() = user_id);

-- Subscription pricing
CREATE TABLE public.subscription_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL UNIQUE CHECK (type IN ('normal', 'com_bot')),
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subscription_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read subscription_pricing" ON public.subscription_pricing FOR SELECT USING (true);
CREATE POLICY "Admins manage subscription_pricing" ON public.subscription_pricing FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
INSERT INTO public.subscription_pricing (type, price) VALUES ('normal', 0), ('com_bot', 0);

-- Professionals table
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  commission_percent INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own professionals" ON public.professionals FOR ALL USING (auth.uid() = user_id);

-- FK for professional_id columns
ALTER TABLE public.transactions ADD CONSTRAINT fk_transactions_professional FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;
ALTER TABLE public.cuts ADD CONSTRAINT fk_cuts_professional FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;
ALTER TABLE public.plan_usage_records ADD CONSTRAINT fk_plan_usage_records_professional FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Professional schedules
CREATE TABLE public.professional_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  active BOOLEAN DEFAULT true
);
ALTER TABLE public.professional_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own professional_schedules" ON public.professional_schedules FOR ALL USING (
  EXISTS (SELECT 1 FROM public.professionals WHERE id = professional_schedules.professional_id AND user_id = auth.uid())
);

-- Appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'concluido', 'cancelado', 'no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own appointments" ON public.appointments FOR ALL USING (auth.uid() = user_id);

-- WhatsApp config
CREATE TABLE public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  api_url TEXT NOT NULL DEFAULT 'https://free.uazapi.dev',
  instance_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whatsapp_config" ON public.whatsapp_config FOR ALL USING (auth.uid() = user_id);

-- WhatsApp messages
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wa_chatid TEXT NOT NULL,
  wa_message_id TEXT,
  from_me BOOLEAN DEFAULT false,
  text TEXT,
  msg_type TEXT DEFAULT 'text',
  wa_timestamp BIGINT NOT NULL,
  push_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_whatsapp_messages_user_chat ON public.whatsapp_messages (user_id, wa_chatid, wa_timestamp);
CREATE UNIQUE INDEX idx_whatsapp_messages_unique ON public.whatsapp_messages (user_id, wa_message_id) WHERE wa_message_id IS NOT NULL;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whatsapp_messages" ON public.whatsapp_messages FOR ALL USING (auth.uid() = user_id);
