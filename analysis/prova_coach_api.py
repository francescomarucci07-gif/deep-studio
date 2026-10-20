"""
Deep Studio - P4 - prova del coach v1 con la Claude API
========================================================

Manda al coach i 20 input della prova v2 (10 clip x italiano/inglese) e salva
le risposte, i token usati e il costo. Il modello vede SOLO il prompt v1 e le
misure: nessuna nota gold. E' la prova "alla cieca".

Cosa serve nella stessa cartella:
  - questo file
  - P4-prompt-coach-v1.md       (dal progetto; il prompt e' il testo tra le righe =====)
  - la cartella input\          (dallo zip "Deep Studio - P4 prova v2": G01_it.json ... G10_en.json)

Preparazione (una volta):
  py -m pip install anthropic
  set ANTHROPIC_API_KEY=la-tua-chiave

Uso:
  py prova_coach_api.py                 -> tutte e 20 (costo stimato ~0,60 $)
  py prova_coach_api.py --solo G01_it   -> una sola, per provare (~0,03 $)
  py prova_coach_api.py --modello claude-haiku-5-5   -> confronto con un altro modello

Il nome del modello va verificato sulla console Anthropic [DA VERIFICARE].
Risultati in risposte_api\ : un JSON per input + riepilogo.csv con token e costo.
"""
import argparse, csv, json, os, sys, time
from pathlib import Path

PREZZI = {  # dollari per milione di token, listino del 18 ott 2026 (input, output)
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-opus-5-5": (4.0, 20.0),
}

def leggi_prompt(p):
    t = Path(p).read_text(encoding="utf-8")
    parti = t.split("\n=====\n")
    if len(parti) < 3:
        sys.exit("Nel file del prompt non trovo il testo tra le due righe =====")
    return parti[1].strip()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modello", default="claude-sonnet-5-5")
    ap.add_argument("--prompt", default="P4-prompt-coach-v1.md")
    ap.add_argument("--input", default="input")
    ap.add_argument("--solo", default=None, help="es. G01_it")
    ap.add_argument("--out", default="risposte_api")
    a = ap.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Manca ANTHROPIC_API_KEY (set ANTHROPIC_API_KEY=...)")
    import anthropic
    client = anthropic.Anthropic()
    system = leggi_prompt(a.prompt)
    files = sorted(Path(a.input).glob("G*_*.json"))
    if a.solo:
        files = [f for f in files if f.stem == a.solo]
    if not files:
        sys.exit("Nessun input trovato.")
    out = Path(a.out) / a.modello
    out.mkdir(parents=True, exist_ok=True)
    pin, pout = PREZZI.get(a.modello, (None, None))

    righe, totale = [], 0.0
    for f in files:
        print(f"-> {f.stem}")
        t0 = time.time()
        msg = client.messages.create(
            model=a.modello, max_tokens=4000, system=system,
            messages=[{"role": "user", "content": f.read_text(encoding="utf-8")}],
        )
        testo = "".join(b.text for b in msg.content if b.type == "text")
        ok = True
        try:
            risposta = json.loads(testo)
        except json.JSONDecodeError:
            ok, risposta = False, {"testo_grezzo": testo}
        (out / f"{f.stem}.json").write_text(json.dumps(risposta, ensure_ascii=False, indent=1), encoding="utf-8")
        ti, to = msg.usage.input_tokens, msg.usage.output_tokens
        costo = (ti * pin + to * pout) / 1e6 if pin is not None else None
        totale += costo or 0
        n1 = (risposta.get("notes") or [{}])[0].get("title", "") if ok else "JSON non valido"
        righe.append({"input": f.stem, "json_ok": ok, "nota_1": n1, "token_in": ti, "token_out": to,
                      "costo_usd": round(costo, 4) if costo is not None else "", "secondi": round(time.time() - t0, 1)})
        print(f"   nota 1: {n1}  ({ti} in / {to} out)")

    with open(out / "riepilogo.csv", "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=list(righe[0].keys()), delimiter=";")
        w.writeheader(); w.writerows(righe)
    print(f"\nFatto: {len(righe)} risposte in {out}. Costo totale circa {totale:.2f} $")

if __name__ == "__main__":
    main()
