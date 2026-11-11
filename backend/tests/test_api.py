"""Pruebas de la API de HoloClass (pytest)."""
import json
import struct

from app.content import load_content
from conftest import auth

CONTENT = load_content()


def minimal_glb() -> bytes:
    gltf = {"asset": {"version": "2.0"}, "scenes": [{"nodes": [0]}], "nodes": [{"name": "Parte_A"}]}
    js = json.dumps(gltf).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


def correct_answer(q):
    return q["items"] if q["type"] == "order" else q["answer"]


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["app"] == "holoclass"


def test_catalog_publico_sin_respuestas(client):
    c = client.get("/api/catalog").json()
    assert [m["key"] for m in c["modules"]] == ["corazon", "sistema_solar", "moleculas", "atomo"]
    assert c["markers"]["1"]["model"] == "heart" and c["markers"]["20"]["model"] == "atom_H"
    assert set(c["models"]["heart"]["parts"]) == set(CONTENT["models"]["heart"]["parts"])
    assert c["models"]["heart"]["parts"]["aorta"]["fact"]
    for q in c["quizzes"]["corazon"]["post"]:
        assert "answer" not in q and "explain" not in q
    assert len(c["quizzes"]["corazon"]["post"]) == len(CONTENT["quizzes"]["corazon"]["post"])
    assert c["modules"][2]["markers"][:3] == [5, 6, 7]


def test_catalog_docente_con_respuestas(client, teacher):
    c = client.get("/api/catalog", headers=teacher).json()
    post = {q["id"]: q for q in c["quizzes"]["corazon"]["post"]}
    assert post["c1"]["answer"] == "ventriculo_izq"
    assert post["c5"]["items"] == CONTENT["quizzes"]["corazon"]["post"][4]["items"]


def test_registro_login_y_grupo(client):
    r = client.post("/api/auth/register", json={"name": "Ana Prueba", "email": "ana@test.mx", "password": "secreta1", "role": "estudiante", "group_code": "demo01"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["groups"]
    assert client.post("/api/auth/register", json={"name": "X", "email": "ana@test.mx", "password": "secreta1"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "ana@test.mx", "password": "mala123"}).status_code == 401
    assert client.post("/api/auth/register", json={"name": "Y", "email": "y@test.mx", "password": "secreta1", "group_code": "ZZZZZZ"}).status_code == 404
    h = auth(client, "ana@test.mx", "secreta1")
    assert client.get("/api/auth/me", headers=h).json()["role"] == "estudiante"


def test_sesion_y_eventos(client, student):
    sid = client.post("/api/sessions", json={"module": "corazon"}, headers=student).json()["id"]
    ev = [{"kind": "parte_seleccionada", "model": "heart", "part": "aorta"}, {"kind": "parte_seleccionada", "model": "heart", "part": "aorta"},
          {"kind": "inventado"}]
    assert client.post(f"/api/sessions/{sid}/events", json={"events": ev}, headers=student).status_code == 204
    assert client.post(f"/api/sessions/{sid}/end", json={"explored": 70, "avg_fps": 55}, headers=student).json()["ok"]
    assert client.post("/api/sessions", json={"module": "corazon"}).status_code == 401


def test_cuestionario_pre_y_post(client, student):
    qs = client.get("/api/quizzes/corazon/post").json()
    assert all("answer" not in q for q in qs)
    order_q = next(q for q in qs if q["type"] == "order")
    assert sorted(order_q["items"]) == sorted(CONTENT["quizzes"]["corazon"]["post"][4]["items"])
    src = {q["id"]: q for q in CONTENT["quizzes"]["corazon"]["post"]}
    r = client.post("/api/quizzes/corazon/post/check", json={"qid": "c1", "answer": "ventriculo_izq"}).json()
    assert r["ok"] and r["correct"] == "ventriculo_izq" and r["explain"]
    assert not client.post("/api/quizzes/corazon/post/check", json={"qid": "c1", "answer": "aorta"}).json()["ok"]
    assert client.post("/api/quizzes/corazon/post/check", json={"qid": "c6", "answer": True}).json()["ok"]
    # pre-test con la mitad correcta
    pre = CONTENT["quizzes"]["corazon"]["pre"]
    answers = [{"qid": q["id"], "answer": correct_answer(q) if i % 2 == 0 else None, "ms": 1000} for i, q in enumerate(pre)]
    r = client.post("/api/quizzes/corazon/pre/attempts", json={"answers": answers}, headers=student).json()
    assert r["score"] == round(100 * 3 / 5)
    # evaluación final perfecta
    answers = [{"qid": k, "answer": correct_answer(q), "ms": 2000} for k, q in src.items()]
    r = client.post("/api/quizzes/corazon/post/attempts", json={"answers": answers}, headers=student).json()
    assert r["score"] == 100 and all(a["ok"] for a in r["answers"])
    p = client.get("/api/me/progress", headers=student).json()["corazon"]
    assert p["pre"] == 60 and p["best"] == 100 and p["explored"] >= 70


def test_docente_estadisticas(client, teacher, student):
    groups = client.get("/api/teacher/groups", headers=teacher).json()
    demo = next(g for g in groups if g["code"] == "DEMO01")
    assert demo["students"] >= 1
    s = client.get(f"/api/teacher/stats?group_id={demo['id']}", headers=teacher).json()
    cor = s["modules"]["corazon"]
    assert cor["avgPost"] == 100 and cor["avgPre"] == 60 and cor["avgGain"] == 1.0
    assert any(p["key"] == "heart:aorta" and p["count"] >= 2 for p in cor["parts"])
    assert client.get("/api/teacher/stats", headers=student).status_code == 403


def test_grupos_crear_unirse_eliminar(client, teacher):
    g = client.post("/api/teacher/groups", json={"name": "3.º A"}, headers=teacher).json()
    assert len(g["code"]) == 6
    client.post("/api/auth/register", json={"name": "Beto", "email": "beto@test.mx", "password": "secreta1"})
    hb = auth(client, "beto@test.mx", "secreta1")
    assert client.post("/api/groups/join", json={"code": g["code"].lower()}, headers=hb).json()["id"] == g["id"]
    assert [x["code"] for x in client.get("/api/me/groups", headers=hb).json()] == [g["code"]]
    me = client.get("/api/auth/me", headers=hb).json()
    assert client.delete(f"/api/teacher/groups/{g['id']}/students/{me['id']}", headers=teacher).status_code == 204
    assert client.delete(f"/api/teacher/groups/{g['id']}", headers=teacher).status_code == 204


def test_editar_textos_y_preguntas(client, teacher):
    r = client.put("/api/teacher/models/heart/texts", json={"intro": "Intro nueva", "parts": {"aorta": {"name": "Aorta", "text": "Texto editado", "fact": "", "more": "Más"}}}, headers=teacher)
    assert r.status_code == 200
    m = client.get("/api/catalog").json()["models"]["heart"]
    assert m["intro"] == "Intro nueva" and m["parts"]["aorta"]["text"] == "Texto editado" and "fact" not in m["parts"]["aorta"]
    bad = [{"id": "x1", "type": "pick", "q": "¿?", "answer": "no_existe"}]
    assert client.put("/api/teacher/quizzes/corazon/post", json={"questions": bad}, headers=teacher).status_code == 422
    new = CONTENT["quizzes"]["corazon"]["post"][:2] + [{"id": "n1", "type": "mc", "q": "Nueva", "options": ["a", "b"], "answer": 1, "concept": "X", "explain": "Y"}]
    assert client.put("/api/teacher/quizzes/corazon/post", json={"questions": new}, headers=teacher).status_code == 200
    ids = [q["id"] for q in client.get("/api/quizzes/corazon/post").json()]
    assert sorted(ids) == ["c1", "c2", "n1"]
    assert client.post("/api/teacher/content/reset", headers=teacher).json()["ok"]
    c = client.get("/api/catalog").json()
    assert len(c["quizzes"]["corazon"]["post"]) == len(CONTENT["quizzes"]["corazon"]["post"])
    assert c["models"]["heart"]["intro"] == CONTENT["models"]["heart"]["intro"]


def test_modulo_propio_glb(client, teacher):
    payload = {"module": {"subject": "anatomia", "title": "Cerebro", "desc": "d", "level": "S", "markers": [30], "min_explored_pct": 50},
               "model": {"name": "Cerebro", "intro": "i", "license": "CC0", "attribution": "Equipo", "scale": 1, "parts": {"Parte_A": {"name": "A", "text": "t"}}, "tour": ["Parte_A"]},
               "quizzes": {"pre": [], "post": [{"id": "p1", "type": "pick", "q": "Toca A", "answer": "Parte_A"}]}}
    files = {"file": ("cerebro.glb", minimal_glb(), "model/gltf-binary")}
    r = client.post("/api/teacher/modules", data={"payload": json.dumps(payload)}, files=files, headers=teacher)
    assert r.status_code == 200, r.text
    key = r.json()["key"]
    c = client.get("/api/catalog").json()
    assert c["markers"]["30"]["model"] == "glb_" + key
    url = c["models"]["glb_" + key]["file"]
    assert client.get(url).content[:4] == b"glTF"
    # el marcador ya no está libre
    r2 = client.post("/api/teacher/modules", data={"payload": json.dumps(payload)}, files={"file": ("x.glb", minimal_glb(), "model/gltf-binary")}, headers=teacher)
    assert r2.status_code == 409
    bad = client.post("/api/teacher/modules", data={"payload": json.dumps({**payload, "module": {**payload["module"], "markers": [31]}})}, files={"file": ("x.glb", b"nope", "x")}, headers=teacher)
    assert bad.status_code == 422
    assert client.delete(f"/api/teacher/modules/{key}", headers=teacher).status_code == 204
    assert "30" not in client.get("/api/catalog").json()["markers"]
    assert client.delete("/api/teacher/modules/corazon", headers=teacher).status_code == 403


def test_datos_simulados(client, teacher):
    gid = next(g["id"] for g in client.get("/api/teacher/groups", headers=teacher).json() if g["code"] == "DEMO01")
    assert client.post(f"/api/teacher/groups/{gid}/simulate", headers=teacher).json()["ok"]
    s = client.get(f"/api/teacher/stats?group_id={gid}", headers=teacher).json()
    assert s["totals"]["students"] >= 13 and s["modules"]["corazon"]["hardest"] is not None
    assert client.delete("/api/teacher/simulated", headers=teacher).status_code == 204
    s = client.get(f"/api/teacher/stats?group_id={gid}", headers=teacher).json()
    assert all("(simulado)" not in st["name"] for st in s["students"])


def test_frontend_servido(client):
    r = client.get("/")
    assert r.status_code == 200 and "HoloClass" in r.text
    assert client.get("/data/content.json").json()["version"] == CONTENT["version"]
