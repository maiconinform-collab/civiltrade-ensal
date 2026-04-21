-- ============================================
-- MIGRAÇÃO #2: Entidades + Settings
-- ============================================

-- Trigger reusável de updated_at
CREATE OR REPLACE FUNCTION public.tg_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. PROFESSORES
CREATE TABLE public.professores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  departamento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.professores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professores_public_read" ON public.professores
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "professores_admin_write" ON public.professores
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_professores_updated BEFORE UPDATE ON public.professores
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- 2. DISCIPLINAS
CREATE TABLE public.disciplinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo TEXT,
  carga_horaria INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.disciplinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disciplinas_public_read" ON public.disciplinas
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "disciplinas_admin_write" ON public.disciplinas
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_disciplinas_updated BEFORE UPDATE ON public.disciplinas
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- 3. SALAS
CREATE TABLE public.salas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  bloco TEXT,
  capacidade INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salas_public_read" ON public.salas
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "salas_admin_write" ON public.salas
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_salas_updated BEFORE UPDATE ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- 4. HORARIOS (slots padrão)
CREATE TABLE public.horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno TEXT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  dia_semana TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "horarios_public_read" ON public.horarios
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "horarios_admin_write" ON public.horarios
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_horarios_updated BEFORE UPDATE ON public.horarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- 5. SETTINGS (chave/valor JSONB)
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Settings: leitura pública (TV precisa das cores/logo)
CREATE POLICY "settings_public_read" ON public.settings
  FOR SELECT TO anon, authenticated USING (true);

-- Apenas super_admin altera configurações
CREATE POLICY "settings_super_admin_write" ON public.settings
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Valores iniciais (rosa Afya + roxo do tema OKLCH)
INSERT INTO public.settings (key, value) VALUES
  ('brand_name', '"Afya"'::jsonb),
  ('unit_name', '"Unidade Principal"'::jsonb),
  ('logo_url', '""'::jsonb),
  ('primary_color', '"336 78% 56%"'::jsonb),
  ('secondary_color', '"280 65% 55%"'::jsonb)
ON CONFLICT (key) DO NOTHING;