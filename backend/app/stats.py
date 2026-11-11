"""Estadísticas de aprendizaje (mismo cálculo que computeStats() en app/js/store.js)."""
from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import InteractionEvent, LearningSession, Module, Question, Quiz, QuizAttempt, User


def _minutes(s: LearningSession) -> float:
    return max(0.0, (s.ended_at - s.started_at).total_seconds() / 60) if s.ended_at else 0.0


def _avg(xs):
    return round(sum(xs) / len(xs)) if xs else None


def _iso(dt):
    return dt.isoformat() if dt else None


def compute_stats(db: Session, students: list[User]) -> dict:
    ids = [u.id for u in students]
    modules = db.scalars(select(Module).order_by(Module.sort_order, Module.id)).all()
    sessions = db.scalars(select(LearningSession).where(LearningSession.user_id.in_(ids))).all() if ids else []
    attempts = db.scalars(select(QuizAttempt).where(QuizAttempt.user_id.in_(ids)).options(
        selectinload(QuizAttempt.answers), selectinload(QuizAttempt.quiz))).all() if ids else []
    sid = [s.id for s in sessions]
    part_events = db.execute(select(InteractionEvent.session_id, InteractionEvent.model_key, InteractionEvent.part_key)
                             .where(InteractionEvent.session_id.in_(sid), InteractionEvent.kind == "parte_seleccionada")).all() if sid else []
    session_module = {s.id: s.module_id for s in sessions}
    parts_by_module: dict[int, Counter] = defaultdict(Counter)
    for s_id, mk, pk in part_events:
        parts_by_module[session_module[s_id]][f"{mk}:{pk}"] += 1

    out_modules = {}
    for m in modules:
        quiz_post = db.scalar(select(Quiz).where(Quiz.module_id == m.id, Quiz.kind == "post").options(selectinload(Quiz.questions)))
        post = [a for a in attempts if a.quiz.module_id == m.id and a.quiz.kind == "post"]
        pre = [a for a in attempts if a.quiz.module_id == m.id and a.quiz.kind == "pre"]
        questions = []
        for q in (quiz_post.questions if quiz_post else []):
            if not q.active:
                continue
            ans = [x for a in post for x in a.answers if x.question_id == q.id]
            questions.append({"id": q.qkey, "q": q.prompt, "type": q.qtype, "concept": q.concept_tag or "", "answered": len(ans),
                              "pct": round(100 * sum(x.is_correct for x in ans) / len(ans)) if ans else None,
                              "avgSec": round(sum((x.response_ms or 0) for x in ans) / len(ans) / 1000, 1) if ans else None})
        gains = []
        for st in students:
            p = sorted([a for a in pre if a.user_id == st.id], key=lambda a: a.finished_at)
            q = [a for a in post if a.user_id == st.id]
            if p and q:
                pre_s, post_s = round(p[0].score), round(max(a.score for a in q))
                gains.append({"student": st.id, "pre": pre_s, "post": post_s, "gain": 0 if pre_s >= 100 else round((post_s - pre_s) / (100 - pre_s), 2)})
        ms = [s for s in sessions if s.module_id == m.id]
        answered = sorted([x for x in questions if x["pct"] is not None], key=lambda x: x["pct"])
        out_modules[m.key] = {
            "sessions": len(ms), "minutes": round(sum(_minutes(s) for s in ms), 1), "attempts": len(post),
            "avgPost": _avg([a.score for a in post]), "avgPre": _avg([a.score for a in pre]),
            "avgGain": round(sum(g["gain"] for g in gains) / len(gains), 2) if gains else None,
            "gains": gains, "questions": questions,
            "parts": [{"key": k, "count": n} for k, n in parts_by_module[m.id].most_common()],
            "hardest": answered[0] if answered else None,
        }

    out_students = []
    for st in students:
        mine = [s for s in sessions if s.user_id == st.id]
        my_att = [a for a in attempts if a.user_id == st.id]
        mods = {}
        for m in modules:
            sm = [s for s in mine if s.module_id == m.id]
            am = [a for a in my_att if a.quiz.module_id == m.id]
            pre = sorted([a for a in am if a.quiz.kind == "pre"], key=lambda a: a.finished_at)
            posts = [a for a in am if a.quiz.kind == "post"]
            mods[m.key] = {"explored": max((s.explored_pct for s in sm), default=0), "pre": round(pre[0].score) if pre else None,
                           "best": round(max(a.score for a in posts)) if posts else None, "attempts": len(posts), "sessions": len(sm)}
        stamps = [s.started_at for s in mine] + [a.finished_at for a in my_att]
        out_students.append({"id": st.id, "name": st.full_name, "email": st.email, "sessions": len(mine),
                             "minutes": round(sum(_minutes(s) for s in mine), 1), "last": _iso(max(stamps)) if stamps else None, "modules": mods})
    posts = [a for a in attempts if a.quiz.kind == "post"]
    return {"totals": {"students": len(students), "sessions": len(sessions), "attempts": len(posts), "avgScore": _avg([a.score for a in posts]),
                       "minutes": round(sum(_minutes(s) for s in sessions), 1)},
            "modules": out_modules, "students": out_students}


def progress(db: Session, user: User) -> dict:
    return compute_stats(db, [user])["students"][0]["modules"]
