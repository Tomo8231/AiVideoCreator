"""衝突ログから効果音トラックを作る。

処理の流れ:
  衝突イベント → 素材（録音 or 合成）を選ぶ → 揺らぎ（ピッチ・音量）→ 強さに応じた音量
  → カメラ位置から見た定位（左右・距離減衰・到達遅延・空気による高域減衰）→ 配置
  擦れ・転がり → 速度と押し付け力で音量が変わるノイズ
  → 残響（実在の部屋のインパルス応答 or 合成）→ 部屋の環境音 → ラウドネス調整・リミッター
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import pyloudnorm
import soundfile as sf
from scipy import signal

from .. import materials
from ..physics import Recording
from ..scene import CameraPath, Scene
from . import synth
from .samples import AUDIO_EXT, SampleBank, load_audio

ASSETS = Path(__file__).resolve().parents[2] / "assets" / "audio"
SOUND_SPEED = 343.0
STATIC_MASS = 30.0  # 机など固定物を音の計算上で扱うときの仮の質量[kg]


@dataclass
class AudioSettings:
    sr: int = 48000
    # 聴き比べ用に各処理を個別に止められる
    material_variation: bool = True   # False: 全衝突を同じ1つの音にする
    random_variation: bool = True     # ピッチ・音量の揺らぎ、ラウンドロビン
    spatial: bool = True              # 左右定位・距離減衰・遅延
    friction: bool = True             # 擦れ・転がり音
    slide_gain: float = 0.15          # 擦れ音の大きさ
    roll_gain: float = 0.3            # 転がり音の大きさ
    reverb: bool = True
    room_tone: bool = True
    pitch_jitter: float = 0.04        # ±4%
    gain_jitter_db: float = 2.0       # ±2dB
    reference_distance: float = 0.3   # この距離より近いと音量は上がらない[m]
    reverb_wet_db: float = -17.0      # 残響の量（直接音に対して）
    reverb_rt60: float = 0.38         # 合成残響の残響時間[秒]（小さめの部屋）
    room_tone_db: float = -38.0       # 環境音の大きさ（全体のラウドネスに対する相対値[LU]）
    target_lufs: float = -14.0
    true_peak_db: float = -1.0
    max_limiting_db: float = 6.0      # これ以上リミッターで潰さない（潰すと迫力・自然さが落ちる）
    seed: int = 1


@dataclass
class AudioResult:
    mix: np.ndarray                   # [n, 2]
    stems: dict[str, np.ndarray]
    sr: int
    report: dict = field(default_factory=dict)
    placements: list = field(default_factory=list)   # (イベント時刻, 実際に置いた時刻, 強さ)

    def write(self, path: Path, stems_dir: Optional[Path] = None) -> None:
        sf.write(str(path), self.mix, self.sr, subtype="PCM_24")
        if stems_dir:
            stems_dir.mkdir(parents=True, exist_ok=True)
            for k, v in self.stems.items():
                sf.write(str(stems_dir / f"{k}.wav"), v, self.sr, subtype="PCM_24")


# ------------------------------------------------------------------ 空間

class Listener:
    """カメラ = 聴取位置。マイクがカメラに付いている想定。"""

    def __init__(self, cam: CameraPath, fps: int):
        self.cam = cam
        self.fps = fps

    def frame(self, t: float) -> int:
        return int(np.clip(round(t * self.fps), 0, len(self.cam.position) - 1))

    def locate(self, t: float, pos: np.ndarray) -> tuple[float, float]:
        """(左右 -1〜1, 距離[m])"""
        f = self.frame(t)
        p = self.cam.position[f]
        fwd = self.cam.target[f] - p
        fwd /= np.linalg.norm(fwd) + 1e-9
        right = np.cross(fwd, [0, 0, 1.0])
        right /= np.linalg.norm(right) + 1e-9
        rel = pos - p
        dist = float(np.linalg.norm(rel))
        az = np.arctan2(rel @ right, rel @ fwd)
        return float(np.clip(np.sin(az), -1, 1)), dist


def _pan_gains(pan: float) -> tuple[float, float]:
    # 等パワー・パン。ステレオマイク程度の広がりに抑える（0.8倍）
    a = (pan * 0.8 + 1) * np.pi / 4
    return float(np.cos(a)), float(np.sin(a))


def _air_lowpass(x: np.ndarray, dist: float, sr: int) -> np.ndarray:
    if dist < 1.5:
        return x
    fc = float(np.clip(22000 / (1 + (dist - 1.5) / 4), 3000, 20000))
    sos = signal.butter(1, fc, fs=sr, output="sos")
    return signal.sosfilt(sos, x)


# ------------------------------------------------------------------ 本体

def _resample_pitch(x: np.ndarray, ratio: float) -> np.ndarray:
    if abs(ratio - 1) < 1e-4:
        return x
    n = int(len(x) / ratio)
    return np.interp(np.arange(n) * ratio, np.arange(len(x)), x)


def _body_mass(scene: Scene, i: int) -> float:
    b = scene.bodies[i]
    if b.static:
        return STATIC_MASS
    return b.mass if b.mass is not None else materials.get(b.material).density * b.volume()


def render_audio(scene: Scene, rec: Recording, cam: CameraPath, st: AudioSettings = AudioSettings()) -> AudioResult:
    sr = st.sr
    rng = np.random.default_rng(st.seed)
    n_total = int((rec.n_frames / rec.fps + 3.0) * sr)
    impacts = np.zeros((n_total, 2))
    fric = np.zeros((n_total, 2))
    listener = Listener(cam, rec.fps)
    bank = SampleBank(ASSETS, sr)
    used_samples = 0
    placements = []

    fixed = None  # material_variation=False 用の「全部同じ音」
    if not st.material_variation:
        ac = materials.get("wood").acoustic
        fixed = synth.impact(ac, ac, 0.05, 0.05, 1, 1, 0.5, np.random.default_rng(0), sr)
        fixed /= np.abs(fixed).max()

    for ev in rec.events:
        a, b = int(ev["a"]), int(ev["b"])
        ba, bb = scene.bodies[a], scene.bodies[b]
        speed = float(ev["speed"])
        ma, mb = _body_mass(scene, a), _body_mass(scene, b)
        mu = ma * mb / (ma + mb)
        # 振幅 ∝ 速度 × 実効質量^0.35（重い物ほど大きいが、比例はしない）
        gain = (speed / 0.5) * (mu / 0.01) ** 0.35 * 0.25
        if fixed is not None:
            dry = fixed
        else:
            strength = float(np.clip(speed / 0.6, 0, 1))
            dry = bank.impact(ba.material, bb.material, strength, rng) if st.random_variation else None
            if dry is not None:
                used_samples += 1
            else:
                ev_rng = rng if st.random_variation else np.random.default_rng(1000 + a * 7 + b)
                wa = float(np.clip((mb / ma) ** 0.25, 0.15, 1.0))
                wb = float(np.clip((ma / mb) ** 0.25, 0.15, 1.0))
                dry = synth.impact(materials.get(ba.material).acoustic, materials.get(bb.material).acoustic,
                                   ba.characteristic_length(), bb.characteristic_length(), wa, wb, speed, ev_rng, sr)
                dry = dry / (np.abs(dry).max() + 1e-12)
        if st.random_variation:
            dry = _resample_pitch(dry, 1 + rng.uniform(-st.pitch_jitter, st.pitch_jitter))
            gain *= 10 ** (rng.uniform(-st.gain_jitter_db, st.gain_jitter_db) / 20)
        pos = np.array([ev["x"], ev["y"], ev["z"]], dtype=float)
        t = float(ev["time"])
        if st.spatial:
            pan, dist = listener.locate(t, pos)
            gain *= st.reference_distance / max(dist, st.reference_distance)
            delay = dist / SOUND_SPEED
            dry = _air_lowpass(dry, dist, sr)
        else:
            pan, delay = 0.0, 0.0
        gl, gr = _pan_gains(pan)
        start = int(round((t + delay) * sr))
        end = min(n_total, start + len(dry))
        if start >= n_total:
            continue
        seg = dry[: end - start] * gain
        impacts[start:end, 0] += seg * gl
        impacts[start:end, 1] += seg * gr
        placements.append((t, t + delay, gain))

    if st.friction and len(rec.contacts):
        _render_friction(scene, rec, listener, st, fric, bank, rng)

    dry_bus = impacts + fric
    wet = _reverb(dry_bus, st, rng) if st.reverb else np.zeros_like(dry_bus)
    mix = dry_bus + wet
    # 超低域（物理的に意味のない成分）をカット
    sos = signal.butter(2, 30, btype="high", fs=sr, output="sos")
    mix = signal.sosfilt(sos, mix, axis=0)
    tone = np.zeros_like(mix)
    meter = pyloudnorm.Meter(sr)
    mix_lufs = meter.integrated_loudness(mix) if np.abs(mix).max() > 0 else -70.0
    if st.room_tone:
        tone = _room_tone(len(mix), sr, rng)
        tone_lufs = meter.integrated_loudness(tone)
        tone *= 10 ** ((mix_lufs + st.room_tone_db - tone_lufs) / 20)
        mix = mix + tone
    # 末尾の無音を詰める（最後の音の残響が消えるまで残す）
    end_sample = int(rec.n_frames / rec.fps * sr)
    mix, impacts, fric, wet, tone = (x[:end_sample] for x in (mix, impacts, fric, wet, tone))
    fade = int(sr * 0.3)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]

    mix, master_report = _master(mix, sr, st)
    scale = master_report["applied_gain"]
    stems = {"impacts": impacts * scale, "friction": fric * scale, "reverb": wet * scale, "room_tone": tone * scale}
    report = {"events": int(len(rec.events)), "events_from_samples": used_samples, **master_report}
    return AudioResult(mix, stems, sr, report, placements)


def _render_friction(scene, rec, listener, st, out, bank, rng) -> None:
    sr = st.sr
    c = rec.contacts
    keys = np.unique(np.stack([c["a"], c["b"]], 1), axis=0)
    spf = sr / rec.fps
    for a, b in keys:
        rows = c[(c["a"] == a) & (c["b"] == b)]
        amp_slide = rows["slide"] * np.sqrt(np.maximum(rows["force"], 0))
        amp_roll = rows["roll"] * np.sqrt(np.maximum(rows["force"], 0))
        if max(amp_slide.max(), amp_roll.max()) < 0.004:
            continue
        frames = rows["frame"]
        f0, f1 = int(frames.min()), int(frames.max()) + 2
        nf = f1 - f0
        env_s = np.zeros(nf)
        env_r = np.zeros(nf)
        env_s[frames - f0] = np.where(rows["slide"] > 0.008, amp_slide, 0)
        env_r[frames - f0] = np.where(rows["roll"] > 0.005, amp_roll, 0)
        n = int(nf * spf)
        tt = np.arange(n) / spf
        es = np.interp(tt, np.arange(nf), env_s)
        er = np.interp(tt, np.arange(nf), env_r)
        if es.max() + er.max() < 1e-6:
            continue
        ma = materials.get(scene.bodies[a].material).acoustic
        mb = materials.get(scene.bodies[b].material).acoustic
        band = (np.sqrt(ma.friction_band[0] * mb.friction_band[0]), np.sqrt(ma.friction_band[1] * mb.friction_band[1]))
        sig = np.zeros(n)
        if es.max() > 0:
            src = bank.loop(scene.bodies[a].material, "slide")
            src = _loop_to(src, n, rng) if src is not None else synth.friction_noise(n, band, rng, sr, grain=1.0)
            sig += src / (np.std(src) + 1e-9) * es * st.slide_gain
        if er.max() > 0:
            roller = a if scene.bodies[a].shape in ("sphere", "cylinder") else b
            src = bank.loop(scene.bodies[roller].material, "roll")
            src = _loop_to(src, n, rng) if src is not None else synth.friction_noise(
                n, (band[0] * 0.25, band[1] * 0.5), rng, sr, grain=0.5)
            sig += src / (np.std(src) + 1e-9) * er * st.roll_gain
        start = int(f0 * spf)
        end = min(len(out), start + n)
        if start >= len(out):
            continue
        sig = sig[: end - start]
        if st.spatial:
            mid = rows[len(rows) // 2]
            pan, dist = listener.locate(mid["frame"] / rec.fps, np.array([mid["x"], mid["y"], mid["z"]]))
            sig = sig * st.reference_distance / max(dist, st.reference_distance)
        else:
            pan = 0.0
        gl, gr = _pan_gains(pan)
        out[start:end, 0] += sig * gl
        out[start:end, 1] += sig * gr


def _loop_to(x: np.ndarray, n: int, rng) -> np.ndarray:
    off = int(rng.integers(0, len(x)))
    reps = int(np.ceil((n + off) / len(x))) + 1
    return np.tile(x, reps)[off: off + n]


def _reverb(x: np.ndarray, st: AudioSettings, rng) -> np.ndarray:
    ir = _load_ir(st.sr)
    if ir is None:
        ir = _synthetic_ir(st.sr, st.reverb_rt60, rng)
    wet = np.stack([signal.fftconvolve(x[:, ch], ir[:, ch])[: len(x)] for ch in range(2)], 1)
    # 直接音とのエネルギー比で量を決める
    gain = 10 ** (st.reverb_wet_db / 20) * np.sqrt(np.sum(x ** 2) / (np.sum(wet ** 2) + 1e-12))
    return wet * gain


def _load_ir(sr: int) -> Optional[np.ndarray]:
    d = ASSETS / "ir"
    files = sorted(f for f in d.glob("*") if f.suffix.lower() in AUDIO_EXT) if d.is_dir() else []
    if not files:
        return None
    data, file_sr = sf.read(str(files[0]), always_2d=True, dtype="float64")
    if data.shape[1] == 1:
        data = np.repeat(data, 2, 1)
    if file_sr != sr:
        from math import gcd
        g = gcd(int(file_sr), sr)
        data = signal.resample_poly(data, sr // g, int(file_sr) // g, axis=0)
    return data[:, :2]


def _synthetic_ir(sr: int, rt60: float, rng) -> np.ndarray:
    """小さな部屋の残響を合成：初期反射（机・壁・天井）＋帯域ごとに減衰の違う後部残響。"""
    n = int(sr * rt60 * 1.6)
    t = np.arange(n) / sr
    ir = np.zeros((n, 2))
    for ch in range(2):
        for delay_ms, g in ((2.5, 0.5), (7, 0.35), (11, 0.3), (16, 0.22), (23, 0.18), (31, 0.12)):
            d = int(sr * delay_ms / 1000 * rng.uniform(0.9, 1.1))
            if d < n:
                ir[d, ch] += g * rng.choice([-1, 1])
        tail = np.zeros(n)
        for lo, hi, k in ((60, 500, 1.15), (500, 3000, 1.0), (3000, 16000, 0.55)):
            noise = synth._bandpass(rng.standard_normal(n), lo, hi, sr)
            tail += noise * np.exp(-6.91 * t / (rt60 * k))
        onset = np.clip((t - 0.012) / 0.02, 0, 1)
        ir[:, ch] += tail * onset * 0.25
    return ir / np.abs(ir).max()


def _room_tone(n: int, sr: int, rng) -> np.ndarray:
    files = sorted(f for f in (ASSETS / "roomtone").glob("*") if f.suffix.lower() in AUDIO_EXT) \
        if (ASSETS / "roomtone").is_dir() else []
    if files:
        x = load_audio(files[0], sr)
        return np.stack([_loop_to(x, n, rng), _loop_to(x, n, rng)], 1)
    # 合成：低域寄りのノイズ（空調・遠くの環境音のような質感）、左右で無相関
    out = np.zeros((n, 2))
    for ch in range(2):
        w = rng.standard_normal(n)
        sos = signal.butter(1, 400, fs=sr, output="sos")
        brown = signal.sosfilt(sos, w)
        hiss = synth._bandpass(w, 2000, 9000, sr) * 0.05
        out[:, ch] = brown / (np.std(brown) + 1e-9) + hiss / (np.std(hiss) + 1e-9) * 0.08
    return out


def _true_peak_env(x: np.ndarray, oversample: int = 4) -> np.ndarray:
    up = signal.resample_poly(x, oversample, 1, axis=0)
    a = np.abs(up).max(axis=1)
    n = len(x)
    a = a[: n * oversample].reshape(n, oversample).max(axis=1)
    return a


def _limiter_gain(x: np.ndarray, sr: int, ceiling: float) -> np.ndarray:
    peak = _true_peak_env(x)
    look = int(sr * 0.0015)
    from scipy.ndimage import maximum_filter1d
    held = maximum_filter1d(peak, size=2 * look + 1)
    g = np.minimum(1.0, ceiling / np.maximum(held, 1e-12))
    # 戻り（リリース）を滑らかにする
    rel = np.exp(-1.0 / (sr * 0.06))
    out = g.copy()
    for i in range(1, len(out)):
        out[i] = min(g[i], rel * out[i - 1] + (1 - rel) * g[i])
    # 掛かり始め（アタック）もなめらかに（先読み分の窓で平均）
    k = np.hanning(2 * look + 1)
    k /= k.sum()
    smoothed = np.convolve(out, k, mode="same")
    return np.minimum(out, smoothed)


def _master(mix: np.ndarray, sr: int, st: AudioSettings) -> tuple[np.ndarray, dict]:
    meter = pyloudnorm.Meter(sr)
    base = meter.integrated_loudness(mix)
    ceiling = 10 ** (st.true_peak_db / 20)
    gain_db = st.target_lufs - base
    for _ in range(6):
        y = mix * 10 ** (gain_db / 20)
        g = _limiter_gain(y, sr, ceiling)
        max_gr = -20 * np.log10(g.min() + 1e-12)
        if max_gr <= st.max_limiting_db + 0.05:
            break
        gain_db -= max_gr - st.max_limiting_db
    y = y * g[:, None]
    final = meter.integrated_loudness(y)
    tp = 20 * np.log10(_true_peak_env(y).max() + 1e-12)
    report = {
        "loudness_lufs": round(float(final), 2),
        "target_lufs": st.target_lufs,
        "true_peak_dbtp": round(float(tp), 2),
        "max_limiting_db": round(float(-20 * np.log10(g.min() + 1e-12)), 2),
        "applied_gain": float(10 ** (gain_db / 20)),
    }
    if final < st.target_lufs - 1.0:
        report["note"] = (f"リミッターを {st.max_limiting_db} dB 以上かけないと目標 {st.target_lufs} LUFS に届かないため、"
                          f"{final:.1f} LUFS で止めました（音の粒立ちを優先）。max_limiting_db を上げれば大きくできます。")
    return y, report
