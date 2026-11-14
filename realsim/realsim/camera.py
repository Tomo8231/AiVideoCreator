"""シミュレーション結果からカメラワークを作る汎用関数。"""
from __future__ import annotations

from typing import Optional, Sequence

import numpy as np

from .physics import Recording
from .scene import CameraPath, Scene


def _orbit(target: np.ndarray, distance, elevation_deg, azimuth_deg) -> np.ndarray:
    el = np.radians(elevation_deg)
    az = np.radians(azimuth_deg)
    off = np.stack([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el) * np.ones_like(az)], -1)
    return target + off * np.asarray(distance)[..., None]


def follow_action(rec: Recording, scene: Scene, *, distance: float = 0.4, elevation_deg: float = 25.0,
                  azimuth_deg: float = -60.0, focal_mm: float = 50.0, fstop: float = 2.8,
                  smooth_seconds: float = 0.7, lead_seconds: float = 0.15,
                  bodies: Optional[Sequence[str]] = None, handheld: float = 0.0015,
                  wide_ending_seconds: float = 0.0, wide_distance_factor: float = 3.0,
                  min_speed: float = 0.03) -> CameraPath:
    """動いている物体の重心（速度で重み付け）を追いかけるカメラ。

    何も動いていない時間は直前の注視点を保つ。wide_ending_seconds > 0 なら
    最後にゆっくり引いて全体を映す。
    """
    fps = rec.fps
    idx = [rec.index(n) for n in bodies] if bodies else [i for i, b in enumerate(scene.bodies) if not b.static]
    pos = rec.transforms[:, idx, :3].astype(float)
    vel = np.zeros_like(pos)
    vel[1:] = (pos[1:] - pos[:-1]) * fps
    speed = np.linalg.norm(vel, axis=2)
    lead = int(lead_seconds * fps)
    F = rec.n_frames
    target = np.zeros((F, 3))
    last = pos[0].mean(0)
    for f in range(F):
        g = min(F - 1, f + lead)
        w = np.where(speed[g] > min_speed, speed[g] ** 2, 0.0)
        if w.sum() > 0:
            last = (pos[g] * w[:, None]).sum(0) / w.sum()
        target[f] = last
    camera_pos = _orbit(target, np.full(F, distance), elevation_deg, np.full(F, azimuth_deg))
    path = CameraPath(camera_pos, target, np.full(F, focal_mm), np.full(F, fstop)).smoothed(smooth_seconds, fps)

    if wide_ending_seconds > 0:
        all_pos = rec.transforms[-1, idx, :3]
        center = (all_pos.min(0) + all_pos.max(0)) / 2
        extent = float(np.linalg.norm(all_pos.max(0) - all_pos.min(0)))
        wide_tgt = center
        wide_pos = _orbit(wide_tgt[None], np.array([max(distance * wide_distance_factor, extent * 1.3)]),
                          elevation_deg + 20, np.array([azimuth_deg]))[0]
        n = int(wide_ending_seconds * fps)
        s = F - n
        u = np.clip((np.arange(F) - s) / max(n, 1), 0, 1)
        u = u * u * (3 - 2 * u)
        path.position = path.position * (1 - u[:, None]) + wide_pos * u[:, None]
        path.target = path.target * (1 - u[:, None]) + wide_tgt * u[:, None]
        path.fstop = path.fstop * (1 - u) + max(fstop, 5.6) * u
    return path.with_handheld(handheld, scene.seed, fps)


def static_shot(rec: Recording, position, target, focal_mm=50.0, fstop=4.0, handheld: float = 0.0,
                seed: int = 0) -> CameraPath:
    F = rec.n_frames
    path = CameraPath(np.tile(position, (F, 1)).astype(float), np.tile(target, (F, 1)).astype(float),
                      np.full(F, focal_mm), np.full(F, fstop))
    return path.with_handheld(handheld, seed, rec.fps)
