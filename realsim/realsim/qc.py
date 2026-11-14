"""自動チェック。数値で確認できることはここで確認する。
音の「自然さ」は数値では判定できないので、人が聴いて判断すること。
"""
from __future__ import annotations

import numpy as np

from .audio.mixer import AudioResult
from .physics import Recording, physics_warnings
from .scene import Scene


def av_sync(res: AudioResult, fps: int) -> dict:
    """孤立した強い衝突について、音の立ち上がり時刻と映像上の衝突時刻のズレを測る。"""
    x = np.abs(res.stems["impacts"]).max(axis=1)
    sr = res.sr
    pl = sorted(res.placements, key=lambda p: p[1])
    times = np.array([p[1] for p in pl])
    if len(pl) == 0:
        return {"checked": 0}
    gains = np.array([p[2] for p in pl])
    strong = gains >= np.percentile(gains, 70)
    offsets = []
    for i, (t_ev, t_place, g) in enumerate(pl):
        if not strong[i]:
            continue
        near = np.abs(times - t_place)
        near[i] = 1e9
        if near.min() < 0.04:
            continue
        a, b = int((t_place - 0.01) * sr), int((t_place + 0.03) * sr)
        if a < 0 or b > len(x):
            continue
        win = x[a:b]
        if win.max() <= 0:
            continue
        onset = a + int(np.argmax(win > 0.3 * win.max()))
        offsets.append(onset / sr - t_ev)
    if not offsets:
        return {"checked": 0}
    offsets = np.array(offsets) * 1000
    frame_ms = 1000 / fps
    return {"checked": int(len(offsets)), "max_offset_ms": round(float(np.abs(offsets).max()), 2),
            "mean_offset_ms": round(float(offsets.mean()), 2), "frame_ms": round(frame_ms, 2),
            "ok": bool(np.abs(offsets).max() <= frame_ms)}


def run_checks(scene: Scene, rec: Recording, audio: AudioResult) -> dict:
    out = {"physics_warnings": physics_warnings(rec, scene), "audio": dict(audio.report)}
    rep = audio.report
    issues = []
    if not np.isfinite(audio.mix).all():
        issues.append("音声に NaN／無限大が入っている")
    if rep["loudness_lufs"] is None:
        issues.append("音がほぼ無音（ラウドネスを測れない）")
    elif abs(rep["loudness_lufs"] - rep["target_lufs"]) > 1.0:
        issues.append(f"ラウドネス {rep['loudness_lufs']} LUFS（目標 {rep['target_lufs']}）")
    if not np.isfinite(rep["true_peak_dbtp"]) or rep["true_peak_dbtp"] > -0.9:
        issues.append(f"トゥルーピーク {rep['true_peak_dbtp']} dBTP（上限 -1.0）")
    if np.abs(audio.mix).max() >= 0.999:
        issues.append("クリッピングあり")
    sync = av_sync(audio, rec.fps)
    out["av_sync"] = sync
    # 測っているのは「音を置いた位置」と「物理の衝突時刻」のズレ（描画した映像そのものは見ていない）
    if not sync.get("checked", 0):
        issues.append("衝突時刻と音のズレを確かめられる衝突が無かった（未確認）")
    elif not sync["ok"]:
        issues.append(f"衝突時刻と音のズレ 最大 {sync['max_offset_ms']} ms（1フレーム {sync['frame_ms']} ms を超過）")
    out["issues"] = issues + out["physics_warnings"]
    out["passed"] = not out["issues"]
    return out
