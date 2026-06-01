# 🐕 KIKKI: Un Perro en Busca de su Hogar

Juego web tipo plataforma/arcade (estilo Frogger + Super Mario Bros) con **estética retro de los años 90** (8/16 bits). Kikki, un perro callejero chileno, debe cruzar **5 ciudades de Chile** esquivando autos y coordinando los semáforos para reencontrarse con su familia.

El juego **educa sobre el cuidado responsable de las mascotas** mientras entretiene.

## ▶️ Cómo jugar

Abre `index.html` en cualquier navegador moderno. No necesita instalación ni servidor.

```
# opcional, para servirlo localmente:
cd KikkiGame
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## 🎮 Controles

| Acción            | Jugador 1 (Kikki) | Jugador 2 (Lola) |
|-------------------|-------------------|------------------|
| Moverse           | Flechas ← ↑ → ↓   | W A S D          |
| Aceptar / menús   | ENTER             | ENTER            |
| Pausa             | P                 | P                |
| Silenciar sonido  | M                 | M                |

## ✨ Características

- **5 ciudades chilenas** de norte a sur: Arica, La Serena, Valparaíso, Santiago y Punta Arenas, cada una con su paleta de color y dificultad creciente.
- **3 niveles de dificultad** (Fácil / Normal / Difícil) que cambian la velocidad de los autos, la cantidad de tráfico, la duración de los semáforos y las vidas.
- **Semáforos** que coordinan el cruce: avanza cuando está en VERDE (autos detenidos), espera cuando está en ALTO.
- **Sistema de vidas** con corazones por jugador.
- **Modo 2 jugadores cooperativo**: si un perro se queda sin vidas, el otro puede **rescatarlo** caminando hasta él. ¡Llegar juntos a la meta da puntos extra!
- **Huesos 🦴** coleccionables que funcionan como moneda compartida del equipo.
- **Parada de cuidados** entre ciudades, donde gastas huesos en:
  - 🍖 **Alimentar** a Kikki (recupera vidas)
  - 💉 **Veterinario** (vida extra)
  - ✂️ **Peluquero** (velocidad extra)
  - 🧥 **Ropa de abrigo** (escudo contra un golpe)
  
  Cada servicio entrega un **dato educativo** real sobre el cuidado de mascotas.
- **Datos curiosos** sobre el lenguaje canino y la tenencia responsable entre nivel y nivel.
- **Final emotivo**: Kikki encuentra a su familia, con un mensaje sobre adopción responsable ("Adopta, no compres").
- **Gráficos pixel-art** y **música/efectos chiptune** generados por código (sin archivos externos).

## 🗂️ Estructura

```
KikkiGame/
├── index.html      # estructura y carga
├── css/style.css   # estética retro 90s (CRT, paleta 16 bits)
└── js/
    ├── data.js     # ciudades, dificultades, tips educativos, tienda
    ├── sprites.js  # dibujo pixel-art (Kikki, autos, semáforo, huesos)
    ├── audio.js    # chiptune con Web Audio API
    └── game.js     # motor: loop, estados, físicas, cooperativo
```

## 🐾 Mensaje del juego

Más allá del desafío arcade, *Kikki* busca enseñar — especialmente a quienes recién juegan — que **una mascota es para toda la vida**: necesita alimentación adecuada, visitas al veterinario, higiene, paseos y, sobre todo, mucho amor.
