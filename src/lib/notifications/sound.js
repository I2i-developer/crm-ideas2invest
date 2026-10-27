let audioContext;
const played = new Set();
const STORAGE_PREFIX = "crm-notification-chime:";

export async function unlockNotificationAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  try {
    audioContext ||= new AudioContext();
    if (audioContext.state !== "running") await audioContext.resume();
    return audioContext.state === "running";
  } catch { return false; }
}

function chime() {
  if (!audioContext || audioContext.state !== "running") return false;
  const start = audioContext.currentTime;
  for (const [offset, frequency] of [[0, 659.25], [0.14, 880]]) {
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = "sine"; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(0.12, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.32);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(start + offset); oscillator.stop(start + offset + 0.35);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  return true;
}

export async function playNotificationSound(userId, notificationId) {
  if (!userId || !notificationId || document.hidden || audioContext?.state !== "running") return false;
  const key = STORAGE_PREFIX + userId, id = String(notificationId);
  const play = () => {
    if (played.has(userId + ":" + id)) return false;
    let recent = [];
    try {
      recent = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(recent)) recent = [];
      if (recent.includes(id)) return false;
      localStorage.setItem(key, JSON.stringify([...recent.slice(-99), id]));
    } catch { /* Sound still works when device storage is unavailable. */ }
    played.add(userId + ":" + id);
    if (played.size > 200) played.delete(played.values().next().value);
    return chime();
  };
  if (navigator.locks) return navigator.locks.request(key, play);
  return play();
}

export async function testNotificationSound() {
  return await unlockNotificationAudio() && chime();
}
