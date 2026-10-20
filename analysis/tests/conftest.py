"""Segnali sintetici per i test: niente audio vero nel repository."""
import sys
from pathlib import Path

import numpy as np
import pytest
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SR = 48000


def sine(freq, seconds, amp=1.0, sr=SR, phase=0.0):
    t = np.arange(int(seconds * sr)) / sr
    return amp * np.sin(2 * np.pi * freq * t + phase)


def stereo(left, right=None):
    return np.stack([left, left if right is None else right], axis=1)


def kick_track(bpm, seconds, sr=SR):
    """Kick sintetico: sinusoide 55 Hz con inviluppo esponenziale su ogni battito."""
    n = int(seconds * sr)
    out = np.zeros(n)
    hit_len = int(0.25 * sr)
    t = np.arange(hit_len) / sr
    hit = np.sin(2 * np.pi * 55 * t) * np.exp(-t * 18)
    period = 60.0 / bpm
    for k in range(int(seconds / period)):
        i = int(round(k * period * sr))
        m = min(hit_len, n - i)
        out[i:i + m] += hit[:m]
    return out


def write_wav(path, x, sr=SR):
    wavfile.write(str(path), sr, np.asarray(x, dtype=np.float32))
    return path


@pytest.fixture
def sr():
    return SR
