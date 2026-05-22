-- ============================================
-- MIGRAÇÃO #3: Storage bucket para logo
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública
CREATE POLICY "branding_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

-- Apenas super_admin escreve
CREATE POLICY "branding_super_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'branding' AND public.is_super_admin(auth.uid()));

CREATE POLICY "branding_super_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'branding' AND public.is_super_admin(auth.uid()));

CREATE POLICY "branding_super_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'branding' AND public.is_super_admin(auth.uid()));