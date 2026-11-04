-- =====================================================================
--  HoloClass — Esquema de base de datos (PostgreSQL 16+)
--  Ejecutar:  psql -U postgres -c "CREATE DATABASE holoclass;"
--             psql -U postgres -d holoclass -f schema.sql
-- =====================================================================

BEGIN;

CREATE TYPE user_role      AS ENUM ('estudiante', 'docente', 'admin');
CREATE TYPE content_kind   AS ENUM ('explicacion', 'dato_curioso', 'saber_mas', 'narracion');
CREATE TYPE question_kind  AS ENUM ('opcion_multiple', 'verdadero_falso', 'seleccion_espacial');
CREATE TYPE model_source   AS ENUM ('glb', 'procedural');
CREATE TYPE event_kind     AS ENUM ('marcador_detectado', 'parte_seleccionada', 'animacion',
                                    'narracion', 'recorrido_paso', 'anclado', 'seguimiento_perdido');

-- ---------- Usuarios, estudiantes y docentes ----------
CREATE TABLE app_user (
    user_id        SERIAL PRIMARY KEY,
    full_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           user_role    NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE teacher (
    teacher_id   INT PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
    institution  VARCHAR(120),
    department   VARCHAR(80)
);

CREATE TABLE student (
    student_id     INT PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
    enrollment_no  VARCHAR(20) UNIQUE,
    grade_level    VARCHAR(30)                       -- 'Secundaria 2', 'Bachillerato 1'...
);

CREATE TABLE class_group (
    group_id     SERIAL PRIMARY KEY,
    teacher_id   INT NOT NULL REFERENCES teacher(teacher_id) ON DELETE CASCADE,
    name         VARCHAR(80) NOT NULL,
    join_code    CHAR(6) NOT NULL UNIQUE,            -- código para auto-registro
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_student (
    group_id    INT REFERENCES class_group(group_id) ON DELETE CASCADE,
    student_id  INT REFERENCES student(student_id)   ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, student_id)
);

-- ---------- Contenido educativo ----------
CREATE TABLE subject (
    subject_id   SERIAL PRIMARY KEY,
    name         VARCHAR(60) NOT NULL UNIQUE,        -- Anatomía, Astronomía, Química
    color_hex    CHAR(7) NOT NULL DEFAULT '#6366F1',
    icon         VARCHAR(40)
);

CREATE TABLE module (
    module_id          SERIAL PRIMARY KEY,
    subject_id         INT NOT NULL REFERENCES subject(subject_id),
    created_by         INT REFERENCES teacher(teacher_id) ON DELETE SET NULL,
    title              VARCHAR(100) NOT NULL,
    description        TEXT,
    level              VARCHAR(30),
    min_explored_pct   SMALLINT NOT NULL DEFAULT 60 CHECK (min_explored_pct BETWEEN 0 AND 100),
    is_published       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_3d (
    model_id        SERIAL PRIMARY KEY,
    module_id       INT NOT NULL REFERENCES module(module_id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    source_type     model_source NOT NULL,
    file_url        VARCHAR(255),                    -- /assets/models/heart.glb (si es glb)
    procedural_key  VARCHAR(60),                     -- 'molecule:h2o', 'solar:earth' (si es procedural)
    size_kb         INT,
    triangles       INT,
    scale           NUMERIC(6,3) NOT NULL DEFAULT 1.0,
    license         VARCHAR(60) NOT NULL,            -- 'CC BY 4.0', 'CC0', 'Propio'
    attribution     VARCHAR(255),
    source_url      VARCHAR(255),
    CHECK ((source_type = 'glb' AND file_url IS NOT NULL) OR
           (source_type = 'procedural' AND procedural_key IS NOT NULL))
);

CREATE TABLE model_part (
    part_id      SERIAL PRIMARY KEY,
    model_id     INT NOT NULL REFERENCES model_3d(model_id) ON DELETE CASCADE,
    part_key     VARCHAR(60) NOT NULL,               -- = nombre de la malla en el GLB
    display_name VARCHAR(80) NOT NULL,
    sort_order   SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (model_id, part_key)
);

CREATE TABLE model_animation (
    animation_id  SERIAL PRIMARY KEY,
    model_id      INT NOT NULL REFERENCES model_3d(model_id) ON DELETE CASCADE,
    clip_name     VARCHAR(60) NOT NULL,              -- nombre del clip glTF o animación por código
    display_name  VARCHAR(80) NOT NULL,
    description   TEXT
);

CREATE TABLE marker (
    marker_id    SERIAL PRIMARY KEY,
    dictionary   VARCHAR(20) NOT NULL DEFAULT 'DICT_4X4_50',
    aruco_code   SMALLINT NOT NULL,
    model_id     INT REFERENCES model_3d(model_id) ON DELETE SET NULL,  -- NULL = marcador libre
    card_title   VARCHAR(80),
    size_mm      SMALLINT NOT NULL DEFAULT 50,
    UNIQUE (dictionary, aruco_code)
);

CREATE TABLE educational_content (
    content_id   SERIAL PRIMARY KEY,
    part_id      INT REFERENCES model_part(part_id) ON DELETE CASCADE,
    model_id     INT REFERENCES model_3d(model_id)  ON DELETE CASCADE,  -- contenido general del modelo
    kind         content_kind NOT NULL,
    title        VARCHAR(120),
    body         TEXT NOT NULL,
    audio_url    VARCHAR(255),
    language     CHAR(5) NOT NULL DEFAULT 'es-MX',
    CHECK (part_id IS NOT NULL OR model_id IS NOT NULL)
);

-- ---------- Cuestionarios ----------
CREATE TABLE quiz (
    quiz_id       SERIAL PRIMARY KEY,
    module_id     INT NOT NULL REFERENCES module(module_id) ON DELETE CASCADE,
    model_id      INT REFERENCES model_3d(model_id),  -- modelo que se usa en preguntas espaciales
    title         VARCHAR(100) NOT NULL,
    is_pretest    BOOLEAN NOT NULL DEFAULT FALSE,
    time_limit_s  INT,
    shuffle       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE question (
    question_id      SERIAL PRIMARY KEY,
    quiz_id          INT NOT NULL REFERENCES quiz(quiz_id) ON DELETE CASCADE,
    kind             question_kind NOT NULL,
    prompt           TEXT NOT NULL,
    concept_tag      VARCHAR(60),                    -- para estadística por concepto
    correct_part_id  INT REFERENCES model_part(part_id),
    points           SMALLINT NOT NULL DEFAULT 1,
    explanation      TEXT,                           -- retroalimentación general
    CHECK (kind <> 'seleccion_espacial' OR correct_part_id IS NOT NULL)
);

CREATE TABLE answer_option (
    option_id    SERIAL PRIMARY KEY,
    question_id  INT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
    text         VARCHAR(255) NOT NULL,
    is_correct   BOOLEAN NOT NULL DEFAULT FALSE,
    feedback     VARCHAR(255)
);

-- ---------- Resultados ----------
CREATE TABLE learning_session (
    session_id     SERIAL PRIMARY KEY,
    student_id     INT NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
    module_id      INT NOT NULL REFERENCES module(module_id),
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at       TIMESTAMPTZ,
    avg_fps        NUMERIC(5,1),
    explored_pct   SMALLINT
);

CREATE TABLE interaction_event (
    event_id     BIGSERIAL PRIMARY KEY,
    session_id   INT NOT NULL REFERENCES learning_session(session_id) ON DELETE CASCADE,
    kind         event_kind NOT NULL,
    part_id      INT REFERENCES model_part(part_id),
    marker_id    INT REFERENCES marker(marker_id),
    payload      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_session ON interaction_event(session_id, kind);

CREATE TABLE quiz_attempt (
    attempt_id    SERIAL PRIMARY KEY,
    quiz_id       INT NOT NULL REFERENCES quiz(quiz_id),
    student_id    INT NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
    session_id    INT REFERENCES learning_session(session_id) ON DELETE SET NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    score         NUMERIC(5,2),                      -- 0–100
    max_points    SMALLINT
);

CREATE TABLE attempt_answer (
    attempt_id          INT REFERENCES quiz_attempt(attempt_id) ON DELETE CASCADE,
    question_id         INT REFERENCES question(question_id),
    selected_option_id  INT REFERENCES answer_option(option_id),
    selected_part_id    INT REFERENCES model_part(part_id),
    is_correct          BOOLEAN NOT NULL,
    response_ms         INT,
    PRIMARY KEY (attempt_id, question_id)
);

-- ---------- Vistas para HoloTeacher ----------
CREATE VIEW v_question_stats AS
SELECT q.quiz_id, q.question_id, q.prompt, q.concept_tag,
       COUNT(a.*)                                             AS answers,
       ROUND(100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 1) AS pct_correct,
       ROUND(AVG(a.response_ms) / 1000.0, 1)                  AS avg_seconds
FROM question q
LEFT JOIN attempt_answer a USING (question_id)
GROUP BY q.quiz_id, q.question_id, q.prompt, q.concept_tag;

CREATE VIEW v_part_popularity AS
SELECT p.model_id, p.part_key, p.display_name, COUNT(e.event_id) AS selections
FROM model_part p
LEFT JOIN interaction_event e ON e.part_id = p.part_id AND e.kind = 'parte_seleccionada'
GROUP BY p.model_id, p.part_key, p.display_name;

-- Ganancia normalizada de Hake: (post - pre) / (100 - pre)
CREATE VIEW v_learning_gain AS
WITH best AS (
    SELECT qa.student_id, z.module_id, z.is_pretest, MAX(qa.score) AS score
    FROM quiz_attempt qa JOIN quiz z USING (quiz_id)
    WHERE qa.score IS NOT NULL
    GROUP BY qa.student_id, z.module_id, z.is_pretest
)
SELECT pre.student_id, pre.module_id, pre.score AS pre_score, post.score AS post_score,
       ROUND((post.score - pre.score) / NULLIF(100 - pre.score, 0), 2) AS normalized_gain
FROM best pre
JOIN best post ON post.student_id = pre.student_id AND post.module_id = pre.module_id
WHERE pre.is_pretest AND NOT post.is_pretest;

-- =====================================================================
--  DATOS DE EJEMPLO
-- =====================================================================
INSERT INTO app_user (full_name, email, password_hash, role) VALUES
 ('Mtra. Laura Gómez', 'docente@holoclass.test', '$2b$12$hash_de_ejemplo', 'docente'),
 ('Diego Ramírez',     'diego@holoclass.test',   '$2b$12$hash_de_ejemplo', 'estudiante'),
 ('Sofía Torres',      'sofia@holoclass.test',   '$2b$12$hash_de_ejemplo', 'estudiante');

INSERT INTO teacher VALUES (1, 'Secundaria Técnica 12', 'Ciencias');
INSERT INTO student VALUES (2, 'A001', 'Secundaria 2'), (3, 'A002', 'Secundaria 2');
INSERT INTO class_group (teacher_id, name, join_code) VALUES (1, '2.º B Ciencias', 'HC2B01');
INSERT INTO group_student (group_id, student_id) VALUES (1, 2), (1, 3);

INSERT INTO subject (name, color_hex, icon) VALUES
 ('Anatomía', '#EF4444', 'heart'), ('Astronomía', '#6366F1', 'orbit'), ('Química', '#10B981', 'atom');

INSERT INTO module (subject_id, created_by, title, description, level, is_published) VALUES
 (1, 1, 'El corazón humano', 'Estructura y funcionamiento del corazón.', 'Secundaria', TRUE),
 (2, 1, 'El sistema solar', 'Planetas, tamaños y órbitas.', 'Secundaria', TRUE),
 (3, 1, 'Geometría molecular', 'Moléculas simples y modelo de Bohr.', 'Bachillerato', TRUE);

INSERT INTO model_3d (module_id, name, source_type, file_url, procedural_key, size_kb, triangles, license, attribution, source_url) VALUES
 (1, 'Corazón humano', 'glb', '/assets/models/heart.glb', NULL, 3200, 58000, 'CC BY 4.0', 'Autor del modelo (registrar)', 'https://ejemplo/fuente'),
 (2, 'Tierra', 'procedural', NULL, 'solar:earth', NULL, 4096, 'CC BY 4.0', 'Texturas: Solar System Scope', 'https://www.solarsystemscope.com/textures/'),
 (3, 'Agua (H2O)', 'procedural', NULL, 'molecule:h2o', NULL, NULL, 'Dominio público', 'Coordenadas: PubChem', 'https://pubchem.ncbi.nlm.nih.gov/');

INSERT INTO model_part (model_id, part_key, display_name, sort_order) VALUES
 (1, 'auricula_der',   'Aurícula derecha',    1),
 (1, 'ventriculo_der', 'Ventrículo derecho',  2),
 (1, 'auricula_izq',   'Aurícula izquierda',  3),
 (1, 'ventriculo_izq', 'Ventrículo izquierdo',4),
 (1, 'aorta',          'Arteria aorta',       5),
 (1, 'arteria_pulm',   'Arteria pulmonar',    6),
 (1, 'venas_cavas',    'Venas cavas',         7),
 (1, 'valvulas',       'Válvulas cardiacas',  8),
 (3, 'oxigeno',        'Átomo de oxígeno',    1),
 (3, 'hidrogeno',      'Átomos de hidrógeno', 2);

INSERT INTO model_animation (model_id, clip_name, display_name, description) VALUES
 (1, 'latido', 'Latido cardiaco', 'Ciclo de sístole y diástole (~75 lpm).'),
 (1, 'flujo',  'Flujo sanguíneo', 'Recorrido de sangre oxigenada y desoxigenada.');

INSERT INTO marker (aruco_code, model_id, card_title) VALUES
 (1, 1, 'Corazón (exterior)'), (5, 2, 'La Tierra'), (12, 3, 'Molécula de agua'), (40, NULL, 'Comodín docente');

INSERT INTO educational_content (part_id, kind, title, body) VALUES
 (4, 'explicacion', 'Ventrículo izquierdo',
  'Es la cavidad con la pared muscular más gruesa. Bombea sangre rica en oxígeno hacia la aorta para distribuirla a todo el cuerpo.'),
 (4, 'dato_curioso', NULL, 'Su pared puede ser hasta tres veces más gruesa que la del ventrículo derecho.'),
 (5, 'explicacion', 'Arteria aorta', 'Es la arteria más grande del cuerpo; recibe la sangre del ventrículo izquierdo.');

INSERT INTO quiz (module_id, model_id, title, is_pretest) VALUES
 (1, 1, 'Pre-test: el corazón', TRUE),
 (1, 1, 'Evaluación: el corazón', FALSE);

INSERT INTO question (quiz_id, kind, prompt, concept_tag, correct_part_id, explanation) VALUES
 (2, 'seleccion_espacial', 'Selecciona en el modelo la cavidad que bombea sangre oxigenada a todo el cuerpo.', 'circulacion_mayor', 4,
  'El ventrículo izquierdo impulsa la sangre hacia la aorta.'),
 (2, 'opcion_multiple', '¿Cuántas cavidades tiene el corazón humano?', 'estructura', NULL, 'Dos aurículas y dos ventrículos.'),
 (1, 'opcion_multiple', '¿Cuántas cavidades tiene el corazón humano?', 'estructura', NULL, NULL);

INSERT INTO answer_option (question_id, text, is_correct, feedback) VALUES
 (2, '2', FALSE, 'Son más: hay aurículas y ventrículos.'),
 (2, '3', FALSE, 'Revisa el lado izquierdo y el derecho.'),
 (2, '4', TRUE,  '¡Correcto! Dos aurículas y dos ventrículos.'),
 (2, '6', FALSE, 'Son menos.'),
 (3, '2', FALSE, NULL), (3, '4', TRUE, NULL);

-- Una sesión y dos intentos de ejemplo (pre y post)
INSERT INTO learning_session (student_id, module_id, ended_at, avg_fps, explored_pct)
VALUES (2, 1, now(), 48.5, 87);

INSERT INTO interaction_event (session_id, kind, part_id, marker_id, payload) VALUES
 (1, 'marcador_detectado', NULL, 1, '{"latency_ms": 120}'),
 (1, 'parte_seleccionada', 4, NULL, NULL),
 (1, 'parte_seleccionada', 5, NULL, NULL),
 (1, 'animacion', NULL, NULL, '{"clip": "latido"}');

INSERT INTO quiz_attempt (quiz_id, student_id, session_id, finished_at, score, max_points) VALUES
 (1, 2, NULL, now(), 40.00, 1),
 (2, 2, 1,    now(), 100.00, 2);

INSERT INTO attempt_answer (attempt_id, question_id, selected_option_id, selected_part_id, is_correct, response_ms) VALUES
 (1, 3, 5, NULL, FALSE, 9000),
 (2, 1, NULL, 4, TRUE, 6400),
 (2, 2, 3, NULL, TRUE, 3100);

COMMIT;
