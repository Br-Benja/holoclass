# 01 · Documento del Proyecto — HoloClass

## 1. Descripción profesional

**HoloClass** es una plataforma web de aprendizaje interactivo que combina realidad aumentada (RA) basada en marcadores, visión por computadora y gráficos 3D en tiempo real para transformar material educativo impreso en experiencias tridimensionales exploratorias. Cada tarjeta educativa contiene una ilustración del tema y un marcador fiducial **ArUco**; al mostrarla ante la webcam de una laptop, el sistema reconoce el marcador, estima su posición y orientación en el espacio y superpone sobre ella el modelo 3D correspondiente, que sigue los movimientos de la tarjeta en la mano del estudiante.

A diferencia de un visor 3D, HoloClass está construido alrededor de un **ciclo pedagógico completo**: *explorar → comprender → comprobar → retroalimentar*. El estudiante manipula el modelo (rotar, acercar, desarmar en vista explosionada), selecciona componentes para ver etiquetas y explicaciones con narración de voz, activa animaciones didácticas (latido cardiaco, órbitas planetarias, formación de enlaces) y responde cuestionarios que incluyen **preguntas espaciales sobre el propio modelo** ("selecciona la aurícula derecha"). Cada interacción y resultado se registra, y el docente consulta en su panel el progreso del grupo, las preguntas con más errores y el tiempo de exploración por tema.

Todo funciona **en el navegador de una laptop con webcam**, sin visores, sin apps instaladas y sin GPU dedicada, con herramientas gratuitas y de código abierto.

---

## 2. Justificación

1. **Dificultad de los contenidos espaciales.** Temas como la anatomía del corazón, el sistema solar o la geometría molecular son intrínsecamente tridimensionales, pero se enseñan con imágenes planas. Comprender relaciones espaciales (qué cámara del corazón está detrás de cuál, por qué el agua es una molécula angular) exige que el estudiante "reconstruya mentalmente" el 3D, lo que representa una barrera para muchos.
2. **Evidencia de la RA en educación.** Diversos metaanálisis (p. ej., Garzón & Acevedo, 2019, *Educational Research Review*; Chang et al., 2022, *Computers & Education*) reportan efectos positivos de moderados a medios de la RA sobre el desempeño académico y la motivación, especialmente en ciencias. *(Verificar y citar con exactitud las fuentes en la versión final.)*
3. **Barrera de costo de la RA actual.** Los visores (HoloLens, Meta Quest) y las plataformas comerciales tienen costos inaccesibles para muchas escuelas públicas. HoloClass solo requiere una laptop y tarjetas impresas en papel.
4. **El material impreso no desaparece:** HoloClass lo **potencia** en lugar de reemplazarlo; la tarjeta física sigue siendo útil sin la cámara.
5. **Valor académico para el equipo:** integra visión por computadora (detección de marcadores, estimación de pose, calibración), gráficos 3D (WebGL, transformaciones, raycasting), modelado 3D, desarrollo full-stack, bases de datos y diseño instruccional.

---

## 3. Planteamiento del problema

Los estudiantes de nivel secundaria, bachillerato y primeros semestres universitarios enfrentan dificultades para comprender contenidos cuya naturaleza es tridimensional o dinámica, porque se presentan con recursos estáticos y bidimensionales (libros, diapositivas, diagramas). Esto provoca:

- memorización sin comprensión de las relaciones espaciales;
- baja participación y motivación en clase;
- poca retroalimentación inmediata sobre lo aprendido;
- docentes sin información sobre qué conceptos específicos no se entienden.

Las herramientas 3D existentes suelen ser visores pasivos (sin evaluación ni seguimiento), apps móviles cerradas o soluciones de RA que requieren hardware costoso.

**Pregunta de investigación:**
¿Puede una plataforma web de realidad aumentada basada en marcadores, ejecutada en una laptop convencional, ofrecer una experiencia estable (≥ 30 FPS, detección ≥ 95 % en condiciones normales) que mejore la comprensión de contenidos tridimensionales, medida como ganancia entre un pre-test y un post-test, frente al material impreso tradicional?

---

## 4. Objetivos

### Objetivo general
Desarrollar una plataforma web educativa de realidad aumentada que, mediante el reconocimiento de marcadores con la cámara de una laptop, despliegue modelos 3D interactivos con explicaciones por componente, narración, animaciones y evaluaciones vinculadas al modelo, para facilitar la comprensión de contenidos tridimensionales y proporcionar al docente información sobre el aprendizaje de sus estudiantes.

### Objetivos específicos
1. Diseñar un juego de **al menos 12 tarjetas educativas** con ilustración y marcador ArUco, y un módulo **HoloScan** que las detecte en el navegador con una tasa ≥ 95 % a 30–80 cm de distancia y recupere el seguimiento en < 0.5 s tras una oclusión.
2. Estimar la pose (posición y orientación) del marcador y superponer modelos 3D que sigan la tarjeta con renderizado ≥ 30 FPS en una laptop de gama media sin GPU dedicada.
3. Preparar y optimizar en Blender **al menos 3 modelos principales** (corazón, sistema solar, modelo atómico) y **6 moléculas generadas por código**, cada uno con partes seleccionables, etiquetas y al menos una animación educativa, con un peso ≤ 5 MB por modelo.
4. Implementar **HoloLearn**: explicaciones por componente, narración por voz en español y modo de exploración guiada y libre.
5. Implementar **HoloQuiz** con preguntas de opción múltiple y **preguntas de selección espacial** sobre el modelo, calificación automática y retroalimentación inmediata.
6. Implementar **HoloTeacher**: gestión de grupos y estudiantes, consulta de resultados y estadísticas de uso, y edición de contenidos (textos, preguntas) de los módulos existentes.
7. Diseñar e implementar la base de datos relacional en **PostgreSQL** y la API REST en **FastAPI**.
8. Evaluar la plataforma con métricas técnicas y con una **prueba piloto con al menos 20 estudiantes** (pre-test/post-test, SUS y encuesta de motivación).
9. [OPCIONAL] Implementar **HoloHands**: rotación, zoom y selección mediante gestos de mano con MediaPipe.

---

## 5. Selección de los módulos educativos para la primera versión

### 5.1 Matriz de decisión

Criterios (1 = bajo, 5 = alto). Para "esfuerzo" un 5 significa **poco esfuerzo**.

| Materia / tema | Impacto visual en feria | Valor educativo del 3D | Disponibilidad de modelos con licencia libre | Poco esfuerzo de producción | Facilidad para preguntas espaciales | **Total** |
|----------------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Anatomía — corazón** | 5 | 5 | 4 | 3 | 5 | **22** |
| Anatomía — cerebro | 4 | 4 | 4 | 3 | 4 | 19 |
| Anatomía — esqueleto | 4 | 4 | 4 | 2 (muchas piezas) | 4 | 18 |
| **Astronomía — sistema solar** | 5 | 4 | 5 (NASA, texturas CC-BY) | 5 (esferas + texturas) | 4 | **23** |
| **Química — moléculas y átomo** | 4 | 5 (geometría molecular) | 5 (datos públicos) | 5 (se generan por código) | 4 | **23** |
| Física — fuerzas y movimiento | 3 | 4 | 2 | 2 (requiere simulación) | 2 | 13 |
| Matemáticas — geometría 3D | 3 | 4 | 5 (procedural) | 4 | 3 | 19 |

### 5.2 Módulos seleccionados [MVP]

**1. 🫀 Anatomía: el corazón humano**
- Modelo con 8 partes seleccionables: aurícula derecha e izquierda, ventrículo derecho e izquierdo, aorta, arteria pulmonar, venas cavas, válvulas (agrupadas).
- Animaciones: **latido** (ciclo sístole/diástole) y **flujo sanguíneo** (partículas rojas y azules siguiendo una trayectoria).
- Vista explosionada y corte transversal (plano de recorte de Three.js).
- Tarjetas: "Corazón (exterior)", "Corazón (corte interno)", "Circulación".

**2. 🪐 Astronomía: el sistema solar**
- Sol y 8 planetas con texturas reales; órbitas animadas con velocidad ajustable; modo **escala real de tamaños** vs. escala didáctica.
- Una tarjeta por planeta (8) + una tarjeta "Sistema solar completo".
- **Comparación de modelos:** dos tarjetas juntas (p. ej., Tierra y Júpiter) muestran ambos planetas a escala relativa.

**3. ⚛️ Química: estructura molecular y modelo atómico**
- Moléculas generadas en tiempo real desde un archivo de datos (coordenadas y enlaces): H₂O, CO₂, CH₄, NH₃, O₂, C₆H₁₂O₆ (glucosa) y más.
- Modelo atómico de Bohr animado (electrones en órbitas) para los primeros 10 elementos.
- Estilos: esferas y barras / relleno espacial; muestra ángulos de enlace.
- **Interacción estrella [OPCIONAL]:** acercar físicamente la tarjeta "H" a la tarjeta "O" para "formar" agua.

**Descartados para la v1 (futuras mejoras):** física (requiere motor de simulación y validación pedagógica compleja), esqueleto (206 piezas), geometría (menor impacto visual en feria). El **cerebro** queda como opcional porque reutiliza todo el pipeline del corazón.

---

## 6. Alcance y limitaciones

### 6.1 Alcance (lo que SÍ se implementa)

| Área | Incluido |
|------|----------|
| Plataforma | Aplicación web (JavaScript, módulos ES) ejecutada en Chrome/Edge en laptop con webcam; funciona en `localhost` y puede desplegarse en un servidor gratuito |
| Marcadores | Tarjetas impresas con marcador ArUco (diccionario 4×4) + ilustración; 12–20 tarjetas |
| RA | Detección, pose 3D y superposición del modelo sobre la tarjeta; suavizado y manejo de pérdida de seguimiento |
| Modo escritorio | Sin cámara o al perder la tarjeta, el modelo puede "anclarse" a la pantalla para seguir explorándolo con el ratón |
| Modelos | Corazón, sistema solar (9 cuerpos), modelo atómico y ≥ 6 moléculas |
| Interacción | Rotar, zoom, seleccionar partes, vista explosionada, animaciones, etiquetas |
| Aprendizaje | Explicaciones por componente, narración TTS en español, exploración guiada y libre |
| Evaluación | Opción múltiple + selección espacial en el modelo, retroalimentación, registro de resultados |
| Docente | Grupos, estudiantes, resultados, estadísticas, edición de textos y preguntas de los módulos |
| Roles | Estudiante, docente y administrador, autenticación JWT |

### 6.2 Limitaciones (declaradas ante el jurado)

1. **RA basada en marcadores, no sin marcadores:** el modelo aparece sobre la tarjeta impresa, no sobre cualquier superficie; esto se elige a propósito porque es mucho más estable en una laptop.
2. **Webcam frontal:** la experiencia es tipo "espejo" (el estudiante sostiene la tarjeta frente a la pantalla); no hay percepción de profundidad real ni oclusión por la mano.
3. **Dependencia de iluminación y estado de la tarjeta:** reflejos, tarjetas dobladas o marcadores muy pequeños reducen la detección. Las tarjetas se imprimen en mate y se enmican en mate.
4. **No se reconocen dibujos libres hechos a mano** en la v1; el reconocimiento usa marcadores impresos (ver futuras mejoras).
5. **Contenido limitado** a los 3 módulos seleccionados; los modelos son didácticos, no de precisión médica o científica.
6. **Gestos de mano (HoloHands) son opcionales** y se desactivan si afectan el rendimiento; la interacción principal es con ratón/táctil.
7. **La narración depende de las voces del sistema operativo/navegador** (Web Speech API).
8. **La creación de nuevos módulos 3D desde el panel docente** se limita a asociar un modelo GLB ya preparado y escribir sus textos y preguntas; no incluye un editor 3D.
9. **La validación pedagógica** es una prueba piloto pequeña (≈ 20 estudiantes), no un estudio con validez estadística general.

### 6.3 Futuras mejoras (fuera de alcance)
RA sin marcadores (WebXR en celulares), reconocimiento de dibujos hechos a mano con un modelo de clasificación, tarjetas creadas por el docente con imagen propia (image tracking con MindAR), modo multijugador en clase, más materias (física con simulación, geometría, esqueleto), app móvil, accesibilidad avanzada (subtítulos de señas), tutor con IA generativa, exportación a LMS (Moodle/Classroom vía LTI).
