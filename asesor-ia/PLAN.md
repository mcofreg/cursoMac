# Plan — "El asesor IA de Fintual"

## Técnica elegida

**Imagen: Canvas 2D vectorial + Chromium headless (Playwright) + ffmpeg.**
- Todo se dibuja con primitivas (polígonos, arcos, gradientes, texto) en una proyección isométrica propia (`iso(x,y,z)`): cajas, muros, planos inclinados para texto sobre paredes.
- Elegido sobre Python/Pillow (sin antialiasing decente ni gradientes ni sombras) y sobre SVG/Lottie (más lento de iterar para un diorama con ~40 objetos animados). Canvas da antialiasing, brillos neón (`shadowBlur`), tipografía real (Inter + DejaVu Sans Mono) y es determinista: `renderFrame(t)` siempre dibuja lo mismo para el mismo `t`.
- El mismo `index.html` sirve para previsualizar en vivo y para renderizar: `tools/render.js` pide cada frame, captura el `<canvas>` en PNG y lo envía por tubería a ffmpeg (sin escribir miles de PNG en disco), en 3 procesos paralelos.
- Cámara 2D (paneo + zoom con interpolación suave) sobre el mundo isométrico: acercamiento a cada estación y plano general al inicio y al final.

**Sonido: síntesis en Node (`tools/audio.js`), sin archivos externos.**
- Osciladores (seno, triángulo, sierra, cuadrada), ruido blanco filtrado (paso bajo/alto de un polo), envolventes exponenciales, FM simple para el piano eléctrico, parciales inarmónicos para campanas.
- Cada efecto lo dispara un evento de `tl.events`, la **misma** lista que usa la animación (`src/timeline.js`). El paneo estéreo sale de la posición en pantalla del robot o de la persona en ese instante.
- Música lo-fi en bucle (96 BPM, Cmaj7–Am7–Fmaj7–G): pad, bajo, arpegio FM, bombo y shaker suaves. Ducking automático: la música baja hasta −6 dB cuando suena un efecto (seguidor de envolvente).
- Pistas WAV separadas (efectos, música, mezcla) y MP4 con la mezcla normalizada a −16 LUFS.

## Flujo de datos

```
data.json ──► src/timeline.js (build) ──► pasos, títulos, cámara, expresiones, burbujas, hojas del expediente, EVENTOS
                                   ├──► src/scene.js  → frames (Canvas) → render.js → ffmpeg → MP4
                                   └──► tools/audio.js → efectos.wav / musica.wav / mezcla.wav
```

## Escenas (59,1 s, 30 fps)

| Tiempo | Escena | Estación (herramienta) | Título en pantalla |
|---|---|---|---|
| 0–3,2 | Plano general del diorama, etiquetas "asesor IA" y "persona del equipo" | — | **El asesor IA de Fintual** |
| 3,2–5,8 | Burbuja entra por la ventanilla (canal: app) | LEER (`leer_mensaje`) | 1. El cliente escribe |
| 5,8–7,7 | Robot piensa, clava una tarjeta en "consulta" | ENTENDER (`clasificar_pedido`) | 2. Entiende qué necesita |
| 7,7–9,7 | Se abre el cajón APORTES | REVISAR CUENTA (`consultar_cuenta`) | 3. Consulta y calcula |
| 9,7–11,9 | Engranajes, se atasca, chispas y humo | CALCULAR (`calcular_simular`) | (sigue) |
| 11,9–14,1 | Lupa; semáforo ROJO: el monto no cuadra | VERIFICAR (`verificar_respuesta`) | 4. Verifica antes de responder |
| 14,1–15,9 | Recalcula, imprime el rollo | CALCULAR | Si no cuadra… lo corrige |
| 15,9–17,7 | Semáforo VERDE, alivio | VERIFICAR | (sigue) |
| 17,7–20,1 | Telégrafo, burbuja sale; celebra; hojas al cajón "CERRADOS" | RESPONDER (`responder`) | 5. Responde y cierra |
| 20,1–22,1 | Reclamo por correo | LEER | Caso 2: un reclamo |
| 22,1–24,3 | Cajón RESCATES, alarma roja, el gato se despierta | REVISAR CUENTA | Un dato no cuadra |
| 24,3–27,9 | Pregunta al cliente; llega el dato corregido | RESPONDER → LEER | Pide el dato correcto |
| 27,9–30,1 | Palanca, tubos neumáticos con monedas | EJECUTAR (`ejecutar_operacion`) | Reprocesa el rescate |
| 30,1–32,1 | Semáforo verde | VERIFICAR | — |
| 32,1–35,9 | Responde y ofrece persona → "prefiero al asesor IA 🙂" | RESPONDER | Responde y cierra |
| 35,9–37,8 | Situación excepcional (web) | LEER | Caso 3: algo excepcional |
| 37,8–39,8 | Expediente: hojas en la mochila | REVISAR CUENTA | El contexto crece |
| 39,8–42,1 | Libro de políticas, "?" | BUSCAR (`buscar_ayuda`) | No hay una regla clara |
| 42,1–44,7 | Tira la cuerda, campana, la persona baja | DERIVAR A PERSONA (`derivar_a_humano`) | ¿Necesita criterio? Llama a alguien |
| 44,7–47,3 | Entrega la mochila; la persona hojea y asiente | — | Le entrega todo el contexto |
| 47,3–49,1 | Sello "DECISIÓN ✓", devuelve mochila con hoja dorada | — | — |
| 49,1–51,5 | Responde y cierra | RESPONDER | 5. Responde y cierra |
| 51,5–59,1 | Café frente a la TV (que muestra esta animación) y plano general | — | **IA en primera línea. Personas cuando hacen falta.** |

Indicadores fijos: ciclo ENTENDER → ACTUAR → VERIFICAR (abajo), CASO n/3 (arriba a la derecha), EXPEDIENTE con las hojas acumuladas (abajo a la izquierda) y una línea "herramienta → resultado" en cada paso.
