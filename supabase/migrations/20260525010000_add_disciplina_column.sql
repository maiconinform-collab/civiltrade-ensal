-- Adiciona coluna 'disciplina' (TEXT) para o modelo atômico de ensalamento.
-- Uma linha = uma aula em uma data específica (campo 'data') com uma disciplina.
-- As colunas antigas (segunda, terca, etc.) são mantidas para retrocompatibilidade.
ALTER TABLE ensalamento ADD COLUMN IF NOT EXISTS disciplina TEXT;

-- Índices para performance no filtro por data
CREATE INDEX IF NOT EXISTS idx_ensalamento_data ON ensalamento(data);
CREATE INDEX IF NOT EXISTS idx_ensalamento_unidade_data ON ensalamento(unidade, data);
