"""Endpoints REST de HoloClass (documentación interactiva en /docs)."""
import json
import random
from collections import Counter
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from . import content as C
from .config import MAX_UPLOAD_MB, UPLOAD_DIR
from .db import get_db
from .models import (AttemptAnswer, ClassGroup, GroupStudent, InteractionEvent, LearningSession, Marker, Model3D, ModelPart, Module,
                     Question, Quiz, QuizAttempt, Student, Subject, Teacher, User)
from .security import create_token, current_user, hash_password, optional_user, teacher_user, verify_password
from .stats import compute_stats, progress

router = APIRouter(prefix="/api")
EVENT_KINDS = {"marcador_detectado", "parte_seleccionada", "animacion", "narracion", "recorrido_paso", "anclado", "seguimiento_perdido", "reaccion", "gesto"}


def user_out(db: Session, u: User) -> dict:
    groups = db.scalars(select(GroupStudent.group_id).where(GroupStudent.student_id == u.id)).all()
    return {"id": u.id, "name": u.full_name, "email": u.email, "role": u.role, "groups": list(groups)}


def get_module(db: Session, key: str) -> Module:
    m = db.scalar(select(Module).where(Module.key == key).options(selectinload(Module.models).selectinload(Model3D.parts)))
    if not m:
        raise HTTPException(404, "Módulo no encontrado.")
    return m


def get_quiz(db: Session, module_key: str, kind: str) -> Quiz:
    if kind not in ("pre", "post"):
        raise HTTPException(404, "Cuestionario no encontrado.")
    m = get_module(db, module_key)
    q = db.scalar(select(Quiz).where(Quiz.module_id == m.id, Quiz.kind == kind).options(
        selectinload(Quiz.questions).selectinload(Question.options), selectinload(Quiz.questions).selectinload(Question.correct_part)))
    if not q:
        raise HTTPException(404, "Cuestionario no encontrado.")
    return q


# ================================================================== Salud
@router.get("/health")
def health():
    return {"app": "holoclass", "status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ================================================================== Autenticación
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: str = "estudiante"
    group_code: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/auth/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Ya existe una cuenta con ese correo.")
    role = "docente" if data.role == "docente" else "estudiante"
    u = User(full_name=data.name.strip(), email=email, password_hash=hash_password(data.password), role=role)
    db.add(u); db.flush()
    db.add(Teacher(id=u.id) if role == "docente" else Student(id=u.id))
    if data.group_code and role == "estudiante":
        g = db.scalar(select(ClassGroup).where(ClassGroup.join_code == data.group_code.strip().upper()))
        if not g:
            db.rollback(); raise HTTPException(404, "No existe un grupo con ese código.")
        db.flush(); db.add(GroupStudent(group_id=g.id, student_id=u.id))
    db.commit()
    return {"token": create_token(u), "user": user_out(db, u)}


@router.post("/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == data.email.lower()))
    if not u or not u.is_active or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    return {"token": create_token(u), "user": user_out(db, u)}


@router.get("/auth/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(db, user)


# ================================================================== Catálogo
@router.get("/catalog")
def catalog(user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    return C.build_catalog(db, with_answers=bool(user and user.role in ("docente", "admin")))


# ================================================================== Sesiones de exploración
class SessionIn(BaseModel):
    module: str


class EventIn(BaseModel):
    kind: str
    model: str | None = None
    part: str | None = None
    marker: int | None = None
    payload: dict | None = None
    t: datetime | None = None


class EventsIn(BaseModel):
    events: list[EventIn] = Field(max_length=500)


class EndIn(BaseModel):
    explored: int = Field(0, ge=0, le=100)
    avg_fps: float | None = None


def own_session(db: Session, sid: int, user: User) -> LearningSession:
    s = db.get(LearningSession, sid)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Sesión no encontrada.")
    return s


@router.post("/sessions")
def start_session(data: SessionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = get_module(db, data.module)
    s = LearningSession(user_id=user.id, module_id=m.id); db.add(s); db.commit()
    return {"id": s.id}


@router.post("/sessions/{sid}/events", status_code=204)
def log_events(sid: int, data: EventsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    own_session(db, sid, user)
    for e in data.events:
        if e.kind not in EVENT_KINDS:
            continue
        db.add(InteractionEvent(session_id=sid, kind=e.kind, model_key=e.model, part_key=e.part, marker_code=e.marker, payload=e.payload,
                                created_at=e.t or datetime.now(timezone.utc)))
    db.commit()


@router.post("/sessions/{sid}/end")
def end_session(sid: int, data: EndIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = own_session(db, sid, user)
    s.ended_at = datetime.now(timezone.utc); s.explored_pct = max(s.explored_pct or 0, data.explored); s.avg_fps = data.avg_fps
    db.commit()
    return {"ok": True}


# ================================================================== Cuestionarios
class CheckIn(BaseModel):
    qid: str
    answer: int | bool | str | list[str] | None = None


class AnswerIn(BaseModel):
    qid: str
    answer: int | bool | str | list[str] | None = None
    ms: int | None = None


class AttemptIn(BaseModel):
    answers: list[AnswerIn]
    started_at: datetime | None = None


def _norm(q: Question, a):
    # JSON no distingue bool de int en algunos clientes: normalizamos según el tipo de pregunta
    if q.qtype == "tf" and isinstance(a, str):
        return a == "true"
    if q.qtype == "mc" and isinstance(a, str) and a.isdigit():
        return int(a)
    return a


@router.get("/quizzes/{module_key}/{kind}")
def get_questions(module_key: str, kind: str, db: Session = Depends(get_db)):
    quiz = get_quiz(db, module_key, kind)
    return [C.question_dict(q, with_answers=False) for q in quiz.questions if q.active]


@router.post("/quizzes/{module_key}/{kind}/check")
def check(module_key: str, kind: str, data: CheckIn, db: Session = Depends(get_db)):
    quiz = get_quiz(db, module_key, kind)
    q = next((x for x in quiz.questions if x.qkey == data.qid and x.active), None)
    if not q:
        raise HTTPException(404, "Pregunta no encontrada.")
    ok, correct = C.grade(q, _norm(q, data.answer))
    return {"ok": ok, "correct": correct, "explain": q.explanation or ""}


@router.post("/quizzes/{module_key}/{kind}/attempts")
def submit_attempt(module_key: str, kind: str, data: AttemptIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    quiz = get_quiz(db, module_key, kind)
    active = [q for q in quiz.questions if q.active]
    by_key = {q.qkey: q for q in active}
    graded, seen = [], set()
    for a in data.answers:
        q = by_key.get(a.qid)
        if not q or a.qid in seen:
            continue
        seen.add(a.qid)
        ok, _ = C.grade(q, _norm(q, a.answer))
        graded.append((q, a, ok))
    score = round(100 * sum(ok for _, _, ok in graded) / (len(active) or 1), 2)
    att = QuizAttempt(quiz_id=quiz.id, user_id=user.id, started_at=data.started_at or datetime.now(timezone.utc), finished_at=datetime.now(timezone.utc), score=score)
    for q, a, ok in graded:
        att.answers.append(AttemptAnswer(question_id=q.id, answer={"v": a.answer}, is_correct=ok, response_ms=a.ms))
    db.add(att); db.commit()
    return {"score": round(score), "attemptId": att.id, "answers": [{"qid": q.qkey, "ok": ok, "ms": a.ms} for q, a, ok in graded]}


@router.get("/me/progress")
def my_progress(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return progress(db, user)


# ================================================================== Grupos (estudiante)
class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=10)


@router.post("/groups/join")
def join_group(data: CodeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "estudiante":
        raise HTTPException(400, "Solo los estudiantes se unen a grupos.")
    g = db.scalar(select(ClassGroup).where(ClassGroup.join_code == data.code.strip().upper()))
    if not g:
        raise HTTPException(404, "No existe un grupo con ese código.")
    if not db.get(GroupStudent, (g.id, user.id)):
        db.add(GroupStudent(group_id=g.id, student_id=user.id)); db.commit()
    return {"id": g.id, "name": g.name, "code": g.join_code}


@router.get("/me/groups")
def my_groups(user: User = Depends(current_user), db: Session = Depends(get_db)):
    gs = db.scalars(select(ClassGroup).join(GroupStudent, GroupStudent.group_id == ClassGroup.id).where(GroupStudent.student_id == user.id)).all()
    return [{"id": g.id, "name": g.name, "code": g.join_code} for g in gs]


# ================================================================== Docente: grupos y estadísticas
class GroupIn(BaseModel):
    name: str = Field("", max_length=80)


def new_code(db: Session) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if not db.scalar(select(ClassGroup).where(ClassGroup.join_code == code)):
            return code


def own_group(db: Session, gid: int, user: User) -> ClassGroup:
    g = db.get(ClassGroup, gid)
    if not g or (g.teacher_id != user.id and user.role != "admin"):
        raise HTTPException(404, "Grupo no encontrado.")
    return g


@router.get("/teacher/groups")
def list_groups(user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    gs = db.scalars(select(ClassGroup).where(ClassGroup.teacher_id == user.id).order_by(ClassGroup.id)).all()
    counts = Counter(db.scalars(select(GroupStudent.group_id)).all())
    return [{"id": g.id, "name": g.name, "code": g.join_code, "students": counts.get(g.id, 0), "created": g.created_at.isoformat()} for g in gs]


@router.post("/teacher/groups")
def create_group(data: GroupIn, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    if not db.get(Teacher, user.id):
        db.add(Teacher(id=user.id)); db.flush()
    g = ClassGroup(teacher_id=user.id, name=data.name.strip() or "Grupo nuevo", join_code=new_code(db)); db.add(g); db.commit()
    return {"id": g.id, "name": g.name, "code": g.join_code, "students": 0}


@router.delete("/teacher/groups/{gid}", status_code=204)
def delete_group(gid: int, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    db.delete(own_group(db, gid, user)); db.commit()


@router.delete("/teacher/groups/{gid}/students/{sid}", status_code=204)
def remove_student(gid: int, sid: int, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    own_group(db, gid, user)
    db.execute(delete(GroupStudent).where(GroupStudent.group_id == gid, GroupStudent.student_id == sid)); db.commit()


def students_of(db: Session, user: User, group_id: int | None) -> list[User]:
    gids = [own_group(db, group_id, user).id] if group_id else db.scalars(select(ClassGroup.id).where(ClassGroup.teacher_id == user.id)).all()
    if not gids:
        return []
    return db.scalars(select(User).join(GroupStudent, GroupStudent.student_id == User.id).where(GroupStudent.group_id.in_(gids)).distinct().order_by(User.full_name)).all()


@router.get("/teacher/stats")
def stats(group_id: int | None = None, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    return compute_stats(db, students_of(db, user, group_id))


# ================================================================== Docente: contenidos
class TextsIn(BaseModel):
    intro: str | None = None
    parts: dict[str, dict[str, str]] = {}


class QuizIn(BaseModel):
    questions: list[dict]


@router.put("/teacher/models/{model_key}/texts")
def save_texts(model_key: str, data: TextsIn, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    m = db.scalar(select(Model3D).where(Model3D.key == model_key).options(selectinload(Model3D.parts).selectinload(ModelPart.contents)))
    if not m:
        raise HTTPException(404, "Modelo no encontrado.")
    C.save_model_texts(db, m, data.intro, data.parts); db.commit()
    return {"ok": True}


@router.put("/teacher/quizzes/{module_key}/{kind}")
def save_quiz(module_key: str, kind: str, data: QuizIn, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    if kind not in ("pre", "post"):
        raise HTTPException(404, "Cuestionario no encontrado.")
    m = get_module(db, module_key)
    try:
        C.save_quiz(db, m, kind, data.questions)
    except ValueError as e:
        db.rollback(); raise HTTPException(422, str(e))
    db.commit()
    return {"ok": True}


@router.post("/teacher/content/reset")
def reset_content(user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    C.reset_base_content(db)
    return {"ok": True}


@router.post("/teacher/modules")
async def create_module(payload: str = Form(...), file: UploadFile = File(...), user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    try:
        data = json.loads(payload)
        mod, model = data["module"], data["model"]
    except (ValueError, KeyError):
        raise HTTPException(422, "Datos del módulo inválidos.")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_MB * 1048576:
        raise HTTPException(413, f"El archivo supera {MAX_UPLOAD_MB} MB.")
    if raw[:4] != b"glTF":
        raise HTTPException(422, "El archivo no es un GLB válido.")
    if not (model.get("license") or "").strip():
        raise HTTPException(422, "Indica la licencia del modelo.")
    subject = db.scalar(select(Subject).where(Subject.key == mod.get("subject")))
    if not subject:
        raise HTTPException(422, "Materia inválida.")
    free = set(C.load_content().get("free_markers", []))
    code = int((mod.get("markers") or [0])[0])
    if code not in free or db.scalar(select(Marker).where(Marker.aruco_code == code, Marker.model_id.is_not(None))):
        raise HTTPException(409, "Ese marcador no está libre.")
    if not db.get(Teacher, user.id):
        db.add(Teacher(id=user.id)); db.flush()
    key = "custom_" + uuid.uuid4().hex[:10]
    fname = f"{uuid.uuid4().hex}.glb"
    (UPLOAD_DIR / fname).write_bytes(raw)
    module = Module(key=key, subject=subject, created_by=user.id, title=mod.get("title", "Módulo")[:100], description=mod.get("desc"), level=mod.get("level"),
                    min_explored_pct=int(mod.get("min_explored_pct", 50)), is_custom=True, sort_order=1000)
    db.add(module); db.flush()
    m3d = C.create_model(db, module, "glb_" + key, {**model, "source": "glb"}, is_main=True, file_url=f"/uploads/{fname}")
    m3d.size_kb = len(raw) // 1024
    db.flush()
    marker = db.scalar(select(Marker).where(Marker.aruco_code == code))
    if marker:
        marker.model_id, marker.card_title = m3d.id, module.title
    else:
        db.add(Marker(aruco_code=code, model_id=m3d.id, card_title=module.title))
    db.flush()
    quizzes = data.get("quizzes") or {}
    for kind in ("pre", "post"):
        try:
            C.save_quiz(db, module, kind, quizzes.get(kind, []))
        except ValueError as e:
            db.rollback(); raise HTTPException(422, str(e))
    db.commit()
    return {"key": key, "title": module.title, "markers": [code], "main": m3d.key, "custom": True, "subject": subject.key}


@router.delete("/teacher/modules/{key}", status_code=204)
def delete_module(key: str, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    m = get_module(db, key)
    if not m.is_custom or (m.created_by != user.id and user.role != "admin"):
        raise HTTPException(403, "Solo puedes eliminar módulos propios.")
    for model in m.models:
        if model.file_url and model.file_url.startswith("/uploads/"):
            (UPLOAD_DIR / model.file_url.split("/")[-1]).unlink(missing_ok=True)
        db.execute(Marker.__table__.update().where(Marker.model_id == model.id).values(model_id=None))
    db.delete(m); db.commit()


# ================================================================== Docente: datos simulados (para demostrar el panel)
@router.post("/teacher/groups/{gid}/simulate")
def simulate(gid: int, user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    g = own_group(db, gid, user)
    names = ["Ana", "Luis", "Sofía", "Mateo", "Valeria", "Emiliano", "Regina", "Santiago", "Camila", "Leonardo", "Ximena", "Iker"]
    modules = db.scalars(select(Module).where(Module.is_custom.is_(False)).options(selectinload(Module.models).selectinload(Model3D.parts))).all()
    quizzes = {(q.module_id, q.kind): q for q in db.scalars(select(Quiz).options(selectinload(Quiz.questions))).all()}
    now = datetime.now(timezone.utc)
    for n in names:
        u = User(full_name=f"{n} (simulado)", email=f"{n.lower()}.{uuid.uuid4().hex[:6]}@sim.local", password_hash="!", role="estudiante", simulated=True)
        db.add(u); db.flush(); db.add(Student(id=u.id)); db.flush(); db.add(GroupStudent(group_id=g.id, student_id=u.id))
        for m in modules:
            if random.random() < 0.2:
                continue
            start = now - timedelta(days=random.uniform(1, 9)); end = start + timedelta(minutes=random.uniform(4, 18))
            main = C.main_model(m)
            chosen = [p for p in main.parts if random.random() < 0.8]
            s = LearningSession(user_id=u.id, module_id=m.id, started_at=start, ended_at=end, avg_fps=random.randint(35, 60),
                                explored_pct=round(100 * len(chosen) / max(1, len(main.parts))))
            db.add(s); db.flush()
            for p in chosen:
                for _ in range(random.randint(1, 3)):
                    db.add(InteractionEvent(session_id=s.id, kind="parte_seleccionada", model_key=main.key, part_key=p.part_key, created_at=start))
            skill = random.uniform(0.3, 0.95)
            for kind in ("pre", "post"):
                qz = quizzes.get((m.id, kind))
                qs = [q for q in (qz.questions if qz else []) if q.active]
                if not qs:
                    continue
                prob = skill * 0.6 if kind == "pre" else min(0.98, skill + 0.15)
                oks = [random.random() < (prob * 0.9 if q.qtype == "pick" else prob) for q in qs]
                t = start - timedelta(minutes=1) if kind == "pre" else end
                att = QuizAttempt(quiz_id=qz.id, user_id=u.id, started_at=t, finished_at=t, score=round(100 * sum(oks) / len(qs), 2))
                for q, ok in zip(qs, oks):
                    att.answers.append(AttemptAnswer(question_id=q.id, answer=None, is_correct=ok, response_ms=random.randint(3000, 15000)))
                db.add(att)
    db.commit()
    return {"ok": True}


@router.delete("/teacher/simulated", status_code=204)
def clear_simulated(user: User = Depends(teacher_user), db: Session = Depends(get_db)):
    for u in db.scalars(select(User).where(User.simulated.is_(True))).all():
        db.delete(u)
    db.commit()
