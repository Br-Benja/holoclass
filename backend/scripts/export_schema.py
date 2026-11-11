"""Genera database/schema.sql (PostgreSQL) a partir de los modelos SQLAlchemy, más las vistas de analítica.

Uso:  python scripts/export_schema.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.dialects import postgresql  # noqa: E402
from sqlalchemy.schema import CreateIndex, CreateTable  # noqa: E402

from app.db import Base  # noqa: E402
import app.models  # noqa: E402,F401

VIEWS = """
-- =====================================================================
--  Vistas de analítica para el panel docente
-- =====================================================================
CREATE OR REPLACE VIEW v_question_stats AS
SELECT m.key AS module_key, z.kind, q.qkey, q.prompt, q.concept_tag, q.qtype,
       COUNT(a.attempt_id)                                                  AS answers,
       ROUND(100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 1)      AS pct_correct,
       ROUND(AVG(a.response_ms) / 1000.0, 1)                                AS avg_seconds
FROM question q
JOIN quiz z   ON z.quiz_id = q.quiz_id
JOIN module m ON m.module_id = z.module_id
LEFT JOIN attempt_answer a ON a.question_id = q.question_id
WHERE q.active
GROUP BY m.key, z.kind, q.qkey, q.prompt, q.concept_tag, q.qtype;

CREATE OR REPLACE VIEW v_part_popularity AS
SELECT e.model_key, e.part_key, COUNT(*) AS selections
FROM interaction_event e
WHERE e.kind = 'parte_seleccionada'
GROUP BY e.model_key, e.part_key;

-- Ganancia normalizada de Hake: (post - pre) / (100 - pre), con el primer pre-test y el mejor post
CREATE OR REPLACE VIEW v_learning_gain AS
WITH pre AS (
    SELECT DISTINCT ON (a.user_id, z.module_id) a.user_id, z.module_id, a.score
    FROM quiz_attempt a JOIN quiz z ON z.quiz_id = a.quiz_id
    WHERE z.kind = 'pre' ORDER BY a.user_id, z.module_id, a.finished_at
), post AS (
    SELECT a.user_id, z.module_id, MAX(a.score) AS score
    FROM quiz_attempt a JOIN quiz z ON z.quiz_id = a.quiz_id
    WHERE z.kind = 'post' GROUP BY a.user_id, z.module_id
)
SELECT u.full_name, m.key AS module_key, pre.score AS pre_score, post.score AS post_score,
       ROUND(((post.score - pre.score) / NULLIF(100 - pre.score, 0))::numeric, 2) AS normalized_gain
FROM pre JOIN post USING (user_id, module_id)
JOIN app_user u ON u.user_id = pre.user_id
JOIN module m   ON m.module_id = pre.module_id;
"""

HEADER = """-- =====================================================================
--  HoloClass — Esquema de base de datos (PostgreSQL 16+)
--  GENERADO desde backend/app/models.py con backend/scripts/export_schema.py
--  El backend crea estas tablas automáticamente al iniciar y siembra el contenido
--  desde app/data/content.json. Este archivo sirve como documentación y para crear
--  la base manualmente:
--     psql -U postgres -c "CREATE DATABASE holoclass;"
--     psql -U postgres -d holoclass -f schema.sql
-- =====================================================================
"""


def main():
    dialect = postgresql.dialect()
    parts = [HEADER, "BEGIN;\n"]
    for table in Base.metadata.sorted_tables:
        parts.append(str(CreateTable(table).compile(dialect=dialect)).strip() + ";\n")
        for idx in table.indexes:
            parts.append(str(CreateIndex(idx).compile(dialect=dialect)).strip() + ";\n")
    parts.append(VIEWS)
    parts.append("\nCOMMIT;\n")
    out = Path(__file__).resolve().parents[2] / "database" / "schema.sql"
    out.write_text("\n".join(parts), encoding="utf-8")
    print(f"Esquema escrito en {out}")


if __name__ == "__main__":
    main()
