/* ============================================================
   AUDIO CHIPTUNE (Web Audio API, sin archivos externos)
   Efectos de sonido y musiquita 8 bits generados al vuelo.
   ============================================================ */

const Sound = (() => {
    let ctx = null;
    let muted = false;
    let musicTimer = null;

    function ensure() {
        if (!ctx) {
            try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { ctx = null; }
        }
        if (ctx && ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // Reproduce una nota cuadrada (sabor NES)
    function blip(freq, dur, type = 'square', vol = 0.08) {
        if (muted || !ensure()) return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + dur);
    }

    const sfx = {
        move:   () => blip(420, 0.06, 'square', 0.05),
        bone:   () => { blip(880, 0.07); setTimeout(() => blip(1320, 0.09), 60); },
        hit:    () => { blip(160, 0.18, 'sawtooth', 0.12); setTimeout(() => blip(90, 0.25, 'sawtooth', 0.12), 80); },
        win:    () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.16), i * 110)),
        select: () => blip(660, 0.05, 'square', 0.06),
        buy:    () => { blip(740, 0.08); setTimeout(() => blip(988, 0.12), 70); },
        bark:   () => { blip(300, 0.08, 'square', 0.1); setTimeout(() => blip(240, 0.1, 'square', 0.1), 70); },
        lose:   () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.1), i * 180))
    };

    // Melodía de fondo en bucle (simple, alegre, 8 bits)
    function startMusic() {
        if (muted || !ensure()) return;
        stopMusic();
        const melody = [
            523, 659, 784, 659, 523, 587, 659, 587,
            523, 659, 784, 1047, 880, 784, 659, 587
        ];
        let i = 0;
        musicTimer = setInterval(() => {
            blip(melody[i % melody.length], 0.16, 'triangle', 0.035);
            if (i % 2 === 0) blip(melody[i % melody.length] / 2, 0.18, 'square', 0.02);
            i++;
        }, 230);
    }

    function stopMusic() {
        if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    }

    function toggleMute() {
        muted = !muted;
        if (muted) stopMusic();
        return muted;
    }

    return { sfx, startMusic, stopMusic, toggleMute, ensure, isMuted: () => muted };
})();
