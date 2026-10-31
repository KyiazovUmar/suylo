"""Pre-records whole sentences in Suylo's AI voice (same as the online AI path), so they sound smooth on any
device and offline. Sentences come from scripts/sentences.ts. Writes public/sentences/<n>.mp3 and
src/data/sentences.json ({sentence: [file, word starts]}). Only makes what is missing.

Run (from the suylo/ folder):
  node --experimental-strip-types scripts/sentences.ts > /tmp/sentences.json
  ../tools/kyrgyz-tts-mini/.venv/bin/python scripts/gen_sentences.py /tmp/sentences.json
"""

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import io  # noqa: E402

import soundfile as sf  # noqa: E402
from tts_server import sentence  # noqa: E402  (loads the voice model)

# ~33 kbps: clear for one voice, and a few thousand sentences stay small enough to ship
COMPRESSION = 0.85


def smaller(mp3: bytes) -> bytes:
    data, sr = sf.read(io.BytesIO(mp3))
    out = io.BytesIO()
    sf.write(out, data, sr, format="MP3", compression_level=COMPRESSION, bitrate_mode="CONSTANT")
    return out.getvalue()

ROOT = Path(__file__).resolve().parent.parent


def file_name(text: str) -> str:
    """A recording's name comes from its own words, so a different sentence can never take over a name: phones keep
    recordings by name (offline cache), and a reused name would make Suylo say an old sentence."""
    return "t" + hashlib.sha1(text.encode()).hexdigest()[:12]
OUT = ROOT / "public/sentences"
INDEX = ROOT / "src/data/sentences.json"


def main() -> None:
    listed = json.loads(Path(sys.argv[1]).read_text())  # [{key, core}]
    core = {item["key"]: item["core"] for item in listed}
    wanted = list(core)
    OUT.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    index = {k: [v[0], v[1], core[k]] for k, v in index.items() if k in core}
    # older recordings were numbered (s1, s2…): give each its own name
    for text, entry in index.items():
        name = file_name(text)
        if entry[0] != name and (OUT / f"{entry[0]}.mp3").exists():
            (OUT / f"{entry[0]}.mp3").rename(OUT / f"{name}.mp3")
            entry[0] = name
    INDEX.write_text(json.dumps(index, ensure_ascii=False) + "\n")
    for i, text in enumerate(wanted):
        if text in index:
            continue
        name = file_name(text)
        audio, starts = sentence(text)
        (OUT / f"{name}.mp3").write_bytes(smaller(audio))
        index[text] = [name, json.loads(starts), core[text]]
        if i % 50 == 0:
            INDEX.write_text(json.dumps(index, ensure_ascii=False) + "\n")
            print(f"{i + 1}/{len(wanted)}  {text}", flush=True)
    INDEX.write_text(json.dumps(index, ensure_ascii=False) + "\n")
    for f in OUT.glob("*.mp3"):
        if f.stem not in {v[0] for v in index.values()}:
            f.unlink()
    print(f"done: {len(index)} sentences", flush=True)


if __name__ == "__main__":
    main()
