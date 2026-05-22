-- Tabela de eventos do auditório
CREATE TABLE public.auditorio_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  responsavel text,
  descricao text,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  local text DEFAULT 'Auditório Principal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auditorio_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auditorio_public_read" ON public.auditorio_eventos
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "auditorio_admin_write" ON public.auditorio_eventos
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER tg_auditorio_updated_at
  BEFORE UPDATE ON public.auditorio_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE INDEX idx_auditorio_inicio ON public.auditorio_eventos (inicio);

-- Tabela de avisos (marquee na TV)
CREATE TABLE public.avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avisos_public_read" ON public.avisos
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "avisos_admin_write" ON public.avisos
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER tg_avisos_updated_at
  BEFORE UPDATE ON public.avisos
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Tabela de perfis (nome do usuário)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_super_admin_read" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER tg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Auto-criar profile no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles para usuários existentes
INSERT INTO public.profiles (id, nome)
SELECT id, COALESCE(raw_user_meta_data->>'nome', email)
FROM auth.users
ON CONFLICT (id) DO NOTHING;