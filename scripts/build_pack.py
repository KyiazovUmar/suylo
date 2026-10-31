"""Builds the optional big dictionary into public/pack/: pictures (160 px), Suylo's voice for every
word (a final and a mid-sentence take) and pack.json. Parents download it from Settings.

Run (from the suylo/ folder):  npm run pack
"""

import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_audio as g  # noqa: E402
from pack_data import CATEGORIES, IMAGES, CATEGORY_KIND, DESCRIBES, OWNERS, PRONOUN_PERSON, STEMS, HOMONYMS, INTO, IZAFET, KIND, MINE, NOT_MINE, PLACES, PRONOUN_FORMS, TOPICS, USE  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/pack"
RAW = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets"
TONED = set(json.loads((Path(__file__).parent / "fluent-tones.json").read_text()))

LATIN = dict(zip("абвгдеёжзийклмнңоөпрстуүфхцчшщъыьэюя",
                 ["a","b","v","g","d","e","yo","j","z","i","y","k","l","m","n","ng","o","o","p","r","s","t","u","u","f","h","ts","ch","sh","sh","","y","","e","yu","ya"]))


def slug(text: str) -> str:
    out = "".join(LATIN.get(c, c) for c in text.lower())
    return "-".join("".join(c if c.isalnum() else " " for c in out).split())


from kyrgyz_morph import accusative, body_forms, dative as _dative, izafet_dative, izafet_object, person_forms  # noqa: E402

# Phrases ending in a possessive take -НА instead («соода борбору» → «соода борборуна»).
DATIVE_OVERRIDES = {
    "соода борбору": "соода борборуна",
    "спорт аянтчасы": "спорт аянтчасына",
    "реабилитация борбору": "реабилитация борборуна",
    "дарыгердин кабинети": "дарыгердин кабинетине",
    "менин бөлмөм": "менин бөлмөмө",
    "эшиктин алды": "эшиктин алдына",
}
PLACE_CATEGORIES = {"pk-places", "pk-city"}


def dative(word: str) -> str:
    return DATIVE_OVERRIDES.get(word) or (izafet_dative(word) if word in IZAFET else _dative(word))


def acc(word: str) -> str:
    return izafet_object(word) if word in IZAFET else accusative(word)


# A stomach ache is «ичим ооруп жатат» («ич» = inside), not «курсагым».
PAIN = {"курсак": "ичим"}


def thing_forms(word: str, kind: str) -> dict:
    """The endings a thing's verbs give it (TAKES in src/lib/grammar.ts)."""
    forms = {"obj": izafet_object(word)} if word in IZAFET else {}
    if kind in ("animal", "horse", "toy", "container", "book"):
        forms["acc"] = acc(word)  # «мышыкты кучактагым», «эшикти ач»
    if kind in ("car", "transport"):
        forms["dat"] = dative(word)  # «автобуска түшкүм»
    if kind == "body":
        forms |= body_forms(word)  # «Менин көзүм ооруп жатат», «колумду жуугум»
        if word in PAIN:
            forms["poss"] = PAIN[word]
    return forms


ME_FORMS = {"gen": "менин", "dat": "мага", "acc": "мени", "com": "мени менен", "abl": "менден"}


def image_urls(name: str):
    d, s = urllib.parse.quote(name), name.lower().replace(" ", "_")
    if name in TONED:
        yield f"{RAW}/{d}/Medium/3D/{s}_3d_medium.png"
        yield f"{RAW}/{d}/Default/3D/{s}_3d_default.png"
    yield f"{RAW}/{d}/3D/{s}_3d.png"


def fetch_image(name: str, dest: Path) -> bool:
    if dest.exists():
        return True
    for url in image_urls(name):
        try:
            data = urllib.request.urlopen(url, timeout=30).read()
        except Exception:
            continue
        raw = dest.with_suffix(".full.png")
        raw.write_bytes(data)
        subprocess.run(["sips", "-Z", "160", str(raw), "--out", str(dest)], check=True, capture_output=True)
        raw.unlink()
        return True
    return False


def main() -> None:
    (OUT / "img").mkdir(parents=True, exist_ok=True)
    (OUT / "audio").mkdir(parents=True, exist_ok=True)
    only_images = "--images" in sys.argv

    default = json.loads((ROOT / "src/data/vocab.json").read_text())
    default_labels = {c["label"] for cat in default["categories"] for c in cat["cards"] if c.get("role") != "verbatim"} - HOMONYMS
    # forms of the default deck's plain verbs, to link the big dictionary's verbs to them
    default_forms = {f: c["id"] for cat in default["categories"] for c in cat["cards"] if c.get("kind") == "activity" for f in c.get("forms", {}).values()}
    lists, jobs = {}, []
    for cat_id, label, icon, entries in CATEGORIES:
        cards = []
        if cat_id not in INTO:
            jobs.append((icon, OUT / "img" / f"cat-{cat_id}.png"))
        for image, word, kind, *rest in entries:
            if word in default_labels:
                continue
            image = image or IMAGES.get(f"{cat_id}:{word}") or IMAGES.get(word)
            extra = dict(rest[0]) if rest else {}
            card_id = extra.pop("id", None) or f"{cat_id}-{slug(word)}"
            if extra.get("role") == "me":
                extra["forms"] = ME_FORMS
            elif kind == "person" and cat_id in NOT_MINE and word not in MINE:
                # «космонавт менен ойногум», «клоунга», «Мага клоун жагат»
                extra["forms"] = {"poss": word, "possDat": dative(word), "possAcc": acc(word), "possCom": f"{word} менен"}
            elif kind == "person":
                extra["forms"] = person_forms(word)
            elif word in PRONOUN_FORMS:
                extra["forms"] = PRONOUN_FORMS[word]
                extra["pers"] = PRONOUN_PERSON[word]
            elif kind == "describe" and word in DESCRIBES:
                extra["describes"] = DESCRIBES[word]
            elif (cat_id in PLACE_CATEGORIES or word in PLACES) and kind == "noun" and "role" not in extra:
                extra["role"] = "place"
                extra["forms"] = {"dat": dative(word)}
            elif kind == "noun" and "role" not in extra:
                if word in USE:
                    extra["use"] = USE[word]
                    extra["kind"] = "activity"
                elif "consume" not in extra:
                    extra["kind"] = KIND.get(word) or CATEGORY_KIND.get(cat_id, "thing")
                forms = thing_forms(word, extra.get("kind", ""))
                if forms:
                    extra["forms"] = forms
            if kind == "verb" and "stem" not in extra:
                if word in STEMS:
                    extra["stem"] = STEMS[word]
                elif word in default_forms:
                    extra["base"] = default_forms[word]  # «уялып жатам» + «-дым» → «уялдым», with Suylo's clip
                elif m := re.fullmatch(r"(.+?)[гк][ыиуү]м келип жатат", word):
                    extra["stem"] = m.group(1)  # «секиргим келип жатат» → «секир»
                elif extra.get("subject") and " " not in word.replace("окуп бер", "x"):
                    extra["stem"] = word  # «кел», «кара», «окуп бер»
            if word in OWNERS:
                extra["owner"] = OWNERS[word]
            card = {"id": card_id, "label": word, "type": kind, "image": bool(image), **extra}
            if image:
                jobs.append((image, OUT / "img" / f"{card_id}.png"))
            cards.append(card)
        lists[cat_id] = cards

    # related lists together: into the main topics, or topics of their own
    categories = []
    for target in dict.fromkeys(INTO.values()):
        categories.append({"id": f"pk-into-{target}", "label": "", "into": target,
                           "cards": [c for cat_id, t in INTO.items() if t == target for c in lists[cat_id]]})
    for topic_id, label, members in TOPICS:
        categories.append({"id": topic_id, "label": label, "cards": [c for m in members for c in lists[m]]})
    placed = set(INTO) | {m for _, _, members in TOPICS for m in members}
    assert placed == set(lists), f"lists with no topic: {set(lists) - placed}"

    with ThreadPoolExecutor(12) as pool:
        results = list(pool.map(lambda j: fetch_image(*j), jobs))
    print(f"pictures: {sum(results)}/{len(jobs)}")

    if not only_images:
        tts = g.get_tts()
        settings = g.Settings(rate=1.25, temperature=0.35)
        total = sum(len(c["cards"]) for c in categories)
        done = 0
        for cat in categories:
            for card in cat["cards"]:
                final = OUT / "audio" / f"{card['id']}.mp3"
                if not final.exists():
                    text = card.get("say", card["label"])
                    audio, sr = g.say(tts, text, "woman", settings, 1.12)
                    g.write(final.with_suffix(""), audio, sr)
                    mid, sr = g.say_mid(tts, text, "woman", settings, 1.12)
                    g.write(OUT / "audio" / f"{card['id']}--mid", mid, sr)
                for form, word in card.get("forms", {}).items():
                    if "say" in card:
                        word = word.replace(card["label"], card["say"])
                    path = OUT / "audio" / f"{card['id']}--{form}.mp3"
                    if not path.exists():
                        audio, sr = g.say(tts, word, "woman", settings, 1.12)
                        g.write(path.with_suffix(""), audio, sr)
                        mid, sr = g.say_mid(tts, word, "woman", settings, 1.12)
                        g.write(OUT / "audio" / f"{card['id']}--{form}--mid", mid, sr)
                done += 1
                if done % 50 == 0:
                    print(f"voices: {done}/{total}", flush=True)

    keep = {c["id"] for cat in categories for c in cat["cards"]} | {f"{c['id']}--{form}" for cat in categories for c in cat["cards"] for form in c.get("forms", {})}
    for f in (OUT / "audio").glob("*.mp3"):
        if f.stem.removesuffix("--mid") not in keep:
            f.unlink()
    keep_img = {f"cat-{cat['id']}" for cat in categories} | {c["id"] for cat in categories for c in cat["cards"] if c["image"]}
    for f in (OUT / "img").glob("*.png"):
        if f.stem not in keep_img:
            f.unlink()
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    pack = {"version": 4, "words": sum(len(c["cards"]) for c in categories), "bytes": size, "categories": categories}
    (OUT / "pack.json").write_text(json.dumps(pack, ensure_ascii=False) + "\n")
    print(f"pack: {pack['words']} words in {len(categories)} categories, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
