# DECISIONES — "El asesor IA de Fintual"

## Técnicas
- **Imagen:** Canvas 2D vectorial con proyección isométrica propia, renderizado frame a frame en Chromium headless (Playwright) y codificado con ffmpeg (H.264, CRF 17, 1920×1080, 30 fps). Sin imágenes, modelos ni generadores externos: todo se dibuja con polígonos, arcos, gradientes y texto.
- **Sonido:** síntesis en Node.js (ondas, ruido filtrado, envolventes, FM, parciales inarmónicos). Sin muestras de audio.
- **Por qué:** Canvas es determinista (mismo `t` → mismo frame), tiene antialiasing, brillos neón y tipografía real, y el mismo HTML sirve para la vista previa en vivo y para el render final. Detalle en `PLAN.md`.

## Flujo técnico
1. `data.json` — 3 casos tipo, cada uno una secuencia ordenada de pasos (estación, fase, resultado, error y corrección).
2. `src/timeline.js` — convierte los pasos en una línea de tiempo: caminatas del robot (con desvío alrededor de la mesa de VERIFICAR), cámara, títulos (mínimo 2 s, sin solaparse), expresiones, burbujas, hojas del expediente, entrega de la mochila y una lista de **eventos**.
3. `src/scene.js` — dibuja el diorama y el HUD para cualquier `t`.
4. `tools/audio.js` — recorre **los mismos eventos** y sintetiza cada efecto en su instante exacto; el paneo sale de la posición del personaje en pantalla.
5. `tools/render.js` — 3 procesos de Chromium en paralelo → PNG por tubería → ffmpeg → concatenado + audio normalizado (−16 LUFS).
6. `tools/keyframes.js` — renderiza frames clave en PNG para revisarlos.

Comandos: `node tools/audio.js && node tools/render.js 3` (vista previa: `npx http-server .` y abrir `index.html`).

## Iteraciones y correcciones (revisión visual de frames clave)
1. **Plano general cortado** arriba y con el título encima de la escena → bajé el zoom (0,72) y moví el título de la intro a la parte inferior.
2. **Letreros que tapaban todo en los acercamientos** → en primeros planos solo se ve el letrero de la estación activa; los demás se desvanecen según el zoom.
3. **Primer plano vacío** → agregué sala de estar (sofá, mesa de café, pisos), dispensador de agua, radio con notas musicales, segunda planta, lámpara de pie y bodega con rack bajo el altillo.
4. **Etiquetas de resultado que tapaban cajones y al gato** → pasaron a una línea fija abajo: `herramienta → resultado` (rojo = error, verde = corrección).
5. **Semáforo de VERIFICAR escondido** detrás del letrero y luego delante del telégrafo → reubiqué mesa, semáforo (más grande) y letrero.
6. **El robot quedaba detrás de la escalera en EJECUTAR** → la sala de máquinas se movió al rincón delantero derecho (además llena el plano general).
7. **El robot atravesaba la mesa de VERIFICAR** → ruteo con puntos de paso.
8. **Entrega de la mochila poco legible** (personajes superpuestos, planta delante) → más separación, cámara más cerca, mochila que vuelca en arco y persona 18 % más alta que el robot.
9. **Respuesta "prefiero al asesor IA" duraba 0,3 s** → alargué el cierre del caso 2 y adelanté la burbuja de salida.
10. **Final:** el texto tapaba el café → el cierre pasa por un plano medio (café frente a la TV que reproduce esta animación) y luego un plano general con el texto arriba.
11. **Audio:** la campana dominaba el pico y la mezcla quedaba baja → bajé su ganancia y normalicé la mezcla final a −16 LUFS.
12. Cejas de "preocupado" se veían enojadas → invertidas.

## Público vs. ilustrativo

| Elemento | Estado | Fuente |
|---|---|---|
| El chat de soporte lo atiende en primera línea un asesor IA | **Público** | DPL News: Fintual "conectó ChatGPT para la atención al cliente" en sept. 2024 |
| La IA trabaja con datos y cálculos del cliente | **Público** | Carta anual del CEO 2024: la IA está "mejor preparada con datos y cálculos, rápido" (vía Chócale) |
| 94 % de respuestas correctas (marca en la pantalla del medidor) | **Público, autorreportado** | Carta anual 2024: "la tasa de respuestas correctas de los asesores IA alcanzó un 94%" |
| Hay clientes que prefieren a la IA ("prefiero al asesor IA 🙂") | **Público** | Carta anual 2024: "Algunos clientes incluso la piden explícitamente" |
| Existe un equipo humano detrás | **Público** | DPL News: el CEO atendió en persona a un usuario en el chat de soporte |
| Canales app / web / correo | Ilustrativo (lo pide el brief) | — |
| Herramientas y nombres técnicos (`consultar_cuenta`, `calcular_simular`, `verificar_respuesta`, `ejecutar_operacion`, `derivar_a_humano`, `clasificar_pedido`…) | **Ilustrativo** | No hay documentación pública de las herramientas internas |
| Verificación antes de responder (semáforo) y corrección del cálculo | **Ilustrativo** | Fintual no describe públicamente sus controles |
| Que la IA reprocese un rescate por sí sola | **Ilustrativo** | No es público qué operaciones ejecuta la IA |
| Cómo y cuándo se deriva a una persona (campana + expediente completo) | **Ilustrativo** | No es público |
| Los 3 casos, mensajes y resultados | **Ilustrativos y anonimizados** | Sin nombres, RUT, correos, números de cuenta ni montos (montos como `$ ••••`) |

**Cifras no usadas:** el 82 % se omitió a propósito: la carta anual lo describe como satisfacción ("buena" o "muy buena") y DPL News como preferencia por la IA. No queda claro cuál de las dos lecturas es la correcta. El medidor de la pantalla sube despacio hasta la marca del 94 %, con la etiqueta "94 % reportado (2024)".

**Sin marcas:** no hay logotipo. El nombre aparece solo como texto en el título, y la paleta (índigo, coral y menta con acentos neón) está inspirada en la marca sin copiarla.

Fuentes:
- Chócale, "Fintual cerró el mejor año de su historia: la carta de Pedro Pineda, su CEO" (mar. 2025): https://chocale.cl/2025/03/fintual-cerro-el-mejor-ano-de-su-historia-la-carta-de-pedro-pineda-su-ceo/
- DPL News, "Fintual busca pasar del billion al trillion en el largo plazo": https://dplnews.com/?p=267992

## Tiempo
- Render del video: ~6 min (352 s, ≈0,58 s por frame y proceso) (3 procesos en paralelo, 4 núcleos). Audio: ~3 s.
- Sesión total (investigación, código, 6 rondas de revisión de frames, render): ~1 h 30 min aprox.
