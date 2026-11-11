-- =====================================================================
--  HoloClass — Esquema de base de datos (PostgreSQL 16+)
--  GENERADO desde backend/app/models.py con backend/scripts/export_schema.py
--  El backend crea estas tablas automáticamente al iniciar y siembra el contenido
--  desde app/data/content.json. Este archivo sirve como documentación y para crear
--  la base manualmente:
--     psql -U postgres -c "CREATE DATABASE holoclass;"
--     psql -U postgres -d holoclass -f schema.sql
-- =====================================================================

BEGIN;

CREATE TABLE app_user (
	user_id SERIAL NOT NULL, 
	full_name VARCHAR(100) NOT NULL, 
	email VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role VARCHAR(12) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	simulated BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (user_id), 
	CONSTRAINT ck_user_role CHECK (role IN ('estudiante','docente','admin'))
);

CREATE UNIQUE INDEX ix_app_user_email ON app_user (email);

CREATE TABLE subject (
	subject_id SERIAL NOT NULL, 
	key VARCHAR(40) NOT NULL, 
	name VARCHAR(60) NOT NULL, 
	color_hex VARCHAR(7) NOT NULL, 
	icon VARCHAR(16), 
	PRIMARY KEY (subject_id), 
	UNIQUE (key)
);

CREATE TABLE student (
	student_id INTEGER NOT NULL, 
	enrollment_no VARCHAR(20), 
	grade_level VARCHAR(30), 
	PRIMARY KEY (student_id), 
	FOREIGN KEY(student_id) REFERENCES app_user (user_id) ON DELETE CASCADE
);

CREATE TABLE teacher (
	teacher_id INTEGER NOT NULL, 
	institution VARCHAR(120), 
	department VARCHAR(80), 
	PRIMARY KEY (teacher_id), 
	FOREIGN KEY(teacher_id) REFERENCES app_user (user_id) ON DELETE CASCADE
);

CREATE TABLE class_group (
	group_id SERIAL NOT NULL, 
	teacher_id INTEGER NOT NULL, 
	name VARCHAR(80) NOT NULL, 
	join_code VARCHAR(6) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (group_id), 
	FOREIGN KEY(teacher_id) REFERENCES teacher (teacher_id) ON DELETE CASCADE, 
	UNIQUE (join_code)
);

CREATE TABLE module (
	module_id SERIAL NOT NULL, 
	key VARCHAR(60) NOT NULL, 
	subject_id INTEGER NOT NULL, 
	created_by INTEGER, 
	title VARCHAR(100) NOT NULL, 
	description TEXT, 
	level VARCHAR(30), 
	min_explored_pct SMALLINT NOT NULL, 
	is_published BOOLEAN NOT NULL, 
	is_custom BOOLEAN NOT NULL, 
	sort_order INTEGER NOT NULL, 
	PRIMARY KEY (module_id), 
	CONSTRAINT ck_module_pct CHECK (min_explored_pct BETWEEN 0 AND 100), 
	UNIQUE (key), 
	FOREIGN KEY(subject_id) REFERENCES subject (subject_id), 
	FOREIGN KEY(created_by) REFERENCES teacher (teacher_id) ON DELETE SET NULL
);

CREATE TABLE group_student (
	group_id INTEGER NOT NULL, 
	student_id INTEGER NOT NULL, 
	joined_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (group_id, student_id), 
	FOREIGN KEY(group_id) REFERENCES class_group (group_id) ON DELETE CASCADE, 
	FOREIGN KEY(student_id) REFERENCES student (student_id) ON DELETE CASCADE
);

CREATE TABLE learning_session (
	session_id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	module_id INTEGER NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	ended_at TIMESTAMP WITH TIME ZONE, 
	avg_fps FLOAT, 
	explored_pct SMALLINT NOT NULL, 
	PRIMARY KEY (session_id), 
	FOREIGN KEY(user_id) REFERENCES app_user (user_id) ON DELETE CASCADE, 
	FOREIGN KEY(module_id) REFERENCES module (module_id) ON DELETE CASCADE
);

CREATE INDEX ix_learning_session_user_id ON learning_session (user_id);

CREATE TABLE model_3d (
	model_id SERIAL NOT NULL, 
	key VARCHAR(80) NOT NULL, 
	module_id INTEGER NOT NULL, 
	is_main BOOLEAN NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	source_type VARCHAR(12) NOT NULL, 
	file_url VARCHAR(255), 
	intro TEXT, 
	scale FLOAT NOT NULL, 
	license VARCHAR(120) NOT NULL, 
	attribution VARCHAR(255), 
	source_url VARCHAR(255), 
	tour JSON, 
	animations JSON, 
	size_kb INTEGER, 
	PRIMARY KEY (model_id), 
	CONSTRAINT ck_model_source CHECK ((source_type = 'glb' AND file_url IS NOT NULL) OR source_type = 'procedural'), 
	UNIQUE (key), 
	FOREIGN KEY(module_id) REFERENCES module (module_id) ON DELETE CASCADE
);

CREATE TABLE quiz (
	quiz_id SERIAL NOT NULL, 
	module_id INTEGER NOT NULL, 
	kind VARCHAR(4) NOT NULL, 
	title VARCHAR(100) NOT NULL, 
	PRIMARY KEY (quiz_id), 
	UNIQUE (module_id, kind), 
	CONSTRAINT ck_quiz_kind CHECK (kind IN ('pre','post')), 
	FOREIGN KEY(module_id) REFERENCES module (module_id) ON DELETE CASCADE
);

CREATE TABLE interaction_event (
	event_id SERIAL NOT NULL, 
	session_id INTEGER NOT NULL, 
	kind VARCHAR(24) NOT NULL, 
	model_key VARCHAR(80), 
	part_key VARCHAR(80), 
	marker_code INTEGER, 
	payload JSON, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (event_id), 
	FOREIGN KEY(session_id) REFERENCES learning_session (session_id) ON DELETE CASCADE
);

CREATE INDEX ix_interaction_event_session_id ON interaction_event (session_id);

CREATE TABLE marker (
	marker_id SERIAL NOT NULL, 
	dictionary VARCHAR(20) NOT NULL, 
	aruco_code SMALLINT NOT NULL, 
	model_id INTEGER, 
	card_title VARCHAR(100), 
	size_mm SMALLINT NOT NULL, 
	PRIMARY KEY (marker_id), 
	UNIQUE (aruco_code), 
	FOREIGN KEY(model_id) REFERENCES model_3d (model_id) ON DELETE SET NULL
);

CREATE TABLE model_part (
	part_id SERIAL NOT NULL, 
	model_id INTEGER NOT NULL, 
	part_key VARCHAR(80) NOT NULL, 
	display_name VARCHAR(100) NOT NULL, 
	sort_order SMALLINT NOT NULL, 
	PRIMARY KEY (part_id), 
	UNIQUE (model_id, part_key), 
	FOREIGN KEY(model_id) REFERENCES model_3d (model_id) ON DELETE CASCADE
);

CREATE TABLE quiz_attempt (
	attempt_id SERIAL NOT NULL, 
	quiz_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	finished_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	score FLOAT NOT NULL, 
	PRIMARY KEY (attempt_id), 
	FOREIGN KEY(quiz_id) REFERENCES quiz (quiz_id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES app_user (user_id) ON DELETE CASCADE
);

CREATE INDEX ix_quiz_attempt_user_id ON quiz_attempt (user_id);

CREATE TABLE educational_content (
	content_id SERIAL NOT NULL, 
	part_id INTEGER NOT NULL, 
	kind VARCHAR(16) NOT NULL, 
	body TEXT NOT NULL, 
	language VARCHAR(5) NOT NULL, 
	PRIMARY KEY (content_id), 
	UNIQUE (part_id, kind), 
	FOREIGN KEY(part_id) REFERENCES model_part (part_id) ON DELETE CASCADE
);

CREATE TABLE question (
	question_id SERIAL NOT NULL, 
	quiz_id INTEGER NOT NULL, 
	qkey VARCHAR(40) NOT NULL, 
	qtype VARCHAR(6) NOT NULL, 
	prompt TEXT NOT NULL, 
	concept_tag VARCHAR(60), 
	correct_part_id INTEGER, 
	explanation TEXT, 
	sort_order SMALLINT NOT NULL, 
	points SMALLINT NOT NULL, 
	active BOOLEAN NOT NULL, 
	PRIMARY KEY (question_id), 
	UNIQUE (quiz_id, qkey), 
	CONSTRAINT ck_question_type CHECK (qtype IN ('mc','tf','pick','order')), 
	FOREIGN KEY(quiz_id) REFERENCES quiz (quiz_id) ON DELETE CASCADE, 
	FOREIGN KEY(correct_part_id) REFERENCES model_part (part_id) ON DELETE SET NULL
);

CREATE TABLE answer_option (
	option_id SERIAL NOT NULL, 
	question_id INTEGER NOT NULL, 
	text VARCHAR(255) NOT NULL, 
	is_correct BOOLEAN NOT NULL, 
	position SMALLINT NOT NULL, 
	PRIMARY KEY (option_id), 
	FOREIGN KEY(question_id) REFERENCES question (question_id) ON DELETE CASCADE
);

CREATE TABLE attempt_answer (
	attempt_id INTEGER NOT NULL, 
	question_id INTEGER NOT NULL, 
	answer JSON, 
	is_correct BOOLEAN NOT NULL, 
	response_ms INTEGER, 
	PRIMARY KEY (attempt_id, question_id), 
	FOREIGN KEY(attempt_id) REFERENCES quiz_attempt (attempt_id) ON DELETE CASCADE, 
	FOREIGN KEY(question_id) REFERENCES question (question_id) ON DELETE CASCADE
);


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


COMMIT;
