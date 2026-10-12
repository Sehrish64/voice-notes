# 🎙️ Voice Notes

Record your voice in the browser and get a live transcript. Plain HTML, CSS and JavaScript, no build step, no backend.

## Features
- Record audio with `MediaRecorder`
- Two transcription modes:
  - **⚡ Live** — Web Speech API (Urdu, English, Hindi, Arabic), instant, needs internet
  - **🔒 Whisper offline** — runs Whisper in your browser via transformers.js, fully private after the one-time model download
- Whisper model picker: `whisper-small` (better accuracy) or `whisper-tiny` (faster, smaller)
- Waveform visualizer
- Edit, copy or download the transcript (.txt)
- Download the recording

## Offline (Whisper) mode
1. Pick **🔒 Whisper offline** under "Transcription mode".
2. Choose a model: **small** (default, better accuracy) or **tiny** (faster, less accurate).
3. Record as usual, stop, then hit **"Transcribe with Whisper"**.

First run downloads the model **once** (~550 MB for small, ~100 MB for tiny) and the browser caches it — after that, transcription works with no internet at all. A progress bar shows the download. The model runs on your device's CPU, so expect roughly real-time-to-slower speed on phones; recordings over 3 minutes show a warning because they'll be slow on the small model.

Whisper reads the language from the language selector: اردو → `urdu`, English → `english`, हिन्दी → `hindi`, العربية → `arabic`.

## Privacy notes — read this
- **Live mode is NOT private:** in Chrome, the Web Speech API sends your audio to Google's servers for recognition.
- **Whisper mode IS private** (after first setup): audio never leaves your device. But the *first* run needs internet twice — once to fetch the transformers.js library from the jsDelivr CDN, once to download the model weights from Hugging Face. After that, airplane mode works.

## Run it
Mic access needs HTTPS or localhost:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Use Chrome or Edge for best results.

## Notes
- In Chrome, the Web Speech API sends audio to Google's servers for recognition, so Live mode is not fully offline. Use Whisper offline mode for private transcription.
- Whisper small (~550 MB) is much heavier than tiny (~100 MB) — on a slow connection, start with tiny.
- Whisper accuracy on Urdu/Hindi is generally better than the Web Speech API, but still not perfect — always proofread.

## Roadmap
- [x] Whisper in-browser (offline mode)
- [ ] Save notes in IndexedDB
- [ ] AI summary of each recording
- [ ] Roman Urdu output

## License
MIT
