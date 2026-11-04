# 08 · Evaluación del Proyecto y Métricas — HoloClass

## 1. Innovación
- **RA educativa sin hardware especial:** laptop + papel, abierta en un navegador.
- **Evaluación espacial ligada al modelo:** el estudiante no solo elige una respuesta, **la señala en el 3D**. Esto mide comprensión espacial, algo que un cuestionario de texto no puede medir.
- **Puente físico-digital:** las tarjetas siguen siendo material didáctico útil sin la cámara; la RA las potencia.
- **Analítica de aprendizaje** que conecta lo que se exploró con lo que se respondió (qué partes vio, cuánto tiempo, en qué falló).
- **Contenido escalable por datos:** moléculas procedurales y marcadores libres asignables desde el panel docente.

## 2. Complejidad técnica

| Componente | Dificultad (1–5) | Reto principal |
|------------|:---:|----------------|
| Detección ArUco y pose en navegador | 3 | Precisión de pose, calibración, coordenadas espejo |
| Estabilidad del seguimiento | 4 | Temblor, pérdidas, varias tarjetas a la vez |
| Render 3D en tiempo real sobre video | 3 | Alinear la cámara virtual con la real; rendimiento en GPU integrada |
| Preparación de modelos 3D | 4 | Segmentar, animar y optimizar sin perder calidad |
| Selección de partes y preguntas espaciales | 3 | Raycasting sobre modelos animados/explosionados |
| Backend, BD y analítica | 2 | Estándar |
| HoloHands [OPC] | 4 | Rendimiento compartido con la detección; gestos robustos |
| **Global** | **3.5 / 5 — Intermedio-alto** | Factible con alcance controlado |

## 3. Viabilidad

| Tipo | Evaluación |
|------|-----------|
| Técnica | ✅ Tecnologías maduras y documentadas; la prueba de concepto (cubo en RA) se valida en la semana 1 |
| Económica | ✅ $1,650–$3,590 MXN; software y contenido sin costo |
| Temporal | ✅ 3 módulos y gestos opcionales; feature freeze en la semana 6 |
| Operativa | ✅ Cualquier escuela con laptops; las tarjetas se imprimen en cualquier papelería |
| Legal | ✅ Con registro de licencias de cada recurso (CC0 / CC BY / dominio público) |

## 4. Costos
Ver [07_Cronograma_y_Presupuesto.md](07_Cronograma_y_Presupuesto.md#4-presupuesto-pesos-mexicanos). Para una escuela, el costo marginal de usarlo es el de imprimir y enmicar las tarjetas (≈ $15 MXN por tarjeta).

## 5. Riesgos y mitigación

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Reflejos de luz en la tarjeta impiden la detección | Alta | Alto | Enmicado mate; aro de luz difusa; marcador con margen blanco amplio |
| Temblor del modelo | Media | Medio | Filtro One-Euro; calibración; marcador de 5 cm mínimo |
| FPS bajos en la laptop de la demo | Media | Alto | Presupuestos de polígonos, calidad adaptativa, Worker; probar en la laptop más modesta |
| Modelo 3D con licencia incompatible | Media | Alto | Registro de licencias obligatorio; solo CC0/CC BY/dominio público |
| Retraso en la segmentación del corazón | Media | Alto | BodyParts3D ya viene segmentado; plan B: modelo estilizado más simple |
| HoloHands inestable | Alta | Bajo | Es opcional; solo en modo Anclado; se desactiva automáticamente |
| Contenido educativo con errores | Media | Alto | Revisión por un docente de ciencias asesor |
| Pocos participantes en el piloto | Media | Medio | Coordinar desde la semana 3 con una secundaria/bachillerato cercano o con estudiantes de primer semestre |
| Falla en vivo | Baja | Muy alto | Laptop de respaldo calibrada, modo sin cámara, video de respaldo, tarjetas de repuesto |

## 6. Rendimiento (metas técnicas)

| Indicador | Meta | Cómo se mide |
|-----------|------|--------------|
| **Tasa de detección del marcador** | ≥ 95 % de frames con la tarjeta visible a 30–80 cm, inclinación ≤ 45°, iluminación interior normal | `tools/benchmark_detection.py` sobre videos grabados con condiciones controladas |
| **Distancia máxima de detección** | ≥ 1 m con marcador de 5 cm | Prueba con cinta métrica |
| **Falsos positivos** (ID equivocado) | 0 en 10 min de video | Mismo benchmark |
| **Latencia de detección** | ≤ 50 ms por frame en Worker | `performance.now()` |
| **Tiempo hasta que aparece el modelo** | ≤ 0.5 s desde que la tarjeta entra en cuadro | Video a 60 FPS + conteo de frames |
| **Recuperación tras oclusión** | ≤ 0.5 s | Prueba de tapar/destapar 20 veces |
| **Temblor (jitter)** | Desviación estándar de la posición del modelo con la tarjeta quieta ≤ 2 mm | Registro de poses durante 10 s |
| **FPS de render** | ≥ 30 (meta 60) con detección activa; ≥ 25 con HoloHands | `stats.js` en 3 laptops diferentes |
| **Tiempo de carga del módulo** | ≤ 3 s en red local; ≤ 1 s desde caché | DevTools |
| **Precisión de selección de partes** | ≥ 95 % de clics seleccionan la parte deseada | 50 intentos por modelo |
| **Respuesta de la API** | ≤ 200 ms (p95) | Logs de FastAPI |
| **Precisión de gestos [OPC]** | ≥ 85 % de gestos reconocidos | 30 intentos por gesto |

## 7. Experiencia del usuario

| Indicador | Meta | Instrumento |
|-----------|------|-------------|
| **SUS** (System Usability Scale) | ≥ 75 ("bueno-excelente") | Cuestionario SUS estándar de 10 ítems |
| Éxito en tareas sin ayuda | ≥ 90 % (escanear, seleccionar 3 partes, completar quiz) | Observación con protocolo |
| Tiempo para la primera interacción exitosa | ≤ 60 s desde el login | Cronómetro |
| Motivación | Media ≥ 4/5 | Encuesta breve basada en el modelo ARCS (atención, relevancia, confianza, satisfacción) |
| Satisfacción del docente | ≥ 4/5 | Entrevista a 2–3 docentes |

## 8. Impacto educativo

**Diseño de la prueba piloto (semana 7):**
- Participantes: ≥ 20 estudiantes del mismo nivel, divididos en dos grupos:
  - **Grupo control:** estudia el tema del corazón con una lámina impresa durante 15 min.
  - **Grupo HoloClass:** explora el mismo contenido durante 15 min con la plataforma.
- Ambos presentan el **mismo pre-test y post-test** (8 preguntas, incluidas 3 de razonamiento espacial en formato de imagen para que sea justo con el grupo control).
- **Métrica principal: ganancia normalizada de Hake** `g = (post − pre) / (100 − pre)`. Interpretación: g < 0.3 baja, 0.3–0.7 media, > 0.7 alta.
- **Métricas secundarias:** aciertos en preguntas espaciales, tiempo en tarea, motivación (ARCS), SUS.
- **Honestidad metodológica:** con n ≈ 20 el resultado es **indicativo, no concluyente**; se reporta así ante el jurado, junto con las limitaciones (efecto novedad, muestra pequeña, sesión única).

| Indicador educativo | Meta |
|---------------------|------|
| Ganancia normalizada del grupo HoloClass | ≥ 0.4 (media) |
| Diferencia de ganancia vs. grupo control | Positiva |
| Aciertos en preguntas espaciales | ≥ 75 % |
| Partes exploradas antes del quiz | ≥ 80 % en promedio |

## 9. Posibilidades de comercialización

| Modelo de negocio | Descripción |
|-------------------|-------------|
| **Kits de tarjetas + licencia escolar** | Paquete físico de tarjetas por materia + acceso a la plataforma por grupo (p. ej., $1,500 MXN/año por grupo) |
| Freemium para docentes | 1 grupo y 3 módulos gratis; plan escolar con todos los módulos y analítica |
| Editoriales de libros de texto | Licenciar el motor para que sus libros incluyan marcadores ("libros aumentados") |
| Museos y planetarios | Tarjetas de recuerdo que cobran vida en casa |
| Educación en salud | Material para escuelas de enfermería y técnicos en salud |

**Notas:** los modelos con licencia **CC BY-SA** (p. ej., BodyParts3D) obligan a compartir derivados con la misma licencia; para un producto comercial cerrado conviene usar modelos **CC0/CC BY** o propios. js-aruco2 tiene licencia MIT, Three.js MIT y MediaPipe Apache 2.0, todas compatibles con uso comercial.

## 10. Diferenciación frente a plataformas existentes

| Característica | Visores 3D (Sketchfab, BioDigital) | Apps de RA educativas móviles (p. ej., Merge Cube / apps con marcador) | Plataformas de quiz (Kahoot, Quizizz) | **HoloClass** |
|----------------|:---:|:---:|:---:|:---:|
| Funciona en laptop con webcam, en navegador | ✔ (sin RA) | ✖ (mayormente móvil/tablet) | ✔ | ✔ |
| RA sobre material físico | ✖ | ✔ | ✖ | ✔ |
| Explicación por componente + narración | Parcial | Parcial | ✖ | ✔ |
| Evaluación integrada | ✖ | Parcial | ✔ | ✔ |
| **Preguntas respondidas señalando el modelo 3D** | ✖ | ✖ | ✖ | ✔ |
| Panel docente con analítica de exploración | ✖ | Parcial | ✔ (solo quiz) | ✔ |
| Costo para la escuela | Suscripción | Hardware/licencias | Freemium | Gratis / bajo |

*(Verificar las funciones actuales de cada plataforma antes de la exposición.)*
