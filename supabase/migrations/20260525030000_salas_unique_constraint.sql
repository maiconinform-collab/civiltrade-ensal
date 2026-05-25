-- Remove duplicatas de salas, mantendo apenas a sala mais recente para cada par (nome, unidade)
DELETE FROM salas a USING (
    SELECT MIN(ctid) as ctid, nome, unidade
    FROM salas 
    GROUP BY nome, unidade HAVING COUNT(*) > 1
) b
WHERE a.nome = b.nome AND a.unidade = b.unidade AND a.ctid <> b.ctid;

-- Repete o delete acima em loop caso houvesse mais de 2 duplicatas para a mesma sala
DELETE FROM salas a USING (
    SELECT MIN(ctid) as ctid, nome, unidade
    FROM salas 
    GROUP BY nome, unidade HAVING COUNT(*) > 1
) b
WHERE a.nome = b.nome AND a.unidade = b.unidade AND a.ctid <> b.ctid;

-- Repete de novo por segurança
DELETE FROM salas a USING (
    SELECT MIN(ctid) as ctid, nome, unidade
    FROM salas 
    GROUP BY nome, unidade HAVING COUNT(*) > 1
) b
WHERE a.nome = b.nome AND a.unidade = b.unidade AND a.ctid <> b.ctid;

-- E mais uma vez... (uma CTE recursiva ou query de deleção mais inteligente seria ideal, mas dado o tamanho da base, isso atende)
DELETE FROM salas
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
        ROW_NUMBER() OVER( PARTITION BY nome, unidade ORDER BY created_at ASC ) AS row_num
        FROM salas
    ) t
    WHERE t.row_num > 1
);

-- Adiciona a restrição Unique
ALTER TABLE salas ADD CONSTRAINT unique_sala_unidade UNIQUE (nome, unidade);
