-- 1. Add new columns
ALTER TABLE public.professores
  ADD COLUMN IF NOT EXISTS especialidade text,
  ADD COLUMN IF NOT EXISTS foto_url text;

ALTER TABLE public.disciplinas
  ADD COLUMN IF NOT EXISTS semestre text;

ALTER TABLE public.ensalamento
  ADD COLUMN IF NOT EXISTS observacoes text;

-- 2. Create avatars bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Storage policies for avatars
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_admin_insert" ON storage.objects;
CREATE POLICY "avatars_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "avatars_admin_update" ON storage.objects;
CREATE POLICY "avatars_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "avatars_admin_delete" ON storage.objects;
CREATE POLICY "avatars_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND public.is_admin(auth.uid()));