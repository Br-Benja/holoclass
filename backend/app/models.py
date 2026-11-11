"""Modelo relacional de HoloClass (ver database/schema.sql y 05_Base_de_Datos.md)."""
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, SmallInteger,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ Usuarios
class User(Base):
    __tablename__ = "app_user"
    id: Mapped[int] = mapped_column("user_id", Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(12))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (CheckConstraint("role IN ('estudiante','docente','admin')", name="ck_user_role"),)


class Teacher(Base):
    __tablename__ = "teacher"
    id: Mapped[int] = mapped_column("teacher_id", ForeignKey("app_user.user_id", ondelete="CASCADE"), primary_key=True)
    institution: Mapped[str | None] = mapped_column(String(120))
    department: Mapped[str | None] = mapped_column(String(80))


class Student(Base):
    __tablename__ = "student"
    id: Mapped[int] = mapped_column("student_id", ForeignKey("app_user.user_id", ondelete="CASCADE"), primary_key=True)
    enrollment_no: Mapped[str | None] = mapped_column(String(20))
    grade_level: Mapped[str | None] = mapped_column(String(30))


class ClassGroup(Base):
    __tablename__ = "class_group"
    id: Mapped[int] = mapped_column("group_id", Integer, primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teacher.teacher_id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    join_code: Mapped[str] = mapped_column(String(6), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class GroupStudent(Base):
    __tablename__ = "group_student"
    group_id: Mapped[int] = mapped_column(ForeignKey("class_group.group_id", ondelete="CASCADE"), primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student.student_id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# ------------------------------------------------------------------ Contenido
class Subject(Base):
    __tablename__ = "subject"
    id: Mapped[int] = mapped_column("subject_id", Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    color_hex: Mapped[str] = mapped_column(String(7), default="#6366F1")
    icon: Mapped[str | None] = mapped_column(String(16))


class Module(Base):
    __tablename__ = "module"
    id: Mapped[int] = mapped_column("module_id", Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.subject_id"))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("teacher.teacher_id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    level: Mapped[str | None] = mapped_column(String(30))
    min_explored_pct: Mapped[int] = mapped_column(SmallInteger, default=50)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    subject: Mapped[Subject] = relationship()
    models: Mapped[list["Model3D"]] = relationship(back_populates="module", cascade="all, delete-orphan", order_by="Model3D.id")
    __table_args__ = (CheckConstraint("min_explored_pct BETWEEN 0 AND 100", name="ck_module_pct"),)


class Model3D(Base):
    __tablename__ = "model_3d"
    id: Mapped[int] = mapped_column("model_id", Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("module.module_id", ondelete="CASCADE"))
    is_main: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str] = mapped_column(String(100))
    source_type: Mapped[str] = mapped_column(String(12))
    file_url: Mapped[str | None] = mapped_column(String(255))
    intro: Mapped[str | None] = mapped_column(Text)
    scale: Mapped[float] = mapped_column(Float, default=1.0)
    license: Mapped[str] = mapped_column(String(120))
    attribution: Mapped[str | None] = mapped_column(String(255))
    source_url: Mapped[str | None] = mapped_column(String(255))
    tour: Mapped[list | None] = mapped_column(JSON)
    animations: Mapped[list | None] = mapped_column(JSON)
    size_kb: Mapped[int | None] = mapped_column(Integer)
    module: Mapped[Module] = relationship(back_populates="models")
    parts: Mapped[list["ModelPart"]] = relationship(back_populates="model", cascade="all, delete-orphan", order_by="ModelPart.sort_order")
    __table_args__ = (CheckConstraint("(source_type = 'glb' AND file_url IS NOT NULL) OR source_type = 'procedural'", name="ck_model_source"),)


class ModelPart(Base):
    __tablename__ = "model_part"
    id: Mapped[int] = mapped_column("part_id", Integer, primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("model_3d.model_id", ondelete="CASCADE"))
    part_key: Mapped[str] = mapped_column(String(80))
    display_name: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    model: Mapped[Model3D] = relationship(back_populates="parts")
    contents: Mapped[list["EducationalContent"]] = relationship(cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("model_id", "part_key"),)


class EducationalContent(Base):
    __tablename__ = "educational_content"
    id: Mapped[int] = mapped_column("content_id", Integer, primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("model_part.part_id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))    # explicacion | dato_curioso | saber_mas
    body: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(5), default="es-MX")
    __table_args__ = (UniqueConstraint("part_id", "kind"),)


class Marker(Base):
    __tablename__ = "marker"
    id: Mapped[int] = mapped_column("marker_id", Integer, primary_key=True)
    dictionary: Mapped[str] = mapped_column(String(20), default="ARUCO_MIP_36h12")
    aruco_code: Mapped[int] = mapped_column(SmallInteger, unique=True)
    model_id: Mapped[int | None] = mapped_column(ForeignKey("model_3d.model_id", ondelete="SET NULL"))
    card_title: Mapped[str | None] = mapped_column(String(100))
    size_mm: Mapped[int] = mapped_column(SmallInteger, default=50)
    model: Mapped[Model3D | None] = relationship()


# ------------------------------------------------------------------ Cuestionarios
class Quiz(Base):
    __tablename__ = "quiz"
    id: Mapped[int] = mapped_column("quiz_id", Integer, primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("module.module_id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(4))     # pre | post
    title: Mapped[str] = mapped_column(String(100))
    questions: Mapped[list["Question"]] = relationship(back_populates="quiz", cascade="all, delete-orphan", order_by="Question.sort_order")
    __table_args__ = (UniqueConstraint("module_id", "kind"), CheckConstraint("kind IN ('pre','post')", name="ck_quiz_kind"))


class Question(Base):
    __tablename__ = "question"
    id: Mapped[int] = mapped_column("question_id", Integer, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quiz.quiz_id", ondelete="CASCADE"))
    qkey: Mapped[str] = mapped_column(String(40))
    qtype: Mapped[str] = mapped_column(String(6))    # mc | tf | pick | order
    prompt: Mapped[str] = mapped_column(Text)
    concept_tag: Mapped[str | None] = mapped_column(String(60))
    correct_part_id: Mapped[int | None] = mapped_column(ForeignKey("model_part.part_id", ondelete="SET NULL"))
    explanation: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    points: Mapped[int] = mapped_column(SmallInteger, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    quiz: Mapped[Quiz] = relationship(back_populates="questions")
    options: Mapped[list["AnswerOption"]] = relationship(cascade="all, delete-orphan", order_by="AnswerOption.position")
    correct_part: Mapped[ModelPart | None] = relationship()
    __table_args__ = (UniqueConstraint("quiz_id", "qkey"), CheckConstraint("qtype IN ('mc','tf','pick','order')", name="ck_question_type"))


class AnswerOption(Base):
    __tablename__ = "answer_option"
    id: Mapped[int] = mapped_column("option_id", Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("question.question_id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(255))
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(SmallInteger, default=0)   # en 'order' = posición correcta


# ------------------------------------------------------------------ Resultados
class LearningSession(Base):
    __tablename__ = "learning_session"
    id: Mapped[int] = mapped_column("session_id", Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.user_id", ondelete="CASCADE"), index=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("module.module_id", ondelete="CASCADE"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    avg_fps: Mapped[float | None] = mapped_column(Float)
    explored_pct: Mapped[int] = mapped_column(SmallInteger, default=0)


class InteractionEvent(Base):
    __tablename__ = "interaction_event"
    id: Mapped[int] = mapped_column("event_id", Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("learning_session.session_id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    model_key: Mapped[str | None] = mapped_column(String(80))
    part_key: Mapped[str | None] = mapped_column(String(80))
    marker_code: Mapped[int | None] = mapped_column(Integer)
    payload: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempt"
    id: Mapped[int] = mapped_column("attempt_id", Integer, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quiz.quiz_id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.user_id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    score: Mapped[float] = mapped_column(Float)
    quiz: Mapped[Quiz] = relationship()
    answers: Mapped[list["AttemptAnswer"]] = relationship(cascade="all, delete-orphan")


class AttemptAnswer(Base):
    __tablename__ = "attempt_answer"
    attempt_id: Mapped[int] = mapped_column(ForeignKey("quiz_attempt.attempt_id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("question.question_id", ondelete="CASCADE"), primary_key=True)
    answer: Mapped[dict | None] = mapped_column(JSON)          # guarda {"v": respuesta}
    is_correct: Mapped[bool] = mapped_column(Boolean)
    response_ms: Mapped[int | None] = mapped_column(Integer)
    question: Mapped[Question] = relationship()
