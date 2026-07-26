# ⚽ MUNDIAL 2026 · CAPTAIN FIGHTERS

Juego de lucha 2D estilo **Super Nintendo** en el que se enfrentan los **capitanes de las
selecciones del Mundial 2026**. Hecho para jugar **en el móvil**, con mandos táctiles en pantalla.

Todo funciona sin conexión y sin instalar nada: es HTML + CSS + JavaScript puro, sin librerías,
sin imágenes y sin sonidos externos (los gráficos se dibujan en un `<canvas>` de 480×270 y la
música y los efectos se sintetizan con WebAudio).

## Cómo jugar en el teléfono

1. **GitHub Pages** (lo más cómodo): en el repositorio, *Settings → Pages → Deploy from a branch*,
   elige la rama y guarda. Después abre en el móvil:
   `https://<tu-usuario>.github.io/<repositorio>/mundial2026/`
2. **Sin internet**: copia la carpeta `mundial2026` al teléfono y abre `index.html` con el navegador.
3. En el ordenador basta con abrir `mundial2026/index.html`.

Consejos: gira el teléfono en horizontal para ver mejor el campo, y pulsa el botón **⛶** para
pantalla completa. En vertical también se juega bien: el campo queda arriba y los mandos abajo.

## Controles

| Móvil | Teclado | Acción |
|---|---|---|
| ▲ | ↑ / W | Saltar (con ◀ ▶ salta en diagonal) |
| ▼ | ↓ / S | Agacharse (▼ + P/K = golpes bajos) |
| ◀ ▶ | ← → / A D | Caminar · **hacia atrás = bloquear** |
| P | J / Z / Espacio | Puñetazo rápido |
| K | K / X | Patada fuerte |
| S | L / C | Especial: dispara el balón |
| SUPER | I / V | Chilena (necesita la barra azul al 100%) |

Toca el reloj durante el combate para **pausar**.

## Reglas

- Partidos al mejor de 3 rondas, 75 segundos por ronda.
- El **barrido** (▼+K) derriba; los ataques desde el salto no se bloquean agachado, y los
  golpes bajos no se bloquean de pie.
- La barra azul sube al golpear, al recibir y al bloquear. Al 100% se puede lanzar el súper.
- **Copa Mundial**: 4 rondas (octavos, cuartos, semifinal y final) hasta levantar el trofeo.
- **Partido amistoso**: eliges tu capitán y el de la máquina.
- La dificultad (fácil / normal / difícil), el capitán elegido y las copas ganadas se guardan
  en el navegador.

## Plantilla

16 capitanes con estadísticas propias de fuerza, velocidad y defensa:

Argentina (Messi) · Brasil (Marquinhos) · México (E. Álvarez) · Estados Unidos (Pulisic) ·
Canadá (A. Davies) · España (Morata) · Francia (Mbappé) · Inglaterra (Kane) ·
Portugal (Ronaldo) · Alemania (Kimmich) · Países Bajos (Van Dijk) · Croacia (Modrić) ·
Uruguay (Giménez) · Colombia (James) · Japón (Endō) · Marruecos (Hakimi)

Cada uno tiene su propio equipaje, su especial y su súper.

## Ficheros

```
mundial2026/
├── index.html   estructura y mandos táctiles
├── style.css    diseño adaptable (horizontal y vertical)
└── game.js      motor del juego: combate, IA, escenarios, audio y menús
```

Proyecto de aficionado sin ánimo de lucro, sin relación con la FIFA ni con los futbolistas
mencionados.
