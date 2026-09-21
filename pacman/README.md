# Pac Web

Juego estilo Pac-Man hecho en HTML5 + Canvas, pensado para jugarse en el iPhone
con el dedo. Es una **Progressive Web App (PWA)**: se instala desde Safari en la
pantalla de inicio, se abre a pantalla completa como cualquier app y funciona
sin conexión una vez cargado.

## ¿Por qué no hay un `.dmg`?

Un archivo `.dmg` es una imagen de disco de **macOS**; el iPhone no puede abrirlo
ni instalarlo. Las apps nativas de iPhone se distribuyen como `.ipa` y solo se
pueden instalar con Xcode y una cuenta de desarrollador de Apple, o a través del
App Store / TestFlight. La forma directa de tener el juego en el iPhone sin pasar
por eso es instalarlo como PWA, que es lo que hace este proyecto.

## Instalar en el iPhone

Necesitas que el juego esté publicado en una URL con HTTPS. La opción más
sencilla es GitHub Pages, que es gratis y forma parte de este mismo repositorio.

### Opción A: GitHub Pages (recomendada)

1. En GitHub abre el repositorio y ve a **Settings → Pages**.
2. En *Build and deployment* elige **Deploy from a branch**, rama `master`,
   carpeta `/ (root)`, y guarda.
3. Tras un minuto el juego quedará en:
   `https://mcofreg.github.io/cursoMac/pacman/`
4. En el iPhone abre esa URL en **Safari** (tiene que ser Safari, no Chrome).
5. Pulsa el botón **Compartir** (el cuadrado con la flecha hacia arriba) y elige
   **Añadir a pantalla de inicio**.
6. Aparece el icono "Pac Web" en la pantalla de inicio. Al abrirlo se ve a
   pantalla completa, sin barra de direcciones, y sigue funcionando sin Internet.

### Opción B: probarlo desde el Mac en la misma Wi-Fi

Sin publicar nada, para una prueba rápida:

```bash
cd pacman
python3 -m http.server 8000
```

Busca la IP del Mac (Ajustes → Wi-Fi → botón (i) de tu red) y abre en el iPhone
`http://IP-DEL-MAC:8000/`. Así se juega y se puede añadir a la pantalla de
inicio, pero al ser HTTP el modo sin conexión no queda activo.

### Opción C: en el propio Mac

Abre `pacman/index.html` en el navegador o usa el servidor de la opción B con
`http://localhost:8000/`. Se controla con las flechas o WASD.

## Controles

| Acción | iPhone | Mac |
| --- | --- | --- |
| Moverse | Deslizar el dedo sobre el tablero o usar la cruceta | Flechas o WASD |
| Pausar | Botón `II` | Espacio, `P` o Esc |
| Sonido | Botón `♪` | `M` |

El giro se "guarda": si pulsas una dirección antes de llegar al cruce, Pac gira
en cuanto puede.

## Mecánicas

- 4 fantasmas con la personalidad clásica: Blinky persigue, Pinky se adelanta,
  Inky flanquea e Clyde se acobarda de cerca. Alternan fases de dispersión y
  persecución.
- Píldoras de poder: los fantasmas se vuelven azules y se pueden comer
  (200, 400, 800 y 1600 puntos en cadena). Parpadean antes de recuperarse y, al
  ser comidos, sus ojos vuelven a la casa y salen de nuevo.
- Túnel lateral que conecta ambos lados del laberinto.
- Fruta de bonus dos veces por nivel; cambia según el nivel.
- Vida extra a los 10 000 puntos. El récord se guarda en el dispositivo.
- Cada nivel aumenta la velocidad y acorta el tiempo de susto.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura de la pantalla: marcador, tablero, cruceta y botones. |
| `style.css` | Diseño adaptado al móvil, con márgenes seguros para el notch. |
| `game.js` | Motor del juego: laberinto, movimiento, fantasmas, dibujo, sonido y controles. |
| `manifest.webmanifest` | Metadatos de la PWA (nombre, icono, pantalla completa, orientación). |
| `sw.js` | Service worker que guarda el juego en caché para usarlo sin conexión. |
| `icon-*.png`, `apple-touch-icon.png` | Iconos para la pantalla de inicio. |

Si cambias algo del juego y ya lo tenías instalado, sube el número de versión en
`sw.js` (`pacweb-v1` → `pacweb-v2`) para que el iPhone descargue la versión nueva.

## Si más adelante quieres una app nativa

El juego se puede envolver en un proyecto de Xcode con una `WKWebView` que
cargue estos mismos archivos, y desde el Mac instalarlo por cable en el iPhone
con tu Apple ID (sin pagar la cuenta de desarrollador, la firma caduca cada 7
días). Es el paso natural si quieres subirlo al App Store.
