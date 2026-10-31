"""Pre-generates Suylo's voice: one clip per card in src/data/vocab.json, via kyrgyz-tts-mini.

Voices by Ulutsoft LLC for the National Commission on the State Language (Mamtil).
The clips ship with the app, so the child's phone never runs a model and everything works offline.

Usage (from the suylo/ folder):
  ../tools/kyrgyz-tts-mini/.venv/bin/python scripts/gen_audio.py --voice woman --young 1.2
  ../tools/kyrgyz-tts-mini/.venv/bin/python scripts/gen_audio.py --only water milk    # redo single cards
  ../tools/kyrgyz-tts-mini/.venv/bin/python scripts/gen_audio.py --samples           # a few phrases at 4 "younger" levels
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parent.parent
TOOLKIT = ROOT.parent / "tools" / "kyrgyz-tts-mini"
sys.path.insert(0, str(TOOLKIT))

from kyrgyz_tts_mini.acoustic.model import fix_len_compatibility, generate_path, sequence_mask  # noqa: E402
from kyrgyz_tts_mini.config import Settings  # noqa: E402
from kyrgyz_tts_mini.engine import get_tts  # noqa: E402
from kyrgyz_tts_mini.text import _ids, clean, to_ids  # noqa: E402

HOP = 256  # vocoder samples per mel frame

# The voices were trained on whole sentences. Alone, a word's first consonant comes out soft
# (топ → «доп», тиш → «диш»), so each word is spoken after a short lead-in and then cut out.
CARRIER = "мына, "

# Spoken by the mascot itself, not tied to a card.
EXTRA = {"_greeting": "Салам! Менин атым Сүйлө.", "_and": "жана", "_with": "менен", "_go": "Кеттик!"}

# Every variant of the мүчөлөр a child can tap (src/lib/muchos.ts): «алма» + «га», «мектеп» + «ке».
# (One-letter endings like «-м» are not voiced alone; those words use the AI voice.)
_H, _L = "ыиуү", "аеоө"
ENDINGS = (
    [c + v for c in "гкдт" for v in _L]  # га ке да те
    + [c + v + "н" for c in "дт" for v in _L]  # дан тен
    + [c + v + n for c in "ндт" for v in _H for n in ("", "н")]  # ны ди ту / нын дин тун
    + [c + v + "р" for c in "лдт" for v in _L]  # лар дер тор
    + [c + v + "й" for c in "дт" for v in _L]  # дай тей
    + ["с" + v + "з" for v in _H]  # сыз
    + [c + v for c in "лдт" for v in ("уу", "үү")]  # луу дүү
    + [c + v for c in "бп" for v in _H]  # бы пи
    + ["ч" + v for v in _H]  # чы чи
)
EXTRA |= {f"_sfx-{e}": e for e in ENDINGS}

SAMPLES = ["Менин суу ичким келип жатат.", "Ажатканага баргым келип жатат.", "Башым ооруп жатат.", "Апа, мага жардам бер.", "Салам! Менин атым Сүйлө."]


def trim(audio: np.ndarray, sr: int, start_pad: float = 0.03, end_pad: float = 0.1) -> np.ndarray:
    """Cut leading/trailing silence so words in a sentence follow each other quickly.
    The threshold is relative to the loudest sample, and the tail keeps 100 ms so quiet final
    consonants (the т in «сүт», the п in «топ») are never clipped."""
    level = 0.015 * np.max(np.abs(audio))
    loud = np.flatnonzero(np.abs(audio) > level)
    if not len(loud):
        return audio
    return audio[max(0, loud[0] - int(start_pad * sr)) : min(len(audio), loud[-1] + int(end_pad * sr))]


def speed_up(audio: np.ndarray, factor: float) -> np.ndarray:
    """Play `factor` times faster: pitch and formants rise together, which sounds like a smaller, younger voice.
    A windowed-sinc low-pass first keeps the squeezed high frequencies from aliasing."""
    if abs(factor - 1) < 1e-3:
        return audio
    taps = np.arange(129) - 64
    cutoff = 0.5 / factor * 0.92
    kernel = 2 * cutoff * np.sinc(2 * cutoff * taps) * np.hamming(len(taps))
    filtered = np.convolve(audio, kernel / kernel.sum(), mode="same")
    positions = np.arange(int(len(audio) / factor)) * factor
    return np.interp(positions, np.arange(len(audio)), filtered).astype(np.float32)


def normalize(audio: np.ndarray, peak: float = 0.95) -> np.ndarray:
    m = np.max(np.abs(audio))
    return audio if m == 0 else audio * (peak / m)


def write(path: Path, audio: np.ndarray, sr: int) -> Path:
    """MP3 when this libsndfile supports it (small, plays everywhere), otherwise WAV."""
    try:
        sf.write(path.with_suffix(".mp3"), audio, sr, format="MP3")
        return path.with_suffix(".mp3")
    except Exception:
        sf.write(path.with_suffix(".wav"), audio, sr, subtype="PCM_16")
        return path.with_suffix(".wav")


def synthesize_with_timing(tts, text: str, voice: str, settings: Settings) -> tuple[np.ndarray, np.ndarray]:
    """Same steps as the toolkit's engine, but also returns how many mel frames each token lasts."""
    model = tts.voice(voice)
    vocoder, denoiser = tts.vocoder()
    ids = to_ids(text)
    x = torch.tensor([ids], dtype=torch.long, device=tts.device)
    x_lengths = torch.tensor([len(ids)], device=tts.device)
    with torch.inference_mode():
        mu_x, logw, x_mask = model.encoder(x, x_lengths)
        w = torch.ceil(torch.exp(logw) * x_mask) * settings.rate
        y_lengths = torch.clamp_min(torch.sum(w, [1, 2]), 1).long()
        y_max = y_lengths.max()
        y_mask = sequence_mask(y_lengths, fix_len_compatibility(y_max)).unsqueeze(1).to(x_mask.dtype)
        attn = generate_path(w.squeeze(1), (x_mask.unsqueeze(-1) * y_mask.unsqueeze(2)).squeeze(1))
        mu_y = torch.matmul(attn.transpose(1, 2), mu_x.transpose(1, 2)).transpose(1, 2)
        mel = model.decoder(mu_y, y_mask, settings.steps, settings.temperature)[:, :, :y_max]
        mel = mel * model.mel_std.unsqueeze(-1) + model.mel_mean.unsqueeze(-1)
        audio = vocoder(mel).clamp(-1, 1)
        audio = denoiser(audio.squeeze(), strength=settings.denoise).float().cpu().squeeze().numpy()
    return audio, w[0, 0].cpu().numpy()


def say(tts, text: str, voice: str, settings: Settings, young: float = 1.0) -> tuple[np.ndarray, int]:
    # The model reads lowercase Cyrillic; a trailing period gives words a natural falling end.
    spoken = text.strip().lower()
    if spoken[-1] not in ".!?":
        spoken += "."
    # Younger voice: let the model speak `young` times slower, then speed the audio back up by the same
    # factor — the talking pace stays the same while the voice becomes higher and smaller.
    slowed = Settings(rate=settings.rate * young, temperature=settings.temperature, steps=settings.steps, denoise=settings.denoise)
    audio, durations = synthesize_with_timing(tts, CARRIER + spoken, voice, slowed)
    # Cut where the word itself begins (inside the comma pause), with a short fade-in against clicks.
    lead_tokens = sum(1 for c in clean(CARRIER) if c in _ids and c != "_")
    start = int(np.cumsum(durations)[2 * lead_tokens] * HOP) - int(0.02 * 22050)
    audio = audio[max(0, start):].copy()
    fade = int(0.008 * 22050)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio = speed_up(audio, young)
    return normalize(trim(audio, 22050)), 22050


# Mid-sentence take: the word is followed by another word, so it keeps a continuing tone instead
# of the sentence-final fall. Sentences are then played as mid, mid, …, final — and sound joined.
FOLLOW = " жана."


def symbols(text: str) -> int:
    return sum(1 for c in clean(text) if c in _ids and c != "_")


def say_mid(tts, text: str, voice: str, settings: Settings, young: float = 1.0) -> tuple[np.ndarray, int]:
    word = text.strip().lower().rstrip(".!?")
    slowed = Settings(rate=settings.rate * young, temperature=settings.temperature, steps=settings.steps, denoise=settings.denoise)
    audio, durations = synthesize_with_timing(tts, CARRIER + word + FOLLOW, voice, slowed)
    ends = np.cumsum(durations)
    lead = symbols(CARRIER)
    start = int(ends[2 * lead] * HOP) - int(0.02 * 22050)
    last = 2 * (lead + symbols(word) - 1) + 1  # token of the word's last letter
    end = int(ends[last + 1] * HOP)  # include the short pad after it
    audio = audio[max(0, start) : end].copy()
    fade_in, fade_out = int(0.008 * 22050), int(0.015 * 22050)
    audio[:fade_in] *= np.linspace(0, 1, fade_in)
    audio[-fade_out:] *= np.linspace(1, 0, fade_out)
    audio = speed_up(audio, young)
    level = 0.015 * np.max(np.abs(audio))
    loud = np.flatnonzero(np.abs(audio) > level)
    if len(loud):
        audio = audio[max(0, loud[0] - int(0.03 * 22050)) :]
    return normalize(audio), 22050


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="woman", choices=["woman", "man"])
    ap.add_argument("--rate", type=float, default=1.25, help="speaking pace; higher is slower (a bit slow is clearer for kids)")
    ap.add_argument("--temperature", type=float, default=0.35, help="lower = steadier pronunciation")
    ap.add_argument("--young", type=float, default=1.12, help="1.0 = original voice; higher sounds younger")
    ap.add_argument("--only", nargs="*", help="card ids to (re)generate")
    ap.add_argument("--missing", action="store_true", help="only make clips that do not exist yet")
    ap.add_argument("--samples", action="store_true", help="write comparison clips at several --young levels and exit")
    args = ap.parse_args()

    tts = get_tts()
    settings = Settings(rate=args.rate, temperature=args.temperature)

    if args.samples:
        # Same phrases in the chosen voice at a few "younger" levels, to compare by ear.
        out = TOOLKIT.parent / "voice-samples"
        out.mkdir(exist_ok=True)
        for young in (1.0, 1.12, 1.2, 1.28):
            for i, text in enumerate(SAMPLES):
                audio, sr = say(tts, text, args.voice, settings, young)
                print(write(out / f"{args.voice}-young{round(young * 100)}-{i + 1}", audio, sr))
        return

    vocab = json.loads((ROOT / "src/data/vocab.json").read_text())
    # "say" is a spelling only for the voice (e.g. печенье → печение); the card still shows "label".
    phrases = {card["id"]: card.get("say", card["label"]) for cat in vocab["categories"] for card in cat["cards"]} | EXTRA
    # Grammatical forms the sentence engine may switch to (мен → менин / мага), saved as "<id>--<form>".
    for cat in vocab["categories"]:
        for card in cat["cards"]:
            for form, word in card.get("forms", {}).items():
                # the voice-only spelling carries over: «оюнчукту» is voiced as «ойунчукту»
                if "say" in card:
                    word = word.replace(card["label"], card["say"])
                phrases[f"{card['id']}--{form}"] = word
    if args.only:
        phrases = {k: v for k, v in phrases.items() if k in args.only}

    out = ROOT / "public/audio"
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT / "src/data/audio.json"
    manifest = json.loads(manifest_path.read_text())
    ids = set(manifest.get("ids", []))
    ext = manifest.get("ext")

    for card_id, label in phrases.items():
        if args.missing and (out / f"{card_id}.{ext or 'mp3'}").exists():
            continue
        audio, sr = say(tts, label, args.voice, settings, args.young)
        path = write(out / card_id, audio, sr)
        ext = path.suffix.lstrip(".")
        ids.add(card_id)
        line = f"{card_id:16} {len(audio) / sr:4.2f}s  {label}"
        if card_id not in ("_greeting", "_go"):
            mid, sr = say_mid(tts, label, args.voice, settings, args.young)
            write(out / f"{card_id}--mid", mid, sr)
            ids.add(f"{card_id}--mid")
            line += f"   (mid {len(mid) / sr:4.2f}s)"
        print(line)

    manifest = {"voice": args.voice, "young": args.young, "ext": ext, "ids": sorted(ids)}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"\n{len(phrases)} clips → public/audio/*.{ext}")


if __name__ == "__main__":
    main()
