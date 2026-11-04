# 09 · Exposición, Demostración y Preguntas del Jurado — HoloClass

## 1. Preparación del stand

- Laptop de demo **calibrada** + monitor grande orientado al público + bocinas.
- **Aro de luz difusa** frente a la mesa (sin luz directa sobre las tarjetas).
- Mesa con las tarjetas exhibidas en atriles por materia (rojo, violeta, verde) y **3 juegos de repuesto**.
- Mouse inalámbrico para que el jurado interactúe.
- Usuario **estudiante demo** y **docente demo** con datos reales del piloto.
- **Plan B:** laptop de respaldo, modo sin cámara, video de 90 s.
- Póster: problema → cómo funciona (diagrama) → resultados del piloto (ganancia, SUS, FPS) → equipo.

## 2. Guion de la demostración (5 minutos)

| Tiempo | Quién | Qué se dice / hace |
|--------|-------|--------------------|
| **0:00 – 0:30** · Problema | I5 | Muestra una lámina impresa del corazón. *"¿Pueden decirme qué cavidad está detrás de cuál? En los libros, el corazón, el sistema solar o una molécula son dibujos planos, aunque sean objetos 3D. Muchos estudiantes los memorizan sin entenderlos, y el profesor no sabe exactamente qué parte no quedó clara."* |
| **0:30 – 0:45** · Solución | I5 | *"HoloClass convierte una tarjeta de papel en una lección 3D interactiva, con una laptop normal y sin gafas especiales."* |
| **0:45 – 1:30** · Aparición | I1 | Toma la tarjeta **Corazón**, la acerca a la cámara → el corazón **brota** de la tarjeta y empieza a latir. Gira e inclina la tarjeta: el corazón la sigue. *"La cámara reconoce el marcador de la esquina y calcula su posición y ángulo 30 veces por segundo, todo dentro del navegador."* La aleja y la acerca (zoom físico). La tapa con la mano → se desvanece → la destapa → reaparece al instante. |
| **1:30 – 2:20** · Exploración | I3 | Pulsa **📌 Fijar**. Gira el modelo con el ratón y hace clic en el **ventrículo izquierdo**: se resalta y la narración explica su función. Activa **💥 Explosionar** (las partes se separan) y el **corte** con el control deslizante → se ve el interior. Activa **flujo sanguíneo** (partículas rojas y azules). |
| **2:20 – 2:50** · Más materias | I2 | Pone la tarjeta **Tierra** y luego **Júpiter** al lado → aparecen ambos planetas **a escala relativa**: *"Así de grande es Júpiter comparado con la Tierra."* Cambia a la tarjeta **H₂O**: la molécula aparece con su ángulo de 104.5°. *"Las moléculas se generan por código a partir de datos científicos públicos: agregar una nueva es agregar un archivo."* |
| **2:50 – 3:50** · Cuestionario con el jurado | I3 + **jurado** | Le ofrece el mouse a un **miembro del jurado**: *"¿Nos ayuda?"* Cuestionario de 3 preguntas: una de opción múltiple y **dos espaciales**: *"Toque en el modelo la cavidad que envía sangre a los pulmones."* El jurado señala una parte → retroalimentación inmediata (verde/rojo + explicación). Al final, pantalla de resultados con estrellas y desglose por concepto. |
| **3:50 – 4:30** · Panel docente | I4 | Cambia al docente demo: *"Estos son los resultados reales de nuestra prueba piloto con N estudiantes."* Muestra el **concepto más difícil** (con la parte del modelo resaltada), el mapa de calor de partes consultadas y la **ganancia pre/post del grupo**. Abre el asistente de nuevo módulo: subir un GLB, nombrar partes y asignar un marcador libre. |
| **4:30 – 5:00** · Cierre | I5 | *"HoloClass funciona en cualquier laptop, cuesta lo que cuesta imprimir unas tarjetas y le da al profesor información que hoy no tiene. En nuestro piloto, la ganancia de aprendizaje fue de [valor] contra [valor] con material impreso. Los invitamos a tomar una tarjeta y probarlo."* |

**Momentos "wow" planeados:**
1. El corazón brota de la tarjeta y la sigue al girarla.
2. Tapar y destapar: recuperación instantánea.
3. Vista explosionada + corte.
4. Dos tarjetas lado a lado: comparación a escala.
5. El jurado responde señalando el modelo 3D.
6. [OPC] Juntar las tarjetas H y O → se forma la molécula de agua.
7. [OPC] Girar el modelo con la mano en el aire (HoloHands).

**Reglas:**
- Todos los integrantes hablan.
- Si falla la detección: *"Por eso existe el modo Fijar"* → continuar en modo sin cámara.
- Al final, dejar que el jurado tome cualquier tarjeta y la pruebe por su cuenta (la RA es robusta; es la mejor prueba de que funciona).
- Mínimo 10 ensayos cronometrados, en el lugar de la feria si es posible.

## 3. Guion de exposición extendida (8–10 min, si se solicita)
1. Problema y evidencia sobre RA en educación (1 min)
2. Objetivos, alcance y qué **no** hace (1 min)
3. Por qué RA con marcadores en navegador (comparación de enfoques) (1 min)
4. Arquitectura y pipeline de RA (1.5 min)
5. Producción de modelos 3D y licencias (1 min)
6. Demostración (5 min)
7. Resultados: métricas técnicas y piloto (1 min)
8. Limitaciones, trabajo futuro y comercialización (0.5 min)

---

## 4. Preguntas difíciles del jurado y respuestas

**1. ¿Esto no es solo un visor 3D con una cámara?**
No. Un visor muestra un objeto; HoloClass cierra el ciclo de aprendizaje: exploración con explicaciones por parte, narración, recorrido guiado, evaluación **ligada al modelo** (se responde señalando el 3D) y analítica para el docente sobre qué se exploró y qué se falló. Además medimos su efecto con un pre-test y un post-test.

**2. ¿Por qué marcadores y no realidad aumentada sin marcadores?**
La RA sin marcadores necesita detectar superficies, lo que requiere celulares con ARCore/ARKit; con la webcam de una laptop no es confiable. Los marcadores ArUco dan una pose precisa, se detectan en milisegundos, toleran cambios de luz y tienen un ID que nunca se confunde. Para una demo en vivo y para un salón de clases real, la estabilidad es lo prioritario.

**3. ¿Por qué no usan las ilustraciones directamente como marcadores?**
Es posible con *image tracking* (MindAR), pero es más sensible a la luz, al desenfoque y a la textura de la imagen, y consume más CPU. Lo dejamos como mejora futura para que los docentes creen tarjetas con sus propias imágenes. La tarjeta ya combina la ilustración con el marcador.

**4. ¿Dónde está la visión artificial? ¿Solo usaron una librería?**
La visión artificial está en la detección de marcadores (umbral adaptativo, detección de contornos, extracción de cuadriláteros, lectura del código binario) y en la **estimación de pose** con la calibración de la cámara que hicimos con OpenCV. Implementamos el filtro de suavizado, la máquina de estados de seguimiento y la proyección de la cámara virtual. Y medimos su desempeño con nuestro propio banco de pruebas en Python. Usar librerías probadas es buena ingeniería; nuestro trabajo es integrarlas, calibrarlas, hacerlas estables y medirlas.

**5. ¿Por qué la detección corre en el navegador y no en Python?**
Porque enviar cada frame a un servidor y regresar la pose agrega retraso y hace que el modelo "tiemble" o se quede atrás. En el navegador, dentro de un Web Worker, la latencia es mínima y funciona incluso sin internet. Python lo usamos para generar marcadores, calibrar y medir.

**6. ¿Cómo garantizan el rendimiento en laptops normales?**
Con presupuestos de polígonos (≤ 150 mil triángulos por escena), compresión meshopt/Draco y texturas WebP, detección en un hilo aparte sobre un frame reducido, iluminación sencilla y calidad adaptativa si los FPS bajan. Medimos [valor] FPS en una laptop con gráficos integrados.

**7. ¿Los modelos 3D son suyos? ¿Tienen derechos para usarlos?**
Los obtuvimos de fuentes con licencias abiertas (CC0, CC BY o dominio público, como texturas de Solar System Scope y datos de PubChem) y los adaptamos: segmentación, animación y optimización en Blender. Cada recurso tiene su registro de licencia y la aplicación incluye una pantalla de créditos. Las moléculas y el sistema solar se generan por código.

**8. ¿El contenido es correcto científicamente?**
Los textos los redactó el equipo con fuentes de referencia y los revisó un docente de ciencias. Los modelos son **didácticos**, no de precisión médica; así lo indicamos.

**9. ¿Cómo saben que los estudiantes aprenden más?**
Hicimos un piloto con [N] estudiantes: grupo control con lámina impresa y grupo con HoloClass, mismo pre-test y post-test. Medimos la ganancia normalizada de Hake: [valores]. Somos claros en que con esa muestra el resultado es indicativo, no concluyente; un estudio formal sería el siguiente paso.

**10. ¿No es solo el efecto novedad?**
Es una limitación real que reconocemos. Para separarlo haría falta un estudio de varias semanas. Lo que sí podemos afirmar es que las preguntas espaciales, que son las más difíciles con material plano, mostraron [resultado].

**11. ¿Qué pasa si una escuela no tiene buena iluminación o las tarjetas se maltratan?**
Usamos enmicado mate, marcadores con margen blanco y mensajes de ayuda automáticos. Si la detección falla, el modo "Fijar" y el modo sin cámara permiten seguir aprendiendo con el ratón. Reimprimir una tarjeta cuesta unos pesos.

**12. ¿El docente puede crear contenido sin programar?**
Sí, dentro de lo que definimos: puede editar explicaciones y preguntas, y crear un módulo nuevo subiendo un modelo GLB ya preparado, nombrando sus partes y asignándole un marcador libre. Lo que no incluye es un editor 3D; eso es una mejora futura.

**13. ¿Qué hacen con los datos de los estudiantes?**
Guardamos solo lo necesario: nombre, grupo, interacciones y resultados. **El video de la cámara nunca sale de la laptop** ni se guarda. Las contraseñas se almacenan cifradas con bcrypt y el acceso es por rol.

**14. ¿Por qué solo tres materias?**
Elegimos con una matriz de decisión: impacto visual, valor del 3D para el tema, disponibilidad de modelos con licencia y esfuerzo de producción. Preferimos tres módulos sólidos a cinco incompletos. La arquitectura permite agregar más: el corazón, el sistema solar y la química demuestran los tres tipos de contenido (modelo anatómico, modelos procedurales con texturas y modelos generados desde datos).

**15. ¿Los gestos con la mano funcionan?**
Son una función opcional: [si entró] funcionan en modo Fijado con MediaPipe y se desactivan solos si bajan los FPS. [Si no entró] Los dejamos fuera de la versión de feria porque comprometían la estabilidad; preferimos una demo confiable.

**16. ¿Es comercializable?**
Sí: kits de tarjetas más licencia escolar, alianzas con editoriales para libros aumentados y museos. Las librerías principales (Three.js, js-aruco2: MIT; MediaPipe: Apache 2.0) permiten uso comercial; para venderlo usaríamos solo modelos CC0/CC BY o propios.

**17. ¿Qué aportó cada integrante?**
Cada quien explica su rol con un problema concreto que resolvió (p. ej., I1: eliminar el temblor con el filtro One-Euro; I2: reducir el corazón de 400 mil a 58 mil triángulos sin perder detalle).

**18. ¿Qué harían con seis meses más?**
Versión móvil con WebXR, tarjetas personalizadas del docente con image tracking, reconocimiento de dibujos hechos a mano, más materias (física con simulación, geometría), modo competencia en clase e integración con Classroom/Moodle.

---

## 5. Checklist del día de la feria
- [ ] Laptop principal y de respaldo **calibradas** y cargadas; extensión eléctrica
- [ ] Servidor y BD iniciados 30 min antes; `reset_demo.sql` ejecutado
- [ ] Modelos precargados (abrir cada módulo una vez para llenar la caché)
- [ ] 3 juegos de tarjetas, limpias y planas
- [ ] Aro de luz, monitor, bocinas, mouse inalámbrico
- [ ] Probar la detección en la mesa real y ajustar la posición de la luz
- [ ] Video de respaldo en el escritorio
- [ ] Póster con **valores reales** del piloto (ganancia, SUS, FPS)
- [ ] Pantalla de créditos y `LICENSES.md` disponibles por si el jurado pregunta
