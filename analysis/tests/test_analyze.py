"""Test dell'analisi su segnali sintetici di cui conosciamo la risposta giusta.

Ricostruiti il 20 ott 2026 (gli originali non erano su Drive). 13 test.
"""
import json
from pathlib import Path

import jsonschema
import numpy as np
from scipy.io import wavfile

import deep_studio_analyze as ds
from conftest import SR, kick_track, sine, stereo, write_wav

SCHEMA = json.loads((Path(ds.__file__).parent / "deep-studio-analysis-1.0.schema.json").read_text(encoding="utf-8"))


# --- Loudness: i valori di prova della norma ITU-R BS.1770 -------------------------

def test_loudness_sine_1khz_0dbfs_un_canale():
    x = stereo(sine(1000, 10), np.zeros(10 * SR))
    assert abs(ds.loudness_block(x, SR)["integrated_lufs"] - (-3.0)) < 0.1


def test_loudness_sine_1khz_meno20dbfs():
    x = stereo(sine(1000, 10, amp=0.1), np.zeros(10 * SR))
    assert abs(ds.loudness_block(x, SR)["integrated_lufs"] - (-23.0)) < 0.1


def test_wav_24bit_letto_come_float(tmp_path):
    # FL esporta a 24 bit: scipy li legge come int32, load_wav deve riportarli in [-1, 1]
    x = stereo(sine(1000, 5, amp=0.1), np.zeros(5 * SR))
    p = tmp_path / "t24.wav"
    wavfile.write(str(p), SR, (x * 2**31).astype(np.int32))
    y, sr = ds.load_wav(p)
    assert sr == SR and abs(ds.loudness_block(y, sr)["integrated_lufs"] - (-23.0)) < 0.1


def test_true_peak_vede_i_picchi_tra_i_campioni():
    # sinusoide a sr/4 sfasata di 45 gradi: i campioni non toccano mai il picco vero
    x = stereo(sine(SR / 4, 2, phase=np.pi / 4))
    ld = ds.loudness_block(x, SR)
    assert abs(ld["sample_peak_dbfs"] - (-3.0)) < 0.1
    assert ld["true_peak_dbtp"] > -0.5


def test_clipping_contato_solo_se_ci_sono_campioni_a_fondo_scala():
    pulita = stereo(sine(100, 2, amp=0.5))
    clippata = stereo(np.clip(sine(100, 2, amp=2.0), -1, 1))
    assert ds.count_clipped(pulita) == 0
    assert ds.count_clipped(clippata) > 0


# --- Stereo ----------------------------------------------------------------------------

def test_mono_ha_correlazione_1_e_niente_side():
    st = ds.stereo_block(stereo(sine(80, 4, 0.5) + sine(1000, 4, 0.3)), SR)
    assert st["correlation"] > 0.99
    assert st["side_ratio_by_band"]["low"] < 0.01
    assert abs(st["mono_fold_loss_db"]) < 0.1


def test_controfase_viene_segnalata():
    s = sine(1000, 4, 0.5)
    r = {"loudness": {"clipped_samples": 0, "sample_peak_dbfs": -6, "true_peak_dbtp": -6},
         "stereo": ds.stereo_block(stereo(s, -s), SR),
         "dynamics": {"crest_factor_db": 12}, "sections": [{}, {}], "track": {"duration_s": 4}}
    assert r["stereo"]["correlation"] < -0.99
    assert r["stereo"]["mono_fold_loss_above_120hz_db"] > 20
    assert {"fase", "perdita_in_mono"} <= {c["check"] for c in ds.run_checks(r, "nomaster")}


# --- Bilancio tonale, tempo, sezioni ---------------------------------------------------

def test_bande_sub_e_low():
    sub = ds.band_powers(stereo(sine(40, 4)), SR)
    low = ds.band_powers(stereo(sine(100, 4)), SR)
    assert max(sub, key=sub.get) == "sub"
    assert max(low, key=low.get) == "low"


def test_tempo_di_un_kick_a_124_bpm():
    bpm, phase, _ = ds.estimate_tempo(kick_track(124, 30), SR)
    assert abs(bpm - 124) < 0.5
    assert phase < 0.05


def test_sezioni_intro_piano_poi_drop():
    bar = 4 * 60 / 124
    quiet = kick_track(124, 16 * bar) * 0.1
    loud = kick_track(124, 16 * bar) + sine(3000, 16 * bar, 0.2)  # entra anche roba sopra
    secs = ds.sections_block(stereo(np.concatenate([quiet, loud])), SR, 124, 0.0)
    assert len(secs) >= 2
    assert secs[0]["label_guess"] == "intro"
    assert secs[-1]["label_guess"] == "drop"


# --- Stem ------------------------------------------------------------------------------

def test_kick_bassline_clash_e_sidechain():
    bpm, secs = 124, 16
    kick = kick_track(bpm, secs)
    bass = sine(50, secs, 0.8)
    duck = np.ones_like(bass)  # sidechain: bassline quasi muta nei 150 ms dopo ogni kick
    period = int(round(60 / bpm * SR))
    for i in range(0, len(duck), period):
        duck[i:i + int(0.15 * SR)] = 0.1
    senza = ds.kick_bass_block(stereo(kick), stereo(bass), SR, bpm)
    con = ds.kick_bass_block(stereo(kick), stereo(bass * duck), SR, bpm)
    assert senza["share_of_hits_with_clash"] >= 0.5
    assert con["share_of_hits_with_clash"] < 0.5
    assert con["sidechain_depth_db"] > senza["sidechain_depth_db"] + 6


def test_role_of_usa_l_ultima_parola():
    casi = {
        "Sunset_Kick.wav": "kick", "T01_sunset_stem-bass.wav": "bass", "Lead Synth.wav": "lead",
        "Pad 2.wav": "pad", "demucs_perc.wav": "perc", "Atmosfere.wav": "pad", "808.wav": "bass",
        "Hats.wav": "perc", "Vocal Chop.wav": "vox", "Kick Bass.wav": "bass", "Mistero.wav": "other",
    }
    for nome, ruolo in casi.items():
        assert ds.role_of(nome) == ruolo, nome


# --- Dalla cartella al JSON 1.0 ----------------------------------------------------------

def test_cartella_completa_produce_json_1_0_valido(tmp_path):
    secs, bpm = 20, 124
    kick, bass = kick_track(bpm, secs) * 0.8, sine(50, secs, 0.5)
    write_wav(tmp_path / "T01_sunset_nomaster.wav", stereo(0.5 * (kick + bass)))
    (tmp_path / "T01_stem").mkdir()
    write_wav(tmp_path / "T01_stem" / "Sunset_Kick.wav", stereo(kick))
    write_wav(tmp_path / "T01_stem" / "Sunset_Bass.wav", stereo(bass))

    # prima i riferimenti (qui: la traccia stessa), poi l'analisi che li usa
    assert ds.main([str(tmp_path), "--sottogenere", "deep", "--crea-riferimenti",
                    "--out", str(tmp_path / "rif")]) == 0
    assert ds.main([str(tmp_path), "--sottogenere", "deep", "--stadio", "finita"]) == 0

    r = json.loads((tmp_path / "_analisi" / "T01_sunset_nomaster.json").read_text(encoding="utf-8"))
    jsonschema.validate(r, SCHEMA)
    assert r["schema_version"] == "1.0"
    assert r["track"]["subgenre"] == "deep" and r["track"]["stage"] == "finita"
    assert {k: v["role"] for k, v in r["stems"]["items"].items()} == {"sunset_kick": "kick", "sunset_bass": "bass"}
    assert r["clashes"] and r["clashes"][0]["type"] == "kick_bass"
    assert r["reference"]["lufs_diff"] == 0.0
    assert (tmp_path / "_analisi" / "riepilogo.csv").is_file()
