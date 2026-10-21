"""
Deep Studio - analisi delle tracce (v0.3, versione house)
=========================================================

NOTA: v0.3 ricostruita il 20 ott 2026 partendo dalla v0.2-house su Drive. Rispetto
alla v0.2: JSON 1.0 (deep-studio-analysis-1.0.schema.json), ruolo di ogni stem
ricavato dal nome con role_of(), stem in "stems.items", --sottogenere e --stadio,
funzione analyze_file() riusabile dal worker della M2.

Cosa fa
-------
Legge una cartella di WAV esportati da FL Studio e, per ogni mix, scrive un file
JSON con le misure (formato "schema 1.0") piu' un riepilogo CSV da incollare nel
foglio P1.

L'audio NON esce mai dal tuo computer: solo i JSON e il CSV vanno su Drive.

Nomi dei file (come nel foglio P1)
----------------------------------
    T01_titolo_nomaster.wav      mix senza master chain
    T01_titolo_master.wav        mix con master chain
    T01_titolo_stem-kick.wav     stem (kick, bass, drums, synth, pad, fx...)

Il pezzo prima del primo "_" (T01) e' l'ID della traccia: serve a collegare
mix e stem della stessa traccia.

Uso (Windows)
-------------
    py deep_studio_analyze.py "C:\\percorso\\cartella-tracce"
    py deep_studio_analyze.py "C:\\percorso\\cartella-tracce" --bpm 124
    py deep_studio_analyze.py "C:\\percorso\\cartella-tracce" --sottogenere deep --stadio finita

Ruolo degli stem: si ricava dall'ULTIMA parola del nome del file (separatori _ - e
spazio), per esempio "Sunset_Kick.wav" -> kick, "T01_x_stem-bass.wav" -> bass,
"Lead Synth.wav" -> lead. Parole sconosciute -> "other". Vedi role_of().

Oppure trascina la cartella sul file analizza.bat.

Dipendenze: solo numpy e scipy (py -m pip install numpy scipy).

Le soglie dei "checks" sono valori di partenza, da tarare sulle vostre note P1.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SCHEMA_VERSION = "1.0"
SCRIPT_VERSION = "0.3-house"

SUBGENRES = ("deep", "tech", "progressive")
STAGES = ("idea grezza", "mix a meta'", "finita")

# Parola finale del nome file -> ruolo dello stem. Tabella unica in stem_roles.json,
# copiata identica in web/lib/stem-roles.json: dashboard e analisi propongono lo stesso ruolo.
_ROLE_TABLE = json.loads((Path(__file__).with_name("stem_roles.json")).read_text(encoding="utf-8"))
ROLE_WORDS: dict[str, str] = _ROLE_TABLE["words"]
ROLES = tuple(r["id"] for r in _ROLE_TABLE["roles"])
VOCAL_ROLES = ("vox", "backing_vox", "vocal_chop", "choir")


def role_of(name: str) -> str:
    """Ruolo di uno stem dall'ultima parola del nome ("Sunset_Kick.wav" -> "kick").

    Prima prova le ultime due parole insieme ("Backing Vocals" -> backing_vocals)."""
    stem = Path(name).stem if "." in name else name
    words = [w for w in re.split(r"[\s_\-\.]+", stem.lower()) if w]
    while words and words[-1].isdigit() and words[-1] not in ROLE_WORDS:  # "Pad 2.wav" sì, "808" no
        words.pop()
    if not words:
        return "other"
    if len(words) >= 2 and f"{words[-2]}_{words[-1]}" in ROLE_WORDS:
        return ROLE_WORDS[f"{words[-2]}_{words[-1]}"]
    w = words[-1]
    return ROLE_WORDS.get(w, ROLE_WORDS.get(w.rstrip("s"), "other"))

# Bande del bilancio tonale (Hz), come nella skill audio-analysis-engine
BANDS = {
    "sub": (20, 60),
    "low": (60, 250),
    "low_mid": (250, 500),
    "mid": (500, 2000),
    "high_mid": (2000, 6000),
    "high": (6000, 20000),
}

# Soglie provvisorie: da tarare sul test set P1 (NON sono verita' assolute)
THRESHOLDS = {
    "true_peak_max_dbtp": -1.0,       # sopra: rischio distorsione dopo la conversione in MP3/AAC
    "nomaster_peak_min_headroom_db": 3.0,  # export senza master: almeno 3 dB di spazio sotto lo 0
    "low_side_ratio_max": 0.10,       # sotto 120 Hz il basso dovrebbe essere quasi mono
    "corr_high_min": 0.20,            # correlazione sopra 120 Hz: sotto questo valore, possibili problemi di fase
    "mono_loss_max_db": 3.0,          # perdita di energia passando in mono
    "crest_min_db": 6.0,              # dinamica: sotto questo valore, mix molto schiacciato
    "kick_bass_ratio_max_db": -3.0,   # bassline troppo forte sotto il kick (da tarare sugli stem veri)
    "sidechain_min_db": 2.0,          # quanto la bassline "si abbassa" sul kick
}


# ---------------------------------------------------------------------------
# Lettura audio
# ---------------------------------------------------------------------------

def load_wav(path: Path) -> tuple[np.ndarray, int]:
    """Legge un WAV (o un FLAC) e restituisce (audio float in [-1, 1] con forma (n, 2), sample rate)."""
    if Path(path).suffix.lower() == ".flac":
        # FLAC: serve soundfile (licenza BSD), facoltativo per chi usa solo WAV
        try:
            import soundfile
        except ImportError as e:
            raise RuntimeError("Per i FLAC serve soundfile: pip install soundfile") from e
        data, sr = soundfile.read(str(path), dtype="float64", always_2d=True)
        return (np.repeat(data, 2, axis=1) if data.shape[1] == 1 else data[:, :2]), sr
    sr, data = wavfile.read(str(path))
    if data.dtype == np.int16:
        x = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:  # anche i WAV a 24 bit arrivano qui
        x = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.uint8:
        x = (data.astype(np.float64) - 128.0) / 128.0
    else:  # float32 / float64 (export "32-bit float" di FL)
        x = data.astype(np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    elif x.shape[1] > 2:
        x = x[:, :2]
    return x, sr


# ---------------------------------------------------------------------------
# Loudness (ITU-R BS.1770 / EBU R128), implementata con numpy/scipy
# ---------------------------------------------------------------------------

def k_weighting(sr: int):
    """Filtri K-weighting (shelf + passa-alto) ricalcolati per qualsiasi sample rate.

    Formule di B. De Man: a 48 kHz riproducono i coefficienti della norma BS.1770.
    """
    # Shelf alto (+4 dB sopra ~1.7 kHz: simula la testa)
    G, fc, Q = 3.999843853973347, 1681.974450955533, 0.7071752369554196
    K = np.tan(np.pi * fc / sr)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = np.array([(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0])
    a1 = np.array([1.0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0])
    # Passa-alto (taglia sotto ~38 Hz)
    fc, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * fc / sr)
    a0 = 1 + K / Q + K * K
    b2 = np.array([1.0, -2.0, 1.0])
    a2 = np.array([1.0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0])
    return (b1, a1), (b2, a2)


def k_filter(x: np.ndarray, sr: int) -> np.ndarray:
    (b1, a1), (b2, a2) = k_weighting(sr)
    y = signal.lfilter(b1, a1, x, axis=0)
    return signal.lfilter(b2, a2, y, axis=0)


def block_loudness(xk: np.ndarray, sr: int, win_s: float, hop_s: float):
    """Loudness (LUFS) di blocchi di durata win_s con passo hop_s, sul segnale gia' K-filtrato."""
    win, hop = int(win_s * sr), int(hop_s * sr)
    if len(xk) < win:
        win = len(xk)
    starts = np.arange(0, len(xk) - win + 1, hop)
    sq = np.concatenate([np.zeros((1, xk.shape[1])), np.cumsum(xk ** 2, axis=0)])
    z = (sq[starts + win] - sq[starts]) / win  # media dei quadrati per canale
    power = z.sum(axis=1)
    with np.errstate(divide="ignore"):
        lufs = -0.691 + 10 * np.log10(power)
    return starts / sr, lufs, power


def loudness_block(x: np.ndarray, sr: int) -> dict:
    xk = k_filter(x, sr)

    # Integrata: blocchi da 400 ms, overlap 75%, gate assoluto -70 e relativo -10
    _, l400, p400 = block_loudness(xk, sr, 0.4, 0.1)
    abs_ok = l400 > -70
    if not abs_ok.any():
        integrated = float("-inf")
    else:
        rel = -0.691 + 10 * np.log10(p400[abs_ok].mean()) - 10
        ok = abs_ok & (l400 > rel)
        integrated = -0.691 + 10 * np.log10(p400[ok].mean())

    # Short-term (3 s, passo 1 s) e loudness range (LRA)
    t3, l3, p3 = block_loudness(xk, sr, 3.0, 1.0)
    lra = None
    abs_ok = l3 > -70
    if abs_ok.sum() >= 2:
        rel = -0.691 + 10 * np.log10(p3[abs_ok].mean()) - 20
        vals = l3[abs_ok & (l3 > rel)]
        if len(vals) >= 2:
            lra = float(np.percentile(vals, 95) - np.percentile(vals, 10))

    # True peak: sovracampionamento x4
    up = signal.resample_poly(x, 4, 1, axis=0)
    tp = float(np.max(np.abs(up)))
    sample_peak = float(np.max(np.abs(x)))

    return {
        "integrated_lufs": round(float(integrated), 2),
        "true_peak_dbtp": round(20 * np.log10(max(tp, 1e-12)), 2),
        "sample_peak_dbfs": round(20 * np.log10(max(sample_peak, 1e-12)), 2),
        "lra_lu": None if lra is None else round(lra, 1),
        "clipped_samples": count_clipped(x),
        "short_term_curve": [[round(float(t), 1), round(float(l), 1)]
                             for t, l in zip(t3, l3) if np.isfinite(l)],
        "confidence": "high",
    }


def count_clipped(x: np.ndarray, level: float = 0.999, run: int = 3) -> int:
    """Campioni in sequenze di almeno `run` campioni consecutivi a fondo scala."""
    total = 0
    for ch in range(x.shape[1]):
        hot = np.abs(x[:, ch]) >= level
        if not hot.any():
            continue
        d = np.diff(np.concatenate([[0], hot.astype(np.int8), [0]]))
        starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
        lengths = ends - starts
        total += int(lengths[lengths >= run].sum())
    return total


# ---------------------------------------------------------------------------
# Bilancio tonale, dinamica, stereo
# ---------------------------------------------------------------------------

def band_powers(x: np.ndarray, sr: int) -> dict:
    """Energia per banda, calcolata sui due canali separati (non sulla somma mono)."""
    nper = min(8192, len(x))
    f, pxx = signal.welch(x, fs=sr, nperseg=nper, axis=0)
    p = pxx.sum(axis=1)  # somma delle potenze di L e R
    total = p[(f >= 20) & (f <= 20000)].sum() + 1e-20
    out = {}
    for name, (lo, hi) in BANDS.items():
        e = p[(f >= lo) & (f < hi)].sum()
        out[name] = round(10 * np.log10(e / total + 1e-20), 1)
    return out


def dynamics_block(x: np.ndarray, sr: int, win_s: float = 2.0) -> dict:
    def crest(seg):
        rms = np.sqrt(np.mean(seg ** 2)) + 1e-12
        return 20 * np.log10((np.max(np.abs(seg)) + 1e-12) / rms)

    win = int(win_s * sr)
    per = []
    for start in range(0, len(x) - win + 1, win):
        seg = x[start:start + win]
        if np.sqrt(np.mean(seg ** 2)) > 1e-4:  # salta il silenzio
            per.append([round(start / sr, 1), round(float(crest(seg)), 1)])
    return {
        "crest_factor_db": round(float(crest(x)), 1),
        "per_window": per,
        "confidence": "high",
    }


def stereo_block(x: np.ndarray, sr: int) -> dict:
    L, R = x[:, 0], x[:, 1]
    sos_lo = signal.butter(4, 120, "lowpass", fs=sr, output="sos")
    sos_hi = signal.butter(4, 120, "highpass", fs=sr, output="sos")
    Lh, Rh = signal.sosfiltfilt(sos_hi, L), signal.sosfiltfilt(sos_hi, R)
    Ll, Rl = signal.sosfiltfilt(sos_lo, L), signal.sosfiltfilt(sos_lo, R)

    def corr(a, b):
        den = np.sqrt(np.sum(a ** 2) * np.sum(b ** 2))
        return float(np.sum(a * b) / den) if den > 0 else 1.0

    total_e = np.sum(L ** 2 + R ** 2) + 1e-20

    def side_ratio(a, b):
        m, s = (a + b) / 2, (a - b) / 2
        em, es = np.sum(m ** 2), np.sum(s ** 2)
        if 2 * (em + es) < total_e * 1e-4:  # banda quasi vuota (< -40 dB): niente da giudicare
            return 0.0
        return float(es / (em + es))

    def mono_loss(a, b):
        stereo = np.mean((a ** 2 + b ** 2) / 2)
        mono = np.mean(((a + b) / 2) ** 2)
        return float(10 * np.log10((stereo + 1e-20) / (mono + 1e-20)))

    # Correlazione per finestra (sopra 120 Hz), per sapere DOVE c'e' il problema
    win = int(2.0 * sr)
    per = []
    for start in range(0, len(x) - win + 1, win):
        a, b = Lh[start:start + win], Rh[start:start + win]
        if np.sqrt(np.mean(a ** 2 + b ** 2)) > 1e-4:
            per.append([round(start / sr, 1), round(corr(a, b), 2)])

    return {
        # Misurata sopra 120 Hz: kick e bassline mono nasconderebbero un pad in controfase
        "correlation": round(corr(Lh, Rh), 2),
        "correlation_full_band": round(corr(L, R), 2),
        "correlation_per_window": per,
        "side_ratio_by_band": {"low": round(side_ratio(Ll, Rl), 3),
                               "high": round(side_ratio(Lh, Rh), 3)},
        "mono_fold_loss_db": round(mono_loss(L, R), 1),
        "mono_fold_loss_above_120hz_db": round(mono_loss(Lh, Rh), 1),
        "confidence": "high",
    }


# ---------------------------------------------------------------------------
# Tempo e sezioni
# ---------------------------------------------------------------------------

def onset_envelope(mono: np.ndarray, sr: int, hop: int = 512, max_hz: float | None = None):
    """Spectral flux. Con max_hz=200 guarda solo il low end, cioe' il kick."""
    nper = 2048
    # padding iniziale: il frame k e' centrato esattamente a k*hop campioni
    padded = np.concatenate([np.zeros(nper // 2), mono])
    f, t, Z = signal.stft(padded, fs=sr, nperseg=nper, noverlap=nper - hop, boundary=None)
    mag = np.log1p(100 * np.abs(Z))
    if max_hz:
        mag = mag[f <= max_hz]
    flux = np.maximum(0, np.diff(mag, axis=1)).sum(axis=0)
    flux = np.concatenate([[0], flux])
    return flux - signal.medfilt(flux, 31), sr / hop


def estimate_tempo(mono: np.ndarray, sr: int, lo: float = 110, hi: float = 135, fixed: float | None = None):
    """Tempo per la house: cerca solo tra 110 e 135 BPM (la cassa dritta aiuta molto)."""
    env, fps = onset_envelope(mono, sr)
    env = np.maximum(env, 0)
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    lags = np.arange(len(ac))
    lag_lo, lag_hi = int(np.floor(60 * fps / hi)), int(np.ceil(60 * fps / lo))
    lag_hi = min(lag_hi, len(ac) - 2)
    if lag_hi <= lag_lo:
        return None, None, 0.0
    # rinforza con il multiplo a 2 e 4 battiti (la battuta)
    score = ac[lag_lo:lag_hi + 1].copy()
    for mult in (2, 4):
        idx = lags[lag_lo:lag_hi + 1] * mult
        idx = idx[idx < len(ac)]
        score[:len(idx)] += 0.5 * ac[idx]
    k = int(np.argmax(score)) + lag_lo
    # interpolazione parabolica per precisione sotto il frame
    if lag_lo < k < lag_hi:
        y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
        den = y0 - 2 * y1 + y2
        k = k + (0.5 * (y0 - y2) / den if den != 0 else 0)
    bpm = 60 * fps / k
    # fase: dove cade il kick (solo low end, cosi' gli hats in levare non ingannano)
    kenv, _ = onset_envelope(mono, sr, max_hz=200)
    kenv = np.maximum(kenv, 0)
    # rifinitura: griglia fine di BPM e fase, scegliendo quella che cade meglio sui colpi di kick.
    # Serve perche' anche 0.2 BPM di errore spostano la griglia di mezza battuta dopo un minuto.
    kenv = signal.convolve(kenv, np.ones(3) / 3, mode="same")
    frames = np.arange(len(kenv))
    best = (-np.inf, bpm, 0.0)
    if fixed:  # BPM indicato dal producer: si cerca solo la fase
        bpm = fixed
    span = 0.0 if fixed else 1.0
    for cand in np.arange(bpm - span, bpm + span + 0.0001, 0.02):
        period = 60 * fps / cand
        beats = np.arange(0, len(kenv) - 1, period)
        for ph in np.arange(0, period, 0.5):
            s = np.interp(beats + ph, frames, kenv).sum()
            if s > best[0]:
                best = (s, cand, ph)
    _, bpm, best_phase = best
    period = 60 * fps / bpm
    if best_phase > 0.9 * period:  # il kick cade appena prima di un battito: in realta' la fase e' ~0
        best_phase = max(0.0, best_phase - period)
    peak_ratio = float(ac[int(round(k))] / (ac[0] + 1e-12))
    return float(bpm), best_phase / fps, peak_ratio


def sections_block(x: np.ndarray, sr: int, bpm: float, phase_s: float) -> list[dict]:
    """Divide la traccia in sezioni su griglia di 4 battute, dove cambia il 'colore' energetico."""
    bar = 4 * 60 / bpm
    first = phase_s % bar
    edges = np.arange(first, len(x) / sr + 1e-9, bar)
    if len(edges) < 3:
        return []
    # caratteristiche per battuta: energia in dB nelle 6 bande + energia totale
    sos = {name: signal.butter(2, [max(lo, 20), min(hi, sr / 2 - 100)], "bandpass", fs=sr, output="sos")
           for name, (lo, hi) in BANDS.items()}
    mono = x.mean(axis=1)
    band_sig = {n: signal.sosfiltfilt(s, mono) for n, s in sos.items()}
    feats, rms = [], []
    for a, b in zip(edges[:-1], edges[1:]):
        i, j = int(a * sr), int(b * sr)
        row = [10 * np.log10(np.mean(band_sig[n][i:j] ** 2) + 1e-12) for n in BANDS]
        feats.append(row)
        rms.append(np.mean(x[i:j] ** 2))
    feats, rms = np.array(feats), np.array(rms)
    nb = len(feats)

    # novita' ai confini di frase (ogni 4 battute dall'inizio)
    boundaries = [0]
    for b in range(4, nb - 1, 4):
        prev = feats[max(0, b - 4):b].mean(axis=0)
        nxt = feats[b:min(nb, b + 4)].mean(axis=0)
        if np.mean(np.abs(nxt - prev)) > 2.5:  # soglia provvisoria, dB medi tra le bande
            boundaries.append(b)
    boundaries.append(nb)

    secs = []
    energies = []
    for a, b in zip(boundaries[:-1], boundaries[1:]):
        energies.append(10 * np.log10(rms[a:b].mean() + 1e-12))
    emax = max(energies)
    for k, (a, b) in enumerate(zip(boundaries[:-1], boundaries[1:])):
        rel = energies[k] - emax
        if rel > -2:
            label = "drop"
        elif k == 0:
            label = "intro"
        elif k == len(energies) - 1:
            label = "outro"
        elif energies[k + 1] > energies[k] + 2 and rms[a:b][-1] > rms[a:b][0] * 1.5:
            label = "build"
        else:
            label = "break"
        secs.append({
            "start_s": round(float(edges[a]), 2),
            "end_s": round(float(edges[b]) if b < len(edges) else len(x) / sr, 2),
            "bars": int(b - a),
            "label_guess": label,
            "energy": round(float(10 ** (rel / 20)), 2),  # 1.0 = sezione piu' forte
            "energy_rel_db": round(float(rel), 1),
            "confidence": "medium",
        })
    return secs


# ---------------------------------------------------------------------------
# Stem: bilanciamento, kick contro bassline e sidechain
# ---------------------------------------------------------------------------

def pitch_track(mono: np.ndarray, sr: int, fmin: float = 70.0, fmax: float = 1000.0,
                frame_s: float = 0.04, hop_s: float = 0.02, threshold: float = 0.15):
    """f0 per finestra con il metodo YIN (de Cheveigne & Kawahara 2002), solo numpy.

    Restituisce (tempi_s, f0_hz) con NaN dove la finestra non e' intonata (silenzio, rumore)."""
    n, hop = int(frame_s * sr), int(hop_s * sr)
    tau_min, tau_max = max(2, int(sr / fmax)), int(sr / fmin)
    if len(mono) < n + tau_max:
        return np.array([]), np.array([])
    rms_all = np.sqrt(np.mean(mono ** 2)) + 1e-12
    times, f0s = [], []
    size = 1 << int(np.ceil(np.log2(2 * (n + tau_max))))
    for start in range(0, len(mono) - n - tau_max, hop):
        seg = mono[start:start + n + tau_max]
        frame = seg[:n]
        times.append(start / sr)
        if np.sqrt(np.mean(frame ** 2)) < rms_all * 0.1:  # troppo piano: pausa tra le frasi
            f0s.append(np.nan)
            continue
        # funzione differenza d(tau) via autocorrelazione con FFT
        spec = np.fft.rfft(seg, size)
        acf = np.fft.irfft(spec * np.conj(np.fft.rfft(frame, size)), size)[: tau_max + 1]
        energy = np.cumsum(np.concatenate([[0.0], seg ** 2]))
        e0 = energy[n]
        e_tau = energy[np.arange(tau_max + 1) + n] - energy[np.arange(tau_max + 1)]
        d = e0 + e_tau - 2 * acf
        d[0] = 0
        cmnd = d[1:] * np.arange(1, tau_max + 1) / (np.cumsum(d[1:]) + 1e-12)
        cmnd = np.concatenate([[1.0], cmnd])
        below = np.where(cmnd[tau_min:] < threshold)[0]
        if len(below) == 0:
            f0s.append(np.nan)
            continue
        tau = below[0] + tau_min
        while tau + 1 <= tau_max and cmnd[tau + 1] < cmnd[tau]:  # scendi fino al minimo locale
            tau += 1
        if 1 <= tau < tau_max:  # interpolazione parabolica
            a, b, c = cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]
            den = a - 2 * b + c
            tau = tau + (0.5 * (a - c) / den if den != 0 else 0)
        f0s.append(sr / tau)
    return np.array(times), np.array(f0s)


def vocal_block(x: np.ndarray, sr: int) -> dict:
    """Misure per uno stem di voce: intonazione (serve l'autotune?), sibilanti, fango, dinamica."""
    mono = x.mean(axis=1)
    _, f0 = pitch_track(mono, sr)
    voiced = f0[np.isfinite(f0)]
    pitch = {"voiced_share": round(float(np.mean(np.isfinite(f0))), 2) if len(f0) else 0.0}
    if len(voiced) >= 10:
        midi = 69 + 12 * np.log2(voiced / 440.0)
        cents = (midi - np.round(midi)) * 100  # scarto dalla nota piu' vicina (accordatura A440)
        pitch.update({
            "f0_median_hz": round(float(np.median(voiced)), 1),
            "median_abs_cents": round(float(np.median(np.abs(cents))), 1),
            "share_off_25_cents": round(float(np.mean(np.abs(cents) > 25)), 2),
            "mean_offset_cents": round(float(np.mean(cents)), 1),  # tutto calante (-) o crescente (+)?
        })
    f, pxx = signal.welch(mono, fs=sr, nperseg=min(4096, len(mono)))

    def band(lo, hi):
        return float(pxx[(f >= lo) & (f < hi)].sum()) + 1e-20

    total = band(20, min(20000, sr / 2))
    return {
        "pitch": pitch,
        # sibilanti: 5-9 kHz rispetto alla presenza 1-4 kHz; sopra ~ -6 dB servono de-esser
        "sibilance_db": round(10 * np.log10(band(5000, 9000) / band(1000, 4000)), 1),
        # fango: energia sotto 150 Hz (spesso rimbombo del microfono), rispetto al totale
        "low_mud_db": round(10 * np.log10(band(20, 150) / total), 1),
        "crest_factor_db": round(float(20 * np.log10((np.max(np.abs(mono)) + 1e-12) /
                                                     (np.sqrt(np.mean(mono ** 2)) + 1e-12))), 1),
        "note": "soglie provvisorie; l'intonazione e' misurata rispetto alla scala cromatica A440",
        "confidence": "medium",
    }


def stem_level_db(x: np.ndarray, sr: int) -> float:
    return round(loudness_block(x, sr)["integrated_lufs"], 1)


def kick_bass_block(kick: np.ndarray, bass: np.ndarray, sr: int, bpm: float | None) -> dict:
    """Quanto la bassline occupa il low end mentre suona il kick, e quanto si abbassa (sidechain)."""
    n = min(len(kick), len(bass))
    sos = signal.butter(4, [30, 150], "bandpass", fs=sr, output="sos")
    k = signal.sosfiltfilt(sos, kick[:n].mean(axis=1))
    b = signal.sosfiltfilt(sos, bass[:n].mean(axis=1))
    hop = int(0.005 * sr)
    def env(s):
        sq = s ** 2
        m = len(sq) // hop
        return sq[:m * hop].reshape(m, hop).mean(axis=1)
    ek, eb = env(k), env(b)
    fps = sr / hop

    # colpi di kick: picchi dell'inviluppo
    min_dist = int(fps * 60 / ((bpm or 125) * 1.5))
    peaks, _ = signal.find_peaks(ek, height=ek.max() * 0.1, distance=max(min_dist, 1))
    if len(peaks) < 4:
        return {"available": False, "reason": "kick non rilevato"}

    hit_len = int(0.08 * fps)
    ratios, depth, rows = [], [], []
    for i, p in enumerate(peaks[:-1]):
        nxt = peaks[i + 1]
        hit_k = ek[p:p + hit_len].mean() + 1e-15
        hit_b = eb[p:p + hit_len].mean() + 1e-15
        mid_a, mid_b = p + int(0.4 * (nxt - p)), p + int(0.6 * (nxt - p))
        mid_b_e = eb[mid_a:mid_b].mean() + 1e-15
        if eb.max() > 0 and mid_b_e > eb.max() * 1e-4:  # bassline presente
            ratios.append(10 * np.log10(hit_b / hit_k))
            depth.append(10 * np.log10(mid_b_e / hit_b))
            rows.append(p / fps)
    if not ratios:
        return {"available": False, "reason": "bassline assente sotto il kick"}

    ratios, depth, rows = np.array(ratios), np.array(depth), np.array(rows)
    clash = (ratios > THRESHOLDS["kick_bass_ratio_max_db"]) & (depth < THRESHOLDS["sidechain_min_db"])

    # intervalli di tempo in cui c'e' clash (unendo colpi consecutivi)
    ranges = []
    start = None
    for t, c in zip(rows, clash):
        if c and start is None:
            start = t
        if not c and start is not None:
            ranges.append([round(float(start), 1), round(float(t), 1)])
            start = None
    if start is not None:
        ranges.append([round(float(start), 1), round(float(rows[-1]), 1)])

    return {
        "available": True,
        "bass_vs_kick_on_hits_db": round(float(np.median(ratios)), 1),
        "sidechain_depth_db": round(float(np.median(depth)), 1),
        "share_of_hits_with_clash": round(float(clash.mean()), 2),
        "time_ranges_s": ranges,
        "thresholds_note": "soglie provvisorie, da tarare sugli stem veri del test set",
    }


# ---------------------------------------------------------------------------
# Controlli provvisori (per la colonna P3 del foglio)
# ---------------------------------------------------------------------------

def run_checks(r: dict, export_kind: str) -> list[dict]:
    t = THRESHOLDS
    out = []
    ld, st, dy = r["loudness"], r["stereo"], r["dynamics"]
    if ld["clipped_samples"] > 0:
        out.append({"category": "loudness", "check": "clipping",
                    "detail": f"{ld['clipped_samples']} campioni a fondo scala"})
    if export_kind == "master" and ld["true_peak_dbtp"] > t["true_peak_max_dbtp"]:
        out.append({"category": "loudness", "check": "true_peak_alto",
                    "detail": f"true peak {ld['true_peak_dbtp']} dBTP (> {t['true_peak_max_dbtp']})"})
    if export_kind == "nomaster" and ld["sample_peak_dbfs"] > -t["nomaster_peak_min_headroom_db"]:
        out.append({"category": "loudness", "check": "poco_headroom",
                    "detail": f"picco {ld['sample_peak_dbfs']} dBFS senza master chain"})
    if st["side_ratio_by_band"]["low"] > t["low_side_ratio_max"]:
        out.append({"category": "stereo", "check": "low_end_stereo",
                    "detail": f"side sotto 120 Hz = {st['side_ratio_by_band']['low']}"})
    if st["correlation"] < t["corr_high_min"]:
        out.append({"category": "stereo", "check": "fase",
                    "detail": f"correlazione sopra 120 Hz = {st['correlation']}"})
    if st["mono_fold_loss_above_120hz_db"] > t["mono_loss_max_db"]:
        out.append({"category": "stereo", "check": "perdita_in_mono",
                    "detail": f"{st['mono_fold_loss_above_120hz_db']} dB persi in mono sopra 120 Hz"})
    if dy["crest_factor_db"] < t["crest_min_db"]:
        out.append({"category": "dinamica", "check": "sovracompressione",
                    "detail": f"crest factor {dy['crest_factor_db']} dB"})
    secs = r.get("sections") or []
    if len(secs) <= 1 and r["track"]["duration_s"] > 20:
        out.append({"category": "arrangiamento/energia", "check": "arrangiamento_piatto",
                    "detail": "nessun cambio di sezione rilevato"})
    for item in (r.get("stems") or {}).get("items", {}).values():
        v = item.get("vocal")
        if not v:
            continue
        p = v["pitch"]
        if p.get("share_off_25_cents", 0) > 0.35:
            out.append({"category": "voce", "check": "intonazione",
                        "detail": f"{item['file']}: {round(p['share_off_25_cents'] * 100)}% delle note a piu' di "
                                  f"25 cent dalla nota giusta (scarto medio {p['median_abs_cents']} cent)"})
        if v["sibilance_db"] > -6:
            out.append({"category": "voce", "check": "sibilanti",
                        "detail": f"{item['file']}: 5-9 kHz a {v['sibilance_db']} dB dalla presenza (1-4 kHz)"})
        if v["low_mud_db"] > -18:
            out.append({"category": "voce", "check": "fango_voce",
                        "detail": f"{item['file']}: {v['low_mud_db']} dB di energia sotto i 150 Hz"})
    for c in r.get("clashes", []):
        if c.get("type") == "kick_bass" and c.get("severity", 0) >= 0.5:
            out.append({"category": "clash di frequenze", "check": "kick_bass",
                        "detail": f"bassline {c['bass_vs_kick_on_hits_db']} dB rispetto al kick, "
                                  f"sidechain {c['sidechain_depth_db']} dB"})
    return out


# ---------------------------------------------------------------------------
# Orchestrazione
# ---------------------------------------------------------------------------

NAME_RE = re.compile(r"^(?P<id>[^_]+)_(?P<rest>.+)$")


def classify(path: Path):
    m = NAME_RE.match(path.stem)
    tid = m.group("id") if m else path.stem
    low = path.stem.lower()
    sm = re.search(r"_stem-([a-z0-9]+)", low)
    if sm:
        return tid, "stem", sm.group(1)
    if low.endswith("_nomaster"):
        return tid, "mix", "nomaster"
    if low.endswith("_master"):
        return tid, "mix", "master"
    return tid, "mix", "sconosciuto"


def load_reference(subgenre: str | None, *folders: Path) -> dict | None:
    """Media dei riferimenti del sottogenere (riferimenti_<sottogenere>.json), se c'e'."""
    if not subgenre:
        return None
    for d in folders:
        p = Path(d) / f"riferimenti_{subgenre}.json"
        if p.is_file():
            return json.loads(p.read_text(encoding="utf-8"))
    return None


def reference_block(r: dict, ref: dict) -> dict:
    """Differenze mix - media riferimenti. Le bande sono gia' relative all'energia
    totale, quindi il confronto e' 'a pari loudness' (tono, non volume)."""
    bands = r["tonal_balance"]["bands_db"]
    return {
        "name": f"riferimenti_{ref['subgenre']}",
        "n_tracks": ref.get("n_tracks"),
        "lufs_diff": round(r["loudness"]["integrated_lufs"] - ref["integrated_lufs"], 1),
        "crest_diff_db": round(r["dynamics"]["crest_factor_db"] - ref["crest_factor_db"], 1),
        "bands_diff_db": {k: round(bands[k] - ref["bands_db"][k], 1) for k in bands if k in ref["bands_db"]},
        "confidence": "medium" if (ref.get("n_tracks") or 0) >= 3 else "low",
    }


def build_reference(results: list[dict], subgenre: str) -> dict:
    """Media di piu' analisi: diventa riferimenti_<sottogenere>.json (solo uso interno)."""
    def mean(vals):
        return round(float(np.mean(vals)), 2)
    return {
        "subgenre": subgenre,
        "n_tracks": len(results),
        "tracks": [r["track"]["file"] for r in results],
        "integrated_lufs": mean([r["loudness"]["integrated_lufs"] for r in results]),
        "crest_factor_db": mean([r["dynamics"]["crest_factor_db"] for r in results]),
        "bands_db": {k: mean([r["tonal_balance"]["bands_db"][k] for r in results]) for k in BANDS},
    }


def analyze_file(path: Path, stems: dict | None = None, bpm_override: float | None = None,
                 subgenre: str | None = None, stage: str | None = None,
                 reference: dict | None = None, stems_source: str = "upload",
                 roles: dict | None = None) -> dict:
    """Analizza un mix (e gli stem, {nome_file: percorso}) e restituisce il JSON 1.0.

    roles ({nome: ruolo}) sostituisce role_of(): serve quando il producer ha corretto
    il ruolo a mano nella dashboard. E' il punto d'ingresso del worker."""
    stems = stems or {}
    roles = roles or {}
    x, sr = load_wav(path)
    tid, _, kind = classify(path)
    mono = x.mean(axis=1)

    if bpm_override:
        bpm, phase, _ = estimate_tempo(mono, sr, fixed=bpm_override)
        tempo_conf = "high"
    else:
        bpm, phase, strength = estimate_tempo(mono, sr)
        tempo_conf = "medium" if strength and strength > 0.2 else "low"

    r = {
        "schema_version": SCHEMA_VERSION,
        "source": "upload",
        "analyzer": f"deep_studio_analyze {SCRIPT_VERSION}",
        "track": {
            "id": tid,
            "file": path.name,
            "export": kind,
            "version": 1,
            "duration_s": round(len(x) / sr, 2),
            "sample_rate": sr,
            "genre": "house",
            "subgenre": subgenre,
            "stage": stage,
        },
        "loudness": loudness_block(x, sr),
        "tonal_balance": {"bands_db": band_powers(x, sr),
                          "note": "dB rispetto all'energia totale; ha senso solo confrontato con un riferimento",
                          "confidence": "high"},
        "dynamics": dynamics_block(x, sr),
        "stereo": stereo_block(x, sr),
        "sections": sections_block(x, sr, bpm, phase or 0.0) if bpm else [],
        "stems": {"provided": bool(stems), "source": stems_source if stems else None, "items": {}},
        "clashes": [],
        "tempo_bpm": None if bpm is None else round(bpm, 1),
        "tempo_confidence": tempo_conf,
        "key_guess": None,
        "daw_context": None,
        "reference": None,
    }

    if stems:
        conf = "high" if stems_source == "upload" else "medium"
        mix_lufs = r["loudness"]["integrated_lufs"]
        loaded = {}
        for name, p in stems.items():
            p = Path(p)
            sx, ssr = load_wav(p)
            if ssr != sr:
                print(f"   ! {p.name}: sample rate {ssr} diverso dal mix ({sr}), stem saltato")
                continue
            role = roles.get(name) or role_of(name)
            loaded[name] = (role, sx)
            lufs = stem_level_db(sx, sr)
            r["stems"]["items"][name] = {
                "file": p.name,
                "role": role,
                "loudness_lufs": lufs if np.isfinite(lufs) else None,  # stem muto: -inf non e' JSON
                "rel_to_mix_lu": round(lufs - mix_lufs, 1) if np.isfinite(lufs) else None,
                "confidence": conf,
            }
            if role in VOCAL_ROLES and np.isfinite(lufs):
                r["stems"]["items"][name]["vocal"] = vocal_block(sx, sr)
        kick = next((x for role, x in loaded.values() if role == "kick"), None)
        bass = next((x for role, x in loaded.values() if role in ("bass", "sub")), None)
        if kick is not None and bass is not None:
            kb = kick_bass_block(kick, bass, sr, bpm)
            if kb.get("available"):
                r["clashes"].append({
                    "type": "kick_bass",
                    "stems": ["kick", "bass"],
                    "band_hz": [30, 150],
                    "time_ranges_s": kb["time_ranges_s"],
                    "severity": kb["share_of_hits_with_clash"],
                    "bass_vs_kick_on_hits_db": kb["bass_vs_kick_on_hits_db"],
                    "sidechain_depth_db": kb["sidechain_depth_db"],
                    "confidence": "medium" if stems_source == "upload" else "low",
                    "note": kb["thresholds_note"],
                })
            else:
                r["stems"]["kick_bass_note"] = kb.get("reason")

    if reference:
        r["reference"] = reference_block(r, reference)
    r["checks"] = run_checks(r, kind)
    r["checks_note"] = "controlli automatici con soglie provvisorie: servono per la colonna P3, non sono note del coach"
    return r


def main(argv=None):
    ap = argparse.ArgumentParser(description="Deep Studio - analisi locale (v0.3, JSON 1.0)")
    ap.add_argument("cartella", help="cartella con i WAV esportati da FL Studio")
    ap.add_argument("--bpm", type=float, default=None, help="BPM del progetto, se lo conosci (piu' preciso)")
    ap.add_argument("--out", default=None, help="cartella di output (default: <cartella>/_analisi)")
    ap.add_argument("--sottogenere", choices=SUBGENRES, default=None)
    ap.add_argument("--stadio", choices=STAGES, default=None)
    ap.add_argument("--crea-riferimenti", action="store_true",
                    help="la cartella contiene riferimenti: scrive riferimenti_<sottogenere>.json con la media")
    a = ap.parse_args(argv)
    if a.crea_riferimenti and not a.sottogenere:
        ap.error("--crea-riferimenti richiede --sottogenere")

    folder = Path(a.cartella).expanduser()
    if not folder.is_dir():
        print(f"Cartella non trovata: {folder}")
        return 1
    out = Path(a.out) if a.out else folder / "_analisi"
    out.mkdir(parents=True, exist_ok=True)

    wavs = sorted(p for p in folder.glob("*.wav") if not p.name.startswith("."))
    wavs += sorted(p for p in folder.glob("*.WAV") if p not in wavs)
    if not wavs:
        print("Nessun file .wav nella cartella.")
        return 1

    stems_by_id, mixes = {}, []
    for p in wavs:
        tid, kind, sub = classify(p)
        if kind == "stem":
            stems_by_id.setdefault(tid, {})[sub] = p
        else:
            mixes.append(p)

    # In alternativa: una sottocartella "T01_stem" con gli stem esportati da FL
    # ("Split mixer tracks"), senza rinominarli. Il ruolo si ricava dall'ultima parola
    # del nome del file con role_of() ("Sunset_Kick.wav" -> kick).
    for d in sorted(p for p in folder.iterdir() if p.is_dir()):
        m = re.match(r"^([^_]+)_stem", d.name, re.IGNORECASE)
        if not m:
            continue
        for sp in sorted(list(d.glob("*.wav")) + list(d.glob("*.WAV"))):
            stems_by_id.setdefault(m.group(1), {})[sp.stem.lower()] = sp

    reference = None
    if not a.crea_riferimenti:
        reference = load_reference(a.sottogenere, folder, Path(__file__).parent)
        if a.sottogenere and reference is None:
            print(f"(nessun riferimenti_{a.sottogenere}.json: confronto con i riferimenti saltato)")

    rows, results = [], []
    for p in mixes:
        tid, _, kind = classify(p)
        print(f"-> {p.name}")
        try:
            r = analyze_file(p, stems_by_id.get(tid, {}), a.bpm, a.sottogenere, a.stadio, reference)
        except Exception as e:  # una traccia rovinata non deve fermare le altre
            print(f"   errore: {e}")
            continue
        results.append(r)
        (out / f"{p.stem}.json").write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding="utf-8")
        ld, st, dy = r["loudness"], r["stereo"], r["dynamics"]
        kb = r["clashes"][0] if r["clashes"] else {}
        rows.append({
            "ID": tid, "file": p.name, "export": kind, "durata_s": r["track"]["duration_s"],
            "bpm": r["tempo_bpm"], "LUFS": ld["integrated_lufs"], "true_peak_dBTP": ld["true_peak_dbtp"],
            "LRA": ld["lra_lu"], "clip": ld["clipped_samples"], "crest_dB": dy["crest_factor_db"],
            "corr_>120Hz": st["correlation"], "side_<120Hz": st["side_ratio_by_band"]["low"],
            "mono_loss_dB": st["mono_fold_loss_above_120hz_db"],
            **{f"banda_{k}": v for k, v in r["tonal_balance"]["bands_db"].items()},
            "sezioni": " | ".join(f"{s['label_guess']} {s['start_s']}s" for s in r["sections"]),
            "bass_vs_kick_dB": kb.get("bass_vs_kick_on_hits_db", ""),
            "sidechain_dB": kb.get("sidechain_depth_db", ""),
            "controlli": "; ".join(c["check"] for c in r["checks"]),
        })
        print(f"   {ld['integrated_lufs']} LUFS, true peak {ld['true_peak_dbtp']} dBTP, "
              f"{r['tempo_bpm']} BPM, {len(r['sections'])} sezioni, controlli: "
              f"{', '.join(c['check'] for c in r['checks']) or 'nessuno'}")

    if rows:
        with open(out / "riepilogo.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter=";")
            w.writeheader()
            w.writerows(rows)
    if a.crea_riferimenti and results:
        ref_path = folder / f"riferimenti_{a.sottogenere}.json"
        ref_path.write_text(json.dumps(build_reference(results, a.sottogenere), indent=2,
                                       ensure_ascii=False), encoding="utf-8")
        print(f"Riferimenti salvati in {ref_path} (solo uso interno, non va su git)")
    print(f"\nFatto: {len(rows)} mix analizzati. Risultati in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
