"""
Deep Studio - P3 punto 3 - test di Demucs sui mix senza progetto FL
===================================================================

Per le tracce vecchie di cui hai solo il mix finale:
  1) Demucs (htdemucs, licenza MIT) separa ogni mix in drums, bass, other, vocals;
  2) dallo stem drums ricava un "kick" (sotto 150 Hz) e "percussioni" (sopra 150 Hz),
     perche' Demucs non separa il kick dal resto della batteria;
  3) mette gli stem in T01_stem come se venissero da FL e lancia l'analisi v0.3;
  4) segna nei JSON che gli stem vengono da Demucs (confidenza media).

Cosa serve nella stessa cartella:
  - questo file
  - deep_studio_analyze.py (v0.3) e deep-studio-analysis-1.0.schema.json
  - eventuali riferimenti_<sottogenere>.json creati prima

Preparazione (una volta, scarica circa 2 GB tra Demucs e PyTorch):
  py -m pip install demucs numpy scipy

Uso:
  py prova_demucs.py "C:\\tracce_vecchie" --sottogenere deep --stadio finita
I mix vanno chiamati come sempre: T01_titolo_master.wav (o _nomaster).
Tempo: sul processore circa 1-3 minuti per traccia di 5 minuti; con una GPU NVIDIA molto meno.

Cosa confrontare dopo: le misure dagli stem Demucs contro le tue note gold.
Note che dipendono dagli stem: 4 Rider (pad), 5 Fame (lead e percussioni),
7 Trapped (kick e bassline), 9 Fine Wine (clap). Demucs non separa pad, lead e clap:
quelle misure saranno approssimate o mancheranno, ed e' proprio questo che il test deve dire.
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile


def leggi(p):
    sr, d = wavfile.read(str(p))
    x = d.astype(np.float64)
    if d.dtype == np.int16:
        x /= 32768.0
    elif d.dtype == np.int32:
        x /= 2147483648.0
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return x[:, :2], sr


def scrivi(p, x, sr):
    wavfile.write(str(p), sr, x.astype(np.float32))


def allinea(x, sr_from, sr_to, n):
    if sr_from != sr_to:
        x = signal.resample_poly(x, sr_to, sr_from, axis=0)
    if len(x) < n:
        x = np.vstack([x, np.zeros((n - len(x), 2))])
    return x[:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cartella")
    ap.add_argument("--sottogenere", choices=["deep", "tech", "progressive"], default=None)
    ap.add_argument("--stadio", choices=["idea grezza", "mix a meta'", "finita"], default=None)
    ap.add_argument("--modello", default="htdemucs")
    a = ap.parse_args()

    cart = Path(a.cartella)
    mix = sorted(p for p in cart.iterdir() if p.suffix.lower() == ".wav" and "_stem" not in p.stem.lower())
    if not mix:
        sys.exit("Nessun WAV nella cartella.")
    tmp = cart / "_demucs"
    tmp.mkdir(exist_ok=True)

    for p in mix:
        tid = p.stem.split("_")[0]
        dest = cart / f"{tid}_stem"
        if dest.exists():
            print(f"{p.name}: {dest.name} esiste gia', salto la separazione")
            continue
        print(f"-> separo {p.name} con Demucs...")
        subprocess.run([sys.executable, "-m", "demucs", "-n", a.modello, "-o", str(tmp), str(p)], check=True)
        sep = tmp / a.modello / p.stem
        x_mix, sr = leggi(p)
        n = len(x_mix)
        dest.mkdir()
        stems = {}
        for nome in ("drums", "bass", "other", "vocals"):
            f = sep / f"{nome}.wav"
            if f.exists():
                x, s = leggi(f)
                stems[nome] = allinea(x, s, sr, n)
        if "drums" in stems:
            lo = signal.butter(4, 150, "lowpass", fs=sr, output="sos")
            hi = signal.butter(4, 150, "highpass", fs=sr, output="sos")
            scrivi(dest / "demucs_kick.wav", signal.sosfiltfilt(lo, stems["drums"], axis=0), sr)
            scrivi(dest / "demucs_perc.wav", signal.sosfiltfilt(hi, stems["drums"], axis=0), sr)
        if "bass" in stems:
            scrivi(dest / "demucs_bass.wav", stems["bass"], sr)
        if "other" in stems:
            scrivi(dest / "demucs_other.wav", stems["other"], sr)
        if "vocals" in stems and np.max(np.abs(stems["vocals"])) > 1e-3:
            scrivi(dest / "demucs_vox.wav", stems["vocals"], sr)
        print(f"   stem in {dest.name}")

    cmd = [sys.executable, str(Path(__file__).with_name("deep_studio_analyze.py")), str(cart)]
    if a.sottogenere:
        cmd += ["--sottogenere", a.sottogenere]
    if a.stadio:
        cmd += ["--stadio", a.stadio]
    subprocess.run(cmd, check=True)

    for j in (cart / "_analisi").glob("*.json"):
        d = json.loads(j.read_text(encoding="utf-8"))
        if d.get("stems"):
            d["stems"]["source"] = "demucs"
            for it in d["stems"]["items"].values():
                it["confidence"] = "medium"
            for c in d.get("clashes") or []:
                c["confidence"] = "low" if c.get("type") == "generic" else "medium"
            d["analyzer"] = d.get("analyzer", "") + " + demucs " + a.modello
            j.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\nFatto. Carica la cartella _analisi su Drive (analisi / risultati), senza l'audio.")


if __name__ == "__main__":
    main()
