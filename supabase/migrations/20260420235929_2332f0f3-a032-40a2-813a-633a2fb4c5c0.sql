-- ============================================
-- MIGRAÇÃO #1: Roles seguros + Super Admin
-- ============================================

-- 1. Enum de papéis
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin');

-- 2. Tabela user_roles (separada para evitar escalada de privilégio)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Função has_role (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. Função is_super_admin (atalho)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin'::app_role)
$$;

-- 5. Função is_admin_or_super (qualquer admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'super_admin'::app_role)
$$;

-- 6. RLS para user_roles
-- Cada usuário pode ver os próprios papéis
CREATE POLICY "users_view_own_roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Super admin vê todos
CREATE POLICY "super_admin_view_all_roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Apenas super admin gerencia papéis
CREATE POLICY "super_admin_manage_roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 7. Reescrever RLS de ensalamento usando o novo modelo
DROP POLICY IF EXISTS "escrita_autenticada" ON public.ensalamento;
DROP POLICY IF EXISTS "leitura_publica" ON public.ensalamento;

CREATE POLICY "ensalamento_public_read"
ON public.ensalamento FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "ensalamento_admin_write"
ON public.ensalamento FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 8. Descontinuar tabela user_profiles antiga (substituída por user_roles)
DROP TABLE IF EXISTS public.user_profiles;

-- 9. Criar Super Admin: maiconinform@gmail.com / Afya2026@
DO $$
DECLARE
  super_admin_id UUID;
  existing_id UUID;
BEGIN
  -- Verifica se já existe
  SELECT id INTO existing_id FROM auth.users WHERE email = 'maiconinform@gmail.com';
  
  IF existing_id IS NULL THEN
    super_admin_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      super_admin_id,
      'authenticated',
      'authenticated',
      'maiconinform@gmail.com',
      crypt('Afya2026@', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nome":"Maicon - Super Admin"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      super_admin_id,
      jsonb_build_object('sub', super_admin_id::text, 'email', 'maiconinform@gmail.com', 'email_verified', true),
      'email',
      super_admin_id::text,
      now(),
      now(),
      now()
    );
  ELSE
    super_admin_id := existing_id;
  END IF;

  -- Garante o papel de super_admin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (super_admin_id, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;