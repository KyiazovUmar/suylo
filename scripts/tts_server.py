"""Suylo's online AI voice: speaks a whole sentence at once, with natural Kyrgyz intonation.

The app works fully offline with pre-made clips; when this server is reachable it is used for
sentences instead (and the app falls back to the clips the moment it is not).

Run (from the suylo/ folder):  npm run ai
  GET /health            → {"ok": true}
  GET /speak?text=...    → audio/mpeg, header X-Word-Starts: [seconds where each word begins]
"""

import io
import json
import sys
import threading
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_audio as g  # noqa: E402

PORT = 8765
VOICE = "woman"
YOUNG = 1.12
SR = 22050
settings = g.Settings(rate=1.25, temperature=0.35)
tts = g.get_tts()
lock = threading.Lock()


@lru_cache(maxsize=512)
def sentence(text: str) -> tuple[bytes, str]:
    text = " ".join(text.lower().split())
    text = text if text[-1] in ".!?" else text + "."
    slowed = g.Settings(rate=settings.rate * YOUNG, temperature=settings.temperature, steps=settings.steps, denoise=settings.denoise)
    with lock:
        audio, durations = g.synthesize_with_timing(tts, g.CARRIER + text, VOICE, slowed)
    ends = np.cumsum(durations) * g.HOP
    lead = g.symbols(g.CARRIER)
    start = int(ends[2 * lead]) - int(0.02 * SR)

    # Where each word begins (in seconds of the final, sped-up clip), so the app can light up cards in time.
    starts, n = [], lead
    for i, word in enumerate(text.split(" ")):
        if i:
            n += 1  # the space
        starts.append(max(0.0, float(ends[2 * n] - start) / SR / YOUNG))
        n += g.symbols(word)

    audio = audio[max(0, start) :].copy()
    fade = int(0.008 * SR)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio = g.speed_up(audio, YOUNG)
    level = 0.015 * np.max(np.abs(audio))
    loud = np.flatnonzero(np.abs(audio) > level)
    if len(loud):
        audio = audio[: loud[-1] + int(0.1 * SR)]
    buf = io.BytesIO()
    sf.write(buf, g.normalize(audio), SR, format="MP3")
    return buf.getvalue(), json.dumps([round(s, 3) for s in starts])


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "X-Word-Starts")
        # Lets an https-hosted Suylo talk to this server on the same computer (Chrome's private network rule).
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            body, kind, extra = b'{"ok": true}', "application/json", {}
        elif url.path == "/speak":
            text = parse_qs(url.query).get("text", [""])[0].strip()
            if not text or not any(c in g._ids for c in text.lower()):
                self.send_response(400)
                self.cors()
                self.end_headers()
                return
            body, starts = sentence(text[:300])
            kind, extra = "audio/mpeg", {"X-Word-Starts": starts}
            # nothing is printed or saved: what the child says is not kept anywhere
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    sentence("салам")  # warm up the model so the first real sentence is quick
    print(f"Suylo AI voice is ready on http://localhost:{PORT}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
