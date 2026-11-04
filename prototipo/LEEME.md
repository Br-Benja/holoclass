# HoloClass · Prototipo

## Cómo ejecutarlo
1. Doble clic en **`INICIAR.bat`**. Se abre una ventana negra (el servidor) y el navegador en `http://localhost:8101`.
2. Usa **Chrome o Edge**. Necesitas **internet** porque las librerías se cargan desde un CDN.
3. Para detenerlo, cierra la ventana negra.

> No abras `index.html` con doble clic: el navegador solo permite usar la cámara en `localhost` o `https`.

## Cómo probarlo
- **Con cámara:** abre **🖨 Tarjetas imprimibles** e imprime las tarjetas (o ábrelas en tu celular con el brillo al máximo). Elige un módulo → **📷 Explorar con cámara** → muestra la tarjeta a 30–60 cm.
- **Sin cámara:** **🧪 Simulación** (una tarjeta virtual se mueve sola) o **🖱 Sin cámara** (exploras el modelo con el ratón).

| Qué probar | Cómo |
|---|---|
| El modelo sigue a la tarjeta | Gira e inclina la tarjeta |
| Pérdida de seguimiento | Tapa la tarjeta con la mano y destápala |
| Explicación por partes | Toca una parte o una etiqueta; activa “🔊 Narrar al tocar” |
| Animaciones | 💓 Latido, 🩸 Flujo, 💥 Explosionar |
| Soltar la tarjeta | 📌 Fijar en pantalla (arrastra para girar, rueda para zoom) |
| Comparar a escala | Astronomía → muestra Tierra (#3) y Júpiter (#4) juntas → 🔭 Escala real |
| Cuestionario | 📝 Cuestionario: hay preguntas que se contestan **tocando el modelo** |
| Panel docente | Arriba a la derecha; muestra los resultados guardados en este navegador |

## Qué es real y qué es provisional
- **Real:** detección de marcadores ArUco y estimación de pose en el navegador (js-aruco2), RA con Three.js, selección de partes, animaciones, narración, cuestionarios con preguntas espaciales y estadísticas.
- **Provisional:** el corazón es un modelo **procedural simplificado** (en la versión final será un GLB anatómico preparado en Blender), los datos se guardan en el navegador (en la versión final van a FastAPI + PostgreSQL) y no hay usuarios ni grupos.

## Archivos
- `index.html`, `styles.css`: interfaz
- `js/app.js`: cámara, detección, pose, RA, interacción, cuestionario y panel docente
- `js/models.js`: corazón, sistema solar, planetas y moléculas (procedurales)
- `js/content.js`: textos educativos, marcadores y preguntas
- `tarjetas.html`: tarjetas imprimibles (diccionario ARUCO_MIP_36h12)
