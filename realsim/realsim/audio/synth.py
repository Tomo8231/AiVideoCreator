"""衝突音・擦れ音の合成（録音素材がない場合の代わり）。

衝突音はモーダル合成：物体を「減衰する正弦波（固有振動）の集まり」とみなし、
衝突の強さ・接触時間・物体の大きさ・材質から各モードの周波数・減衰・強さを決める。
接触の瞬間の短いノイズ（カチッという成分）も加える。

正直な注意：モーダル合成は録音素材に比べると「それらしいが作り物っぽさが残る」ことが多い。
最高のリアルさが必要なら assets/audio/ に実物の録音を置くこと（samples.py が優先して使う）。
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from ..materials import MODE_RATIOS, Acoustic


def _bandpass(x: np.ndarray, lo: float, hi: float, sr: int, order: int = 2) -> np.ndarray:
    lo = max(20.0, lo)
    hi = min(sr * 0.45, hi)
    if hi <= lo * 1.05:
        hi = lo * 1.5
    sos = signal.butter(order, [lo, hi], btype="band", fs=sr, output="sos")
    return signal.sosfilt(sos, x)


def body_modes(ac: Acoustic, length: float, rng: np.random.Generator, speed: float):
    """1つの物体の固有振動（周波数, 振幅, 減衰率）を返す。"""
    f0 = np.clip(ac.freq_k / max(length, 1e-3), ac.freq_min, ac.freq_max)
    ratios = np.array(MODE_RATIOS[ac.modes]) * rng.uniform(0.97, 1.03, len(MODE_RATIOS[ac.modes]))
    freqs = f0 * ratios
    # 接触時間が短い（硬い・速い）ほど高いモードまで励起される
    tau = ac.contact_ms / 1000.0 * (max(speed, 0.02) / 0.5) ** -0.2
    excite = 1.0 / (1.0 + (freqs * tau * 2.0) ** 2)
    # 当たる位置で各モードの強さが変わる（ランダムで近似）
    amps = rng.uniform(0.25, 1.0, len(freqs)) * excite / np.sqrt(np.arange(1, len(freqs) + 1))
    t60 = ac.t60 / ratios ** ac.hf_damping * rng.uniform(0.85, 1.15, len(freqs))
    keep = freqs < ac.freq_max
    return freqs[keep], amps[keep], 6.91 / t60[keep]


def impact(ac_a: Acoustic, ac_b: Acoustic, len_a: float, len_b: float, w_a: float, w_b: float,
           speed: float, rng: np.random.Generator, sr: int) -> np.ndarray:
    """2物体の衝突音（モノラル、ピーク約1に正規化しない生の振幅）。"""
    parts = []
    longest = 0.0
    specs = []
    for ac, L, w in ((ac_a, len_a, w_a), (ac_b, len_b, w_b)):
        f, a, d = body_modes(ac, L, rng, speed)
        specs.append((f, a * w * ac.loudness, d))
        if len(d):
            longest = max(longest, float((6.91 / d).max()))
    n = int(sr * min(3.0, longest * 1.1 + 0.02))
    t = np.arange(n) / sr
    out = np.zeros(n)
    for f, a, d in specs:
        for fk, ak, dk in zip(f, a, d):
            out += ak * np.exp(-dk * t) * np.sin(2 * np.pi * fk * t + rng.uniform(0, 0.3))
    parts.append(out)
    # 接触ノイズ（両方の材質の平均的な明るさ）
    bright = np.sqrt(ac_a.click_bright * ac_b.click_bright) * (max(speed, 0.02) / 0.5) ** 0.15
    clen = int(sr * 0.006)
    click = rng.standard_normal(clen) * np.exp(-np.arange(clen) / (sr * 0.0012))
    click = _bandpass(click, bright / 2.2, bright * 2.2, sr)
    level = 0.5 * (ac_a.click_level + ac_b.click_level)
    out[:clen] += click / (np.abs(click).max() + 1e-9) * level * np.abs(out).max() * 1.2
    # ごく短いフェードイン（デジタル的なプチ音を防ぐ。0.15ms）
    fi = max(2, int(sr * 0.00015))
    out[:fi] *= np.linspace(0, 1, fi)
    return out


def friction_noise(n: int, band: tuple[float, float], rng: np.random.Generator, sr: int,
                   grain: float = 0.0) -> np.ndarray:
    """擦れ・転がりのノイズ源。grain > 0 で表面の凹凸によるザラつき（微小な粒）を足す。"""
    x = rng.standard_normal(n)
    if grain > 0:
        g = (rng.random(n) < grain / sr * 2000).astype(float) * rng.standard_normal(n) * 4
        x = x + g
    return _bandpass(x, band[0], band[1], sr)
