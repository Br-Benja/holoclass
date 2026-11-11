"""Carga del contenido educativo (content.json) en la base de datos y serialización del catálogo.

El mismo archivo app/data/content.json alimenta al modo local del navegador y a la base de datos,
así el contenido nunca queda desincronizado.
"""
import json
import random
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .config import CONTENT_PATH
from .models import (AnswerOption, ClassGroup, EducationalContent, GroupStudent, Marker, Model3D, ModelPart, Module, Question,
                     Quiz, Student, Subject, Teacher, User)

KIND_FIELDS = {"explicacion": "text", "dato_curioso": "fact", "saber_mas": "more"}


@lru_cache
def load_content() -> dict:
    return json.loads(CONTENT_PATH.read_text(encoding="utf-8"))


# ------------------------------------------------------------------ Escritura
def set_part_texts(db: Session, part: ModelPart, data: dict):
    if data.get("name"):
        part.display_name = data["name"][:100]
    existing = {c.kind: c for c in part.contents}
    for kind, field in KIND_FIELDS.items():
        if field not in data:
            continue
        body = (data.get(field) or "").strip()
        if body:
            if kind in existing:
                existing[kind].body = body
            else:
                part.contents.append(EducationalContent(kind=kind, body=body))
        elif kind in existing:
            db.delete(existing[kind])


def save_model_texts(db: Session, model: Model3D, intro: str | None, parts: dict):
    if intro is not None:
        model.intro = intro
    by_key = {p.part_key: p for p in model.parts}
    for key, data in parts.items():
        if key in by_key:
            set_part_texts(db, by_key[key], data)


def main_model(module: Module) -> Model3D | None:
    return next((m for m in module.models if m.is_main), module.models[0] if module.models else None)


def save_quiz(db: Session, module: Module, kind: str, questions: list[dict]):
    quiz = db.scalar(select(Quiz).where(Quiz.module_id == module.id, Quiz.kind == kind))
    if not quiz:
        quiz = Quiz(module_id=module.id, kind=kind, title=("Pre-test: " if kind == "pre" else "Evaluación: ") + module.title)
        db.add(quiz); db.flush()
    main = main_model(module)
    parts = {p.part_key: p for p in (main.parts if main else [])}
    existing = {q.qkey: q for q in quiz.questions}
    seen = set()
    for i, d in enumerate(questions):
        qtype = d.get("type")
        if qtype not in ("mc", "tf", "pick", "order"):
            raise ValueError(f"Tipo de pregunta inválido: {qtype}")
        key = str(d.get("id") or f"q{i + 1}")[:40]
        if key in seen:
            raise ValueError(f"Identificador de pregunta repetido: {key}")
        seen.add(key)
        q = existing.get(key) or Question(qkey=key)
        if q.id is None:
            quiz.questions.append(q)
        q.qtype, q.prompt, q.sort_order, q.active = qtype, d.get("q", ""), i, True
        q.concept_tag, q.explanation = d.get("concept") or None, d.get("explain") or None
        q.correct_part_id = None
        q.options.clear()
        if qtype == "mc":
            opts = d.get("options") or []
            ans = d.get("answer")
            if not isinstance(ans, int) or not 0 <= ans < len(opts):
                raise ValueError(f"Pregunta {key}: respuesta fuera de rango.")
            q.options.extend(AnswerOption(text=o, is_correct=(j == ans), position=j) for j, o in enumerate(opts))
        elif qtype == "tf":
            ans = bool(d.get("answer"))
            q.options.extend([AnswerOption(text="Verdadero", is_correct=ans, position=0), AnswerOption(text="Falso", is_correct=not ans, position=1)])
        elif qtype == "pick":
            part = parts.get(d.get("answer"))
            if not part:
                raise ValueError(f"Pregunta {key}: la parte '{d.get('answer')}' no existe en el modelo principal.")
            db.flush()
            q.correct_part_id = part.id
        elif qtype == "order":
            items = d.get("items") or []
            if len(items) < 2:
                raise ValueError(f"Pregunta {key}: se necesitan al menos 2 elementos.")
            q.options.extend(AnswerOption(text=t, is_correct=True, position=j) for j, t in enumerate(items))
    for key, q in existing.items():          # las que ya no están se desactivan (conservan el historial)
        if key not in seen:
            q.active = False


def create_model(db: Session, module: Module, key: str, data: dict, is_main: bool, file_url: str | None = None) -> Model3D:
    m = Model3D(key=key, module=module, is_main=is_main, name=data.get("name", key), source_type=data.get("source", "procedural"),
                file_url=file_url, intro=data.get("intro"), scale=float(data.get("scale", 1) or 1), license=data.get("license") or "Sin especificar",
                attribution=data.get("attribution"), source_url=data.get("source_url"), tour=data.get("tour"), animations=data.get("animations"))
    db.add(m)
    for i, (pk, p) in enumerate(data.get("parts", {}).items()):
        part = ModelPart(part_key=pk, display_name=p.get("name", pk), sort_order=i)
        m.parts.append(part)
        for kind, field in KIND_FIELDS.items():
            if p.get(field):
                part.contents.append(EducationalContent(kind=kind, body=p[field]))
    return m


# ------------------------------------------------------------------ Siembra inicial
def seed(db: Session, demo: bool = True):
    if db.scalar(select(Subject).limit(1)):
        return False
    c = load_content()
    subjects = {}
    for s in c["subjects"]:
        subjects[s["key"]] = Subject(key=s["key"], name=s["name"], color_hex=s["color"], icon=s.get("icon"))
        db.add(subjects[s["key"]])
    model_owner = {}
    for i, mod in enumerate(c["modules"]):
        module = Module(key=mod["key"], subject=subjects[mod["subject"]], title=mod["title"], description=mod.get("desc"), level=mod.get("level"),
                        min_explored_pct=mod.get("min_explored_pct", 50), sort_order=i)
        db.add(module)
        keys = [mod["main"]] + [c["markers"][str(mid)]["model"] for mid in mod["markers"]]
        for k in dict.fromkeys(keys):
            if k not in model_owner:
                model_owner[k] = create_model(db, module, k, c["models"][k], is_main=(k == mod["main"]))
    db.flush()
    for code, mk in c["markers"].items():
        db.add(Marker(aruco_code=int(code), model=model_owner.get(mk["model"]), card_title=mk["title"]))
    db.flush()
    for mod in c["modules"]:
        module = db.scalar(select(Module).where(Module.key == mod["key"]))
        for kind in ("pre", "post"):
            save_quiz(db, module, kind, c["quizzes"].get(mod["key"], {}).get(kind, []))
    if demo:
        seed_demo(db)
    db.commit()
    return True


def reset_base_content(db: Session):
    """Restaura textos y preguntas de los módulos base al contenido original de content.json."""
    c = load_content()
    for mk, data in c["models"].items():
        m = db.scalar(select(Model3D).where(Model3D.key == mk))
        if m:
            save_model_texts(db, m, data.get("intro"), data.get("parts", {}))
    for mod in c["modules"]:
        module = db.scalar(select(Module).where(Module.key == mod["key"]))
        if module:
            for kind in ("pre", "post"):
                save_quiz(db, module, kind, c["quizzes"].get(mod["key"], {}).get(kind, []))
    db.commit()


def seed_demo(db: Session):
    from .security import hash_password
    if db.scalar(select(User).where(User.email == "docente@demo.mx")):
        return
    t = User(full_name="Mtra. Laura Gómez", email="docente@demo.mx", password_hash=hash_password("demo1234"), role="docente")
    s = User(full_name="Diego Ramírez", email="estudiante@demo.mx", password_hash=hash_password("demo1234"), role="estudiante")
    db.add_all([t, s]); db.flush()
    db.add_all([Teacher(id=t.id, institution="Escuela demo"), Student(id=s.id, grade_level="Secundaria 2")]); db.flush()
    g = ClassGroup(teacher_id=t.id, name="2.º B Ciencias (demo)", join_code="DEMO01"); db.add(g); db.flush()
    db.add(GroupStudent(group_id=g.id, student_id=s.id))


# ------------------------------------------------------------------ Lectura (catálogo en el mismo formato que content.json)
def question_dict(q: Question, with_answers: bool) -> dict:
    d = {"id": q.qkey, "type": q.qtype, "q": q.prompt, "concept": q.concept_tag or "", "explain": q.explanation or ""}
    opts = sorted(q.options, key=lambda o: o.position)
    if q.qtype == "mc":
        d["options"] = [o.text for o in opts]
        if with_answers:
            d["answer"] = next((i for i, o in enumerate(opts) if o.is_correct), 0)
    elif q.qtype == "tf":
        if with_answers:
            d["answer"] = bool(opts and opts[0].is_correct)
    elif q.qtype == "pick":
        if with_answers:
            d["answer"] = q.correct_part.part_key if q.correct_part else None
    elif q.qtype == "order":
        items = [o.text for o in opts]
        d["items"] = items if with_answers else random.sample(items, len(items))
    if not with_answers:
        d.pop("explain")
    return d


def grade(q: Question, answer) -> tuple[bool, object]:
    opts = sorted(q.options, key=lambda o: o.position)
    if q.qtype == "mc":
        correct = next((i for i, o in enumerate(opts) if o.is_correct), 0)
        return (isinstance(answer, int) and not isinstance(answer, bool) and answer == correct), correct
    if q.qtype == "tf":
        correct = bool(opts and opts[0].is_correct)
        return (isinstance(answer, bool) and answer == correct), correct
    if q.qtype == "pick":
        correct = q.correct_part.part_key if q.correct_part else None
        return (answer is not None and answer == correct), correct
    if q.qtype == "order":
        correct = [o.text for o in opts]
        return (isinstance(answer, list) and answer == correct), correct
    return False, None


def model_dict(m: Model3D) -> dict:
    d = {"name": m.name, "source": m.source_type, "license": m.license, "attribution": m.attribution or "", "intro": m.intro or "",
         "scale": m.scale, "parts": {}}
    if m.tour:
        d["tour"] = m.tour
    if m.animations:
        d["animations"] = m.animations
    if m.file_url:
        d["file"] = m.file_url
    for p in sorted(m.parts, key=lambda p: p.sort_order):
        pd = {"name": p.display_name}
        for c in p.contents:
            pd[KIND_FIELDS.get(c.kind, c.kind)] = c.body
        d["parts"][p.part_key] = pd
    return d


def build_catalog(db: Session, with_answers: bool) -> dict:
    c = load_content()
    modules = db.scalars(select(Module).where(Module.is_published.is_(True)).order_by(Module.sort_order, Module.id)
                         .options(selectinload(Module.models).selectinload(Model3D.parts).selectinload(ModelPart.contents), selectinload(Module.subject))).all()
    markers = db.scalars(select(Marker).order_by(Marker.id).options(selectinload(Marker.model))).all()
    quizzes = db.scalars(select(Quiz).options(selectinload(Quiz.questions).selectinload(Question.options), selectinload(Quiz.questions).selectinload(Question.correct_part))).all()
    by_module_markers: dict[int, list[int]] = {}
    for mk in markers:
        if mk.model:
            by_module_markers.setdefault(mk.model.module_id, []).append(mk.aruco_code)
    out = {"version": c.get("version", 1), "subjects": [{"key": s.key, "name": s.name, "color": s.color_hex, "icon": s.icon} for s in db.scalars(select(Subject).order_by(Subject.id))],
           "modules": [], "models": {}, "markers": {}, "quizzes": {},
           "free_markers": c.get("free_markers", []), "reactions": c.get("reactions", []), "elements": c.get("elements", []), "credits": c.get("credits", [])}
    mid_to_key = {}
    for m in modules:
        main = main_model(m)
        mid_to_key[m.id] = m.key
        out["modules"].append({"key": m.key, "subject": m.subject.key, "title": m.title, "desc": m.description or "", "level": m.level or "",
                               "main": main.key if main else None, "markers": by_module_markers.get(m.id, []), "min_explored_pct": m.min_explored_pct,
                               **({"custom": True} if m.is_custom else {})})
        for model in m.models:
            out["models"][model.key] = model_dict(model)
    for mk in markers:
        if mk.model and mk.model.module_id in mid_to_key:
            out["markers"][str(mk.aruco_code)] = {"model": mk.model.key, "title": mk.card_title or mk.model.name}
    for q in quizzes:
        if q.module_id in mid_to_key:
            out["quizzes"].setdefault(mid_to_key[q.module_id], {"pre": [], "post": []})[q.kind] = [question_dict(x, with_answers) for x in q.questions if x.active]
    return out
