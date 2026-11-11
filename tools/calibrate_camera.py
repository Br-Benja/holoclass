"""Calibración de la webcam con un tablero ChArUco -> app/camera.json

Con la distancia focal real de la cámara, HoloClass estima mejor la posición de la tarjeta y el
modelo 3D queda "pegado" a ella.

Pasos:
  1) python tools/calibrate_camera.py --board            # genera tools/output/charuco_board.png
     Imprímelo al 100 % y pégalo en una superficie plana (cartón, tabla).
  2) python tools/calibrate_camera.py --camera 0         # abre la webcam
     Mueve el tablero a distintas distancias y ángulos. Presiona ESPACIO para capturar
     (mínimo 12 capturas variadas) y C para calcular. Q para salir.
  3) Se escribe app/camera.json; recarga HoloClass.

Usa la misma resolución que el navegador (640x480 por defecto).
"""
import argparse
import json
from datetime import date
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SQUARES_X, SQUARES_Y, SQUARE_MM, MARKER_MM = 7, 5, 30.0, 22.0
DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)   # tablero independiente de las tarjetas


def board():
    return cv2.aruco.CharucoBoard((SQUARES_X, SQUARES_Y), SQUARE_MM / 1000, MARKER_MM / 1000, DICT)


def make_board(out: Path):
    dpi = 300
    w, h = int(SQUARES_X * SQUARE_MM / 25.4 * dpi), int(SQUARES_Y * SQUARE_MM / 25.4 * dpi)
    img = board().generateImage((w, h), marginSize=int(10 / 25.4 * dpi), borderBits=1)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "charuco_board.png"
    cv2.imwrite(str(path), img)
    print(f"Tablero: {path}  (imprime al 100 %: cada cuadro debe medir {SQUARE_MM:.0f} mm; si no, usa --square-mm con la medida real)")


def calibrate(cam: int, width: int, height: int, square_mm: float, out_json: Path):
    b = board()
    if abs(square_mm - SQUARE_MM) > 1e-6:
        b = cv2.aruco.CharucoBoard((SQUARES_X, SQUARES_Y), square_mm / 1000, square_mm * MARKER_MM / SQUARE_MM / 1000, DICT)
    detector = cv2.aruco.CharucoDetector(b)
    cap = cv2.VideoCapture(cam)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width); cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    all_corners, all_ids, size = [], [], None
    print("ESPACIO = capturar · C = calibrar · Q = salir")
    while True:
        ok, frame = cap.read()
        if not ok:
            print("No se pudo leer la cámara."); break
        size = frame.shape[1], frame.shape[0]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        ch_corners, ch_ids, _, _ = detector.detectBoard(gray)
        view = frame.copy()
        n = 0 if ch_ids is None else len(ch_ids)
        if n:
            cv2.aruco.drawDetectedCornersCharuco(view, ch_corners, ch_ids)
        cv2.putText(view, f"esquinas: {n}  capturas: {len(all_corners)}", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.imshow("Calibracion HoloClass", view)
        k = cv2.waitKey(1) & 0xFF
        if k == ord(" ") and n >= 8:
            all_corners.append(ch_corners); all_ids.append(ch_ids); print(f"Captura {len(all_corners)} ({n} esquinas)")
        elif k == ord("c"):
            if len(all_corners) < 8:
                print("Se necesitan al menos 8 capturas (recomendado 12+)."); continue
            break
        elif k == ord("q"):
            cap.release(); cv2.destroyAllWindows(); return
    cap.release(); cv2.destroyAllWindows()
    obj_pts, img_pts = [], []
    for c, i in zip(all_corners, all_ids):
        o, p = b.matchImagePoints(c, i)
        if len(o) >= 6:
            obj_pts.append(o); img_pts.append(p)
    rms, K, dist, _, _ = cv2.calibrateCamera(obj_pts, img_pts, size, None, None)
    data = {"calibrated": True, "width": size[0], "height": size[1], "fx": float(K[0, 0]), "fy": float(K[1, 1]),
            "cx": float(K[0, 2]), "cy": float(K[1, 2]), "dist": [float(x) for x in dist.ravel()], "rms": round(float(rms), 3),
            "captures": len(obj_pts), "date": date.today().isoformat()}
    out_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
    hfov = 2 * np.degrees(np.arctan(size[0] / (2 * K[0, 0])))
    print(f"✔ Error de reproyección: {rms:.3f} px · campo de visión horizontal ≈ {hfov:.1f}° · guardado en {out_json}")
    if rms > 1.0:
        print("  Sugerencia: error alto; repite con más capturas, buena luz y el tablero bien plano.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--board", action="store_true", help="solo generar el tablero imprimible")
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--height", type=int, default=480)
    ap.add_argument("--square-mm", type=float, default=SQUARE_MM, help="medida real de un cuadro impreso")
    ap.add_argument("--out", default=str(ROOT / "app" / "camera.json"))
    a = ap.parse_args()
    if a.board:
        make_board(ROOT / "tools" / "output")
    else:
        calibrate(a.camera, a.width, a.height, a.square_mm, Path(a.out))


if __name__ == "__main__":
    main()
