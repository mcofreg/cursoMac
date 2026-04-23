/* Piano learning app - main logic */

(() => {
    // --- Note model ---
    // An octave of white keys + their black keys between them.
    // We render one octave (C..B) plus the octave's top C for a nice frame.
    const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const NOTE_TO_SEMITONE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    // black key sits between (index of white it follows, name)
    const BLACKS = [
        { after: 0, name: 'C#' },
        { after: 1, name: 'D#' },
        { after: 3, name: 'F#' },
        { after: 4, name: 'G#' },
        { after: 5, name: 'A#' },
    ];

    // Parse song note token like 'C', 'F#', 'C2' (C next octave), 'G-1' (G below)
    function parseToken(tok) {
        const m = tok.match(/^([A-G]#?)(-?\d)?$/);
        if (!m) return null;
        return { name: m[1], octaveOffset: m[2] ? parseInt(m[2], 10) : 0 };
    }

    function midiFor(name, baseOctave, offset = 0) {
        const oct = baseOctave + offset;
        return 12 * (oct + 1) + NOTE_TO_SEMITONE[name]; // MIDI: C-1 = 0, C4 = 60
    }

    // --- State ---
    const state = {
        mode: 'free',
        baseOctave: 4,
        showLabels: true,
        notesTarget: null,
        notesHits: 0,
        notesTries: 0,
        song: null,
        songIndex: 0,
        songPlaying: false,
        songDemoTimer: null,
    };

    // --- DOM refs ---
    const $ = (s) => document.querySelector(s);
    const pianoEl = $('#piano');
    const overlay = $('#tapToStart');
    const startBtn = $('#startBtn');

    // --- Piano rendering ---
    function buildPiano() {
        pianoEl.innerHTML = '';

        // Render 7 white keys (+ top C for octave wrap = 8 white keys)
        const whiteNames = [...WHITE_NOTES, 'C']; // ends with high C from next octave
        const whiteEls = [];

        whiteNames.forEach((name, i) => {
            const isTopC = i === 7;
            const octaveOffset = isTopC ? 1 : 0;
            const midi = midiFor(name, state.baseOctave, octaveOffset);

            const el = document.createElement('div');
            el.className = 'key white';
            if (!state.showLabels) el.classList.add('no-labels');
            el.dataset.name = name;
            el.dataset.octaveOffset = String(octaveOffset);
            el.dataset.midi = String(midi);

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = name + (isTopC ? '↑' : '');
            el.appendChild(label);

            attachKeyEvents(el, midi);
            pianoEl.appendChild(el);
            whiteEls.push(el);
        });

        // Black keys overlay - positioned by white key index
        const totalWhite = whiteNames.length;
        BLACKS.forEach(b => {
            const el = document.createElement('div');
            el.className = 'key black';
            if (!state.showLabels) el.classList.add('no-labels');
            el.dataset.name = b.name;
            el.dataset.octaveOffset = '0';
            const midi = midiFor(b.name, state.baseOctave, 0);
            el.dataset.midi = String(midi);

            // Position black key centered on the boundary between two white keys.
            // Each white key spans 1/totalWhite of the piano width.
            const leftPct = ((b.after + 1) / totalWhite) * 100 - (9.5 / 2);
            el.style.left = `calc(${leftPct}% - 1px)`;

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = b.name;
            el.appendChild(label);

            attachKeyEvents(el, midi);
            pianoEl.appendChild(el);
        });

        refreshHighlights();
    }

    function attachKeyEvents(el, midi) {
        const id = 'k' + midi + '_' + Math.random().toString(36).slice(2, 6);
        let down = false;

        const press = (e) => {
            if (e.cancelable) e.preventDefault();
            if (down) return;
            down = true;
            el.classList.add('active');
            PianoAudio.noteOn(id, midi);
            onKeyPressed(el);
        };
        const release = (e) => {
            if (e && e.cancelable) e.preventDefault();
            if (!down) return;
            down = false;
            el.classList.remove('active');
            PianoAudio.noteOff(id);
        };

        // Pointer events cover touch + mouse on Safari iOS.
        el.addEventListener('pointerdown', press);
        el.addEventListener('pointerup', release);
        el.addEventListener('pointerleave', release);
        el.addEventListener('pointercancel', release);
        // Fallback for older iOS that lacks pointer events reliably.
        el.addEventListener('touchstart', press, { passive: false });
        el.addEventListener('touchend', release, { passive: false });
        el.addEventListener('touchcancel', release, { passive: false });
    }

    function refreshHighlights() {
        pianoEl.querySelectorAll('.key').forEach(k => k.classList.remove('highlight'));

        if (state.mode === 'notes' && state.notesTarget) {
            const target = state.notesTarget;
            pianoEl.querySelectorAll('.key').forEach(k => {
                if (k.dataset.name === target.name && k.dataset.octaveOffset === '0') {
                    k.classList.add('highlight');
                }
            });
        }
        if (state.mode === 'songs' && state.song && state.songPlaying) {
            const step = state.song.notes[state.songIndex];
            if (step) {
                const parsed = parseToken(step[0]);
                if (parsed) {
                    pianoEl.querySelectorAll('.key').forEach(k => {
                        if (k.dataset.name === parsed.name && k.dataset.octaveOffset === String(parsed.octaveOffset)) {
                            k.classList.add('highlight');
                        }
                    });
                }
            }
        }
    }

    // --- Mode logic ---
    function onKeyPressed(el) {
        const name = el.dataset.name;
        const offset = parseInt(el.dataset.octaveOffset, 10);

        if (state.mode === 'free') {
            $('#freeNoteLabel').textContent = name;
        }

        if (state.mode === 'notes' && state.notesTarget) {
            state.notesTries++;
            $('#notesTries').textContent = state.notesTries;
            if (name === state.notesTarget.name && offset === 0) {
                state.notesHits++;
                $('#notesHits').textContent = state.notesHits;
                flashSuccess();
                setTimeout(newNotesTarget, 400);
            }
        }

        if (state.mode === 'songs' && state.song && state.songPlaying) {
            const step = state.song.notes[state.songIndex];
            const parsed = parseToken(step[0]);
            if (parsed && parsed.name === name && parsed.octaveOffset === offset) {
                advanceSong();
            }
        }
    }

    function flashSuccess() {
        const big = $('#notesTarget');
        big.style.transition = 'transform 0.2s ease, color 0.2s ease';
        big.style.transform = 'scale(1.15)';
        big.style.color = 'var(--good)';
        setTimeout(() => {
            big.style.transform = '';
            big.style.color = '';
        }, 300);
    }

    function newNotesTarget() {
        // Pick a random note from the visible white keys (pedagogical: start with naturals).
        const pick = WHITE_NOTES[Math.floor(Math.random() * WHITE_NOTES.length)];
        state.notesTarget = { name: pick };
        $('#notesTarget').textContent = pick;
        refreshHighlights();
    }

    // --- Songs ---
    function populateSongs() {
        const sel = $('#songPicker');
        sel.innerHTML = '';
        Songs.forEach((s, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
        selectSong(0);
    }

    function selectSong(idx) {
        state.song = Songs[idx];
        state.songIndex = 0;
        state.songPlaying = false;
        renderSongSequence();
        updateSongTarget();
        updateProgress();
    }

    function renderSongSequence() {
        const seq = $('#songSequence');
        seq.innerHTML = '';
        if (!state.song) return;
        // Show up to 14 upcoming notes in a horizontal list.
        const start = Math.max(0, state.songIndex - 1);
        const end = Math.min(state.song.notes.length, start + 14);
        for (let i = start; i < end; i++) {
            const n = state.song.notes[i];
            const pill = document.createElement('span');
            pill.className = 'note-pill';
            if (i < state.songIndex) pill.classList.add('done');
            if (i === state.songIndex) pill.classList.add('current');
            pill.textContent = n[0];
            seq.appendChild(pill);
        }
    }

    function updateSongTarget() {
        const tgt = $('#songTarget');
        if (!state.song) { tgt.textContent = '—'; return; }
        if (state.songIndex >= state.song.notes.length) { tgt.textContent = '✓'; return; }
        tgt.textContent = state.song.notes[state.songIndex][0];
    }

    function updateProgress() {
        const bar = $('#songProgress');
        if (!state.song) { bar.style.width = '0%'; return; }
        const pct = (state.songIndex / state.song.notes.length) * 100;
        bar.style.width = pct + '%';
    }

    function advanceSong() {
        state.songIndex++;
        updateSongTarget();
        updateProgress();
        renderSongSequence();
        refreshHighlights();

        if (state.songIndex >= state.song.notes.length) {
            state.songPlaying = false;
            $('#songStart').textContent = 'Otra vez';
            $('#songTarget').textContent = '✓';
        }
    }

    function startSong() {
        state.songIndex = 0;
        state.songPlaying = true;
        $('#songStart').textContent = 'Reiniciar';
        updateSongTarget();
        updateProgress();
        renderSongSequence();
        refreshHighlights();
    }

    function demoSong() {
        if (!state.song) return;
        clearTimeout(state.songDemoTimer);
        const beat = 60 / state.song.tempo * 1000; // ms per beat
        let t = 0;
        state.song.notes.forEach((step, i) => {
            const parsed = parseToken(step[0]);
            const dur = step[1] * beat;
            setTimeout(() => {
                const midi = midiFor(parsed.name, state.baseOctave, parsed.octaveOffset);
                const id = 'demo_' + i;
                PianoAudio.noteOn(id, midi);
                // Briefly flash the matching key.
                pianoEl.querySelectorAll('.key').forEach(k => {
                    if (k.dataset.name === parsed.name && k.dataset.octaveOffset === String(parsed.octaveOffset)) {
                        k.classList.add('active');
                        setTimeout(() => k.classList.remove('active'), Math.min(dur, 500));
                    }
                });
                setTimeout(() => PianoAudio.noteOff(id), Math.max(120, dur * 0.9));
            }, t);
            t += dur;
        });
    }

    // --- Mode switching ---
    function switchMode(mode) {
        state.mode = mode;
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        $('#panel-' + mode).classList.add('active');

        if (mode === 'notes' && !state.notesTarget) newNotesTarget();
        refreshHighlights();
    }

    // --- Octave ---
    function setOctave(v) {
        state.baseOctave = Math.max(2, Math.min(6, v));
        $('#octValue').textContent = String(state.baseOctave);
        buildPiano();
    }

    // --- Wire up ---
    function wire() {
        document.querySelectorAll('.tab').forEach(t => {
            t.addEventListener('click', () => switchMode(t.dataset.mode));
        });

        $('#octDown').addEventListener('click', () => setOctave(state.baseOctave - 1));
        $('#octUp').addEventListener('click', () => setOctave(state.baseOctave + 1));

        $('#showLabels').addEventListener('change', (e) => {
            state.showLabels = e.target.checked;
            pianoEl.querySelectorAll('.key').forEach(k => k.classList.toggle('no-labels', !state.showLabels));
        });

        $('#notesNext').addEventListener('click', newNotesTarget);

        $('#songPicker').addEventListener('change', (e) => selectSong(parseInt(e.target.value, 10)));
        $('#songStart').addEventListener('click', startSong);
        $('#songDemo').addEventListener('click', demoSong);

        startBtn.addEventListener('click', async () => {
            await PianoAudio.unlock();
            overlay.classList.add('hidden');
        });
    }

    // --- Boot ---
    function boot() {
        wire();
        populateSongs();
        buildPiano();
        $('#octValue').textContent = String(state.baseOctave);
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
