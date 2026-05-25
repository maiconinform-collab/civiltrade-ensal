-- Adiciona coluna 'data' (DATE) na tabela ensalamento para filtro por data específica.
-- Nullable para não quebrar registros existentes sem data definida.
ALTER TABLE ensalamento ADD COLUMN IF NOT EXISTS data DATE;
