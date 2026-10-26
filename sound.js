const STORAGE_KEY = 'eatlog-sound-enabled';
let enabled = true;
try { enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (_) { /* Chế độ riêng tư */ }
let audioContext = null;

export function isSoundEnabled() { return enabled; }
export function toggleSound() {
  enabled = !enabled;
  try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch (_) { /* Bỏ qua */ }
  return enabled;
}

export function playTap() {
  if (!enabled) return;
  try {
    // Chỉ khởi tạo sau thao tác bấm thật của người dùng.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(560, now + 0.12);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
  } catch (_) { /* Không làm gián đoạn thao tác nếu trình duyệt chặn âm thanh */ }
}
