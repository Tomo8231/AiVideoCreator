"""例1：机の上のドミノ倒し（最初の1枚を指で押したのと同じ回転を与えて倒す）。

ドミノは実物大（高さ48mm × 幅24mm × 厚さ7.5mm）。
"""
import numpy as np

from realsim.camera import follow_action
from realsim.scene import Body, Environment, Scene, quat_from_euler_z

H, W, T = 0.048, 0.024, 0.0075
SPACING = 0.032
BIG_GAP = 0.55  # 大きいドミノの間隔（前の1枚の高さに対する比）
BIG_GROWTH = 1.3  # 大きいドミノの拡大率（1枚ごと）
MUG_GAP = 0.6  # 最後の1枚とマグの間隔（最後の1枚の高さに対する比）
N_BIG = 3  # 終点の大きいドミノの枚数
WITH_MUG = False  # 最後にマグを置くか。MuJoCo では 4 枚・1.4 倍でもマグ（320g）は倒れなかった（2026-11-14）
COLORS = [(0.8, 0.08, 0.06), (0.95, 0.75, 0.1), (0.05, 0.25, 0.65), (0.92, 0.9, 0.85), (0.08, 0.45, 0.2)]


def path(n_points: int = 4000):
    """S字カーブ。弧長で等間隔に並べ直して返す。"""
    s = np.linspace(0, 1, n_points)
    x = -0.45 + 0.9 * s
    y = 0.16 * np.sin(2 * np.pi * s * 1.25)
    pts = np.stack([x, y], 1)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    arc = np.concatenate([[0], np.cumsum(seg)])
    return pts, arc


def build(n_dominoes: int = 0, duration: float = 0.0) -> Scene:
    pts, arc = path()
    n = n_dominoes or int(arc[-1] / SPACING)
    bodies = [Body("table", "box", (2.0, 1.0, 0.04), "wood_table", (0, 0, -0.02), static=True)]
    rng = np.random.default_rng(3)
    first_dir = None
    for i in range(n):
        d = i * SPACING
        k = np.searchsorted(arc, d)
        k2 = min(k + 5, len(pts) - 1)
        tangent = pts[k2] - pts[max(k - 5, 0)]
        yaw = np.arctan2(tangent[1], tangent[0]) + rng.normal(0, 0.015)  # 手で並べたわずかなズレ
        jitter = rng.normal(0, 0.0004, 2)
        if i == 0:
            first_dir = tangent / np.linalg.norm(tangent)
        mat = "wood" if i % 7 == 3 else "painted_wood"
        color = None if mat == "wood" else COLORS[(i // 6) % len(COLORS)]
        bodies.append(Body(f"domino_{i:03d}", "box", (T, W, H), mat,
                           (pts[k][0] + jitter[0], pts[k][1] + jitter[1], H / 2),
                           quat_from_euler_z(yaw), color=color))
    # きっかけ：最初の1枚を指で軽く押したのと同じ回転を与える
    d0 = bodies[1]
    w = np.cross([0, 0, 1.0], [first_dir[0], first_dir[1], 0]) * 5.0
    d0.angular_velocity = tuple(w)
    # 底の前の辺を支点に回る運動なので、重心にも対応する速度を与える
    r = -np.array([first_dir[0], first_dir[1], 0]) * T / 2 + np.array([0, 0, H / 2])
    d0.linear_velocity = tuple(np.cross(w, r))

    # 終点：BIG_GROWTH 倍ずつ大きくなる木のドミノで勢いを増幅し、最後の1枚が机に倒れる（WITH_MUG なら陶器のマグに当たる）
    end_dir = np.array(pts[-1] - pts[-40])
    end_dir /= np.linalg.norm(end_dir)
    yaw_end = float(np.arctan2(end_dir[1], end_dir[0]))
    prev = np.array(bodies[-1].position[:2])
    prev_h = H
    for k in range(1, N_BIG + 1):
        s_k = BIG_GROWTH ** k
        h, w, t = H * s_k, W * s_k, T * s_k
        prev = prev + end_dir * (prev_h * BIG_GAP + t / 2)
        bodies.append(Body(f"big_{k}", "box", (t, w, h), "wood", (prev[0], prev[1], h / 2),
                           quat_from_euler_z(yaw_end)))
        prev_h = h
    mug_d, mug_h = 0.082, 0.095
    mp = prev + end_dir * (prev_h * MUG_GAP + mug_d / 2)
    if WITH_MUG:
        bodies.append(Body("mug", "cylinder", (mug_d, 0, mug_h), "ceramic", (mp[0], mp[1], mug_h / 2), mass=0.32,  # 中空なので実物の重さを指定
                           color=(0.85, 0.83, 0.78)))
    dur = duration or (0.6 + n * 0.035 + 4.0)
    return Scene(
        name="domino",
        bodies=bodies,
        duration=dur,
        fps=60,
        environment=Environment(background_color=(0.03, 0.028, 0.026)),
        camera_from_recording=lambda rec, sc: follow_action(
            rec, sc, distance=0.38, elevation_deg=35, azimuth_deg=-70, focal_mm=50, fstop=5.6,
            smooth_seconds=0.5, lead_seconds=0.25, wide_ending_seconds=2.0),
    )
