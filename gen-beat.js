// Generate a rock-style drum + bass loop as a WAV file
const fs = require('fs');
const SR = 44100;
const BPM = 128;
const BEATS = 32;
const beatSec = 60 / BPM;
const totalSamples = Math.floor(SR * beatSec * BEATS);
const buf = new Float32Array(totalSamples);

function mix(arr, pos, val) { if (pos >= 0 && pos < arr.length) arr[pos] += val; }

function kick(buf, startSample) {
  for (let i = 0; i < SR * 0.25; i++) {
    const t = i / SR;
    const freq = 150 * Math.exp(-t * 20) + 40;
    const env = Math.exp(-t * 12);
    mix(buf, startSample + i, Math.sin(2 * Math.PI * freq * t) * env * 0.7);
  }
}

function snare(buf, startSample) {
  for (let i = 0; i < SR * 0.18; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 18);
    const noise = (Math.random() * 2 - 1) * 0.35 * env;
    const tone = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 30) * 0.3;
    mix(buf, startSample + i, noise + tone);
  }
}

function hihat(buf, startSample, open) {
  const len = open ? 0.12 : 0.04;
  const decay = open ? 8 : 35;
  for (let i = 0; i < SR * len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * decay);
    mix(buf, startSample + i, (Math.random() * 2 - 1) * 0.12 * env);
  }
}

function bassNote(buf, startSample, freq, duration) {
  for (let i = 0; i < SR * duration; i++) {
    const t = i / SR;
    const env = Math.min(1, t * 50) * Math.exp(-t * 3);
    let val = 0;
    // thick bass: fundamental + slight overtone
    val += Math.sin(2 * Math.PI * freq * t) * 0.5;
    val += Math.sin(2 * Math.PI * freq * 2 * t) * 0.15;
    // soft saturation
    val = Math.tanh(val * 2) * 0.4;
    mix(buf, startSample + i, val * env);
  }
}

function powerChord(buf, startSample, rootFreq, duration) {
  const fifth = rootFreq * 1.498;
  const octave = rootFreq * 2;
  for (let i = 0; i < SR * duration; i++) {
    const t = i / SR;
    const env = Math.min(1, t * 80) * Math.exp(-t * 2.5);
    let val = 0;
    // sawtooth approximation for crunch
    for (let h = 1; h <= 6; h++) {
      val += Math.sin(2 * Math.PI * rootFreq * h * t) / h * 0.12;
      val += Math.sin(2 * Math.PI * fifth * h * t) / h * 0.08;
      val += Math.sin(2 * Math.PI * octave * h * t) / h * 0.06;
    }
    // distortion
    val = Math.tanh(val * 4) * 0.18;
    mix(buf, startSample + i, val * env);
  }
}

// 4 bars of 4 beats = 16 beats per section, 2 sections = 32 beats
// Progression: E-E-G-A (bars 1-2), A-G-E-E (bars 3-4), repeat with variation
const bassSeq = [82.4,82.4,98,110, 110,98,82.4,82.4, 82.4,82.4,98,110, 110,98,82.4,82.4];
const chordSeq = [82.4,82.4,98,110, 110,98,82.4,82.4, 82.4,82.4,98,110, 110,98,82.4,82.4];

for (let beat = 0; beat < BEATS; beat++) {
  const s = Math.floor(beat * beatSec * SR);
  const halfBeat = Math.floor(beatSec * SR / 2);
  const quarterBeat = Math.floor(beatSec * SR / 4);
  const bar = Math.floor(beat / 4);
  const beatInBar = beat % 4;
  const section = Math.floor(beat / 16); // 0 or 1

  // --- KICK ---
  if (beatInBar === 0 || beatInBar === 2) kick(buf, s);
  // double kick before bar 4 and bar 8 (fills)
  if ((bar === 3 || bar === 7) && beatInBar === 3) {
    kick(buf, s); kick(buf, s + quarterBeat); kick(buf, s + halfBeat); kick(buf, s + halfBeat + quarterBeat);
  }
  // ghost kick on offbeats in section 2 for energy
  if (section === 1 && beatInBar === 1) kick(buf, s + halfBeat);

  // --- SNARE ---
  if (beatInBar === 1 || beatInBar === 3) {
    // fill on last bar of each section
    if ((bar === 3 || bar === 7) && beatInBar === 3) {
      snare(buf, s); snare(buf, s + quarterBeat * 2); snare(buf, s + quarterBeat * 3);
    } else {
      snare(buf, s);
    }
  }

  // --- HI-HAT ---
  hihat(buf, s, beatInBar === 2);
  hihat(buf, s + halfBeat, false);
  // 16th hats in section 2 for drive
  if (section === 1) {
    hihat(buf, s + quarterBeat, false);
    hihat(buf, s + quarterBeat * 3, false);
  }

  // --- BASS ---
  const bassIdx = beat % bassSeq.length;
  if (beatInBar === 0 || beatInBar === 2) {
    bassNote(buf, s, bassSeq[bassIdx], beatSec * 1.8);
  }
  // walking bass on offbeats in section 2
  if (section === 1 && (beatInBar === 1 || beatInBar === 3)) {
    bassNote(buf, s, bassSeq[bassIdx] * 1.25, beatSec * 0.8);
  }

  // --- POWER CHORDS ---
  const chordIdx = Math.floor(beat / 2) % chordSeq.length;
  // main chord hits on beat 1 and 3 of each bar
  if (beatInBar === 0) {
    powerChord(buf, s, chordSeq[chordIdx], beatSec * 1.8);
  }
  if (beatInBar === 2) {
    powerChord(buf, s, chordSeq[chordIdx] * 1.059, beatSec * 1.2);
  }
  // extra stab on beat 4 offbeat in section 2
  if (section === 1 && beatInBar === 3 && bar !== 7) {
    powerChord(buf, s + halfBeat, chordSeq[chordIdx], beatSec * 0.4);
  }
}

// Normalize
let peak = 0;
for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
const norm = 0.85 / peak;
for (let i = 0; i < buf.length; i++) buf[i] *= norm;

// Write WAV
function writeWav(filename, samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filename, buffer);
}

writeWav('assets/beat.wav', buf, SR);
console.log('Generated assets/beat.wav (' + (totalSamples / SR).toFixed(2) + 's at ' + BPM + ' BPM)');
