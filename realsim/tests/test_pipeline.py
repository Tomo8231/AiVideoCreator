"""描画以外の工程（物理・音・チェック）の動作確認。 python -m pytest tests"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from realsim.audio.mixer import AudioSettings, render_audio  # noqa: E402
from realsim.audio.samples import SampleBank  # noqa: E402
from realsim.camera import static_shot  # noqa: E402
from realsim.physics import simulate  # noqa: E402
from realsim.qc import run_checks  # noqa: E402
from realsim.scene import Body, Scene  # noqa: E402

H = 0.3


def ball_drop() -> Scene:
    return Scene("test", [
        Body("table", "box", (1, 1, 0.04), "wood_table", (0, 0, -0.02), static=True),
        Body("ball", "sphere", (0.03, 0, 0), "steel", (0, 0, H)),
    ], duration=1.2)


def test_first_impact_time_matches_free_fall():
    sc = ball_drop()
    rec = simulate(sc, progress=False)
    expected = np.sqrt(2 * (H - 0.015) / sc.gravity)
    assert len(rec.events) > 0
    assert abs(rec.events["time"][0] - expected) < 1 / sc.fps
    assert abs(rec.events["speed"][0] - sc.gravity * expected) < 0.15


def test_audio_is_synced_and_within_limits():
    sc = ball_drop()
    rec = simulate(sc, progress=False)
    cam = static_shot(rec, (0, -0.5, 0.2), (0, 0, 0))
    audio = render_audio(sc, rec, cam, AudioSettings())
    report = run_checks(sc, rec, audio)
    assert report["av_sync"]["checked"] >= 1
    assert report["av_sync"]["ok"]
    assert report["audio"]["true_peak_dbtp"] <= -0.9
    assert np.isfinite(audio.mix).all()


def test_release_time_holds_body():
    sc = ball_drop()
    sc.bodies[1].release_time = 0.5
    rec = simulate(sc, progress=False)
    i = rec.index("ball")
    assert abs(rec.transforms[int(0.4 * sc.fps), i, 2] - H) < 1e-4
    assert rec.events["time"][0] > 0.5


def test_sample_bank_round_robin(tmp_path):
    d = tmp_path / "impacts" / "steel__wood_table"
    d.mkdir(parents=True)
    sr = 48000
    for k in range(4):
        x = np.zeros(sr // 10)
        x[100:] = np.sin(np.arange(len(x) - 100) * 0.1 * (k + 1)) * np.exp(-np.arange(len(x) - 100) / 500)
        sf.write(d / f"hit_{k}.wav", x, sr)
    bank = SampleBank(tmp_path, sr)
    rng = np.random.default_rng(0)
    picks = [id(bank.impact("wood_table", "steel", 0.5, rng)) for _ in range(12)]
    assert all(a != b for a, b in zip(picks, picks[1:])), "同じ素材が連続している"
    # 先頭の無音（100サンプル）が 0.5ms 程度まで詰められていること
    clip = bank.impact("steel", "wood_table", 0.5, rng)
    assert np.nonzero(np.abs(clip) > 1e-6)[0][0] <= int(sr * 0.0006)
