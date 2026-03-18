# Spec 017 — Audio Context (Voice Input)

## Problem

Interacting with the panel requires typing text instructions or manually staging class changes. Users should be able to speak instructions ("make this heading larger", "change the background to blue") and have those words automatically queued as agent context — hands-free, while looking at the page.

---

## Goal

Add a voice input mode to the panel that:
1. Records audio from the user's microphone
2. Automatically detects silence to chunk recordings into utterances
3. Transcribes each chunk via OpenAI Whisper
4. Delivers the transcript as a `message`-kind patch in the existing change queue — where an AI agent (Copilot, Claude, etc.) picks it up via `implement_next_change`

---

## Agent Compatibility

| Agent | Audio input | Approach |
|---|---|---|
| **Claude (Opus/Sonnet/Haiku)** | ❌ text + image only | Transcribe first → send transcript |
| **OpenAI GPT-4o / gpt-audio** | ✅ native audio | Can send audio directly OR transcribe first |
| **GitHub Copilot** | ❌ text/code only | Transcribe first → send transcript |

**Decision:** Always transcribe to text before queuing. This works universally across all agents and keeps the MCP message format consistent.

---

## Architecture

```
Browser panel
  MicButton (hold-to-record or toggle)
    ↓ getUserMedia
  AudioContext + AnalyserNode  ← RMS volume monitoring (VAD)
    ↓  silence detected (>500ms below threshold)
  MediaRecorder chunk (audio/webm)
    ↓ POST /audio/transcribe
  Express server
    ↓ OpenAI Whisper API (gpt-4o-transcribe)
  transcript (string)
    ↓ WebSocket PATCH_UPDATE
  Panel queues transcript as message-kind patch
    ↓ user commits
  Agent picks up via implement_next_change
```

---

## Voice Activity Detection (VAD)

All VAD runs in the browser — no server-side streaming needed.

### How it works

```
AudioContext
  └── MediaStreamSourceNode (microphone)
        └── AnalyserNode
              └── poll every animation frame → compute RMS
```

RMS (Root Mean Square) is computed from the time-domain waveform:

```typescript
analyser.getByteTimeDomainData(dataArray);
const rms = Math.sqrt(
  dataArray.reduce((sum, v) => sum + (v - 128) ** 2, 0) / dataArray.length
);
const isSilent = rms < SILENCE_THRESHOLD; // ~5–10 typical starting value
```

### Chunking on silence

- When `isSilent` becomes true, start a silence timer
- If still silent after `SILENCE_GAP_MS` (~500ms), stop the current `MediaRecorder` → fires `ondataavailable`
- POST that chunk to `/audio/transcribe`
- Immediately start a new `MediaRecorder` chunk (don't miss next words)

### Tuning parameters (exposed as UI controls or constants)

| Parameter | Default | Notes |
|---|---|---|
| `SILENCE_THRESHOLD` | 8 | RMS cutoff; raise in noisy environments |
| `SILENCE_GAP_MS` | 500 | Debounce — avoids splitting mid-sentence |
| `MIN_CHUNK_MS` | 300 | Discard chunks shorter than this (breath/click noise) |

---

## Transcription API

### Endpoint (server)

```
POST /audio/transcribe
Content-Type: multipart/form-data
Body: { audio: <blob>, mimeType: "audio/webm" }

Response: { transcript: string }
```

### Server implementation

Uses `openai` npm package:

```typescript
import OpenAI from "openai";
const openai = new OpenAI(); // reads OPENAI_API_KEY from env

const transcription = await openai.audio.transcriptions.create({
  model: "gpt-4o-transcribe",
  file: audioFile,       // multer-provided temp file
  response_format: "text",
  stream: true,          // optional: stream text tokens back as they arrive
});
```

**Model options:**
- `gpt-4o-transcribe` — best accuracy, supports streaming response
- `gpt-4o-mini-transcribe` — faster, cheaper, slightly lower accuracy
- `whisper-1` — original Whisper, no streaming

Streaming transcription (`stream: true`) means text starts arriving before Whisper finishes processing the full chunk — improves perceived latency.

---

## Panel UI

### `MicButton` component

- Single button in the panel toolbar (near "Queue Change")
- States: `idle` → `listening` → `transcribing` → `idle`
- Visual feedback:
  - `listening`: pulsing red dot + live RMS volume meter (thin bar or ring)
  - `transcribing`: spinner
  - After transcript: text appears in the same input used for message-kind patches, pre-filled for user review before committing

### Volume meter

Small visual indicator showing live RMS — helps users understand why chunking did/didn't trigger. A thin bar under the mic button or a glowing ring around it.

---

## Data Flow into Existing Queue

Transcripts are delivered as **`message`-kind patches** — the same type used when a user types a free-text instruction in the panel. No changes to the MCP tool interface or `implement_next_change` behavior needed.

```typescript
// panel sends this after transcript arrives:
ws.send({
  type: 'PATCH_PREVIEW',
  patch: {
    kind: 'message',
    message: transcript,   // e.g. "make the heading font larger"
    elementKey: currentElementKey ?? null,
  }
});
```

User sees the transcript appear as a staged patch, reviews it, then commits as normal.

---

## Open Questions

1. **Auto-commit vs manual commit?** Should transcripts be auto-committed, or require user review first? Start with manual review — less surprising.
2. **Continuous vs push-to-talk?** Push-to-talk (hold mic button) is simpler and avoids accidental recording. Continuous mode (toggle on/off) is more hands-free. Start with toggle.
3. **Dynamic noise floor?** Instead of a fixed `SILENCE_THRESHOLD`, compute a rolling baseline from the first 1s of silence at session start. More robust in different environments.
4. **API key location?** `OPENAI_API_KEY` read from env on the server. Never exposed to the browser.
5. **Chunked transcript concatenation?** If a user speaks across multiple silence-split chunks, should the panel concatenate them into one patch or create separate patches? Start with separate patches per chunk.

---

## Implementation Plan

1. **Server:** Add `POST /audio/transcribe` endpoint with `multer` for file upload + OpenAI client call
2. **Browser VAD:** `useVAD` hook — manages `AudioContext`, `AnalyserNode`, `MediaRecorder`, silence detection loop
3. **Panel UI:** `MicButton` component + volume meter indicator
4. **Wire up:** Send transcript over existing WebSocket as `message`-kind patch, pre-fill the panel's message input

Dependencies needed:
- `openai` npm package (server)
- `multer` (server, for multipart upload handling)
- No new browser dependencies — Web Audio API is built-in
