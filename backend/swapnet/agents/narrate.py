"""Plain-language text for families and coordinators, built only from graph facts.

English and Hindi templates always work. For other languages, if ANTHROPIC_API_KEY is set, Claude
translates the template with an instruction to add no facts. It never decides anything.
"""
import os

from swapnet import organs
from swapnet.graph import db

T = {
    "en": {
        "Registered": "Registered", "Matched": "Matched", "Lab tests": "Lab tests",
        "Committee approval": "Committee approval", "Surgery": "Surgery", "same_day": "same day for all families",
        "pool_h": "You're in the shared pool.",
        "pool_b": "We check for a swap every week across all hospitals. Nothing is needed from you right now.",
        "retry_h": "Your last swap couldn't go ahead. You're back in the shared pool.",
        "retry_b": ("One lab test in that swap didn't match. That was not caused by anything you did. "
                    "You now get priority in the next weekly match."),
        "in_h": "You're in a {n}-family swap.",
        "in_2": "Your {rel}'s kidney goes to another family's patient, and a donor from the other family gives to you.",
        "in_3": "Your {rel}'s kidney goes to another family's patient, and a donor from a third family gives to you.",
        "replaced": ("One family's test didn't match, so a new family has been found. Your place in the swap is safe. "
                     "We'll message you when their tests are back."),
        "committee": "All lab tests are done and fine. The authorisation committee is reviewing the files.",
        "testing": "Lab tests are under way. We'll message you when they are back.",
        "remedy": ("Taking a herbal or Ayurvedic remedy? Some can change how anti-rejection medicines work. "
                   "Check it, then talk to your transplant team."),
    },
    "hi": {
        "Registered": "पंजीकरण", "Matched": "मिलान", "Lab tests": "लैब जाँच",
        "Committee approval": "समिति की मंज़ूरी", "Surgery": "सर्जरी", "same_day": "सभी परिवारों की एक ही दिन",
        "pool_h": "आप साझा पूल में हैं।",
        "pool_b": "हम हर हफ़्ते सभी अस्पतालों में स्वैप खोजते हैं। अभी आपको कुछ करने की ज़रूरत नहीं है।",
        "retry_h": "आपका पिछला स्वैप आगे नहीं बढ़ सका। आप फिर से साझा पूल में हैं।",
        "retry_b": ("उस स्वैप की एक लैब जाँच मेल नहीं खाई। इसमें आपकी कोई गलती नहीं थी। "
                    "अगले साप्ताहिक मिलान में आपको प्राथमिकता मिलेगी।"),
        "in_h": "आप {n} परिवारों के स्वैप में हैं।",
        "in_2": "आपके {rel} की किडनी दूसरे परिवार के मरीज़ को जाएगी, और उस परिवार का दाता आपको देगा।",
        "in_3": "आपके {rel} की किडनी दूसरे परिवार के मरीज़ को जाएगी, और तीसरे परिवार का दाता आपको देगा।",
        "replaced": ("एक परिवार की जाँच मेल नहीं खाई, इसलिए एक नया परिवार मिल गया है। स्वैप में आपकी जगह सुरक्षित है। "
                     "उनकी जाँच आने पर हम आपको संदेश भेजेंगे।"),
        "committee": "सभी लैब जाँचें पूरी और ठीक हैं। प्राधिकरण समिति फ़ाइलें देख रही है।",
        "testing": "लैब जाँचें चल रही हैं। नतीजे आने पर हम आपको संदेश भेजेंगे।",
        "remedy": ("कोई जड़ी-बूटी या आयुर्वेदिक दवा ले रहे हैं? कुछ दवाएँ अस्वीकृति-रोधी दवाओं पर असर डाल सकती हैं। "
                   "जाँच करें, फिर अपनी ट्रांसप्लांट टीम से बात करें।"),
    },
}
REL_HI = {"wife": "पत्नी", "husband": "पति", "mother": "माँ", "father": "पिता", "brother": "भाई", "sister": "बहन",
          "son": "बेटे", "daughter": "बेटी", "grandparent": "दादा-दादी", "grandchild": "पोते"}
# The base text is written for kidney; organs override sentences in swapnet/organs/<organ>.py (`texts`).


def family(f: dict, lang: str = "en") -> dict:
    # Each organ can reword sentences that differ (a liver donor gives part of their liver; the test is a donor check).
    base = lang if lang in T else "en"
    t = {**T[base], **organs.get(f.get("organ")).texts.get(base, {})}
    families = f.get("families") or 0
    rel = f.get("donor_relation") or "family member"
    if lang == "hi":
        rel = REL_HI.get(rel, rel)
    own = f.get("own_tests") or []
    status = f.get("loop_status")
    in_loop = bool(f.get("loop_id"))
    if not in_loop:
        lab = "waiting"
    elif "positive" in own or f.get("replaced"):
        lab = "current"
    else:
        lab = "done" if status in ("committee", "locked") else "current"
    steps = [
        {"label": t["Registered"], "state": "done"},
        {"label": t["Matched"], "state": "done" if in_loop else "current"},
        {"label": t["Lab tests"], "state": lab},
        {"label": t["Committee approval"], "state": "done" if f.get("approval_state") == "approved" else
         ("current" if in_loop else "waiting")},
        {"label": t["Surgery"], "state": "waiting", "note": t["same_day"]},
    ]
    if not in_loop and f.get("failed_count"):
        headline, body = t["retry_h"], t["retry_b"]
    elif not in_loop:
        headline, body = t["pool_h"], t["pool_b"]
    else:
        headline = t["in_h"].format(n=families) + " " + t["in_2" if families == 2 else "in_3"].format(rel=rel)
        if f.get("replaced"):
            body = t["replaced"]
        elif status in ("committee", "locked"):
            body = t["committee"]
        else:
            body = t["testing"]
    text = {"headline": headline, "body": body, "steps": steps, "remedy_note": t["remedy"], "lang": lang if lang in T else "en"}
    if lang not in T:
        text = _llm_translate(text, lang) or text
    return text


def _llm_translate(text: dict, lang: str) -> dict | None:
    if not os.getenv("ANTHROPIC_API_KEY"):
        return None
    try:
        import json

        import anthropic
        client = anthropic.Anthropic()
        name = {"hi": "Hindi", "ta": "Tamil"}.get(lang, lang)
        msg = client.beta.messages.create(
            model=os.getenv("SWAPNET_MODEL", "claude-opus-5-5"),
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=("You translate patient status messages for an organ swap coordination prototype. "
                    "Translate faithfully into plain, warm language. Do not add, remove or change any fact, "
                    "date or medical statement. Return only JSON with the same keys and structure."),
            messages=[{"role": "user", "content": f"Translate the string values into {name}:\n{json.dumps(text, ensure_ascii=False)}"}],
        )
        if msg.stop_reason == "refusal":
            return None
        raw = "".join(b.text for b in msg.content if b.type == "text").strip().strip("`")
        raw = raw[raw.find("{"):raw.rfind("}") + 1]
        return json.loads(raw)
    except Exception as e:  # never block the page on the LLM
        db.event("Patient liaison", f"Translation unavailable ({type(e).__name__}); showing English.", "warn")
        return None
