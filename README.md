# Suylo · Сүйлө

A free picture-card app that helps children who can't speak talk in **Kyrgyz** (AAC: augmentative and
alternative communication). The child taps pictures, and Suylo, the blue mascot, says the child's words
out loud in Kyrgyz. It works offline, with no registration, and everything stays on the phone.

Made by Umar Kyiazov for LogosHack 2026.

## What it does
- **Simple vocabulary (default)**: 56 big words on five fixed pages (`src/data/board.json`): a 24-word main page of
  core words and urgent needs, plus food, feelings, play and people. Every word keeps its slot (6 columns on landscape
  screens, 4 upright) and an empty slot stays a gap, so the child learns where each word is. Parents can change any
  slot in Settings, or switch to the **full vocabulary**: every topic, plus an optional big dictionary of about 950
  more words.
- **Said exactly as tapped**: Suylo says the child's cards in the order they were tapped, with a natural
  sentence tone; it never changes, adds or leaves out a word. (`src/lib/grammar.ts` still holds an experimental
  Kyrgyz grammar engine with its tests; the app does not use it.)
- **Мүчөлөр**: endings the child can add themselves («алма» + «-га» → «алмага»).
- **Suylo's voice**: every word is pre-recorded with a Kyrgyz text-to-speech model, so it works offline.
  Parents can record their own voice for any card, and change the speed and pitch.
- **Parents' settings** behind a PIN: edit pictures, words and voices, and add cards.

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # grammar tests: example sentences, every word × every verb, random taps
npm run build      # offline-ready web app in dist/
```
About 700 common sentences are pre-recorded in the AI voice (`public/sentences`), so they sound smooth on any
device and offline. Other sentences are joined from per-word clips. Optional: `npm run ai` starts the local AI
voice server, which speaks *every* sentence with natural intonation on that computer (and on phones that open
the site from it over the same Wi-Fi). Both need [kyrgyz-tts-mini](https://huggingface.co/ramput-labs/kyrgyz-tts-mini)
in `../tools/kyrgyz-tts-mini`; to re-record the sentences:
```bash
node --experimental-strip-types scripts/sentences.ts > /tmp/sentences.json
../tools/kyrgyz-tts-mini/.venv/bin/python scripts/gen_sentences.py /tmp/sentences.json
```

## Credits and licenses
- **Pictures**: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), MIT License (see `licenses/fluent-emoji-MIT.txt`).
- **Voice**: generated with kyrgyz-tts-mini (code MIT). The voices belong to **Ulutsoft LLC and Mamtil**
  (all rights reserved; contact them about commercial use). The HiFi-GAN vocoder is MIT. The clips in
  `public/audio` and `public/pack/audio` are for this non-commercial project only.
- **Grammar sources**: *A Handbook of Kyrgyz Grammar* (Wikibooks), Peace Corps Kyrgyz Language Manual (1997).

## Privacy
No accounts and no tracking. Cards, recordings and settings are stored only in the browser on the device.
When online, only the text of a sentence is sent to Suylo's voice server to be spoken; the server keeps no logs.
