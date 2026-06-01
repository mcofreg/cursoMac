/* ============================================================
   SPRITES PIXEL-ART (dibujados por código sobre el canvas)
   Estilo 16 bits: rejilla de píxeles "gordos".
   ============================================================ */

// Dibuja una matriz de píxeles. `map` es un arreglo de strings;
// cada caracter mapea a un color en `palette` (espacio = transparente).
function drawPixelMap(ctx, map, palette, x, y, px) {
    for (let r = 0; r < map.length; r++) {
        const row = map[r];
        for (let c = 0; c < row.length; c++) {
            const ch = row[c];
            if (ch === ' ' || !palette[ch]) continue;
            ctx.fillStyle = palette[ch];
            ctx.fillRect(x + c * px, y + r * px, px, px);
        }
    }
}

// ---- KIKKI el perro (vista superior/frontal sencilla) ----
// Color del cuerpo cambia según jugador y "ropa".
function drawKikki(ctx, x, y, size, opts = {}) {
    const px = size / 12;
    const body = opts.color || "#c98a3a";   // café callejero
    const dark = opts.dark || "#8a5a1e";
    const coat = opts.coat;                   // ropa opcional
    const palette = {
        B: body,
        D: dark,
        N: "#1a1a1a",   // nariz/ojos
        W: "#fff7e6",   // hocico/pecho
        T: "#ff8fa3",   // lengua
        C: coat || body // abrigo
    };
    // 12x12. Vista frontal: orejas caídas, ojos, hocico, patitas.
    const map = [
        "  D      D  ",
        " DBD    DBD ",
        " DBBD  DBBD ",
        "  DBBBBBBD  ",
        "  BNBBBBNB  ",
        "  BBNBBNBB  ",
        "  BBWWWWBB  ",
        "  BWWNNWWB  ",
        "  CBWTTWBC  ",
        " CCBBBBBBCC ",
        "  D BB BB D ",
        "  D B  B  D "
    ];
    // Si lleva abrigo, pintamos la franja del cuerpo con color de ropa
    if (coat) {
        palette.B = body;
    }
    drawPixelMap(ctx, map, palette, x, y, px);

    // Escudo (ropa de abrigo activa) -> aura
    if (opts.shield) {
        ctx.strokeStyle = "rgba(44,232,245,0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
    }
}

// ---- AUTO / MICRO ----
function drawCar(ctx, x, y, w, h, color, dir) {
    const px = Math.max(2, Math.floor(h / 8));
    // Cuerpo
    ctx.fillStyle = color;
    ctx.fillRect(x, y + px, w, h - px * 2);
    // Techo
    ctx.fillStyle = shade(color, -25);
    ctx.fillRect(x + w * 0.2, y, w * 0.6, h);
    // Ventanas
    ctx.fillStyle = "#bfeaff";
    ctx.fillRect(x + w * 0.25, y + px, w * 0.5, px * 2);
    // Ruedas
    ctx.fillStyle = "#111";
    ctx.fillRect(x + px, y + h - px, px * 2, px);
    ctx.fillRect(x + w - px * 3, y + h - px, px * 2, px);
    // Luces según dirección
    ctx.fillStyle = "#fff36b";
    if (dir > 0) ctx.fillRect(x + w - px, y + h * 0.4, px, px * 2);
    else ctx.fillRect(x, y + h * 0.4, px, px * 2);
}

// ---- HUESO (coleccionable) ----
function drawBone(ctx, x, y, size) {
    const px = size / 8;
    const map = [
        "WW    WW",
        "WWW  WWW",
        " WWWWWW ",
        "  WWWW  ",
        "  WWWW  ",
        " WWWWWW ",
        "WWW  WWW",
        "WW    WW"
    ];
    drawPixelMap(ctx, map, { W: "#fff7e6" }, x, y, px);
    // borde
    ctx.strokeStyle = "#d9c79a";
    ctx.lineWidth = 1;
}

// ---- SEMÁFORO ----
function drawTrafficLight(ctx, x, y, size, isGreen) {
    const px = size / 8;
    // poste
    ctx.fillStyle = "#222";
    ctx.fillRect(x + size * 0.4, y, px * 1.5, size * 1.6);
    // caja
    ctx.fillStyle = "#111";
    ctx.fillRect(x + size * 0.15, y - size * 0.1, size * 0.7, size * 0.9);
    // luz roja
    ctx.fillStyle = isGreen ? "#5a1515" : "#ff3c3c";
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.12, px * 1.3, 0, 7);
    ctx.fill();
    // luz verde
    ctx.fillStyle = isGreen ? "#3ad967" : "#155a2a";
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.5, px * 1.3, 0, 7);
    ctx.fill();
}

// ---- META / HOGAR (casa con familia) ----
function drawHome(ctx, x, y, size) {
    const px = size / 10;
    const map = [
        "    RR    ",
        "   RRRR   ",
        "  RRRRRR  ",
        " RRRRRRRR ",
        "RRRRRRRRRR",
        " WWWDDWWW ",
        " WWWDDWWW ",
        " WGGWWGGW ",
        " WGGWWGGW ",
        " WWWWWWWW "
    ];
    drawPixelMap(ctx, map, {
        R: "#e74c3c", W: "#f4e7c1", D: "#6b3e1d", G: "#7ec8e3"
    }, x, y, px);
}

// Aclara/oscurece un color hex
function shade(hex, amt) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
}
