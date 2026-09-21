/* Pac Web - juego estilo Pac-Man en Canvas, pensado para pantallas táctiles. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Laberinto
  //   #  pared      .  punto        o  píldora de poder
  //   _  pasillo    ' ' vacío       -  puerta de la casa de fantasmas
  //   G  casa de fantasmas          P  posición inicial de Pac
  // ---------------------------------------------------------------------------
  const MAZE = [
    '#####################',
    '#.........#.........#',
    '#o###.###.#.###.###o#',
    '#...................#',
    '#.###.#.#####.#.###.#',
    '#.....#...#...#.....#',
    '#####.###___###.#####',
    '    #.#_______#.#    ',
    '#####.#_##-##_#.#####',
    '_____.__#GGG#__._____',
    '#####.#_#####_#.#####',
    '    #.#_______#.#    ',
    '#####.#_#####_#.#####',
    '#.........#.........#',
    '#.###.###.#.###.###.#',
    '#o..#.....P.....#..o#',
    '###.#.#.#####.#.#.###',
    '#.....#...#...#.....#',
    '#.#######.#.#######.#',
    '#...................#',
    '#####################'
  ];

  const ROWS = MAZE.length;
  const COLS = MAZE[0].length;
  const T = 16;                 // tamaño lógico de cada celda
  const W = COLS * T;
  const H = ROWS * T;

  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1,  y: 0 }
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DIR_ORDER = ['up', 'left', 'down', 'right']; // prioridad clásica en empates

  const HOUSE_EXIT = { col: 10, row: 7 };  // celda justo encima de la puerta
  const HOUSE_DOOR = { col: 10, row: 8 };
  const HOUSE_CENTER = { col: 10, row: 9 };

  // Colores y esquinas de dispersión
  const GHOST_DEFS = [
    { name: 'blinky', color: '#ff0000', scatter: { col: COLS - 2, row: 1 },        releaseAt: 0 },
    { name: 'pinky',  color: '#ffb8ff', scatter: { col: 1, row: 1 },               releaseAt: 1.5 },
    { name: 'inky',   color: '#00ffff', scatter: { col: COLS - 2, row: ROWS - 2 }, releaseAt: 4.5 },
    { name: 'clyde',  color: '#ffb852', scatter: { col: 1, row: ROWS - 2 },        releaseAt: 7.5 }
  ];

  const MODE_SCHEDULE = [
    { mode: 'scatter', time: 7 },
    { mode: 'chase',   time: 20 },
    { mode: 'scatter', time: 7 },
    { mode: 'chase',   time: 20 },
    { mode: 'scatter', time: 5 },
    { mode: 'chase',   time: Infinity }
  ];

  const FRUITS = [
    { name: 'cereza',  points: 100,  color: '#ff3b3b' },
    { name: 'fresa',   points: 300,  color: '#ff5c8a' },
    { name: 'naranja', points: 500,  color: '#ff9f1a' },
    { name: 'manzana', points: 700,  color: '#d62828' },
    { name: 'melón',   points: 1000, color: '#7bd389' }
  ];

  // ---------------------------------------------------------------------------
  // Estado del tablero
  // ---------------------------------------------------------------------------
  let grid = [];          // copia mutable con puntos
  let pelletsLeft = 0;
  let pacStart = { col: 10, row: 15 };
  let houseCells = [];

  function parseMaze() {
    grid = MAZE.map(function (row) { return row.split(''); });
    pelletsLeft = 0;
    houseCells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        if (ch === '.' || ch === 'o') pelletsLeft++;
        if (ch === 'P') { pacStart = { col: c, row: r }; grid[r][c] = '_'; }
        if (ch === 'G') houseCells.push({ col: c, row: r });
      }
    }
  }

  function wrapCol(c) { return ((c % COLS) + COLS) % COLS; }

  function cellAt(col, row) {
    if (row < 0 || row >= ROWS) return ' ';
    return grid[row][wrapCol(col)];
  }

  function isWalkable(col, row, forGhostEyes) {
    const ch = cellAt(col, row);
    if (ch === '#' || ch === ' ') return false;
    if (ch === '-' || ch === 'G') return !!forGhostEyes;
    return true;
  }

  function isWall(col, row) {
    if (row < 0 || row >= ROWS) return false;
    if (col < 0 || col >= COLS) return false;
    return grid[row][col] === '#';
  }

  function center(col, row) { return { x: (col + 0.5) * T, y: (row + 0.5) * T }; }

  // ---------------------------------------------------------------------------
  // Audio sencillo con WebAudio
  // ---------------------------------------------------------------------------
  const audio = {
    ctx: null,
    muted: localStorage.getItem('pacweb-muted') === '1',
    wakaToggle: false,
    unlock: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    },
    tone: function (freq, dur, type, gain, slideTo) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      g.gain.setValueAtTime(gain || 0.05, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    },
    waka: function () {
      this.wakaToggle = !this.wakaToggle;
      this.tone(this.wakaToggle ? 520 : 380, 0.08, 'square', 0.04);
    },
    power: function () { this.tone(200, 0.35, 'sawtooth', 0.05, 600); },
    eatGhost: function () { this.tone(300, 0.4, 'triangle', 0.08, 1200); },
    fruit: function () { this.tone(900, 0.25, 'triangle', 0.07, 1400); },
    death: function () { this.tone(700, 1.1, 'sawtooth', 0.07, 60); },
    extraLife: function () { this.tone(600, 0.15, 'square', 0.05); setTimeout(() => this.tone(900, 0.25, 'square', 0.05), 150); },
    toggle: function () {
      this.muted = !this.muted;
      localStorage.setItem('pacweb-muted', this.muted ? '1' : '0');
      return this.muted;
    }
  };

  // ---------------------------------------------------------------------------
  // Entidades
  // ---------------------------------------------------------------------------
  function makePac() {
    const c = center(pacStart.col, pacStart.row);
    return {
      x: c.x, y: c.y, dir: 'left', nextDir: 'left',
      moving: false, mouth: 0, mouthDir: 1, alive: true, deathTimer: 0
    };
  }

  function makeGhost(def, index) {
    // Blinky empieza fuera, justo encima de la puerta; el resto espera dentro de la casa
    const outside = index === 0;
    const home = outside ? HOUSE_CENTER : houseCells[Math.min(index - 1, houseCells.length - 1)];
    const c = outside ? center(HOUSE_EXIT.col, HOUSE_EXIT.row) : center(home.col, home.row);
    return {
      name: def.name, color: def.color, scatter: def.scatter, releaseAt: def.releaseAt,
      homeCol: home.col, homeRow: home.row,
      x: c.x, y: c.y, dir: 'left',
      state: outside ? 'active' : 'home',   // home | leaving | active | frightened | eyes | entering
      bob: 0, waitTimer: 0
    };
  }

  // ---------------------------------------------------------------------------
  // Estado del juego
  // ---------------------------------------------------------------------------
  const game = {
    phase: 'title',   // title | ready | playing | dying | levelclear | gameover | paused
    score: 0,
    high: parseInt(localStorage.getItem('pacweb-high') || '0', 10) || 0,
    level: 1,
    lives: 3,
    pac: null,
    ghosts: [],
    modeIndex: 0,
    modeTimer: 0,
    mode: 'scatter',
    frightTimer: 0,
    ghostCombo: 0,
    levelTime: 0,
    phaseTimer: 0,
    pelletsEaten: 0,
    fruit: null,       // {x,y,timer,def}
    fruitSpawned: 0,
    floating: [],      // textos flotantes de puntos
    extraLifeGiven: false,
    flash: 0
  };

  function speeds() {
    const lvl = Math.min(game.level, 12);
    const boost = 1 + (lvl - 1) * 0.06;
    return {
      pac: 7.2 * boost,
      pacFright: 8 * boost,
      ghost: 6.6 * boost,
      ghostFright: 4.2 * boost,
      ghostTunnel: 3.6 * boost,
      eyes: 13
    };
  }

  function frightDuration() {
    return Math.max(1.5, 6.5 - (game.level - 1) * 0.6);
  }

  function resetActors() {
    game.pac = makePac();
    game.ghosts = GHOST_DEFS.map(makeGhost);
    game.modeIndex = 0;
    game.modeTimer = 0;
    game.mode = MODE_SCHEDULE[0].mode;
    game.frightTimer = 0;
    game.ghostCombo = 0;
    game.levelTime = 0;
    game.fruit = null;
  }

  function startLevel(resetBoard) {
    if (resetBoard) {
      parseMaze();
      game.pelletsEaten = 0;
      game.fruitSpawned = 0;
    }
    resetActors();
    game.phase = 'ready';
    game.phaseTimer = 2;
    showOverlay(false);
    updateHud();
  }

  function newGame() {
    game.score = 0;
    game.level = 1;
    game.lives = 3;
    game.extraLifeGiven = false;
    game.floating = [];
    startLevel(true);
  }

  function addScore(points) {
    game.score += points;
    if (!game.extraLifeGiven && game.score >= 10000) {
      game.extraLifeGiven = true;
      game.lives++;
      audio.extraLife();
      addFloating(game.pac.x, game.pac.y - 10, '+1 VIDA', '#ffe300');
    }
    if (game.score > game.high) {
      game.high = game.score;
      localStorage.setItem('pacweb-high', String(game.high));
    }
  }

  function addFloating(x, y, text, color) {
    game.floating.push({ x: x, y: y, text: text, color: color || '#fff', timer: 1 });
  }

  // ---------------------------------------------------------------------------
  // Movimiento sobre la rejilla
  // ---------------------------------------------------------------------------
  function tileOf(e) { return { col: Math.floor(e.x / T), row: Math.floor(e.y / T) }; }

  function distToCenterAlong(e, dir) {
    const t = tileOf(e);
    const c = center(t.col, t.row);
    const d = DIRS[dir];
    return (c.x - e.x) * d.x + (c.y - e.y) * d.y;
  }

  function wrapPosition(e) {
    if (e.x < 0) e.x += W;
    else if (e.x >= W) e.x -= W;
  }

  // Mueve una entidad "dist" píxeles. decide(e) se llama al pasar por el centro
  // de cada celda y debe devolver la nueva dirección o null para detenerse.
  function moveOnGrid(e, dist, decide, canPass) {
    let guard = 0;
    while (dist > 0 && guard++ < 64) {
      let ahead = distToCenterAlong(e, e.dir);
      // Si ya pasamos el centro de esta celda, el siguiente objetivo es el centro de la próxima
      if (ahead < -0.001) ahead += T;
      if (ahead > 0.001) {
        const step = Math.min(dist, ahead);
        e.x += DIRS[e.dir].x * step;
        e.y += DIRS[e.dir].y * step;
        dist -= step;
        wrapPosition(e);
        if (dist <= 0) break;
      }
      // Estamos en el centro de la celda: encajar y decidir
      const t = tileOf(e);
      const c = center(t.col, t.row);
      e.x = c.x; e.y = c.y;
      const nd = decide(e, t);
      if (!nd) { e.moving = false; return; }
      e.dir = nd;
      const next = { col: t.col + DIRS[nd].x, row: t.row + DIRS[nd].y };
      if (!canPass(next.col, next.row)) { e.moving = false; return; }
      e.moving = true;
      const step = Math.min(dist, T / 2);
      e.x += DIRS[nd].x * step;
      e.y += DIRS[nd].y * step;
      dist -= step;
      wrapPosition(e);
    }
    wrapPosition(e);
  }

  // ---------------------------------------------------------------------------
  // Pac
  // ---------------------------------------------------------------------------
  function updatePac(dt) {
    const pac = game.pac;
    const sp = speeds();
    const speed = (game.frightTimer > 0 ? sp.pacFright : sp.pac) * T;

    const canPass = function (c, r) { return isWalkable(c, r, false); };
    moveOnGrid(pac, speed * dt, function (e, t) {
      if (canPass(t.col + DIRS[e.nextDir].x, t.row + DIRS[e.nextDir].y)) return e.nextDir;
      if (canPass(t.col + DIRS[e.dir].x, t.row + DIRS[e.dir].y)) return e.dir;
      return null;
    }, canPass);

    // Permitir giro inverso inmediato (sin esperar al centro)
    if (pac.nextDir === OPPOSITE[pac.dir] && pac.moving) {
      pac.dir = pac.nextDir;
    }

    if (pac.moving) {
      pac.mouth += dt * 12 * pac.mouthDir;
      if (pac.mouth > 1) { pac.mouth = 1; pac.mouthDir = -1; }
      if (pac.mouth < 0) { pac.mouth = 0; pac.mouthDir = 1; }
    } else {
      pac.mouth = Math.max(0, pac.mouth - dt * 6);
    }

    // Comer
    const t = tileOf(pac);
    const ch = grid[t.row][wrapCol(t.col)];
    if (ch === '.' || ch === 'o') {
      grid[t.row][wrapCol(t.col)] = '_';
      pelletsLeft--;
      game.pelletsEaten++;
      if (ch === '.') {
        addScore(10);
        audio.waka();
      } else {
        addScore(50);
        audio.power();
        game.frightTimer = frightDuration();
        game.ghostCombo = 0;
        game.ghosts.forEach(function (g) {
          if (g.state === 'active') { g.state = 'frightened'; g.dir = OPPOSITE[g.dir]; }
          else if (g.state === 'frightened') { g.dir = OPPOSITE[g.dir]; }
        });
      }
      maybeSpawnFruit();
      if (pelletsLeft <= 0) {
        game.phase = 'levelclear';
        game.phaseTimer = 2.2;
        game.flash = 0;
      }
    }

    // Fruta
    if (game.fruit) {
      const dx = pac.x - game.fruit.x, dy = pac.y - game.fruit.y;
      if (dx * dx + dy * dy < (T * 0.7) * (T * 0.7)) {
        addScore(game.fruit.def.points);
        addFloating(game.fruit.x, game.fruit.y, String(game.fruit.def.points), game.fruit.def.color);
        audio.fruit();
        game.fruit = null;
      }
    }
  }

  function maybeSpawnFruit() {
    const thresholds = [60, 140];
    if (game.fruitSpawned < thresholds.length && game.pelletsEaten >= thresholds[game.fruitSpawned]) {
      game.fruitSpawned++;
      const c = center(pacStart.col, pacStart.row);
      game.fruit = { x: c.x, y: c.y, timer: 9, def: FRUITS[Math.min(game.level - 1, FRUITS.length - 1)] };
    }
  }

  // ---------------------------------------------------------------------------
  // Fantasmas
  // ---------------------------------------------------------------------------
  function ghostTarget(g) {
    const pac = game.pac;
    const pt = tileOf(pac);
    const pd = DIRS[pac.dir];
    if (game.mode === 'scatter') return g.scatter;
    switch (g.name) {
      case 'blinky': return pt;
      case 'pinky':  return { col: pt.col + pd.x * 4, row: pt.row + pd.y * 4 };
      case 'inky': {
        const blinky = game.ghosts[0];
        const bt = tileOf(blinky);
        const ahead = { col: pt.col + pd.x * 2, row: pt.row + pd.y * 2 };
        return { col: ahead.col + (ahead.col - bt.col), row: ahead.row + (ahead.row - bt.row) };
      }
      case 'clyde': {
        const gt = tileOf(g);
        const d2 = (gt.col - pt.col) * (gt.col - pt.col) + (gt.row - pt.row) * (gt.row - pt.row);
        return d2 > 64 ? pt : g.scatter;
      }
    }
    return pt;
  }

  function chooseGhostDir(g, t, target, canPass, allowReverse) {
    let best = null, bestD = Infinity;
    const options = [];
    for (let i = 0; i < DIR_ORDER.length; i++) {
      const d = DIR_ORDER[i];
      if (!allowReverse && d === OPPOSITE[g.dir]) continue;
      const nc = t.col + DIRS[d].x, nr = t.row + DIRS[d].y;
      if (!canPass(nc, nr)) continue;
      options.push(d);
      if (target) {
        const dx = nc - target.col, dy = nr - target.row;
        const dist = dx * dx + dy * dy;
        if (dist < bestD) { bestD = dist; best = d; }
      }
    }
    if (!options.length) return OPPOSITE[g.dir];
    if (!target) return options[Math.floor(Math.random() * options.length)];
    return best;
  }

  function updateGhost(g, dt) {
    const sp = speeds();
    const t = tileOf(g);

    if (g.state === 'home') {
      g.bob += dt * 6;
      g.y = center(g.homeCol, g.homeRow).y + Math.sin(g.bob) * 2.5;
      g.dir = Math.sin(g.bob) > 0 ? 'down' : 'up';
      if (game.levelTime >= g.releaseAt && g.waitTimer <= 0) g.state = 'leaving';
      g.waitTimer -= dt;
      return;
    }

    if (g.state === 'leaving') {
      const target = center(HOUSE_CENTER.col, HOUSE_CENTER.row);
      const exit = center(HOUSE_EXIT.col, HOUSE_EXIT.row);
      const step = sp.ghostFright * T * dt;
      if (Math.abs(g.x - target.x) > 0.5) {
        g.dir = g.x < target.x ? 'right' : 'left';
        g.x += Math.sign(target.x - g.x) * Math.min(step, Math.abs(target.x - g.x));
        g.y = target.y;
      } else {
        g.x = target.x;
        g.dir = 'up';
        g.y -= Math.min(step, g.y - exit.y);
        if (g.y <= exit.y + 0.01) {
          g.y = exit.y;
          g.state = game.frightTimer > 0 ? 'frightened' : 'active';
          g.dir = Math.random() < 0.5 ? 'left' : 'right';
        }
      }
      return;
    }

    if (g.state === 'entering') {
      const target = center(HOUSE_CENTER.col, HOUSE_CENTER.row);
      const step = sp.eyes * T * dt;
      g.dir = 'down';
      g.y += Math.min(step, target.y - g.y);
      if (g.y >= target.y - 0.01) {
        g.y = target.y;
        g.state = 'home';
        g.waitTimer = 1.2;
        g.bob = 0;
      }
      return;
    }

    // Estados con movimiento libre por el laberinto
    let speed;
    const inTunnel = t.row === HOUSE_CENTER.row && (t.col < 5 || t.col > COLS - 6);
    if (g.state === 'eyes') speed = sp.eyes;
    else if (g.state === 'frightened') speed = sp.ghostFright;
    else if (inTunnel) speed = sp.ghostTunnel;
    else speed = sp.ghost;

    const eyes = g.state === 'eyes';
    const canPass = function (c, r) { return isWalkable(c, r, eyes); };

    moveOnGrid(g, speed * T * dt, function (e, tile) {
      if (e.state === 'eyes') {
        if (tile.col === HOUSE_EXIT.col && tile.row === HOUSE_EXIT.row) {
          e.state = 'entering';
          return null;
        }
        return chooseGhostDir(e, tile, HOUSE_EXIT, canPass, false);
      }
      if (e.state === 'frightened') return chooseGhostDir(e, tile, null, canPass, false);
      return chooseGhostDir(e, tile, ghostTarget(e), canPass, false);
    }, canPass);

    if (g.state === 'entering') return;
    // Si se detuvo (callejón), forzar giro
    if (!g.moving) g.dir = OPPOSITE[g.dir];
  }

  function checkCollisions() {
    const pac = game.pac;
    const pt = tileOf(pac);
    for (let i = 0; i < game.ghosts.length; i++) {
      const g = game.ghosts[i];
      if (g.state === 'home' || g.state === 'leaving' || g.state === 'entering' || g.state === 'eyes') continue;
      const gt = tileOf(g);
      const dx = pac.x - g.x, dy = pac.y - g.y;
      const close = (gt.col === pt.col && gt.row === pt.row) || (dx * dx + dy * dy < (T * 0.55) * (T * 0.55));
      if (!close) continue;
      if (g.state === 'frightened') {
        game.ghostCombo++;
        const pts = 200 * Math.pow(2, game.ghostCombo - 1);
        addScore(pts);
        addFloating(g.x, g.y, String(pts), '#00ffff');
        audio.eatGhost();
        g.state = 'eyes';
      } else {
        startDeath();
        return;
      }
    }
  }

  function startDeath() {
    game.phase = 'dying';
    game.phaseTimer = 1.6;
    game.pac.alive = false;
    game.pac.deathTimer = 0;
    audio.death();
  }

  // ---------------------------------------------------------------------------
  // Bucle principal
  // ---------------------------------------------------------------------------
  function updateModes(dt) {
    if (game.frightTimer > 0) {
      game.frightTimer -= dt;
      if (game.frightTimer <= 0) {
        game.frightTimer = 0;
        game.ghosts.forEach(function (g) { if (g.state === 'frightened') g.state = 'active'; });
      }
      return; // el reloj de scatter/chase se pausa mientras dura el susto
    }
    game.modeTimer += dt;
    const cur = MODE_SCHEDULE[game.modeIndex];
    if (game.modeTimer >= cur.time && game.modeIndex < MODE_SCHEDULE.length - 1) {
      game.modeIndex++;
      game.modeTimer = 0;
      game.mode = MODE_SCHEDULE[game.modeIndex].mode;
      game.ghosts.forEach(function (g) { if (g.state === 'active') g.dir = OPPOSITE[g.dir]; });
    }
  }

  function update(dt) {
    game.floating.forEach(function (f) { f.timer -= dt; f.y -= dt * 14; });
    game.floating = game.floating.filter(function (f) { return f.timer > 0; });

    switch (game.phase) {
      case 'ready':
        game.phaseTimer -= dt;
        if (game.phaseTimer <= 0) game.phase = 'playing';
        break;

      case 'playing':
        game.levelTime += dt;
        updateModes(dt);
        updatePac(dt);
        if (game.phase !== 'playing') break;
        game.ghosts.forEach(function (g) { updateGhost(g, dt); });
        checkCollisions();
        if (game.fruit) {
          game.fruit.timer -= dt;
          if (game.fruit.timer <= 0) game.fruit = null;
        }
        break;

      case 'dying':
        game.pac.deathTimer += dt;
        game.phaseTimer -= dt;
        if (game.phaseTimer <= 0) {
          game.lives--;
          updateHud();
          if (game.lives <= 0) {
            game.phase = 'gameover';
            showOverlay(true, 'FIN DEL JUEGO', 'Puntuación: ' + game.score + '<br>Récord: ' + game.high, 'Jugar otra vez');
          } else {
            resetActors();
            game.phase = 'ready';
            game.phaseTimer = 1.5;
          }
        }
        break;

      case 'levelclear':
        game.phaseTimer -= dt;
        game.flash += dt;
        if (game.phaseTimer <= 0) {
          game.level++;
          startLevel(true);
        }
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1;

  function resize() {
    const stage = document.getElementById('stage');
    const rect = stage.getBoundingClientRect();
    const availW = Math.max(120, rect.width - 16);
    const availH = Math.max(120, rect.height - 8);
    const s = Math.min(availW / W, availH / H);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
    canvas.width = Math.floor(W * s * dpr);
    canvas.height = Math.floor(H * s * dpr);
    scale = s * dpr;
  }

  function drawMaze() {
    const flashing = game.phase === 'levelclear' && Math.floor(game.flash * 6) % 2 === 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = flashing ? '#ffffff' : '#2121ff';
    ctx.lineWidth = T * 0.34;
    ctx.beginPath();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isWall(c, r)) continue;
        const cx = (c + 0.5) * T, cy = (r + 0.5) * T;
        let connected = false;
        if (isWall(c + 1, r)) { ctx.moveTo(cx, cy); ctx.lineTo(cx + T, cy); connected = true; }
        if (isWall(c, r + 1)) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + T); connected = true; }
        if (!connected && !isWall(c - 1, r) && !isWall(c, r - 1)) {
          ctx.moveTo(cx - 0.01, cy); ctx.lineTo(cx + 0.01, cy);
        }
      }
    }
    ctx.stroke();

    // Puerta de la casa
    ctx.strokeStyle = '#ffb8de';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(HOUSE_DOOR.col * T + 1, (HOUSE_DOOR.row + 0.5) * T);
    ctx.lineTo((HOUSE_DOOR.col + 1) * T - 1, (HOUSE_DOOR.row + 0.5) * T);
    ctx.stroke();

    // Puntos
    ctx.fillStyle = '#ffd9a8';
    const blink = Math.floor(performance.now() / 220) % 2 === 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        if (ch === '.') {
          ctx.fillRect((c + 0.5) * T - 1.5, (r + 0.5) * T - 1.5, 3, 3);
        } else if (ch === 'o' && blink) {
          ctx.beginPath();
          ctx.arc((c + 0.5) * T, (r + 0.5) * T, T * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPac() {
    const pac = game.pac;
    const radius = T * 0.62;
    ctx.save();
    ctx.translate(pac.x, pac.y);
    ctx.fillStyle = '#ffe300';

    if (!pac.alive) {
      // Animación de muerte: la boca se abre hasta desaparecer
      const p = Math.min(1, pac.deathTimer / 1.2);
      const open = p * Math.PI;
      ctx.rotate(-Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius * (1 - p * 0.15), open, Math.PI * 2 - open);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    const angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[pac.dir];
    ctx.rotate(angle);
    const open = 0.08 + pac.mouth * 0.65;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, open, Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGhost(g) {
    const r = T * 0.62;
    const x = g.x, y = g.y;
    const frightened = g.state === 'frightened';
    const eyesOnly = g.state === 'eyes' || g.state === 'entering';
    const blinkWarn = frightened && game.frightTimer < 2 && Math.floor(game.frightTimer * 6) % 2 === 0;

    if (!eyesOnly) {
      ctx.fillStyle = frightened ? (blinkWarn ? '#f8f8f8' : '#2121de') : g.color;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.15, r, Math.PI, 0);
      ctx.lineTo(x + r, y + r * 0.75);
      // Faldón ondulado
      const waves = 3;
      const step = (2 * r) / waves;
      const wobble = Math.floor(performance.now() / 120) % 2 === 0 ? 1 : -1;
      for (let i = 0; i < waves; i++) {
        const sx = x + r - i * step;
        ctx.quadraticCurveTo(sx - step / 2, y + r * 0.75 + wobble * r * 0.28, sx - step, y + r * 0.75);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Ojos
    const d = DIRS[g.dir] || DIRS.left;
    const ex = r * 0.34, ey = -r * 0.25;
    if (frightened && !eyesOnly) {
      ctx.fillStyle = blinkWarn ? '#ff2b2b' : '#ffb8ff';
      ctx.fillRect(x - ex - 1.5, y + ey - 1, 3, 3);
      ctx.fillRect(x + ex - 1.5, y + ey - 1, 3, 3);
      // boca zigzag
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const px = x - r * 0.55 + i * (r * 1.1 / 4);
        const py = y + r * 0.3 + (i % 2 === 0 ? 1.5 : -1.5);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x - ex + d.x * 1.2, y + ey + d.y * 1.2, r * 0.26, r * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(x + ex + d.x * 1.2, y + ey + d.y * 1.2, r * 0.26, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1bff';
    ctx.beginPath();
    ctx.arc(x - ex + d.x * 2.6, y + ey + d.y * 2.6, r * 0.14, 0, Math.PI * 2);
    ctx.arc(x + ex + d.x * 2.6, y + ey + d.y * 2.6, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFruit() {
    const f = game.fruit;
    if (!f) return;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.fillStyle = f.def.color;
    ctx.beginPath();
    ctx.arc(-3, 2, 4.2, 0, Math.PI * 2);
    ctx.arc(3.5, 3, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3cb371';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, -2); ctx.quadraticCurveTo(0, -8, 5, -7);
    ctx.moveTo(3.5, -1); ctx.lineTo(5, -7);
    ctx.stroke();
    ctx.restore();
  }

  function drawText(text, x, y, color, size, align) {
    ctx.fillStyle = color;
    ctx.font = 'bold ' + size + 'px -apple-system, Helvetica, Arial, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    drawMaze();
    drawFruit();

    if (game.phase !== 'title') {
      if (game.phase !== 'dying') {
        game.ghosts.forEach(drawGhost);
      }
      drawPac();
    }

    game.floating.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.timer * 1.5));
      drawText(f.text, f.x, f.y, f.color, 9);
      ctx.globalAlpha = 1;
    });

    if (game.phase === 'ready') {
      drawText('¡PREPARADO!', W / 2, (HOUSE_CENTER.row + 2.5) * T, '#ffe300', 12);
    } else if (game.phase === 'paused') {
      drawText('PAUSA', W / 2, (HOUSE_CENTER.row + 2.5) * T, '#ffe300', 14);
    }
  }

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // evita saltos tras volver de segundo plano
    if (game.phase !== 'paused' && game.phase !== 'title' && game.phase !== 'gameover') update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // HUD y overlay
  // ---------------------------------------------------------------------------
  const scoreEl = document.getElementById('score');
  const highEl = document.getElementById('highscore');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const soundBtn = document.getElementById('sound-btn');

  let lastScore = -1, lastLives = -1, lastLevel = -1, lastHigh = -1;
  function updateHud() {
    if (game.score !== lastScore) { scoreEl.textContent = game.score; lastScore = game.score; }
    if (game.high !== lastHigh) { highEl.textContent = game.high; lastHigh = game.high; }
    if (game.level !== lastLevel) { levelEl.textContent = game.level; lastLevel = game.level; }
    if (game.lives !== lastLives) {
      livesEl.innerHTML = '';
      for (let i = 0; i < Math.max(0, game.lives - 1); i++) {
        const s = document.createElement('span');
        s.className = 'life';
        livesEl.appendChild(s);
      }
      lastLives = game.lives;
    }
  }
  setInterval(updateHud, 100);

  function showOverlay(show, title, text, button) {
    if (title) overlayTitle.textContent = title;
    if (text) overlayText.innerHTML = text;
    if (button) startBtn.textContent = button;
    overlay.classList.toggle('hidden', !show);
  }

  function togglePause() {
    if (game.phase === 'playing' || game.phase === 'ready') {
      game.prevPhase = game.phase;
      game.phase = 'paused';
      pauseBtn.textContent = '▶';
    } else if (game.phase === 'paused') {
      game.phase = game.prevPhase || 'playing';
      pauseBtn.textContent = 'II';
    }
  }

  function refreshSoundBtn() {
    soundBtn.classList.toggle('off', audio.muted);
    soundBtn.setAttribute('aria-label', audio.muted ? 'Activar sonido' : 'Silenciar');
  }

  startBtn.addEventListener('click', function () {
    audio.unlock();
    newGame();
  });
  pauseBtn.addEventListener('click', function () { audio.unlock(); togglePause(); });
  soundBtn.addEventListener('click', function () { audio.unlock(); audio.toggle(); refreshSoundBtn(); });
  refreshSoundBtn();

  // ---------------------------------------------------------------------------
  // Controles: teclado, botones y deslizamientos
  // ---------------------------------------------------------------------------
  function setDir(dir) {
    if (!game.pac) return;
    game.pac.nextDir = dir;
    if (game.phase === 'paused') togglePause();
  }

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
  };
  window.addEventListener('keydown', function (e) {
    if (KEYS[e.key]) {
      e.preventDefault();
      if (game.phase === 'title' || game.phase === 'gameover') { audio.unlock(); newGame(); }
      setDir(KEYS[e.key]);
    } else if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      if (game.phase === 'title' || game.phase === 'gameover') { audio.unlock(); newGame(); }
      else togglePause();
    } else if (e.key === 'm' || e.key === 'M') {
      audio.toggle(); refreshSoundBtn();
    }
  });

  document.querySelectorAll('.dpad-btn').forEach(function (btn) {
    const dir = btn.getAttribute('data-dir');
    const press = function (e) {
      e.preventDefault();
      audio.unlock();
      btn.classList.add('pressed');
      setDir(dir);
    };
    const release = function () { btn.classList.remove('pressed'); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  // Deslizamiento sobre el tablero
  let touchStart = null;
  const SWIPE_MIN = 18;
  function onTouchStart(x, y) { touchStart = { x: x, y: y, handled: false }; }
  function onTouchMove(x, y) {
    if (!touchStart || touchStart.handled) return;
    const dx = x - touchStart.x, dy = y - touchStart.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    touchStart.handled = true;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
  }
  function onTouchEnd() { touchStart = null; }

  const stage = document.getElementById('stage');
  stage.addEventListener('touchstart', function (e) {
    if (e.target.closest('.overlay')) return;
    audio.unlock();
    const t = e.changedTouches[0];
    onTouchStart(t.clientX, t.clientY);
  }, { passive: true });
  stage.addEventListener('touchmove', function (e) {
    if (e.cancelable) e.preventDefault();
    const t = e.changedTouches[0];
    onTouchMove(t.clientX, t.clientY);
  }, { passive: false });
  stage.addEventListener('touchend', onTouchEnd);
  stage.addEventListener('touchcancel', onTouchEnd);

  // Arrastre con ratón (para probar en el Mac)
  let mouseDown = false;
  stage.addEventListener('mousedown', function (e) {
    if (e.target.closest('.overlay')) return;
    mouseDown = true; onTouchStart(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', function (e) { if (mouseDown) onTouchMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', function () { mouseDown = false; onTouchEnd(); });

  // Bloquear el scroll/zoom por gestos en iOS fuera del tablero
  document.addEventListener('touchmove', function (e) {
    if (e.target.closest('.dpad') || e.target.closest('.stage')) {
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  // Pausar al irse a segundo plano
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.phase === 'playing') togglePause();
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 150); });

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  parseMaze();
  game.pac = makePac();
  game.ghosts = GHOST_DEFS.map(makeGhost);
  resize();
  updateHud();
  requestAnimationFrame(function (now) { last = now; frame(now); });

  // Exponer un mínimo para pruebas automatizadas
  window.__pacweb = {
    game: game, MAZE: MAZE, isWalkable: isWalkable, newGame: newGame, setDir: setDir,
    get grid() { return grid; },
    get pelletsLeft() { return pelletsLeft; },
    set pelletsLeft(v) { pelletsLeft = v; }
  };
})();
