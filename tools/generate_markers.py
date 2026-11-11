"""Genera los marcadores ArUco de HoloClass (diccionario ARUCO_MIP_36h12) como PNG y una hoja PDF imprimible.

Los IDs coinciden bit a bit con los que detecta js-aruco2 en el navegador.

Uso:
    python tools/generate_markers.py                 # todos los marcadores de content.json
    python tools/generate_markers.py --ids 1 5 30    # solo algunos
Salida: tools/output/markers/*.png y tools/output/tarjetas.pdf  (5 cm por marcador a 300 ppp)
"""
import argparse
import json
import unicodedata
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CONTENT = json.loads((ROOT / "app" / "data" / "content.json").read_text(encoding="utf-8"))
DPI, MARKER_CM, MARGIN_CM = 300, 5.0, 1.0
px = lambda cm: int(round(cm / 2.54 * DPI))


def marker_img(dictionary, mid: int) -> np.ndarray:
    side = px(MARKER_CM)
    m = cv2.aruco.generateImageMarker(dictionary, mid, side, borderBits=1)
    q = px(MARGIN_CM)                       # zona blanca alrededor (necesaria para detectar)
    return cv2.copyMakeBorder(m, q, q, q, q, cv2.BORDER_CONSTANT, value=255)


def card(dictionary, mid: int, title: str) -> np.ndarray:
    img = cv2.cvtColor(marker_img(dictionary, mid), cv2.COLOR_GRAY2BGR)
    h, w = img.shape[:2]
    canvas = np.full((h + px(1.2), w, 3), 255, np.uint8)
    canvas[:h] = img
    # la fuente Hershey de OpenCV no admite acentos: se quitan (Corazón -> Corazon)
    txt = unicodedata.normalize("NFKD", f"#{mid} {title}").encode("ascii", "ignore").decode()
    cv2.putText(canvas, txt, (px(0.4), h + px(0.8)), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (40, 40, 40), 3, cv2.LINE_AA)
    cv2.rectangle(canvas, (0, 0), (canvas.shape[1] - 1, canvas.shape[0] - 1), (200, 200, 200), 2)
    return canvas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", type=int, nargs="*", help="IDs a generar (por defecto, todos los de content.json)")
    ap.add_argument("--out", default=str(ROOT / "tools" / "output"))
    args = ap.parse_args()
    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_MIP_36h12)
    ids = args.ids or [int(k) for k in CONTENT["markers"]]
    out = Path(args.out); (out / "markers").mkdir(parents=True, exist_ok=True)
    cards = []
    for mid in ids:
        title = CONTENT["markers"].get(str(mid), {}).get("title", "Modulo propio")
        cv2.imwrite(str(out / "markers" / f"marker_{mid:03d}.png"), marker_img(d, mid))
        cards.append(card(d, mid, title))
    # hoja carta (21.6 x 27.9 cm) con 2 columnas
    page_w, page_h = px(21.6), px(27.9)
    pages, x, y, row_h = [], px(1), px(1), 0
    page = np.full((page_h, page_w, 3), 255, np.uint8)
    for c in cards:
        ch, cw = c.shape[:2]
        if x + cw > page_w - px(1):
            x, y, row_h = px(1), y + row_h + px(0.5), 0
        if y + ch > page_h - px(1):
            pages.append(page); page = np.full((page_h, page_w, 3), 255, np.uint8); x, y, row_h = px(1), px(1), 0
        page[y:y + ch, x:x + cw] = c
        x += cw + px(0.5); row_h = max(row_h, ch)
    pages.append(page)
    pdf = out / "tarjetas.pdf"
    try:
        from PIL import Image
        ims = [Image.fromarray(cv2.cvtColor(p, cv2.COLOR_BGR2RGB)) for p in pages]
        ims[0].save(pdf, save_all=True, append_images=ims[1:], resolution=DPI)
        print(f"PDF: {pdf}  ({len(pages)} página(s); imprímelo al 100 %)")
    except ImportError:
        for i, p in enumerate(pages, 1):
            cv2.imwrite(str(out / f"tarjetas_pagina{i}.png"), p)
        print("Pillow no está instalado: se guardaron las hojas como PNG (pip install pillow para PDF).")
    print(f"{len(ids)} marcador(es) en {out / 'markers'}")


if __name__ == "__main__":
    main()
