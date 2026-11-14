"""シーンの記述（物理・映像・音で共有するデータモデル）。

単位はすべて SI（メートル、キログラム、秒）。回転はクォータニオン (x, y, z, w)。
Z 軸が上。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

import numpy as np

Vec3 = tuple[float, float, float]
Quat = tuple[float, float, float, float]  # x, y, z, w


@dataclass
class Body:
    """シーン内の1つの物体。

    shape:
      "box"      size = (幅x, 奥行きy, 高さz)
      "sphere"   size = (直径, -, -)
      "cylinder" size = (直径, -, 高さ)
    """

    name: str
    shape: str
    size: Vec3
    material: str
    position: Vec3
    rotation: Quat = (0.0, 0.0, 0.0, 1.0)
    mass: Optional[float] = None          # None なら材質の密度から計算
    static: bool = False                  # True なら動かない（床・机・壁）
    linear_velocity: Vec3 = (0.0, 0.0, 0.0)
    angular_velocity: Vec3 = (0.0, 0.0, 0.0)
    bevel: Optional[float] = None         # 角の丸め半径[m]。None なら自動
    color: Optional[Vec3] = None          # 材質の色を上書き（塗装・樹脂など）
    visible: bool = True
    release_time: float = 0.0            # この時刻まで空中に固定（手で持っている状態）してから離す

    def volume(self) -> float:
        sx, sy, sz = self.size
        if self.shape == "box":
            return sx * sy * sz
        if self.shape == "sphere":
            return 4.0 / 3.0 * np.pi * (sx / 2) ** 3
        if self.shape == "cylinder":
            return np.pi * (sx / 2) ** 2 * sz
        raise ValueError(f"unknown shape: {self.shape}")

    def characteristic_length(self) -> float:
        """音の高さ（固有振動数）の計算に使う代表長さ。"""
        sx, sy, sz = self.size
        if self.shape == "box":
            return max(sx, sy, sz)
        if self.shape == "sphere":
            return sx
        return max(sx, sz)


@dataclass
class CameraKey:
    """カメラのキーフレーム。target はカメラが向く点（ピントもここに合う）。"""

    time: float
    position: Vec3
    target: Vec3
    focal_mm: float = 50.0
    fstop: float = 2.8


@dataclass
class CameraPath:
    """フレームごとに解決済みのカメラ軌道。映像と音（聴取位置）の両方が使う。"""

    position: np.ndarray   # [F, 3]
    target: np.ndarray     # [F, 3]
    focal_mm: np.ndarray   # [F]
    fstop: np.ndarray      # [F]

    @staticmethod
    def from_keys(keys: Sequence[CameraKey], fps: int, n_frames: int) -> "CameraPath":
        keys = sorted(keys, key=lambda k: k.time)
        t = np.arange(n_frames) / fps
        kt = np.array([k.time for k in keys])

        def interp(values: np.ndarray) -> np.ndarray:
            return _smooth_interp(t, kt, values)

        pos = interp(np.array([k.position for k in keys], dtype=float))
        tgt = interp(np.array([k.target for k in keys], dtype=float))
        foc = interp(np.array([[k.focal_mm] for k in keys], dtype=float))[:, 0]
        fst = interp(np.array([[k.fstop] for k in keys], dtype=float))[:, 0]
        return CameraPath(pos, tgt, foc, fst)

    def smoothed(self, seconds: float, fps: int) -> "CameraPath":
        """手持ちでも三脚でもない「カメラマンが追っている」感じを出すための平滑化。"""
        n = max(1, int(seconds * fps))
        k = np.hanning(2 * n + 1)
        k /= k.sum()

        def sm(a: np.ndarray) -> np.ndarray:
            pad = np.pad(a, [(n, n)] + [(0, 0)] * (a.ndim - 1), mode="edge")
            if a.ndim == 1:
                return np.convolve(pad, k, mode="valid")
            return np.stack([np.convolve(pad[:, i], k, mode="valid") for i in range(a.shape[1])], 1)

        return CameraPath(sm(self.position), sm(self.target), sm(self.focal_mm), sm(self.fstop))

    def with_handheld(self, amount: float, seed: int, fps: int) -> "CameraPath":
        """ごく小さな手ブレを加える。amount はメートル単位の揺れ幅（0.002 程度が目安）。"""
        if amount <= 0:
            return self
        rng = np.random.default_rng(seed)
        n = len(self.position)
        shake = np.zeros((n, 3))
        for freq, amp in ((0.3, 1.0), (1.1, 0.4), (3.0, 0.12)):
            phase = rng.uniform(0, 2 * np.pi, 3)
            tt = np.arange(n) / fps
            shake += amp * np.sin(2 * np.pi * freq * tt[:, None] * rng.uniform(0.8, 1.2, 3) + phase)
        shake *= amount
        return CameraPath(self.position + shake, self.target + shake * 0.3, self.focal_mm, self.fstop)


def _smooth_interp(t: np.ndarray, kt: np.ndarray, kv: np.ndarray) -> np.ndarray:
    """キー間を smoothstep で補間（キーで一瞬止まる、加減速のある動き）。"""
    if len(kt) == 1:
        return np.repeat(kv[:1], len(t), axis=0)
    out = np.empty((len(t), kv.shape[1]))
    idx = np.clip(np.searchsorted(kt, t, side="right") - 1, 0, len(kt) - 2)
    t0, t1 = kt[idx], kt[idx + 1]
    u = np.clip((t - t0) / np.maximum(t1 - t0, 1e-9), 0, 1)
    u = u * u * (3 - 2 * u)
    out[:] = kv[idx] * (1 - u)[:, None] + kv[idx + 1] * u[:, None]
    return out


@dataclass
class Environment:
    """照明と背景。hdri を指定しない場合は手続き的なスタジオ照明を使う。"""

    hdri: Optional[str] = None            # assets/hdri/ 内のファイル名
    hdri_strength: float = 1.0
    hdri_rotation_deg: float = 0.0
    studio_key_strength: float = 1.0      # 手続き的照明の明るさ倍率
    background_color: Vec3 = (0.035, 0.032, 0.03)
    backdrop: bool = True                 # 奥に壁（ホリゾント）を置く


@dataclass
class Scene:
    name: str
    bodies: list[Body]
    duration: float
    fps: int = 60
    gravity: float = 9.81
    environment: Environment = field(default_factory=Environment)
    camera_keys: list[CameraKey] = field(default_factory=list)
    # 物理シミュレーションの結果からカメラ軌道を作りたい場合（被写体を追う等）に指定
    camera_from_recording: Optional[Callable[["object", "Scene"], CameraPath]] = None
    seed: int = 0
    substeps: int = 8                     # 1フレームあたりの物理計算回数。速い物・小さい物が多いなら増やす

    @property
    def n_frames(self) -> int:
        return int(round(self.duration * self.fps))

    def body(self, name: str) -> Body:
        for b in self.bodies:
            if b.name == name:
                return b
        raise KeyError(name)


def quat_from_euler_z(yaw: float) -> Quat:
    return (0.0, 0.0, float(np.sin(yaw / 2)), float(np.cos(yaw / 2)))


def quat_from_axis_angle(axis: Vec3, angle: float) -> Quat:
    a = np.asarray(axis, float)
    a /= np.linalg.norm(a)
    s = np.sin(angle / 2)
    return (float(a[0] * s), float(a[1] * s), float(a[2] * s), float(np.cos(angle / 2)))


def quat_mul(q1: Quat, q2: Quat) -> Quat:
    x1, y1, z1, w1 = q1
    x2, y2, z2, w2 = q2
    return (
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    )
