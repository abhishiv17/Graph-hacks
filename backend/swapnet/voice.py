"""Spoken walkthroughs in Indian languages, through Sarvam (sarvam.ai): `translate` (sarvam-translate:v1) and `speak`
(bulbul text-to-speech, WAV). The key stays on the server (SARVAM_API_KEY); the browser only gets text and audio.
Results are cached in memory, so replaying a walkthrough doesn't spend the quota again. Without a key the walkthrough is
English text only, and the web app can fall back to the browser's own voice."""
import base64
import os
from collections import OrderedDict

import httpx

URL = os.getenv("SARVAM_URL", "https://api.sarvam.ai").rstrip("/")
TTS_MODEL = os.getenv("KINDRED_SARVAM_TTS_MODEL", "bulbul:v3")
TRANSLATE_MODEL = os.getenv("KINDRED_SARVAM_TRANSLATE_MODEL", "sarvam-translate:v1")
LANGUAGES = {
    "en-IN": "English", "hi-IN": "हिन्दी", "ta-IN": "தமிழ்", "te-IN": "తెలుగు", "kn-IN": "ಕನ್ನಡ", "ml-IN": "മലയാളം",
    "bn-IN": "বাংলা", "mr-IN": "मराठी", "gu-IN": "ગુજરાતી", "pa-IN": "ਪੰਜਾਬੀ", "od-IN": "ଓଡ଼ିଆ",
}
_http = httpx.Client(timeout=30)


class _Cache(OrderedDict):
    def __init__(self, size: int):
        super().__init__()
        self.size = size

    def put(self, k, v):
        self[k] = v
        self.move_to_end(k)
        while len(self) > self.size:
            self.popitem(last=False)
        return v


_translated, _audio = _Cache(2000), _Cache(400)


def key() -> str:
    return os.getenv("SARVAM_API_KEY", "")


def enabled() -> bool:
    return bool(key())


def status() -> dict:
    return {"enabled": enabled(), "provider": "sarvam" if enabled() else None, "languages": LANGUAGES,
            "how": "set SARVAM_API_KEY in .env" if not enabled() else None}


def _post(path: str, body: dict) -> dict:
    r = _http.post(f"{URL}{path}", headers={"api-subscription-key": key(), "Content-Type": "application/json"}, json=body)
    r.raise_for_status()
    return r.json()


def translate(text: str, lang: str) -> str:
    """English text in another language. English, or no key: the text as it is."""
    if lang == "en-IN" or lang not in LANGUAGES or not enabled() or not text.strip():
        return text
    k = (text, lang)
    if k in _translated:
        return _translated[k]
    out = _post("/translate", {"input": text[:2000], "source_language_code": "en-IN", "target_language_code": lang,
                               "model": TRANSLATE_MODEL, "mode": "formal", "numerals_format": "international"})
    return _translated.put(k, out.get("translated_text") or text)


def speak(text: str, lang: str) -> bytes:
    """WAV audio of the text, read in that language."""
    if lang not in LANGUAGES:
        raise ValueError(f"unsupported language {lang}")
    k = (text, lang)
    if k in _audio:
        return _audio[k]
    out = _post("/text-to-speech", {"text": text[:2500], "language_code": lang, "model": TTS_MODEL, "pace": 1.0})
    audios = out.get("audios") or []
    if not audios:
        raise ValueError("Sarvam returned no audio")
    return _audio.put(k, base64.b64decode(audios[0]))
