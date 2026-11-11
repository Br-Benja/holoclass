# 10 · Implementación — HoloClass v1.0

Este documento describe **lo que está construido y funcionando**, cómo ejecutarlo, cómo se probó y qué decisiones cambiaron respecto al diseño original.

▶ **En línea (modo local):** https://br-benja.github.io/holoclass/ · **Tarjetas:** https://br-benja.github.io/holoclass/app/tarjetas.html

---

## 1. Cómo ejecutarlo

| Modo | Para qué | Cómo |
|------|----------|------|
| **Local (navegador)** | Demo rápida, GitHub Pages, sin instalar nada | Abrir el enlace en línea, o doble clic en `app/INICIAR.bat` → http://localhost:8101 |
| **Servidor completo** | Cuentas, grupos y resultados compartidos en base de datos | Doble clic en `backend/INICIAR_SERVIDOR.bat` → http://localhost:8000 (la API está en `/docs`) |

- La interfaz **detecta sola** si hay servidor (`/api/health`). En la esquina superior aparece 🟢 *Servidor* o 💾 *Local*.
- Por defecto el servidor usa **SQLite** (sin configurar nada). Para **PostgreSQL**:
  ```bat
  set DATABASE_URL=postgresql+psycopg://postgres:TU_CLAVE@localhost:5432/holoclass
  backend\INICIAR_SERVIDOR.bat
  ```
  Las tablas y el contenido se crean solos al arrancar.
- **Cuentas demo:** `estudiante@demo.mx` / `docente@demo.mx`, contraseña `demo1234`, grupo `DEMO01`.
- Navegador: **Chrome o Edge**. La cámara solo funciona en `localhost` o `https`.

## 2. Qué se implementó (estado real)

| Módulo | Funciones implementadas | Estado |
|--------|-------------------------|--------|
| **HoloScan** | Cámara con selector de dispositivo · detección ArUco (ARUCO_MIP_36h12) en un **Web Worker** · pose 6DoF (POSIT) · **filtro One-Euro** · varios marcadores a la vez · retención 600 ms y desvanecido · avisos de luz y distancia · **calibración** opcional (`camera.json`) · modo simulación con tarjetas virtuales | ✅ |
| **HoloModel** | Corazón de **10 partes** (cavidades, aorta con ramas, pulmonar con bifurcación, cavas, venas pulmonares, válvulas, coronarias trazadas sobre la superficie) · latido · flujo sanguíneo completo · **corte transversal** con interior sombreado · vista explosionada · sistema solar con órbitas · planetas con **escala real** · **7 moléculas** · **átomo de Bohr** (10 elementos) · modelos **GLB** subidos por el docente · etiquetas 3D · modo fijado con cámara orbital y enfoque animado | ✅ |
| **HoloLearn** | Explicación, dato curioso y “saber más” por parte · narración en español · **recorrido guiado** (enfoca, resalta y narra cada parte) · % de exploración del módulo · **reacciones químicas juntando tarjetas** (H+O → H₂O, C+O → CO₂, C+H → CH₄, N+H → NH₃) | ✅ |
| **HoloQuiz** | **Pre-test** (sin retroalimentación) y **evaluación final** · opción múltiple, verdadero/falso, **tocar en el modelo 3D** y **ordenar** · calificación en el servidor (las respuestas no llegan al navegador del estudiante) · resultados por concepto · **ganancia normalizada** | ✅ |
| **HoloHands** | MediaPipe Hand Landmarker: pellizco = girar, dos manos = zoom, señalar 1 s = seleccionar, deslizar = parte siguiente · solo con el modelo fijado · se apaga solo si bajan los FPS | ✅ **beta** (no probado con cámara real por el equipo de desarrollo; probar antes de la feria) |
| **HoloTeacher** | Grupos con código · alta por código · quitar estudiantes · resumen con KPIs · por módulo: pre, post, ganancia, **concepto más difícil**, % de aciertos por pregunta, partes más consultadas · tabla de estudiantes · **exportar CSV** · **editor de textos** · **editor de preguntas** (los 4 tipos) · **nuevo módulo desde un GLB** con marcador libre · datos simulados marcados como tales | ✅ |
| **Plataforma** | Registro / inicio de sesión con roles · JWT + bcrypt (servidor) · PBKDF2 (modo local) · modo invitado (solo local) · insignias · página de créditos y licencias · privacidad: el video nunca sale del dispositivo | ✅ |

### Realismo visual y cámaras

| Aspecto | Implementación |
|---------|----------------|
| Iluminación | Tone mapping ACES (cinematográfico), mapa de entorno `RoomEnvironment` para reflejos PBR, luz principal + luz de contorno |
| Integración con la escena | **Estimación de luz**: el brillo y el tono promedio del video ajustan la intensidad y el color de la luz del modelo · **sombra de contacto** sobre la tarjeta |
| Corazón | Material físico de tejido húmedo (clearcoat + sheen), textura de fibras musculares, variación de color, orejuelas auriculares, grasa en los surcos coronarios; **colores reales** o **didácticos** (azul/rojo) con un botón |
| Planetas | Texturas generadas con ruido de Perlin fractal: continentes, océanos, hielo polar, nubes y atmósfera en la Tierra; bandas y Gran Mancha Roja en Júpiter; casquetes en Marte; anillos con división de Cassini; Sol con granulación y resplandor. Se precalculan en segundo plano para que el módulo abra al instante |
| Moléculas y átomos | Materiales brillantes tipo modelo de esferas y barras |
| Cámaras | **Frontal o trasera** (botón o ajustes) y elección del dispositivo exacto. La frontal se muestra en espejo y la trasera no; la pose 3D se corrige en cada caso. En celulares la trasera es la predeterminada |
| Iconos | Iconos vectoriales **Lucide** (ISC) incluidos localmente en lugar de emojis |

**Futuras mejoras (no implementadas):** tarjetas con imagen propia (image tracking), reconocimiento de dibujos a mano, RA móvil con WebXR, modo competencia en clase, integración con Classroom/Moodle, editor 3D.

## 3. Arquitectura tal como quedó

```mermaid
flowchart LR
    subgraph NAV["Navegador (app/)"]
        CAM[Webcam] --> WK["aruco-worker.js<br/>js-aruco2 + POSIT"]
        WK --> AR["ar.js<br/>One-Euro · anclas · reacciones · Three.js"]
        MOD["models.js<br/>procedurales + GLB"] --> AR
        AR --> VW["viewer.js<br/>explorar · recorrido · evaluación"]
        HH["hands.js<br/>MediaPipe (beta)"] -.-> AR
        VW --> ST["store.js<br/>LocalStore | ApiStore"]
        TP["teacher.js"] --> ST
    end
    ST -- "modo local" --> LS[("localStorage +<br/>IndexedDB (GLB)")]
    ST -- "REST + JWT" --> API["backend/ FastAPI"]
    API --> DB[("PostgreSQL / SQLite<br/>18 tablas")]
    CJ[["app/data/content.json<br/>contenido único"]] --> ST
    CJ --> API
```

- **Una sola fuente de contenido:** `app/data/content.json` alimenta el modo local y se carga en la base de datos al iniciar el servidor.
- **Misma interfaz de datos** (`store.js`): `LocalStore` y `ApiStore` tienen los mismos métodos; la interfaz no sabe cuál usa.
- **El tiempo real nunca depende del servidor:** cámara, detección, render e interacción ocurren en el navegador.

### Estructura del repositorio
```
02_HoloClass/
├── app/                      Interfaz web (HTML + CSS + JavaScript ES modules, sin compilación)
│   ├── index.html · styles.css · tarjetas.html · camera.json · INICIAR.bat
│   ├── data/content.json     Contenido educativo, marcadores, preguntas, reacciones, elementos
│   └── js/  main · store · ar · aruco-worker · models · viewer · quiz · teacher · hands · util
├── backend/                  FastAPI + SQLAlchemy
│   ├── app/  main · api · models · content · stats · security · db · config
│   ├── tests/test_api.py     12 pruebas de la API
│   ├── scripts/export_schema.py
│   ├── requirements.txt · INICIAR_SERVIDOR.bat
├── tools/                    OpenCV (Python)
│   ├── generate_markers.py   PNG + PDF de tarjetas (5 cm a 300 ppp)
│   ├── calibrate_camera.py   Tablero ChArUco → app/camera.json
│   └── benchmark_detection.py
└── database/schema.sql       Generado desde los modelos del backend + vistas de analítica
```

## 4. Decisiones que cambiaron respecto al diseño original

| Diseño original | Implementación | Motivo |
|-----------------|----------------|--------|
| React + Vite + React Three Fiber | **JavaScript con módulos ES** + Three.js directo | Sin paso de compilación: se publica tal cual en GitHub Pages, carga más rápido y es más fácil de depurar. La organización por módulos (`viewer`, `quiz`, `teacher`…) cumple el mismo papel que los componentes. |
| Diccionario `DICT_4X4_50` | **`ARUCO_MIP_36h12`** | Distancia de Hamming mínima de 12: casi imposible confundir una tarjeta con otra. Se verificó que los IDs de OpenCV y js-aruco2 coinciden bit a bit. |
| Corazón GLB de una fuente externa | **Corazón procedural** (generado por código) | Cero riesgos de licencia y partes ya separadas para seleccionar. El docente sí puede subir modelos GLB propios. |
| Solo PostgreSQL | **PostgreSQL o SQLite** (misma API, mismo modelo) | Arranque sin configuración para pruebas y demo; PostgreSQL para uso real. |
| Servidor obligatorio | **Modo local + modo servidor** | La demo funciona en cualquier laptop o en GitHub Pages aunque no haya red en la feria. |

## 5. Pruebas y resultados medidos

| Prueba | Resultado |
|--------|-----------|
| API (pytest, 12 pruebas: autenticación, catálogo, sesiones, eventos, cuestionarios, calificación, grupos, estadísticas, edición de contenido, subida de GLB, datos simulados, interfaz servida) | **12/12** en SQLite y **12/12 en PostgreSQL 18** |
| `database/schema.sql` | Se ejecutó completo en PostgreSQL 18; las 3 vistas devuelven datos con una sesión real |
| Prueba de punta a punta en el navegador con servidor + PostgreSQL | Inicio de sesión, sesión y eventos guardados, pre-test y evaluación calificados en el servidor, panel docente, edición de textos, subida y carga de un GLB |
| Prueba en el navegador en modo local | Detección en Worker (**14–23 ms por frame**), corazón con corte, reacción H+O→H₂O, Bohr, recorrido guiado, evaluación con preguntas espaciales, panel docente, módulo GLB |
| Banco sintético de detección (OpenCV, 320 imágenes con perspectiva real, `tools/benchmark_detection.py --synthetic`) | **98.8 % de detección**, 0 IDs erróneos, 0 falsos positivos en 80 imágenes sin tarjeta; 100 % hasta 1 m de frente, 90 % con 45–60° de inclinación |

**Pendiente de medir por el equipo (con cámara real):** FPS en la laptop de la feria, tasa de detección con tarjetas impresas (`benchmark_detection.py --camera 0`), temblor, HoloHands, y la **prueba piloto con estudiantes** (pre/post, SUS).

Para correr las pruebas:
```bash
cd backend
.venv\Scripts\python -m pytest -q tests
```
Con PostgreSQL: definir `TEST_DATABASE_URL=postgresql+psycopg://usuario:clave@localhost:5432/holoclass_test` antes de correrlas.
