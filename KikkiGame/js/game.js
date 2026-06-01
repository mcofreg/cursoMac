/* ============================================================
   KIKKI: UN PERRO EN BUSCA DE SU HOGAR  -  motor del juego
   Juego web tipo plataforma/Frogger con estética 16 bits.
   ============================================================ */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const screensEl = document.getElementById('screens');
const hudEl = document.getElementById('hud');

const TILE = 64;
const COLS = 10;
const ROWS = 10;          // 0 = meta (hogar), ROWS-1 = partida
const GOAL_ROW = 0;
const START_ROW = ROWS - 1;

// ---------------- Estado global ----------------
const G = {
    state: 'title',       // title | mode | difficulty | intro | play | care | cityclear | gameover | win | paused
    twoPlayers: false,
    diffKey: 'normal',
    diff: DIFFICULTIES.normal,
    cityIndex: 0,
    bones: 0,             // huesos del equipo (moneda compartida)
    score: 0,
    players: [],
    cars: [],
    bonesOnMap: [],
    light: { green: true, timer: 0 },
    buffs: { shield: false, speedBoost: false },
    careUsed: {},         // servicios usados en la parada actual
    menuIndex: 0,
    menuItems: [],
    flash: null           // mensaje flotante {text, t, color}
};

const keys = new Set();

// ---------------- Utilidades ----------------
function tileToPx(col, row) { return { x: col * TILE, y: row * TILE }; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ---------------- Jugadores ----------------
function makePlayer(id) {
    const isP2 = id === 2;
    return {
        id,
        name: isP2 ? "Lola" : "Kikki",
        color: isP2 ? "#c98a3a" : "#e8b35a",
        dark: isP2 ? "#7a4a14" : "#a06a1e",
        col: isP2 ? 6 : 4,
        row: START_ROW,
        lives: G.diff.lives,
        maxLives: G.diff.lives + 2,
        alive: true,
        down: false,        // sin vidas, esperando rescate (solo 2P)
        reached: false,
        moveCD: 0,
        controls: isP2
            ? { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }
            : { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
    };
}

function resetPlayersForCity() {
    G.players.forEach(p => {
        p.col = p.id === 2 ? 6 : 4;
        p.row = START_ROW;
        p.reached = false;
        p.moveCD = 0;
        if (p.down) { p.down = false; p.alive = true; p.lives = 1; } // rescatado al cambiar de ciudad
    });
}

// ---------------- Construcción de ciudad ----------------
function laneRows() {
    // Filas que son calles con autos: 1 .. L (según ciudad)
    const L = CITIES[G.cityIndex].lanes;
    const rows = [];
    for (let r = 1; r <= L; r++) rows.push(r);
    return rows;
}

function buildCity() {
    const city = CITIES[G.cityIndex];
    const lanes = laneRows();
    G.cars = [];
    lanes.forEach((row, idx) => {
        const dir = idx % 2 === 0 ? 1 : -1;
        const baseSpeed = rand(1.2, 2.2) * G.diff.carSpeedMul * (1 + G.cityIndex * 0.06);
        const count = Math.round(rand(2, 3) * G.diff.carDensity);
        const gap = (COLS * TILE) / count;
        for (let i = 0; i < count; i++) {
            const w = TILE * rand(1.2, 1.9);
            G.cars.push({
                row,
                x: i * gap + rand(0, gap * 0.4),
                w,
                h: TILE * 0.66,
                speed: baseSpeed,
                dir,
                color: city.carColors[(idx + i) % city.carColors.length]
            });
        }
    });

    // Huesos repartidos en filas seguras y entre calles
    G.bonesOnMap = [];
    for (let i = 0; i < 4; i++) {
        const col = Math.floor(rand(0, COLS));
        const row = Math.floor(rand(1, ROWS - 1));
        G.bonesOnMap.push({ col, row, taken: false });
    }

    G.light = { green: true, timer: G.diff.greenTime };
}

// ---------------- Bucle principal ----------------
let lastT = 0;
function loop(t) {
    const dt = Math.min(2, (t - lastT) / 16.67 || 1);
    lastT = t;
    if (G.state === 'play') {
        update(dt);
        render();
    } else if (['title', 'mode', 'difficulty', 'intro', 'care', 'cityclear', 'gameover', 'win', 'paused'].includes(G.state)) {
        // Mantenemos el fondo dibujado bajo los overlays
        render();
    }
    requestAnimationFrame(loop);
}

// ---------------- Actualización ----------------
function update(dt) {
    // Semáforo
    G.light.timer -= dt;
    if (G.light.timer <= 0) {
        G.light.green = !G.light.green;
        G.light.timer = G.light.green ? G.diff.greenTime : G.diff.redTime;
    }
    const carsMoving = !G.light.green; // verde para Kikki => autos detenidos

    // Autos
    if (carsMoving) {
        G.cars.forEach(c => {
            c.x += c.speed * c.dir * dt * 2.4;
            const total = COLS * TILE;
            if (c.dir > 0 && c.x > total) c.x = -c.w;
            if (c.dir < 0 && c.x + c.w < 0) c.x = total;
        });
    }

    // Movimiento de jugadores
    G.players.forEach(p => {
        if (!p.alive) return;
        p.moveCD -= dt;
        if (p.moveCD <= 0) {
            let moved = false;
            const cd = G.buffs.speedBoost ? 6 : 9;
            if (keys.has(p.controls.up))    { stepPlayer(p, 0, -1); moved = true; }
            else if (keys.has(p.controls.down))  { stepPlayer(p, 0, 1); moved = true; }
            else if (keys.has(p.controls.left))  { stepPlayer(p, -1, 0); moved = true; }
            else if (keys.has(p.controls.right)) { stepPlayer(p, 1, 0); moved = true; }
            if (moved) p.moveCD = cd;
        }
    });

    // Colisiones con autos en movimiento
    if (carsMoving) {
        G.players.forEach(p => {
            if (!p.alive) return;
            const px = p.col * TILE + 10, py = p.row * TILE + 12;
            const pw = TILE - 20, ph = TILE - 20;
            for (const c of G.cars) {
                if (c.row !== p.row) continue;
                if (rectsOverlap(px, py, pw, ph, c.x, c.row * TILE + TILE * 0.17, c.w, c.h)) {
                    hitPlayer(p);
                    break;
                }
            }
        });
    }

    // Recolección de huesos + rescate cooperativo
    G.players.forEach(p => {
        if (!p.alive) return;
        G.bonesOnMap.forEach(b => {
            if (!b.taken && b.col === p.col && b.row === p.row) {
                b.taken = true;
                G.bones++; G.score += 25;
                Sound.sfx.bone();
                showFlash("+1 hueso", "#ffd23f");
            }
        });
        // Rescate: pisar al compañero caído lo revive
        if (G.twoPlayers) {
            const mate = G.players.find(o => o !== p && o.down);
            if (mate && mate.col === p.col && mate.row === p.row) {
                mate.down = false; mate.alive = true; mate.lives = 1;
                Sound.sfx.bark();
                showFlash("¡Rescate! " + p.name + " salvó a " + mate.name, "#3ad967");
            }
        }
    });

    // ¿Llegó alguien a la meta?
    const winner = G.players.find(p => p.alive && p.row === GOAL_ROW);
    if (winner) { winner.reached = true; cityCleared(); }

    if (G.flash) { G.flash.t -= dt; if (G.flash.t <= 0) G.flash = null; }
    updateHUD();
}

function stepPlayer(p, dc, dr) {
    const nc = clamp(p.col + dc, 0, COLS - 1);
    const nr = clamp(p.row + dr, 0, ROWS - 1);
    if (nc !== p.col || nr !== p.row) {
        p.col = nc; p.row = nr;
        Sound.sfx.move();
        if (dr < 0) G.score += 2; // avanzar hacia la meta da puntitos
    }
}

function hitPlayer(p) {
    if (G.buffs.shield) {
        G.buffs.shield = false;
        showFlash(p.name + ": ¡el abrigo te protegió!", "#2ce8f5");
        Sound.sfx.bark();
        p.col = p.id === 2 ? 6 : 4; p.row = START_ROW;
        return;
    }
    p.lives--;
    Sound.sfx.hit();
    if (p.lives > 0) {
        p.col = p.id === 2 ? 6 : 4; p.row = START_ROW;
        showFlash(p.name + " perdió una vida", "#ff4070");
    } else {
        p.alive = false;
        if (G.twoPlayers) {
            p.down = true;   // queda caído esperando rescate
            showFlash(p.name + " cayó... ¡rescátalo!", "#ff3c3c");
            const anyAlive = G.players.some(o => o.alive);
            if (!anyAlive) gameOver();
        } else {
            gameOver();
        }
    }
}

// ---------------- Render ----------------
function render() {
    const city = CITIES[G.cityIndex];
    // Cielo
    ctx.fillStyle = city.sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Filas: meta, calles, veredas
    const lanes = laneRows();
    for (let r = 0; r < ROWS; r++) {
        const y = r * TILE;
        if (r === GOAL_ROW) {
            ctx.fillStyle = "#2e7d32"; // pasto meta
            ctx.fillRect(0, y, canvas.width, TILE);
        } else if (lanes.includes(r)) {
            ctx.fillStyle = city.road;
            ctx.fillRect(0, y, canvas.width, TILE);
            // líneas divisorias
            ctx.fillStyle = "rgba(255,255,255,0.45)";
            for (let x = 0; x < COLS; x++) ctx.fillRect(x * TILE + 18, y + TILE / 2 - 2, 28, 4);
        } else {
            // vereda segura
            ctx.fillStyle = city.grass;
            ctx.fillRect(0, y, canvas.width, TILE);
            ctx.fillStyle = "rgba(0,0,0,0.08)";
            for (let x = 0; x < COLS; x += 2) ctx.fillRect(x * TILE, y, TILE, TILE);
        }
    }

    // Hogar (meta)
    drawHome(ctx, (COLS / 2) * TILE - TILE / 2, 4, TILE - 8);

    // Huesos
    G.bonesOnMap.forEach(b => {
        if (b.taken) return;
        drawBone(ctx, b.col * TILE + TILE * 0.28, b.row * TILE + TILE * 0.28, TILE * 0.44);
    });

    // Autos
    const carsMoving = !G.light.green;
    G.cars.forEach(c => {
        drawCar(ctx, c.x, c.row * TILE + TILE * 0.17, c.w, c.h, c.color, c.dir);
        if (!carsMoving) { // freno encendido cuando están detenidos
            ctx.fillStyle = "#ff3c3c";
            const bx = c.dir > 0 ? c.x : c.x + c.w - 4;
            ctx.fillRect(bx, c.row * TILE + TILE * 0.3, 4, 8);
        }
    });

    // Semáforo (esquina superior derecha)
    drawTrafficLight(ctx, canvas.width - 70, 70, 40, G.light.green);
    ctx.fillStyle = "#fff";
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.fillText(G.light.green ? "CRUZA" : "ALTO", canvas.width - 92, 150);

    // Jugadores
    G.players.forEach(p => {
        const x = p.col * TILE + TILE * 0.16, y = p.row * TILE + TILE * 0.12, size = TILE * 0.68;
        if (p.down) {
            // perro caído (grisáceo) + SOS parpadeante
            drawKikki(ctx, x, y, size, { color: "#7a7a7a", dark: "#555" });
            ctx.fillStyle = (Math.floor(Date.now() / 300) % 2) ? "#ff3c3c" : "#ffd23f";
            ctx.font = "8px 'Press Start 2P', monospace";
            ctx.fillText("SOS", x + 8, y - 4);
        } else if (p.alive) {
            drawKikki(ctx, x, y, size, {
                color: p.color, dark: p.dark,
                coat: G.buffs.shield ? "#2ce8f5" : null,
                shield: G.buffs.shield
            });
            // etiqueta de nombre en 2P
            if (G.twoPlayers) {
                ctx.fillStyle = p.id === 2 ? "#ff8fa3" : "#ffd23f";
                ctx.font = "7px 'Press Start 2P', monospace";
                ctx.fillText(p.name, x + 4, y + size + 12);
            }
        }
    });

    // Mensaje flotante
    if (G.flash) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, canvas.height / 2 - 22, canvas.width, 44);
        ctx.fillStyle = G.flash.color;
        ctx.font = "11px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.fillText(G.flash.text, canvas.width / 2, canvas.height / 2 + 4);
        ctx.textAlign = "left";
    }
}

function showFlash(text, color) { G.flash = { text, color: color || "#fff", t: 90 }; }

// ---------------- HUD ----------------
function updateHUD() {
    document.getElementById('hud-city').textContent =
        (G.cityIndex + 1) + "/5 " + CITIES[G.cityIndex].name;
    const hearts = n => "❤".repeat(Math.max(0, n)) || "💀";
    document.getElementById('hud-lives-p1').textContent = hearts(G.players[0] ? G.players[0].lives : 0);
    const p2block = document.getElementById('hud-p2-block');
    if (G.twoPlayers && G.players[1]) {
        p2block.classList.remove('hidden');
        document.getElementById('hud-lives-p2').textContent = hearts(G.players[1].lives);
    } else {
        p2block.classList.add('hidden');
    }
    document.getElementById('hud-bones').textContent = G.bones;
    document.getElementById('hud-score').textContent = G.score;
}

// ============================================================
//   FLUJO / PANTALLAS
// ============================================================
function clearScreens() { screensEl.innerHTML = ''; }

function titleScreen() {
    G.state = 'title';
    hudEl.classList.add('hidden');
    Sound.startMusic();
    clearScreens();
    screensEl.innerHTML = `
        <div class="screen">
            <h1>🐕 KIKKI</h1>
            <h2>Un perro en busca de su hogar</h2>
            <p class="small">Un perro callejero chileno cruza 5 ciudades<br>
            esquivando autos y semáforos para reencontrarse con su familia.</p>
            <p class="blink" style="color:#3ad967">▶ Presiona ENTER para empezar</p>
            <p class="small">Aprende sobre el cuidado de las mascotas mientras juegas 🐾</p>
        </div>`;
}

function modeScreen() {
    Sound.sfx.select();
    G.state = 'mode';
    showMenu("MODO DE JUEGO", "¿Cómo quieres jugar?", [
        { label: "1 JUGADOR", tag: "Solo Kikki", onSelect: () => { G.twoPlayers = false; difficultyScreen(); } },
        { label: "2 JUGADORES", tag: "Kikki + Lola cooperan", onSelect: () => { G.twoPlayers = true; difficultyScreen(); } }
    ]);
}

function difficultyScreen() {
    Sound.sfx.select();
    G.state = 'difficulty';
    const items = Object.keys(DIFFICULTIES).map(k => ({
        label: DIFFICULTIES[k].label,
        tag: DIFFICULTIES[k].tag + " · " + DIFFICULTIES[k].lives + " vidas",
        onSelect: () => { G.diffKey = k; G.diff = DIFFICULTIES[k]; startGame(); }
    }));
    showMenu("DIFICULTAD", "Elige tu desafío", items);
}

function showMenu(title, subtitle, items) {
    G.menuItems = items;
    G.menuIndex = 0;
    clearScreens();
    const div = document.createElement('div');
    div.className = 'screen';
    div.innerHTML = `<h1>${title}</h1><h2>${subtitle}</h2>`;
    const opts = document.createElement('div');
    opts.className = 'menu-options';
    items.forEach((it, i) => {
        const b = document.createElement('button');
        b.className = 'menu-item' + (i === 0 ? ' selected' : '');
        b.innerHTML = `${it.label}<span class="tag">${it.tag}</span>`;
        b.onclick = () => { G.menuIndex = i; it.onSelect(); };
        b.onmouseenter = () => setMenuIndex(i);
        opts.appendChild(b);
    });
    div.appendChild(opts);
    screensEl.appendChild(div);
}

function setMenuIndex(i) {
    G.menuIndex = i;
    [...screensEl.querySelectorAll('.menu-item')].forEach((el, k) =>
        el.classList.toggle('selected', k === i));
}

function startGame() {
    G.cityIndex = 0; G.bones = 0; G.score = 0;
    G.buffs = { shield: false, speedBoost: false };
    G.players = G.twoPlayers ? [makePlayer(1), makePlayer(2)] : [makePlayer(1)];
    hudEl.classList.remove('hidden');
    cityIntro();
}

function cityIntro() {
    G.state = 'intro';
    const city = CITIES[G.cityIndex];
    clearScreens();
    screensEl.innerHTML = `
        <div class="screen">
            <h2>CIUDAD ${G.cityIndex + 1} DE 5</h2>
            <h1>${city.name}</h1>
            <p class="small" style="color:${city.accent}">${city.subtitle}</p>
            <p>${city.intro}</p>
            <div class="tip-box">🐾 <strong>Objetivo:</strong> cruza hasta la casa de arriba.
            Cruza cuando el semáforo esté en VERDE (autos detenidos).
            Junta huesos 🦴 para cuidar a Kikki en la próxima parada.</div>
            <p class="blink" style="color:#3ad967">▶ ENTER para cruzar</p>
        </div>`;
}

function beginPlay() {
    resetPlayersForCity();
    buildCity();
    G.careUsed = {};
    clearScreens();
    G.state = 'play';
}

function cityCleared() {
    G.state = 'cityclear';
    G.score += 300 + G.cityIndex * 100;
    Sound.sfx.win();
    // Bono cooperativo si ambos llegaron vivos
    if (G.twoPlayers && G.players.every(p => p.alive)) { G.score += 250; }
    G.buffs.speedBoost = false; // los buffs duran una ciudad
    const fact = DOG_FACTS[Math.floor(rand(0, DOG_FACTS.length))];
    const line = PROGRESS_LINES[Math.floor(rand(0, PROGRESS_LINES.length))];
    clearScreens();
    screensEl.innerHTML = `
        <div class="screen">
            <h1 style="color:#3ad967">¡CIUDAD CRUZADA!</h1>
            <h2>${CITIES[G.cityIndex].name} superada</h2>
            <p>${line}</p>
            <div class="tip-box">💡 <strong>¿Sabías que...?</strong><br>${fact}</div>
            <p class="blink" style="color:#ffd23f">▶ ENTER para ir a la parada de cuidados</p>
        </div>`;
}

function careScreen() {
    G.state = 'care';
    clearScreens();
    const div = document.createElement('div');
    div.className = 'screen';
    div.innerHTML = `<h1>🏥 PARADA DE CUIDADOS</h1>
        <h2>Tienes ${G.bones} 🦴 huesos</h2>
        <p class="small">Gasta tus huesos en cuidar a tu perro. ¡Cada servicio enseña algo y da un beneficio!</p>`;
    const grid = document.createElement('div');
    grid.className = 'care-grid';
    CARE_SERVICES.forEach(s => {
        const card = document.createElement('div');
        const used = G.careUsed[s.id];
        const afford = G.bones >= s.cost;
        card.className = 'care-card' + (used ? ' done' : (afford ? '' : ' locked'));
        card.innerHTML = `<div class="icon">${s.icon}</div>
            <div class="title">${s.title}</div>
            <div class="cost">${used ? '✔ Realizado' : s.cost + ' 🦴'}</div>`;
        if (!used && afford) card.onclick = () => buyCare(s);
        grid.appendChild(card);
    });
    div.appendChild(grid);
    const tip = document.createElement('div');
    tip.className = 'tip-box';
    tip.id = 'care-tip';
    tip.innerHTML = "🐾 Elige un servicio para Kikki, o continúa tu viaje.";
    div.appendChild(tip);
    const cont = document.createElement('button');
    cont.className = 'menu-item selected';
    cont.style.marginTop = "6px";
    cont.innerHTML = `CONTINUAR VIAJE ▶<span class="tag">a la siguiente ciudad</span>`;
    cont.onclick = nextCity;
    div.appendChild(cont);
    screensEl.appendChild(div);
}

function buyCare(s) {
    if (G.bones < s.cost || G.careUsed[s.id]) return;
    G.bones -= s.cost;
    G.careUsed[s.id] = true;
    Sound.sfx.buy();
    // Aplicar beneficio
    if (s.reward.heal) {
        G.players.forEach(p => { if (p.alive && p.lives < p.maxLives) p.lives++; });
        G.score += 60;
    }
    if (s.reward.extraLife) {
        G.players.forEach(p => { if (p.alive) p.lives = Math.min(p.maxLives, p.lives + 1); });
    }
    if (s.reward.speedBoost) G.buffs.speedBoost = true;
    if (s.reward.shield) G.buffs.shield = true;
    careScreen(); // re-render
    const tip = document.getElementById('care-tip');
    if (tip) { tip.innerHTML = "💡 <strong>" + s.title + ":</strong> " + s.tip; }
}

function nextCity() {
    G.cityIndex++;
    if (G.cityIndex >= CITIES.length) { winScreen(); return; }
    cityIntro();
}

function gameOver() {
    G.state = 'gameover';
    Sound.sfx.lose();
    Sound.stopMusic();
    clearScreens();
    screensEl.innerHTML = `
        <div class="screen">
            <h1 style="color:#ff3c3c">GAME OVER</h1>
            <h2>Kikki necesita descansar</h2>
            <p>Llegaste a <strong style="color:#ffd23f">${CITIES[G.cityIndex].name}</strong></p>
            <p>Puntaje: <strong style="color:#3ad967">${G.score}</strong> · Huesos: ${G.bones} 🦴</p>
            <div class="tip-box">🐾 En la vida real, miles de perros buscan un hogar.
            <strong>Adopta, no compres</strong>, y dale a una mascota la familia que merece.</div>
            <p class="blink" style="color:#3ad967">▶ ENTER para volver a intentar</p>
        </div>`;
}

function winScreen() {
    G.state = 'win';
    Sound.sfx.win();
    setTimeout(() => Sound.sfx.win(), 700);
    clearScreens();
    const coop = G.twoPlayers
        ? "<p>Kikki y Lola lo lograron <strong>juntos</strong>. La amistad y la ayuda mutua hicieron posible el viaje. 🐶🐶</p>"
        : "";
    screensEl.innerHTML = `
        <div class="screen">
            <h1 style="color:#ffd23f">🏡 ¡EN CASA!</h1>
            <h2>Kikki encontró a su familia</h2>
            <p>Tras cruzar 5 ciudades de Chile, esquivar mil autos y aprender a
            cuidarse, Kikki por fin reconoció el aroma de su hogar.
            Su dueño lo abrazó entre lágrimas. ¡La aventura terminó!</p>
            ${coop}
            <p>Puntaje final: <strong style="color:#3ad967">${G.score}</strong></p>
            <div class="tip-box">🐾 <strong>Recuerda:</strong> una mascota es para toda la vida.
            Aliméntala bien, llévala al veterinario, paséala y dale mucho amor.
            ¡Tú puedes ser el hogar que un perrito como Kikki está buscando!</div>
            <p class="blink" style="color:#3ad967">▶ ENTER para jugar de nuevo</p>
        </div>`;
}

// ============================================================
//   ENTRADA DE TECLADO
// ============================================================
window.addEventListener('keydown', e => {
    Sound.ensure();
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
    keys.add(code);

    // Silenciar
    if (code === 'KeyM') { const m = Sound.toggleMute(); showFlash(m ? "🔇 Silencio" : "🔊 Sonido", "#2ce8f5"); return; }

    // Pausa
    if (code === 'KeyP') {
        if (G.state === 'play') { G.state = 'paused'; showPause(); }
        else if (G.state === 'paused') { clearScreens(); G.state = 'play'; }
        return;
    }

    // Navegación de menús
    if (['mode', 'difficulty'].includes(G.state)) {
        if (code === 'ArrowUp' || code === 'KeyW') { setMenuIndex((G.menuIndex - 1 + G.menuItems.length) % G.menuItems.length); Sound.sfx.select(); }
        if (code === 'ArrowDown' || code === 'KeyS') { setMenuIndex((G.menuIndex + 1) % G.menuItems.length); Sound.sfx.select(); }
        if (code === 'Enter') G.menuItems[G.menuIndex].onSelect();
        return;
    }

    if (code === 'Enter') {
        switch (G.state) {
            case 'title': modeScreen(); break;
            case 'intro': beginPlay(); break;
            case 'cityclear': careScreen(); break;
            case 'gameover': Sound.startMusic(); titleScreen(); break;
            case 'win': Sound.startMusic(); titleScreen(); break;
        }
    }
});

window.addEventListener('keyup', e => keys.delete(e.code));

function showPause() {
    clearScreens();
    screensEl.innerHTML = `
        <div class="screen">
            <h1>⏸ PAUSA</h1>
            <p class="blink" style="color:#3ad967">▶ P para continuar</p>
            <p class="small">M: silenciar/activar sonido</p>
            <p class="small">P1: Flechas · P2: WASD</p>
        </div>`;
}

// ---------------- Arranque ----------------
titleScreen();
requestAnimationFrame(loop);
