"""物理（MuJoCo）の大事な振る舞いと、自動チェックが問題を見つけられることの確認。 python -m pytest tests"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from realsim.audio.mixer import AudioSettings, render_audio  # noqa: E402
from realsim.camera import static_shot  # noqa: E402
from realsim.physics import physics_warnings, simulate  # noqa: E402
from realsim.qc import run_checks  # noqa: E402
from realsim.scene import Body, Scene  # noqa: E402

TABLE = Body("table", "box", (1, 1, 0.04), "wood_table", (0, 0, -0.02), static=True)


def _bounce_peak(material: str, h: float = 0.2) -> float:
    sc = Scene("b", [TABLE, Body("ball", "sphere", (0.03, 0, 0), material, (0, 0, h))], duration=1.0)
    rec = simulate(sc, progress=False)
    z = rec.transforms[:, 1, 2]
    first = int(np.argmin(z[: int(0.4 * sc.fps)]))   # 1 回目に当たったフレームの近く
    return float(z[first:].max())


def test_bounce_never_exceeds_drop_height_and_keeps_material_order():
    # 接触ばねの時定数を短くしすぎると、落とした高さより高く跳ねた（2026-11-14）
    peaks = {m: _bounce_peak(m) for m in ("rubber", "steel", "wood", "cardboard")}
    assert all(p < 0.2 for p in peaks.values()), peaks
    assert peaks["rubber"] > peaks["steel"] > peaks["wood"] > peaks["cardboard"], peaks


def test_resting_body_stops_making_events():
    sc = Scene("rest", [TABLE, Body("ball", "sphere", (0.03, 0, 0), "steel", (0, 0, 0.1))], duration=3.0)
    rec = simulate(sc, progress=False)
    assert (rec.events["time"] > 2.0).sum() == 0


def test_moving_bodies_collide_with_each_other():
    # 動く物どうし（箱の上に鋼球）。法線の向きや符号を間違えるとドミノの音が全部消える
    sc = Scene("pair", [TABLE, Body("box", "box", (0.08, 0.08, 0.04), "wood", (0, 0, 0.02)),
                        Body("ball", "sphere", (0.03, 0, 0), "steel", (0, 0, 0.2))], duration=0.6)
    rec = simulate(sc, progress=False)
    ev = rec.events[(rec.events["a"] == 1) & (rec.events["b"] == 2)]
    assert len(ev) > 0
    expected = np.sqrt(2 * sc.gravity * (0.2 - 0.04 - 0.015))
    assert abs(ev["speed"][0] - expected) < 0.2


def test_hinge_seesaw_and_pendulum():
    # シーソー：片側に球を落とすと板が軸のまわりだけで傾き、反対側のおもりが持ち上がる
    sc = Scene("seesaw", [TABLE,
                          Body("post", "box", (0.03, 0.06, 0.08), "wood", (0, 0, 0.04), static=True),
                          Body("plank", "box", (0.40, 0.05, 0.01), "wood", (0, 0, 0.09), hinge=((0, 1, 0), (0, 0, 0.09))),
                          Body("weight", "box", (0.04, 0.04, 0.03), "wood", (0.17, 0, 0.11)),
                          Body("ball", "sphere", (0.03, 0, 0), "steel", (-0.17, 0, 0.30))], duration=1.0)
    rec = simulate(sc, progress=False)
    plank = rec.transforms[:, 2, :3]
    assert np.abs(plank - plank[0]).max() < 1e-4          # 軸の位置から動かない
    assert rec.transforms[:, 3, 2].max() > 0.15            # おもりが持ち上がる
    # 振り子：長さ L の棒を端で吊ると、周期は約 2π√(2L/3g)
    L, th = 0.2, np.radians(20)
    rod = Body("rod", "box", (0.01, 0.01, L), "wood", ((L / 2) * np.sin(th), 0, 0.5 - (L / 2) * np.cos(th)),
               rotation=(0, np.sin(th / 2), 0, np.cos(th / 2)), hinge=((0, 1, 0), (0, 0, 0.5)))
    sc = Scene("pend", [rod], duration=3.0)
    x = simulate(sc, progress=False).transforms[:, 0, 0]
    cross = [i for i in range(1, len(x)) if x[i - 1] > 0 >= x[i]]
    period = np.diff(cross).mean() / sc.fps
    assert abs(period - 2 * np.pi * np.sqrt(2 * L / (3 * sc.gravity))) < 0.03


def test_silent_scene_gives_finite_audio_and_is_reported():
    # 衝突 0 件だとラウドネスが -inf → 音声が NaN になっていた
    sc = Scene("still", [TABLE, Body("box", "box", (0.05, 0.05, 0.05), "wood", (0, 0, 0.025))], duration=0.5)
    rec = simulate(sc, progress=False)
    cam = static_shot(rec, (0, -0.5, 0.2), (0, 0, 0))
    for tone in (True, False):
        audio = render_audio(sc, rec, cam, AudioSettings(room_tone=tone))
        assert np.isfinite(audio.mix).all()
        rep = run_checks(sc, rec, audio)
        assert not rep["passed"]


def test_qc_reports_physics_breakdown():
    sc = Scene("x", [TABLE, Body("ball", "sphere", (0.03, 0, 0), "steel", (0, 0, 0.1))], duration=0.5)
    rec = simulate(sc, progress=False)
    rec.stats["max_speed"] = 50.0
    rec.stats["min_contact_distance"] = -0.005
    warns = physics_warnings(rec, sc)
    assert any("最大速度" in w for w in warns) and any("めり込み" in w for w in warns)
