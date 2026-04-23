/* Web Audio synth for piano-like tones. iOS-safe: ctx is resumed on user gesture. */

const PianoAudio = (() => {
    let ctx = null;
    let masterGain = null;
    const active = new Map();

    function midiFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function init() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.35;
        masterGain.connect(ctx.destination);
        return ctx;
    }

    async function unlock() {
        init();
        if (ctx.state !== 'running') {
            try { await ctx.resume(); } catch (e) { /* ignore */ }
        }
        // Play a near-silent blip so iOS formally unlocks the audio graph.
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
    }

    function noteOn(id, midi) {
        init();
        if (active.has(id)) noteOff(id);

        const freq = midiFreq(midi);
        const now = ctx.currentTime;

        // Gain envelope node for overall note amplitude (ADSR-ish).
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.9, now + 0.008);  // attack
        env.gain.exponentialRampToValueAtTime(0.35, now + 0.3); // decay to sustain
        env.connect(masterGain);

        // Low-pass to soften higher partials over time (piano-ish timbre).
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(8000, freq * 10), now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(800, freq * 3), now + 1.2);
        filter.Q.value = 0.6;
        filter.connect(env);

        // Mix three oscillators for a richer tone: fundamental + two harmonics.
        const parts = [
            { type: 'triangle', detune: 0,  gain: 0.6 },
            { type: 'sine',     detune: 12, gain: 0.25 },
            { type: 'sine',     detune: -12, gain: 0.2, octaves: 1 },
        ];

        const oscs = parts.map(p => {
            const o = ctx.createOscillator();
            o.type = p.type;
            o.frequency.value = freq * (p.octaves ? Math.pow(2, p.octaves) : 1);
            o.detune.value = p.detune;
            const g = ctx.createGain();
            g.gain.value = p.gain;
            o.connect(g);
            g.connect(filter);
            o.start(now);
            return o;
        });

        active.set(id, { oscs, env, startedAt: now });
    }

    function noteOff(id) {
        if (!ctx) return;
        const n = active.get(id);
        if (!n) return;
        const now = ctx.currentTime;
        // Release: exponential fade, then stop oscillators.
        try {
            n.env.gain.cancelScheduledValues(now);
            n.env.gain.setValueAtTime(Math.max(0.0001, n.env.gain.value), now);
            n.env.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        } catch (e) { /* ignore */ }
        n.oscs.forEach(o => { try { o.stop(now + 0.38); } catch (e) {} });
        active.delete(id);
    }

    function playNote(id, midi, durationMs = 500) {
        noteOn(id, midi);
        setTimeout(() => noteOff(id), durationMs);
    }

    function setVolume(v) {
        if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
    }

    return { init, unlock, noteOn, noteOff, playNote, setVolume, midiFreq };
})();
