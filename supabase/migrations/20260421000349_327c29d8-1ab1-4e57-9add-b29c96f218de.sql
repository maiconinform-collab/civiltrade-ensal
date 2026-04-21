-- Restringe leitura pública apenas a arquivos de logo no bucket branding
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;

CREATE POLICY "branding_public_read_logo"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'branding'
  AND (storage.filename(name) LIKE 'logo.%')
);