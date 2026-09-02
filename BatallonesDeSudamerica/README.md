# Batallones de Sudamérica

Juego de estrategia voxel (estilo Minecraft) en el que recorres Sudamérica al mando de un ejército de
**legiones romanas**, **guerreros incas** o **lanceros rapanui**. Cruzas fronteras, vences a batallones
autónomos que patrullan cada país, ganas oro y lo inviertes en más batallones, hasta poder alinear
decenas de miles de soldados y conquistar las once capitales.

Se juega en el navegador del teléfono (iOS Safari y Android Chrome) y en escritorio. Es una PWA:
se puede añadir a la pantalla de inicio y funciona a pantalla completa y sin conexión.

## Características

- **Continente procedural**: costa real de Sudamérica, Andes, Amazonas, Paraná, Orinoco, Titicaca,
  desierto de Atacama, Patagonia, Pampa; 11 territorios con fronteras y capitales.
- **Millones de soldados** en el mapa, simulados como batallones (SoA) y dibujados 100 % en GPU:
  cada soldado calcula su puesto en la formación en el vertex shader a partir de una textura con los
  datos de su batallón. Tres niveles de detalle (soldado voxel animado, soldado simple, puntos) permiten
  ver todos los ejércitos desde la vista estratégica.
- **Tres civilizaciones equilibradas** con armas, formaciones y habilidades propias:
  - Romanos: muro de escudos, pilum de apertura, *Testudo*.
  - Incas: hondas a distancia, movilidad, *Carrera Chasqui*.
  - Rapa Nui: media luna de lanceros de obsidiana, golpe inicial, *Mana del Moái*.
  - Matriz piedra-papel-tijera: Romanos > Incas > Rapa Nui > Romanos.
- **IA autónoma**: patrullas, hordas y guarniciones deciden cazar, mantener posición o huir según la
  correlación de fuerzas; la moral provoca desbandadas.
- **Economía y desafíos**: oro por bajas, emboscadas y hordas cronometradas, toma de capitales con
  tributo permanente, tienda (reclutar 100/1000/10 000, mejoras, reponer bajas, fusionar).
- **Gráficos**: terreno voxel con oclusión ambiental, sombras suaves, ciclo día/noche con cielo
  procedural, agua con fresnel, nubes voxel, partículas de combate, bloom (ACES tone mapping).
- Guardado automático en el dispositivo.

## Jugar

```bash
npm install
npm run dev        # servidor local (muestra una URL de red para probar desde el teléfono)
npm run build      # genera dist/ (PWA) y dist-single/index.html (un solo archivo)
npm run preview    # sirve dist/
```

Para probar en el iPhone en la misma red Wi‑Fi: ejecuta `npm run dev`, abre en Safari la URL
`http://<ip-del-mac>:5173`, y usa Compartir → “Añadir a pantalla de inicio”.

### Publicación en GitHub Pages

El flujo `.github/workflows/deploy-pages.yml` construye y publica el juego cada vez que se fusiona en
`master`. Hay que activar Pages en el repositorio (Settings → Pages → Source: *GitHub Actions*). La URL
resultante es `https://<usuario>.github.io/<repositorio>/`.

### App nativa (opcional, App Store / Play Store)

El proyecto es web puro, por lo que puede envolverse con Capacitor:

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android
npx cap init "Batallones de Sudamérica" cl.batallones.sudamerica --web-dir dist
npm run build && npx cap add ios && npx cap open ios
```

## Controles

| Acción | Móvil | Escritorio |
| --- | --- | --- |
| Mover el ejército | Joystick (zona inferior izquierda) | WASD / flechas |
| Girar cámara | Arrastrar con un dedo | Arrastrar con el ratón, Q/E |
| Zoom (hasta ver el continente) | Pinza | Rueda, +/- |
| Vista estratégica | Botón Mapa o tocar el minimapa | M |
| Habilidad especial | Botón de la facción | Espacio |

## Estructura

```
src/
  world/SouthAmerica.ts  generación del mapa (alturas, biomas, países)
  world/Terrain.ts       malla voxel por chunks + malla continental
  world/Sky.ts           cielo, sol/luna, agua, nubes, niebla
  army/Army.ts           simulación de batallones, IA, combate, moral
  army/ArmyRenderer.ts   render GPU (LOD), banderas, partículas
  game/Factions.ts       datos de las civilizaciones
  game/Game.ts           bucle, cámara, desafíos, economía, guardado
  input/Input.ts         joystick virtual, pinza, teclado
  ui/HUD.ts              HUD, tienda, menú, minimapa
```
