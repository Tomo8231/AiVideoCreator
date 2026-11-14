"""録音素材のバンク。素材があれば合成音より優先して使う。

フォルダ構成（どれか1つあれば使う。上ほど優先）:
  assets/audio/impacts/<材質A>__<材質B>/*.wav   （例: wood__wood_table/。順不同で探す）
  assets/audio/impacts/<材質>/*.wav              （小さい／軽い方の物体の材質で探す）
強さの段階を分けたい場合は、その中に soft/ と hard/ のサブフォルダを作る。

擦れ・転がりのループ素材:
  assets/audio/loops/<材質>_roll.wav, <材質>_slide.wav
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from scipy import signal

AUDIO_EXT = (".wav", ".flac", ".aif", ".aiff", ".ogg")


def load_audio(path: Path, sr: int) -> np.ndarray:
    x, file_sr = sf.read(str(path), always_2d=True, dtype="float64")
    x = x.mean(axis=1)
    if file_sr != sr:
        from math import gcd
        g = gcd(int(file_sr), sr)
        x = signal.resample_poly(x, sr // g, int(file_sr) // g)
    return x


def trim_silence(x: np.ndarray, sr: int, thresh_db: float = -50.0) -> np.ndarray:
    """素材の頭の無音を詰める（衝突の瞬間と音の立ち上がりを揃えるため重要）。"""
    peak = np.abs(x).max() + 1e-12
    above = np.nonzero(np.abs(x) > peak * 10 ** (thresh_db / 20))[0]
    if len(above) == 0:
        return x
    start = max(0, above[0] - int(sr * 0.0005))
    return x[start:]


class SampleBank:
    def __init__(self, root: Path, sr: int):
        self.root = root
        self.sr = sr
        self._cache: dict[Path, list[np.ndarray]] = {}
        self._recent: dict[Path, list[int]] = {}

    def _load_dir(self, d: Path) -> list[np.ndarray]:
        if d not in self._cache:
            files = sorted(f for f in d.glob("*") if f.suffix.lower() in AUDIO_EXT)
            clips = [trim_silence(load_audio(f, self.sr), self.sr) for f in files]
            self._cache[d] = [c / (np.abs(c).max() + 1e-12) for c in clips]
        return self._cache[d]

    def _find_dir(self, mat_a: str, mat_b: str) -> Optional[Path]:
        base = self.root / "impacts"
        for name in (f"{mat_a}__{mat_b}", f"{mat_b}__{mat_a}", mat_a, mat_b):
            d = base / name
            if d.is_dir():
                return d
        return None

    def has_any(self) -> bool:
        return (self.root / "impacts").is_dir() and any((self.root / "impacts").iterdir())

    def impact(self, mat_a: str, mat_b: str, strength: float, rng: np.random.Generator) -> Optional[np.ndarray]:
        """strength: 0〜1 程度。0.5 を境に soft / hard を切り替える。"""
        d = self._find_dir(mat_a, mat_b)
        if d is None:
            return None
        layer = d / ("hard" if strength >= 0.5 else "soft")
        if layer.is_dir() and self._load_dir(layer):
            d = layer
        clips = self._load_dir(d)
        if not clips:
            return None
        # ラウンドロビン：直近に使った素材を避けて選ぶ
        recent = self._recent.setdefault(d, [])
        avoid = set(recent[-min(len(clips) - 1, 3):]) if len(clips) > 1 else set()
        choices = [i for i in range(len(clips)) if i not in avoid]
        i = int(rng.choice(choices))
        recent.append(i)
        return clips[i]

    def loop(self, material: str, kind: str) -> Optional[np.ndarray]:
        f = None
        for ext in AUDIO_EXT:
            cand = self.root / "loops" / f"{material}_{kind}{ext}"
            if cand.exists():
                f = cand
                break
        if f is None:
            return None
        if f not in self._cache:
            x = load_audio(f, self.sr)
            self._cache[f] = [x / (np.sqrt(np.mean(x ** 2)) + 1e-12)]
        return self._cache[f][0]
