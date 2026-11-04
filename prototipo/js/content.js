// =====================================================================
//  HoloClass · Contenido educativo del prototipo
//  (en la versión final esto vendrá de la API / PostgreSQL)
// =====================================================================

// Diccionario ArUco usado: ARUCO_MIP_36h12 (js-aruco2). ID -> contenido 3D
export const MARKERS = {
  1: { content: 'heart',   title: 'Corazón humano',   module: 'anatomia' },
  2: { content: 'solar',   title: 'Sistema solar',    module: 'astronomia' },
  3: { content: 'earth',   title: 'La Tierra',        module: 'astronomia' },
  4: { content: 'jupiter', title: 'Júpiter',          module: 'astronomia' },
  8: { content: 'saturn',  title: 'Saturno',          module: 'astronomia' },
  5: { content: 'h2o',     title: 'Agua (H₂O)',       module: 'quimica' },
  6: { content: 'co2',     title: 'Dióxido de carbono (CO₂)', module: 'quimica' },
  7: { content: 'ch4',     title: 'Metano (CH₄)',     module: 'quimica' },
};

export const MODULES = {
  anatomia:   { title: 'El corazón humano', subject: 'Anatomía',  color: '#EF4444', icon: '🫀', main: 'heart', markers: [1],
                desc: 'Cavidades, grandes vasos, latido y flujo sanguíneo.' },
  astronomia: { title: 'El sistema solar',  subject: 'Astronomía', color: '#6366F1', icon: '🪐', main: 'solar', markers: [2, 3, 4, 8],
                desc: 'Planetas, órbitas y comparación de tamaños.' },
  quimica:    { title: 'Geometría molecular', subject: 'Química',  color: '#10B981', icon: '⚛️', main: 'h2o', markers: [5, 6, 7],
                desc: 'Moléculas en 3D generadas a partir de coordenadas reales.' },
};

// Información por contenido y por parte (part_key = nombre de la malla)
export const CONTENT = {
  heart: {
    title: 'Corazón humano',
    intro: 'El corazón es un músculo del tamaño aproximado de un puño que bombea sangre a todo el cuerpo. En este modelo el lado derecho está en azul (sangre con poco oxígeno) y el izquierdo en rojo (sangre oxigenada).',
    parts: {
      auricula_der:   { name: 'Aurícula derecha',   text: 'Recibe la sangre con poco oxígeno que regresa del cuerpo a través de las venas cavas y la pasa al ventrículo derecho.', fact: 'Aquí se encuentra el nodo sinusal, el “marcapasos natural” del corazón.' },
      ventriculo_der: { name: 'Ventrículo derecho', text: 'Bombea la sangre con poco oxígeno hacia los pulmones a través de la arteria pulmonar.', fact: 'Su pared es más delgada que la del izquierdo porque solo envía sangre a los pulmones, que están muy cerca.' },
      auricula_izq:   { name: 'Aurícula izquierda', text: 'Recibe la sangre oxigenada que llega de los pulmones por las venas pulmonares y la pasa al ventrículo izquierdo.', fact: 'Recibe sangre de cuatro venas pulmonares.' },
      ventriculo_izq: { name: 'Ventrículo izquierdo', text: 'Es la cavidad más musculosa. Bombea la sangre oxigenada hacia la aorta para distribuirla a todo el cuerpo.', fact: 'Su pared puede ser hasta tres veces más gruesa que la del ventrículo derecho.' },
      aorta:          { name: 'Arteria aorta',      text: 'Es la arteria más grande del cuerpo. Sale del ventrículo izquierdo, forma un arco y lleva sangre oxigenada a todos los órganos.', fact: 'En un adulto mide unos 2.5 cm de diámetro.' },
      arteria_pulm:   { name: 'Arteria pulmonar',   text: 'Sale del ventrículo derecho y lleva la sangre con poco oxígeno a los pulmones para que se oxigene.', fact: 'Es la única arteria del adulto que transporta sangre con poco oxígeno.' },
      vena_cava:      { name: 'Venas cavas',        text: 'La vena cava superior y la inferior devuelven al corazón la sangre con poco oxígeno de todo el cuerpo y la vierten en la aurícula derecha.', fact: 'La vena cava inferior es la vena más grande del cuerpo.' },
    },
  },
  solar: {
    title: 'Sistema solar',
    intro: 'Ocho planetas giran alrededor del Sol. En este modelo los tamaños y distancias NO están a escala real para que todos sean visibles.',
    parts: {
      sol:      { name: 'Sol',      text: 'Estrella en el centro del sistema solar. Concentra más del 99.8 % de toda su masa.', fact: 'Su luz tarda unos 8 minutos en llegar a la Tierra.' },
      mercurio: { name: 'Mercurio', text: 'El planeta más cercano al Sol y el más pequeño.', fact: 'Un año en Mercurio dura solo 88 días terrestres.' },
      venus:    { name: 'Venus',    text: 'Segundo planeta. Su densa atmósfera de CO₂ lo convierte en el planeta más caliente.', fact: 'Gira en sentido contrario a la mayoría de los planetas.' },
      tierra:   { name: 'Tierra',   text: 'Tercer planeta desde el Sol y el único con vida conocida.', fact: 'Alrededor del 71 % de su superficie está cubierta de agua.' },
      marte:    { name: 'Marte',    text: 'El “planeta rojo”, por el óxido de hierro de su superficie.', fact: 'Tiene el volcán más alto conocido: el Monte Olimpo.' },
      jupiter:  { name: 'Júpiter',  text: 'El planeta más grande: un gigante gaseoso.', fact: 'Su diámetro es unas 11 veces el de la Tierra.' },
      saturno:  { name: 'Saturno',  text: 'Gigante gaseoso famoso por sus anillos de hielo y roca.', fact: 'Su densidad es menor que la del agua.' },
      urano:    { name: 'Urano',    text: 'Gigante de hielo que gira “acostado”, con su eje muy inclinado.', fact: 'Su eje está inclinado unos 98°.' },
      neptuno:  { name: 'Neptuno',  text: 'El planeta más lejano del Sol, con los vientos más rápidos del sistema solar.', fact: 'Sus vientos superan los 2,000 km/h.' },
    },
  },
  earth:   { title: 'La Tierra', intro: 'Nuestro planeta y su satélite natural.', parts: {
      tierra: { name: 'Tierra', text: 'Tercer planeta desde el Sol. Diámetro aproximado: 12,742 km.', fact: 'Activa “Escala real” y muestra también la tarjeta de Júpiter para compararlos.' },
      luna:   { name: 'Luna',   text: 'Satélite natural de la Tierra. Su diámetro es aproximadamente la cuarta parte del terrestre.', fact: 'Siempre nos muestra la misma cara.' } } },
  jupiter: { title: 'Júpiter', intro: 'El gigante del sistema solar.', parts: {
      jupiter: { name: 'Júpiter', text: 'Diámetro aproximado: 139,820 km, unas 11 veces el de la Tierra.', fact: 'La Gran Mancha Roja es una tormenta más grande que la Tierra.' } } },
  saturn:  { title: 'Saturno', intro: 'El planeta de los anillos.', parts: {
      saturno: { name: 'Saturno', text: 'Diámetro aproximado: 116,460 km, unas 9 veces el de la Tierra.', fact: 'Sus anillos miden cientos de miles de km de ancho pero en su mayoría menos de 1 km de grosor.' },
      anillos: { name: 'Anillos', text: 'Formados por miles de millones de fragmentos de hielo y roca.', fact: 'Podrían tener “solo” unos cientos de millones de años.' } } },
  h2o: { title: 'Agua (H₂O)', intro: 'Un átomo de oxígeno unido a dos de hidrógeno. Coordenadas basadas en datos experimentales (ángulo de 104.5°).', parts: {
      O: { name: 'Oxígeno (O)', text: 'Átomo central. Tiene dos pares de electrones libres que “empujan” a los hidrógenos y doblan la molécula.', fact: 'Color CPK: rojo.' },
      H: { name: 'Hidrógeno (H)', text: 'Cada hidrógeno comparte un par de electrones con el oxígeno (enlace covalente sencillo).', fact: 'Color CPK: blanco.' },
      enlaces: { name: 'Enlaces O–H', text: 'Dos enlaces covalentes con un ángulo de 104.5°: por eso el agua es una molécula ANGULAR y polar.', fact: 'Longitud de enlace: 0.96 Å.' } } },
  co2: { title: 'Dióxido de carbono (CO₂)', intro: 'Un carbono unido a dos oxígenos con dobles enlaces.', parts: {
      C: { name: 'Carbono (C)', text: 'Átomo central sin pares libres, por lo que los oxígenos quedan alineados.', fact: 'Color CPK: gris oscuro.' },
      O: { name: 'Oxígeno (O)', text: 'Cada oxígeno forma un doble enlace con el carbono.', fact: 'Color CPK: rojo.' },
      enlaces: { name: 'Dobles enlaces C=O', text: 'Ángulo de 180°: el CO₂ es una molécula LINEAL y no polar.', fact: 'Longitud de enlace: 1.16 Å.' } } },
  ch4: { title: 'Metano (CH₄)', intro: 'Un carbono unido a cuatro hidrógenos.', parts: {
      C: { name: 'Carbono (C)', text: 'Forma cuatro enlaces sencillos distribuidos lo más separados posible.', fact: 'Color CPK: gris oscuro.' },
      H: { name: 'Hidrógeno (H)', text: 'Los cuatro hidrógenos apuntan a los vértices de un tetraedro.', fact: 'Color CPK: blanco.' },
      enlaces: { name: 'Enlaces C–H', text: 'Ángulo de 109.5°: el metano tiene geometría TETRAÉDRICA.', fact: 'Es el principal componente del gas natural.' } } },
};

// Cuestionarios por módulo. type: 'mc' (opción múltiple) | 'pick' (selección espacial en el modelo)
export const QUIZZES = {
  anatomia: [
    { type: 'pick', q: 'Toca en el modelo la cavidad que bombea sangre oxigenada a todo el cuerpo.', answer: 'ventriculo_izq', concept: 'Circulación mayor',
      explain: 'El ventrículo izquierdo impulsa la sangre oxigenada hacia la aorta.' },
    { type: 'mc', q: '¿Cuántas cavidades tiene el corazón humano?', options: ['2', '3', '4', '6'], answer: 2, concept: 'Estructura',
      explain: 'Dos aurículas y dos ventrículos.' },
    { type: 'pick', q: 'Toca la arteria que lleva sangre a los pulmones.', answer: 'arteria_pulm', concept: 'Circulación menor',
      explain: 'La arteria pulmonar sale del ventrículo derecho hacia los pulmones.' },
    { type: 'mc', q: '¿Qué vaso recibe la sangre del ventrículo izquierdo?', options: ['Vena cava', 'Arteria pulmonar', 'Aorta', 'Vena pulmonar'], answer: 2, concept: 'Circulación mayor',
      explain: 'La aorta distribuye la sangre oxigenada a todo el cuerpo.' },
  ],
  astronomia: [
    { type: 'pick', q: 'Toca el planeta más grande del sistema solar.', answer: 'jupiter', concept: 'Tamaños', explain: 'Júpiter es unas 11 veces más ancho que la Tierra.' },
    { type: 'mc', q: '¿Qué planeta está más cerca del Sol?', options: ['Venus', 'Mercurio', 'Marte', 'Tierra'], answer: 1, concept: 'Orden', explain: 'Mercurio es el primer planeta.' },
    { type: 'pick', q: 'Toca el tercer planeta desde el Sol.', answer: 'tierra', concept: 'Orden', explain: 'Mercurio, Venus y luego la Tierra.' },
    { type: 'pick', q: 'Toca el planeta con los anillos más visibles.', answer: 'saturno', concept: 'Características', explain: 'Los anillos de Saturno son los más grandes y brillantes.' },
  ],
  quimica: [
    { type: 'pick', q: 'Toca el átomo de oxígeno de la molécula de agua.', answer: 'O', concept: 'Átomos', explain: 'El oxígeno es el átomo central (rojo).' },
    { type: 'mc', q: '¿Qué geometría tiene la molécula de agua?', options: ['Lineal', 'Angular', 'Tetraédrica', 'Plana trigonal'], answer: 1, concept: 'Geometría', explain: 'Los pares libres del oxígeno doblan la molécula.' },
    { type: 'mc', q: '¿Cuál es el ángulo H–O–H aproximado?', options: ['90°', '104.5°', '120°', '180°'], answer: 1, concept: 'Geometría', explain: 'Es de 104.5°, menor que el tetraédrico (109.5°).' },
    { type: 'mc', q: 'La molécula de CO₂ es…', options: ['Angular', 'Lineal', 'Tetraédrica', 'Piramidal'], answer: 1, concept: 'Geometría', explain: 'Los dos oxígenos quedan a 180°.' },
  ],
};
