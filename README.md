# HoloClass
### Aula Interactiva de Aprendizaje mediante Realidad Aumentada y Visión Artificial

Proyecto para la Feria de Proyectos de Ingeniería en Sistemas Computacionales — 7.º semestre.
Equipo: 5 integrantes · Duración: 8 semanas · Presupuesto: bajo (≈ $1,650–$3,590 MXN).

**▶ Prototipo en línea:** https://br-benja.github.io/holoclass/ · **Tarjetas:** https://br-benja.github.io/holoclass/prototipo/tarjetas.html

---

## Índice de documentos

| # | Documento | Contenido (entregables del prompt maestro) |
|---|-----------|--------------------------------------------|
| 01 | [Documento del proyecto](01_Documento_Proyecto.md) | Descripción profesional, justificación, problema, objetivos, alcance y limitaciones, selección de los 3 módulos educativos |
| 02 | [Arquitectura y tecnologías](02_Arquitectura_y_Tecnologias.md) | Comparación de tecnologías, decisión de RA, arquitectura, diagramas de flujo y secuencia |
| 03 | [Módulos funcionales](03_Modulos_Funcionales.md) | Flujo de 12 pasos, HoloScan, HoloModel, HoloLearn, HoloHands, HoloQuiz, HoloTeacher; funciones diferenciales por prioridad y dificultad |
| 04 | [Modelos 3D](04_Modelos_3D.md) | Fuentes gratuitas con licencias, pipeline en Blender, GLB/glTF, texturas, animaciones, optimización |
| 05 | [Base de datos](05_Base_de_Datos.md) + [`database/schema.sql`](database/schema.sql) | Modelo relacional, diagrama ER, script SQL probado |
| 06 | [Diseño de interfaz](06_Diseno_UI.md) | Sistema visual y las 10 pantallas |
| 07 | [Cronograma y presupuesto](07_Cronograma_y_Presupuesto.md) | Plan de 8 semanas por integrante, Gantt, dependencias, presupuesto en MXN |
| 08 | [Evaluación y métricas](08_Evaluacion_y_Metricas.md) | Innovación, complejidad, riesgos, rendimiento, impacto, comercialización, KPIs técnicos y educativos |
| 09 | [Exposición y demo](09_Exposicion_y_Demo.md) | Guion de 5 minutos, demo interactiva para el jurado, preguntas difíciles |

---

## Resumen en una frase

HoloClass convierte tarjetas impresas en lecciones 3D: la webcam de una laptop reconoce un marcador ArUco integrado en cada tarjeta ilustrada y, **directamente en el navegador**, hace aparecer sobre la tarjeta un modelo 3D (un corazón que late, el sistema solar en movimiento, una molécula) que el estudiante gira, desarma y explora por partes con explicaciones narradas, para luego responder un cuestionario **ligado al propio modelo** ("toca el ventrículo izquierdo") cuyos resultados ve el docente en su panel.

## Los 3 módulos de la primera versión

| Módulo | Contenido de la demo | Por qué |
|--------|----------------------|---------|
| 🫀 **Anatomía** | Corazón (latido animado, 8 partes seleccionables, flujo sanguíneo) | El más impactante visualmente; tema difícil de entender en 2D |
| 🪐 **Astronomía** | Sistema solar (órbitas animadas, 8 planetas + Sol, comparación de tamaños) | Muy atractivo, modelos sencillos (esferas + texturas), fácil de optimizar |
| ⚛️ **Química** | Moléculas (H₂O, CO₂, CH₄, NH₃, glucosa…) y modelo atómico de Bohr | Se **generan por código** a partir de datos, sin modelar a mano → muchos contenidos con poco esfuerzo |

## Principio rector

> **Demostración estable + modelos atractivos + experiencia educativa real.**
> **[MVP]** se implementa y se demuestra · **[OPCIONAL]** solo si el MVP está estable en la semana 6 · **[FUTURO]** se menciona como trabajo posterior.

## Stack (resumen)

- **RA en el navegador:** marcadores **ArUco** detectados con **js-aruco2** (JavaScript) + estimación de pose · **Three.js** (WebGL) para render 3D
- **Interacción:** ratón/táctil (OrbitControls + raycasting) · **MediaPipe Hand Landmarker** (gestos, opcional) · Web Speech API (narración)
- **Contenido 3D:** **Blender** → **GLB** optimizado con **gltf-transform** (Draco/meshopt + texturas WebP/KTX2)
- **Herramientas Python:** **OpenCV (`cv2.aruco`)** para generar marcadores, calibrar la cámara y medir la detección
- **Backend:** **FastAPI** + SQLAlchemy · **PostgreSQL**
- **Frontend:** **React + Vite + Tailwind** (React Three Fiber para integrar Three.js) · Recharts
