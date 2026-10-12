// Voice Notes: record audio (MediaRecorder) + live transcript (Web Speech API)

const $ = (id) => document.getElementById(id);
const recBtn = $("recBtn"), langSel = $("lang"), statusEl = $("status");
const transcriptEl = $("transcript"), player = $("player"), audioLink = $("audioLink");
const canvas = $("viz"), ctx = canvas.getContext("2d");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let stream, recorder, chunks = [], recognition, audioCtx, analyser, rafId;
let recording = false, finalText = "";
let lastBlob = null, whisperTranscriber = null, whisperModelId = null, whisperLoading = null;

const WHISPER_CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2";
const WHISPER_LANG = { "ur-PK": "urdu", "en-US": "english", "en-GB": "english", "hi-IN": "hindi", "ar-SA": "arabic" };
const WHISPER_WARN_SECS = 180; // warn on long recordings

const modeRadios = [...document.querySelectorAll('input[name="mode"]')];
const whisperOpts = $("whisperOpts"), whisperModelSel = $("whisperModel");
const whisperBtn = $("whisperBtn"), whisperStatus = $("whisperStatus");
const dlWrap = $("dlWrap"), dlBar = $("dlBar");

const getMode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || "live";

modeRadios.forEach((r) => r.addEventListener("change", () => {
  const whisper = getMode() === "whisper";
  whisperOpts.hidden = !whisper;
  whisperBtn.hidden = !(whisper && lastBlob);
  whisperStatus.textContent = whisper && !lastBlob
    ? "Record something first, then transcribe it offline."
    : "";
}));

function setModeEnabled(on) { modeRadios.forEach((r) => (r.disabled = !on)); }

if (!SpeechRecognition) {
  $("note").textContent =
    "Live transcription is not supported in this browser. Use Chrome, Edge or Safari. Recording still works.";
}

// ---------- Recording ----------
async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    statusEl.textContent = "Microphone blocked: " + err.message;
    return;
  }

  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = saveAudio;
  recorder.start();

  startVisualizer(stream);
  setModeEnabled(false);
  if (getMode() === "live") {
    startTranscription();
  } else {
    whisperStatus.textContent = "Recording… transcribe it offline when you stop.";
  }

  recording = true;
  recBtn.textContent = "■ Stop";
  recBtn.classList.add("on");
  statusEl.textContent = "Recording…";
}

function stop() {
  recording = false;
  recorder && recorder.state !== "inactive" && recorder.stop();
  stream && stream.getTracks().forEach((t) => t.stop());
  recognition && recognition.stop();
  stopVisualizer();
  setModeEnabled(true);
  recBtn.textContent = "● Start";
  recBtn.classList.remove("on");
  statusEl.textContent = "Done";
}

function saveAudio() {
  const blob = new Blob(chunks, { type: recorder.mimeType });
  lastBlob = blob;
  const url = URL.createObjectURL(blob);
  const ext = recorder.mimeType.includes("mp4") ? "m4a" : recorder.mimeType.includes("ogg") ? "ogg" : "webm";
  player.src = url; player.hidden = false;
  audioLink.href = url; audioLink.download = `recording-${Date.now()}.${ext}`; audioLink.hidden = false;
  if (getMode() === "whisper") {
    whisperBtn.hidden = false;
    whisperStatus.textContent = "Recording saved. Hit “Transcribe with Whisper” whenever you're ready.";
  }
}

// ---------- Transcription ----------
function startTranscription() {
  if (!SpeechRecognition) return;
  finalText = transcriptEl.innerText.trim();
  if (finalText) finalText += "\n";

  recognition = new SpeechRecognition();
  recognition.lang = langSel.value;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += text + " ";
      else interim += text;
    }
    transcriptEl.innerHTML = "";
    transcriptEl.append(finalText);
    const span = document.createElement("span");
    span.className = "interim";
    span.textContent = interim;
    transcriptEl.append(span);
  };

  recognition.onerror = (e) => { statusEl.textContent = "Transcription error: " + e.error; };
  // Chrome stops after silence, so restart while still recording
  recognition.onend = () => { if (recording) try { recognition.start(); } catch {} };
  recognition.start();
}

// ---------- Visualizer ----------
function startVisualizer(s) {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  audioCtx.createMediaStreamSource(s).connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#ff4d5e";

  (function draw() {
    rafId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width / data.length;
    data.forEach((v, i) => {
      const h = (v / 255) * canvas.height;
      ctx.fillStyle = accent.trim();
      ctx.fillRect(i * w, canvas.height - h, w - 1, h);
    });
  })();
}

function stopVisualizer() {
  cancelAnimationFrame(rafId);
  audioCtx && audioCtx.close();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---------- Buttons ----------
recBtn.onclick = () => (recording ? stop() : start());

$("copyBtn").onclick = async () => {
  await navigator.clipboard.writeText(transcriptEl.innerText);
  statusEl.textContent = "Copied";
};

$("txtBtn").onclick = () => {
  const blob = new Blob([transcriptEl.innerText], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `transcript-${Date.now()}.txt`;
  a.click();
};

$("clearBtn").onclick = () => {
  transcriptEl.innerHTML = ""; finalText = "";
  player.hidden = true; audioLink.hidden = true;
  whisperBtn.hidden = true; lastBlob = null;
  whisperStatus.textContent = ""; dlWrap.hidden = true;
};

// ---------- Whisper offline transcription (transformers.js) ----------
function onWhisperProgress(p) {
  if (p.status === "progress" && p.total) {
    const pct = Math.round((p.loaded / p.total) * 100);
    dlWrap.hidden = false;
    dlBar.style.width = pct + "%";
    whisperStatus.textContent = `Downloading model ${p.file || ""} — ${pct}% (one-time)`;
  } else if (p.status === "done") {
    dlWrap.hidden = true;
  }
}

async function ensureWhisper(modelId) {
  if (whisperTranscriber && whisperModelId === modelId) return whisperTranscriber;
  if (whisperLoading) return whisperLoading; // don't double-download
  whisperLoading = (async () => {
    let transformers;
    try {
      transformers = await import(/* @vite-ignore */ WHISPER_CDN);
    } catch (err) {
      throw new Error("Couldn't load the Whisper library — internet is needed for the first download. Try Live mode instead.");
    }
    try {
      whisperTranscriber = await transformers.pipeline(
        "automatic-speech-recognition",
        modelId,
        { progress_callback: onWhisperProgress }
      );
      whisperModelId = modelId;
      return whisperTranscriber;
    } catch (err) {
      whisperTranscriber = null; whisperModelId = null;
      throw new Error("Model download failed (" + (err.message || "network error") + "). Check your connection and try again, or use Live mode.");
    } finally {
      whisperLoading = null;
    }
  })();
  return whisperLoading;
}

// MediaRecorder output (webm/opus, m4a…) -> 16 kHz mono Float32 for Whisper
async function blobToWhisperAudio(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC();
  let decoded;
  try {
    decoded = await actx.decodeAudioData(buf);
  } finally {
    actx.close();
  }
  const secs = decoded.duration;
  if (!secs || secs < 0.5) {
    throw new Error("The recording is empty — nothing to transcribe.");
  }
  if (secs > WHISPER_WARN_SECS) {
    whisperStatus.textContent = `Note: ${Math.round(secs)}s is long — transcription may take a while on this device.`;
  }
  const offline = new OfflineAudioContext(1, Math.ceil(secs * 16000), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

whisperBtn.onclick = async () => {
  if (!lastBlob) return;
  const modelId = whisperModelSel.value;
  whisperBtn.disabled = true;
  try {
    whisperStatus.textContent = "Loading Whisper model… (first run downloads it, then it's cached)";
    const transcriber = await ensureWhisper(modelId);
    whisperStatus.textContent = "Decoding audio…";
    const audio = await blobToWhisperAudio(lastBlob);
    const language = WHISPER_LANG[langSel.value] || "english";
    whisperStatus.textContent = `Transcribing offline (${language})… this runs on your device`;
    const out = await transcriber(audio, {
      language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const text = (out.text || "").trim();
    const cur = transcriptEl.innerText.trim();
    transcriptEl.textContent = (cur ? cur + "\n" : "") + text;
    dlWrap.hidden = true;
    whisperStatus.textContent = text
      ? "Done — transcript added below, you can edit it."
      : "Done, but no speech was detected in the recording.";
  } catch (err) {
    dlWrap.hidden = true;
    whisperStatus.textContent = "Whisper error: " + err.message;
  } finally {
    whisperBtn.disabled = false;
  }
};
