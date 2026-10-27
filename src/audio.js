// Quiet, transient mechanical sounds: a shared noise sample, filtered impacts,
// low resonators and a compressor. No continuous music, alert tones or beeps.
export function createAudio(makeContext = () => new (window.AudioContext || window.webkitAudioContext)()) {
  let context;
  let master;
  let noise;
  let muted = false;
  let failed = false;
  let voices = 0;
  const lastPlayed = new Map();
  function unlock() {
    if (muted || failed) return;
    try {
      if (!context) {
        context = makeContext();
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -22; compressor.knee.value = 18; compressor.ratio.value = 5;
        master = context.createGain(); master.gain.value = .24;
        master.connect(compressor); compressor.connect(context.destination);
        noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = noise.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .12) / 1.02; data[i] = brown * 3; }
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { failed = true; }
  }
  function play(kind = 'click') {
    if (!context || !master || muted || context.state !== 'running' || voices >= 14) return;
    const now = context.currentTime;
    const gate = kind === 'tesla' ? .075 : kind === 'explosion' ? .09 : .055;
    if (now - (lastPlayed.get(kind) ?? -1) < gate) return;
    lastPlayed.set(kind, now);
    const config = {
      click: [.035, 900, .09, 0], muzzle: [.18, 1250, .7, 72], shot: [.18, 1250, .7, 72],
      hit: [.19, 650, .42, 48], splash: [.24, 2100, .25, 0], explosion: [.65, 420, .85, 43],
      rail: [.6, 1650, .9, 57], tesla: [.15, 2900, .28, 0], pulse: [.7, 850, .62, 38],
      'missile-launch': [.32, 1700, .48, 0], event: [.11, 1200, .16, 0], charge: [.32, 900, .18, 45],
    }[kind];
    if (!config) return;
    const [duration, frequency, volume, thump] = config;
    const source = context.createBufferSource(); source.buffer = noise;
    source.playbackRate.value = kind === 'rail' ? .7 : 1;
    const filter = context.createBiquadFilter();
    filter.type = kind === 'tesla' ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * .15), now + duration);
    filter.Q.value = kind === 'tesla' ? 1.5 : .7;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.linearRampToValueAtTime(volume, now + .006);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(master);
    voices++;
    source.onended = () => { voices--; source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(now); source.stop(now + duration);
    if (thump) {
      const resonance = context.createOscillator(); resonance.type = 'sine';
      resonance.frequency.setValueAtTime(thump * 2, now);
      resonance.frequency.exponentialRampToValueAtTime(thump * .42, now + duration);
      const body = context.createGain(); body.gain.setValueAtTime(volume * .36, now);
      body.gain.exponentialRampToValueAtTime(.0001, now + duration);
      resonance.connect(body); body.connect(master);
      resonance.onended = () => { resonance.disconnect(); body.disconnect(); };
      resonance.start(now); resonance.stop(now + duration);
    }
  }
  return {
    unlock, play,
    setMuted(value) { muted = value; if (master) master.gain.setTargetAtTime(muted ? 0 : .24, context.currentTime, .04); },
    suspend() { context?.suspend().catch(() => {}); },
    resume() { if (!muted) context?.resume().catch(() => {}); },
  };
}
