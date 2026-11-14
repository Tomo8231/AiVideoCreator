"""例2：いろいろな材質の物を机に落とす（材質ごとの見た目と音の確認用）。

鋼球・真鍮球・ゴム球・ガラス玉・木のブロック・陶器・段ボール箱を順番に落とす。
固定カメラ（わずかな手ブレあり）。
"""
import numpy as np

from realsim.camera import static_shot
from realsim.scene import Body, Environment, Scene, quat_from_axis_angle

ITEMS = [
    # 名前, 形, 大きさ, 材質, 色
    ("steel_ball", "sphere", (0.03, 0, 0), "steel", None),
    ("wood_block", "box", (0.06, 0.04, 0.03), "wood", None),
    ("rubber_ball", "sphere", (0.045, 0, 0), "rubber", (0.7, 0.12, 0.1)),
    ("ceramic_cup", "cylinder", (0.075, 0, 0.09), "ceramic", (0.2, 0.32, 0.45)),
    ("glass_marble", "sphere", (0.025, 0, 0), "glass", None),
    ("brass_ball", "sphere", (0.028, 0, 0), "brass", None),
    ("cardboard_box", "box", (0.12, 0.09, 0.07), "cardboard", None),
    ("plastic_block", "box", (0.05, 0.05, 0.05), "plastic", (0.95, 0.8, 0.1)),
]
MASS = {"ceramic_cup": 0.3, "cardboard_box": 0.08}  # 中空の物は実物の重さ


def build() -> Scene:
    rng = np.random.default_rng(7)
    bodies = [Body("table", "box", (1.2, 0.8, 0.04), "wood_table", (0, 0, -0.02), static=True)]
    for i, (name, shape, size, mat, color) in enumerate(ITEMS):
        angle = i / len(ITEMS) * 2 * np.pi
        r = 0.08 + 0.05 * (i % 3)
        x, y = r * np.cos(angle) * 1.3, r * np.sin(angle)
        z = 0.37 + 0.03 * (i % 2)  # 離す前の物が画面に入らない高さ（0.22 だと段ボール箱が上端に写った。2026-11-14）
        rot = quat_from_axis_angle(rng.normal(size=3), rng.uniform(0, 0.8))
        bodies.append(Body(name, shape, size, mat, (x, y, z), rot, mass=MASS.get(name), color=color,
                           angular_velocity=tuple(rng.normal(0, 3, 3)),
                           release_time=0.3 + 0.45 * i))  # 0.45秒おきに1つずつ手を離す
    return Scene(
        name="tabletop_drop",
        bodies=bodies,
        duration=0.3 + 0.45 * len(ITEMS) + 1.5,
        substeps=68,  # 0.25ms 刻み。34 だと鋼球が机に最大 2.0mm めり込んだ（2026-11-14）
        fps=60,
        environment=Environment(background_color=(0.04, 0.04, 0.042)),
        camera_from_recording=lambda rec, sc: static_shot(
            rec, position=(0.05, -0.62, 0.3), target=(0.0, 0.0, 0.03), focal_mm=50, fstop=4.0,
            handheld=0.0012, seed=sc.seed),
    )
