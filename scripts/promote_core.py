"""Brings the words the simple board needs from the big dictionary into the main deck, so they ship with the
app (picture, voice, forms) instead of waiting for a download: «ач» (open) and «бул» (this).
Also gives places their "at" form («үйгө» → «үйдө»), said when the verb is not about going
(«Мен сыртта ойногум келип жатат»).

Safe to run again. Afterwards make the new forms' clips:
  ../tools/kyrgyz-tts-mini/.venv/bin/python scripts/gen_audio.py --missing
"""

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / "src/data/vocab.json"
AUDIO = ROOT / "src/data/audio.json"

# main-deck card → (dictionary card it comes from, the card)
PROMOTED = {
    "open": ("pk-asks-ach", {"id": "open", "label": "ач", "type": "verb", "img": "Unlocked", "takes": "open", "subject": "dat", "stem": "ач"}),
    # a thing like «бир нерсе», so it takes endings: «Муну ач», «Мен муну каалайм», «Буга бер»
    "this": ("pk-pronouns-bul", {"id": "this", "label": "бул", "type": "noun", "img": "Backhand index pointing down", "kind": "some", "forms": {"obj": "муну", "acc": "муну", "dat": "буга"}}),
}

# where something happens (locative), for the place cards whose label is "to there" (dative)
LOCATIVE = {
    "home": "үйдө",
    "outside": "сыртта",
    "school": "мектепте",
    "park": "паркта",
    "playground": "оюн аянтчасында",
    "shop": "дүкөндө",
    "hospital": "ооруканада",
    "somewhere": "бир жерде",
}


def main() -> None:
    vocab = json.loads(VOCAB.read_text())
    core = next(c for c in vocab["categories"] if c["id"] == "core")
    have = {card["id"] for cat in vocab["categories"] for card in cat["cards"]}
    for card_id, (_, card) in PROMOTED.items():
        if card_id not in have:
            core["cards"].append(card)
            print("added", card_id, card["label"])

    for cat in vocab["categories"]:
        for card in cat["cards"]:
            loc = LOCATIVE.get(card["id"])
            if loc and card.get("role") == "place":
                card.setdefault("forms", {})["loc"] = loc
    VOCAB.write_text(json.dumps(vocab, ensure_ascii=False, indent=2) + "\n")

    manifest = json.loads(AUDIO.read_text())
    ids = set(manifest["ids"])
    for card_id, (pack_id, _) in PROMOTED.items():
        shutil.copyfile(ROOT / f"public/pack/img/{pack_id}.png", ROOT / f"public/cards/{card_id}.png")
        for mid in ("", "--mid"):
            shutil.copyfile(ROOT / f"public/pack/audio/{pack_id}{mid}.mp3", ROOT / f"public/audio/{card_id}{mid}.mp3")
            ids.add(f"{card_id}{mid}")
    manifest["ids"] = sorted(ids)
    AUDIO.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print("pictures and voices copied; place forms:", ", ".join(LOCATIVE.values()))


if __name__ == "__main__":
    main()
