# HoloClass
### Aula Interactiva de Aprendizaje mediante Realidad Aumentada y Visión Artificial

Proyecto para la Feria de Proyectos de Ingeniería en Sistemas Computacionales — 7.º semestre.
Equipo: 5 integrantes · Duración: 8 semanas · Presupuesto: bajo (≈ $1,650–$3,590 MXN).

**▶ En línea:** https://br-benja.github.io/holoclass/ · **Tarjetas imprimibles:** https://br-benja.github.io/holoclass/app/tarjetas.html
Cuentas demo: `estudiante@demo.mx` / `docente@demo.mx` · contraseña `demo1234` · grupo `DEMO01`

---

## Inicio rápido

| Quiero… | Hago… |
|---------|-------|
| Probarlo ya, sin instalar nada | Abrir el enlace en línea (modo local: los datos se guardan en el navegador) |
| Usarlo en mi laptop sin internet de servidor | Doble clic en `app/INICIAR.bat` → http://localhost:8101 |
| El sistema completo con base de datos | Doble clic en `backend/INICIAR_SERVIDOR.bat` → http://localhost:8000 (API en `/docs`) |
| Imprimir las tarjetas | `app/tarjetas.html` o `python tools/generate_markers.py` (PDF a 5 cm) |
| Calibrar mi webcam | `python tools/calibrate_camera.py --board` y luego `--camera 0` |

Usa **Chrome o Edge**. Detalles, pruebas y resultados en **[10 · Implementación](10_Implementacion.md)**.

## Índice de documentos

| # | Documento | Contenido |
|---|-----------|-----------|
| 01 | [Documento del proyecto](01_Documento_Proyecto.md) | Descripción profesional, justificación, problema, objetivos, alcance y limitaciones, selección de módulos |
| 02 | [Arquitectura y tecnologías](02_Arquitectura_y_Tecnologias.md) | Comparación de tecnologías, decisión de RA, arquitectura, diagramas de flujo y secuencia |
| 03 | [Módulos funcionales](03_Modulos_Funcionales.md) | Flujo de 12 pasos, HoloScan, HoloModel, HoloLearn, HoloHands, HoloQuiz, HoloTeacher; prioridad y dificultad |
| 04 | [Modelos 3D](04_Modelos_3D.md) | Fuentes gratuitas con licencias, pipeline en Blender, GLB/glTF, optimización |
| 05 | [Base de datos](05_Base_de_Datos.md) + [`database/schema.sql`](database/schema.sql) | Modelo relacional, diagrama ER, script SQL probado |
| 06 | [Diseño de interfaz](06_Diseno_UI.md) | Sistema visual y pantallas |
| 07 | [Cronograma y presupuesto](07_Cronograma_y_Presupuesto.md) | Plan de 8 semanas por integrante, Gantt, dependencias, presupuesto en MXN |
| 08 | [Evaluación y métricas](08_Evaluacion_y_Metricas.md) | Innovación, complejidad, riesgos, rendimiento, impacto, comercialización, KPIs |
| 09 | [Exposición y demo](09_Exposicion_y_Demo.md) | Guion de 5 minutos, demo interactiva para el jurado, preguntas difíciles |
| **10** | **[Implementación](10_Implementacion.md)** | **Qué está construido, cómo ejecutarlo, pruebas y resultados medidos, decisiones que cambiaron** |

---

## Resumen en una frase

HoloClass convierte tarjetas impresas en lecciones 3D: la webcam reconoce un marcador ArUco de la tarjeta y, **directamente en el navegador**, hace aparecer sobre ella un modelo 3D (un corazón que late y se puede cortar, el sistema solar, moléculas que se forman al juntar tarjetas de átomos, el átomo de Bohr) que el estudiante explora por partes con narración y recorrido guiado; después responde un pre-test y una evaluación **tocando el propio modelo**, y el docente ve en su panel qué conceptos dominó el grupo y cuánto aprendió.

## Los 4 módulos

| Módulo | Contenido | Tarjetas |
|--------|-----------|----------|
| 🫀 **El corazón humano** | 10 partes, latido, flujo sanguíneo, corte transversal, vista explosionada | #1 |
| 🪐 **El sistema solar** | Órbitas, 8 planetas, Tierra/Marte/Júpiter/Saturno a escala real | #2, #3, #10, #4, #8 |
| ⚛️ **Geometría molecular** | H₂O, CO₂, CH₄, NH₃, O₂, C₂H₄, C₆H₆ · reacciones juntando tarjetas H, O, C, N | #5–7, #11–14, #20–23 |
| ⚛️ **El átomo de Bohr** | Núcleo, capas y electrones de los elementos 1 al 10 | #15 |

Además, el docente puede **crear módulos nuevos subiendo un modelo GLB** (marcadores libres #30–#39).

## Stack

- **RA en el navegador:** ArUco (`ARUCO_MIP_36h12`) con **js-aruco2** en un Web Worker · pose POSIT + filtro One-Euro · **Three.js** (WebGL)
- **Interacción:** ratón/táctil (OrbitControls + raycasting) · **MediaPipe Hand Landmarker** (gestos, beta) · Web Speech API (narración)
- **Interfaz:** HTML + CSS + **JavaScript con módulos ES** (sin compilación, se publica tal cual)
- **Backend:** **FastAPI** + SQLAlchemy 2 · **PostgreSQL** (o SQLite para pruebas) · JWT + bcrypt · pytest
- **Herramientas Python:** **OpenCV** (`cv2.aruco`) para generar tarjetas, calibrar la cámara y medir la detección
- **Contenido 3D:** procedural (generado por código) + GLB del docente (GLTFLoader con meshopt)
