"""Kyrgyz suffixes (мүчөлөр) for Suylo's grammar: "my …" and the case endings that follow it.

Rules (A Handbook of Kyrgyz Grammar, Wikibooks; Peace Corps Kyrgyz Language Manual):
• Vowel harmony. A suffix with a high vowel takes ы/и/у/ү, one with a low vowel а/е/о/ө, matching the
  last vowel of the word — except that after у the low vowel is а («суу» → «сууга»).
• Voiceless consonants: к п с т ф х ц ч ш щ. After them a suffix's г/д become к/т.
• Before a vowel, a final п or к becomes б or г («китеп» → «китебим»).
• "My X": -м after a vowel («апам»), -ым/-им/-ум/-үм after a consonant («досум»).
• "My X" + dative: a low vowel («апама», «досума»); + accusative: -ды/-ди/-ду/-дү («апамды»).
• Accusative: -ны after a vowel («машинаны»), -ты after a voiceless consonant («мышыкты»), -ды after
  the rest («уйду», «коёнду»); the vowel is high and follows harmony.
• A name ending in "its" («окуу китеби») takes -н as an object («окуу китебин») and -на/-не for direction
  («мектеп автобусуна»).
"""

VOWELS = "аеёиоөуүыэюя"
VOICELESS = set("кпстфхцчшщ")
LOW = {"а": "а", "ы": "а", "у": "а", "я": "а", "ю": "а", "о": "о", "ё": "о", "э": "е", "е": "е", "и": "е", "ө": "ө", "ү": "ө"}
HIGH = {"а": "ы", "ы": "ы", "я": "ы", "у": "у", "о": "у", "ё": "у", "ю": "у", "э": "и", "е": "и", "и": "и", "ө": "ү", "ү": "ү"}
SOFTEN = {"п": "б", "к": "г"}


def last_vowel(word: str) -> str:
    return next(c for c in reversed(word.lower()) if c in VOWELS)


def ends_in_vowel(word: str) -> bool:
    return word[-1].lower() in VOWELS


def last_consonant(word: str) -> str:
    w = word.lower()
    return w[-2] if w[-1] in "ьъ" else w[-1]


def dative(word: str) -> str:
    """«базар» → «базарга», «Бишкек» → «Бишкекке», «үй» → «үйгө»."""
    c = "к" if last_consonant(word) in VOICELESS else "г"
    return word + c + LOW[last_vowel(word)]


def accusative(word: str) -> str:
    """«мышык» → «мышыкты», «машина» → «машинаны», «уй» → «уйду», «тюлень» → «тюленди»."""
    stem = word[:-1] if word[-1] in "ьъ" else word
    c = "н" if ends_in_vowel(stem) else "т" if last_consonant(stem) in VOICELESS else "д"
    return stem + c + HIGH[last_vowel(stem)]


def izafet_object(word: str) -> str:
    """«окуу китеби» → «окуу китебин»."""
    return word + "н"


def izafet_dative(word: str) -> str:
    """«мектеп автобусу» → «мектеп автобусуна»."""
    return word + "н" + LOW[last_vowel(word)]


# "My X" for body parts whose last vowel drops: «мурун» → «мурдум», «моюн» → «мойнум».
MY_IRREGULAR = {"мурун": "мурдум", "моюн": "мойнум", "ооз": "оозум"}


def my(word: str) -> str:
    """"My X" — on the last word of a phrase: «апа» → «апам», «чоң апа» → «чоң апам», «бөбөк» → «бөбөгүм»."""
    head, _, last = word.rpartition(" ")
    if last in MY_IRREGULAR:
        mine = MY_IRREGULAR[last]
    elif ends_in_vowel(last):
        mine = last + "м"
    else:
        # a final п/к after a vowel softens before a vowel: «китеп» → «китебим», «топ» → «тобум»
        stem = last[:-1] + SOFTEN[last[-1]] if last[-1] in SOFTEN and len(last) > 1 and last[-2] in VOWELS else last
        mine = stem + HIGH[last_vowel(last)] + "м"
    return f"{head} {mine}" if head else mine


def my_dative(word: str) -> str:
    """To my X: «апама», «досума», «мугалимиме»."""
    mine = my(word)
    return mine + LOW[last_vowel(mine)]


def my_accusative(word: str) -> str:
    """My X as the object: «апамды», «досумду», «бөбөгүмдү»."""
    mine = my(word)
    return mine + "д" + HIGH[last_vowel(mine)]


def my_with(word: str) -> str:
    """With my X: «апам менен»."""
    return my(word) + " менен"


def person_forms(word: str) -> dict:
    return {"poss": my(word), "possDat": my_dative(word), "possAcc": my_accusative(word), "possCom": my_with(word)}


def body_forms(word: str) -> dict:
    """«Менин көзүм ооруп жатат», «колумду жуугум келип жатат»."""
    return {"poss": my(word), "possAcc": my_accusative(word)}


if __name__ == "__main__":
    for w in ["мышык", "ит", "уй", "коён", "машина", "тюлень", "кенгуру", "аюу", "төө", "хомяк", "индюк", "оюнчук", "китеп", "эшик", "кол чатыр"]:
        print(f"{w:10} → {accusative(w)}")
    for w in ["мурун", "моюн", "ооз", "көз", "жүрөк", "сөөк", "кол", "мээ", "таман"]:
        print(f"{w:10} → {body_forms(w)}")
    for w in ["апа", "ата", "чоң апа", "байке", "эже", "бөбөк", "мугалим", "дос", "дарыгер", "конок", "коңшу", "уул", "кыз", "ини", "сиңди", "карындаш", "китеп"]:
        f = person_forms(w)
        print(f"{w:10} → {f['poss']:12} {f['possDat']:14} {f['possAcc']:14} {f['possCom']}")


# ---------------------------------------------------------------- verbs
# A verb stem («сүз», «ойно», «эс ал») and the forms Suylo can say it in. The suffix goes on the last word.

def _on_last(stem: str, make) -> str:
    head, _, last = stem.rpartition(" ")
    out = make(last)
    return f"{head} {out}" if head else out


def _voiceless_end(w: str) -> bool:
    return not ends_in_vowel(w) and last_consonant(w) in VOICELESS


def verb_want(stem: str) -> str:
    """«сүз» → «сүзгүм келип жатат», «ич» → «ичким келип жатат»."""
    return _on_last(stem, lambda w: w + ("к" if _voiceless_end(w) else "г") + HIGH[last_vowel(w)] + "м") + " келип жатат"


def _soft(w: str) -> str:
    """Before a vowel, a final к/п after a vowel softens: «ук» → «уг-», «теп» → «теб-» (but «корк-» stays)."""
    if len(w) > 1 and w[-1] in "кп" and w[-2] in VOWELS:
        return w[:-1] + SOFTEN[w[-1]]
    return w


def verb_doing(stem: str) -> str:
    """«сүз» → «сүзүп жатам», «укта» → «уктап жатам», «ук» → «угуп жатам»."""
    return _on_last(stem, lambda w: w + "п" if ends_in_vowel(w) else _soft(w) + HIGH[last_vowel(w)] + "п") + " жатам"


def verb_did(stem: str) -> str:
    """«сүз» → «сүздүм», «ич» → «ичтим», «ойно» → «ойнодум»."""
    return _on_last(stem, lambda w: w + ("т" if _voiceless_end(w) else "д") + HIGH[last_vowel(w)] + "м")


def verb_lets(stem: str) -> str:
    """«сүз» → «сүзөлү», «бар» → «баралы», «ойно» → «ойнойлу», «же» → «жейли»."""
    def make(w):
        v = last_vowel(w)
        if ends_in_vowel(w):
            return w + ("л" if w[-2:-1] == w[-1] else "йл") + HIGH[v]  # «ойнойлу», «жейли», «жуулу»
        return _soft(w) + LOW[v] + "л" + HIGH[LOW[v]]  # «сүзөлү», «угалы», «ичели»
    return _on_last(stem, make)


def verb_dont(stem: str) -> str:
    """«сүз» → «сүзбө», «ич» → «ичпе», «ойно» → «ойнобо»."""
    return _on_last(stem, lambda w: w + ("п" if _voiceless_end(w) else "б") + LOW[last_vowel(w)])


def verb_please(stem: str) -> str:
    """«бер» → «берчи», «кара» → «карачы», «ойно» → «ойночу»."""
    return _on_last(stem, lambda w: w + "ч" + HIGH[last_vowel(w)])


VERB_FORMS = {"want": verb_want, "doing": verb_doing, "did": verb_did, "lets": verb_lets, "dont": verb_dont, "please": verb_please}


def verb_forms(stem: str) -> dict:
    return {k: f(stem) for k, f in VERB_FORMS.items()}
