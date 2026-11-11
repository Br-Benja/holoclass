"""Banco de pruebas de detección de marcadores (para el reporte de métricas).

Modo 1 · Sintético (sin cámara, reproducible): genera miles de imágenes con una tarjeta a distintas
distancias, ángulos, iluminación, desenfoque y ruido, y mide la tasa de detección y los falsos positivos.
    python tools/benchmark_detection.py --synthetic

Modo 2 · Video real: analiza un video grabado con la webcam (o la cámara en vivo) mostrando una tarjeta.
    python tools/benchmark_detection.py --video prueba.mp4 --expect 1
    python tools/benchmark_detection.py --camera 0 --expect 1 --seconds 30

Usa el detector ArUco de OpenCV con el mismo diccionario que la app (ARUCO_MIP_36h12).
Nota: el navegador usa js-aruco2; OpenCV sirve como referencia de la dificultad de cada condición.
"""
import argparse
import time

import cv2
import numpy as np

D = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_MIP_36h12)
PARAMS = cv2.aruco.DetectorParameters()
# Corrección de errores parecida a la de la app (js-aruco2 con distancia de Hamming máx. 5 de 36 bits).
# El valor por defecto de OpenCV (0.6) corrige demasiados bits y genera IDs erróneos.
PARAMS.errorCorrectionRate = 0.3
DETECTOR = cv2.aruco.ArucoDetector(D, PARAMS)
W, H, FOCAL, MARKER_MM = 640, 480, 640.0, 50.0


def render(mid, dist_mm, yaw, pitch, light, blur, noise, rng):
    """Proyecta una tarjeta de 5 cm con perspectiva real sobre un fondo."""
    side = 400
    m = cv2.aruco.generateImageMarker(D, mid, side, borderBits=1)
    card = cv2.copyMakeBorder(m, 80, 80, 80, 80, cv2.BORDER_CONSTANT, value=255)
    s = card.shape[0]; half = MARKER_MM * s / side / 2
    pts3 = np.array([[-half, -half, 0], [half, -half, 0], [half, half, 0], [-half, half, 0]], np.float32)
    R, _ = cv2.Rodrigues(np.array([np.radians(pitch), np.radians(yaw), 0], np.float32))
    cam = (R @ pts3.T).T + np.array([rng.uniform(-60, 60), rng.uniform(-40, 40), dist_mm])
    proj = np.stack([cam[:, 0] / cam[:, 2] * FOCAL + W / 2, cam[:, 1] / cam[:, 2] * FOCAL + H / 2], 1).astype(np.float32)
    Hm = cv2.getPerspectiveTransform(np.array([[0, 0], [s, 0], [s, s], [0, s]], np.float32), proj)
    bg = rng.integers(60, 200, (H, W), dtype=np.uint8)
    bg = cv2.GaussianBlur(bg, (0, 0), 25)
    warped = cv2.warpPerspective(card, Hm, (W, H), borderValue=0)
    mask = cv2.warpPerspective(np.full_like(card, 255), Hm, (W, H), borderValue=0)
    img = np.where(mask > 0, warped, bg).astype(np.float32)
    img = img * light
    if blur:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    img += rng.normal(0, noise, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8)


def synthetic(n_per, seed):
    rng = np.random.default_rng(seed)
    conds = {
        "30-60 cm, frontal, luz normal": dict(d=(300, 600), ang=(0, 15), light=(0.9, 1.1), blur=0, noise=4),
        "60-80 cm, frontal": dict(d=(600, 800), ang=(0, 15), light=(0.9, 1.1), blur=0, noise=4),
        "80-100 cm": dict(d=(800, 1000), ang=(0, 15), light=(0.9, 1.1), blur=0, noise=4),
        "inclinación 30-45°": dict(d=(300, 600), ang=(30, 45), light=(0.9, 1.1), blur=0, noise=4),
        "inclinación 45-60°": dict(d=(300, 600), ang=(45, 60), light=(0.9, 1.1), blur=0, noise=4),
        "poca luz (35-55 %)": dict(d=(300, 600), ang=(0, 20), light=(0.35, 0.55), blur=0, noise=6),
        "movimiento (desenfoque)": dict(d=(300, 600), ang=(0, 20), light=(0.9, 1.1), blur=1.6, noise=4),
        "ruido de sensor alto": dict(d=(300, 600), ang=(0, 20), light=(0.7, 1.0), blur=0.6, noise=14),
    }
    print(f"{'Condición':34} {'Detección':>10} {'ID erróneo':>11} {'ms/frame':>9}")
    total_ok = total = wrong = 0
    for name, c in conds.items():
        ok = bad = 0; t = 0.0
        for _ in range(n_per):
            mid = int(rng.choice([1, 2, 3, 4, 5, 8, 15, 20]))
            img = render(mid, rng.uniform(*c["d"]), rng.uniform(*c["ang"]) * rng.choice([-1, 1]), rng.uniform(*c["ang"]) * rng.choice([-1, 1]),
                         rng.uniform(*c["light"]), c["blur"], c["noise"], rng)
            t0 = time.perf_counter(); _, ids, _ = DETECTOR.detectMarkers(img); t += time.perf_counter() - t0
            found = [] if ids is None else ids.ravel().tolist()
            ok += mid in found; bad += any(x != mid for x in found)
        total_ok += ok; total += n_per; wrong += bad
        print(f"{name:34} {100 * ok / n_per:9.1f}% {bad:11d} {1000 * t / n_per:9.2f}")
    # falsos positivos en imágenes sin tarjeta
    fp = 0
    for _ in range(n_per * 2):
        bg = cv2.GaussianBlur(rng.integers(0, 255, (H, W), dtype=np.uint8), (0, 0), rng.uniform(0.5, 6))
        _, ids, _ = DETECTOR.detectMarkers(bg); fp += ids is not None
    print(f"\nTotal: {100 * total_ok / total:.1f}% de detección en {total} imágenes · IDs erróneos: {wrong} · falsos positivos sin tarjeta: {fp}/{n_per * 2}")


def video(source, expect, seconds):
    cap = cv2.VideoCapture(source)
    frames = hits = wrong = 0; t = 0.0; t_end = time.time() + seconds if isinstance(source, int) else None
    gaps, gap = [], 0
    while True:
        ok, frame = cap.read()
        if not ok or (t_end and time.time() > t_end):
            break
        g = cv2.cvtColor(cv2.resize(frame, (W, int(W * frame.shape[0] / frame.shape[1]))), cv2.COLOR_BGR2GRAY)
        t0 = time.perf_counter(); _, ids, _ = DETECTOR.detectMarkers(g); t += time.perf_counter() - t0
        found = [] if ids is None else ids.ravel().tolist()
        frames += 1
        if expect in found:
            hits += 1
            if gap: gaps.append(gap); gap = 0
        else:
            gap += 1
        wrong += any(x != expect for x in found)
    cap.release()
    if not frames:
        print("No se leyeron frames."); return
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    print(f"Frames: {frames} · detección: {100 * hits / frames:.1f}% · IDs erróneos: {wrong} · {1000 * t / frames:.2f} ms/frame")
    if gaps:
        print(f"Pérdidas de seguimiento: {len(gaps)} · duración media {np.mean(gaps) / fps * 1000:.0f} ms · máxima {max(gaps) / fps * 1000:.0f} ms")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--n", type=int, default=250, help="imágenes por condición (modo sintético)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--video"); ap.add_argument("--camera", type=int)
    ap.add_argument("--expect", type=int, default=1); ap.add_argument("--seconds", type=int, default=30)
    a = ap.parse_args()
    if a.video or a.camera is not None:
        video(a.video if a.video else a.camera, a.expect, a.seconds)
    else:
        synthetic(a.n, a.seed)


if __name__ == "__main__":
    main()
