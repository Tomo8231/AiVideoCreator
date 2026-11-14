#!/usr/bin/env python3
"""リアル3D動画パイプラインの実行スクリプト。

  python run.py scenes/domino.py                       # 下書き品質で全工程
  python run.py scenes/domino.py --quality final       # 本番品質
  python run.py scenes/domino.py --still 1.0 2.5       # 指定秒の静止画だけ（見た目の調整用）
  python run.py scenes/domino.py --audio-only --ab     # 音だけ。聴き比べ用の3種類も書き出す
  python run.py scenes/domino.py --vertical            # 縦動画（ショート向け）
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from dataclasses import replace
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from realsim.audio.mixer import AudioSettings, render_audio  # noqa: E402
from realsim.physics import Recording, simulate  # noqa: E402
from realsim.post import PostSettings, encode  # noqa: E402
from realsim.qc import run_checks  # noqa: E402
from realsim.scene import CameraPath  # noqa: E402


def load_scene_module(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scene", type=Path)
    ap.add_argument("--quality", default="draft", choices=["draft", "preview", "final", "final4k"])
    ap.add_argument("--vertical", action="store_true", help="縦長（9:16）で描画")
    ap.add_argument("--still", type=float, nargs="*", help="指定した秒の静止画だけ描画")
    ap.add_argument("--range", type=float, nargs=2, metavar=("START", "END"), help="描画する時間範囲[秒]")
    ap.add_argument("--audio-only", action="store_true")
    ap.add_argument("--ab", action="store_true", help="聴き比べ用の音声 (a)(b)(c) を書き出す")
    ap.add_argument("--reuse-physics", action="store_true", help="前回の物理シミュレーション結果を再利用")
    ap.add_argument("--save-blend", action="store_true", help="Blender で開ける .blend を保存")
    ap.add_argument("--exposure", type=float, default=0.0, help="露出補正（段）")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    mod = load_scene_module(args.scene)
    scene = mod.build()
    out = args.out or ROOT / "out" / scene.name
    out.mkdir(parents=True, exist_ok=True)
    t_start = time.time()
    timings = {}

    # 1. 物理
    rec_path = out / "recording.npz"
    t0 = time.time()
    if args.reuse_physics and rec_path.exists():
        rec = Recording.load(rec_path)
        # シーンを変えたあとに古い結果を使うと、別の物体の動きが貼られる。合わなければ止める
        if rec.names != [b.name for b in scene.bodies] or rec.fps != scene.fps or rec.n_frames != scene.n_frames:
            raise SystemExit("前回の物理結果が今のシーンと合いません（物体・fps・長さ）。--reuse-physics を外して計算し直してください")
        print(f"[1/5] 物理: 前回の結果を再利用 ({rec_path})")
    else:
        print(f"[1/5] 物理シミュレーション: 物体 {len(scene.bodies)} 個、{scene.duration:.1f} 秒")
        rec = simulate(scene)
        rec.save(rec_path)
    timings["physics_s"] = round(time.time() - t0, 1)

    # 2. カメラ
    if scene.camera_from_recording:
        cam = scene.camera_from_recording(rec, scene)
    elif scene.camera_keys:
        cam = CameraPath.from_keys(scene.camera_keys, scene.fps, rec.n_frames)
    else:
        raise SystemExit("シーンにカメラが指定されていません（camera_keys か camera_from_recording）")

    # 3. 音
    t0 = time.time()
    print("[2/5] 音の生成")
    st = getattr(mod, "AUDIO", AudioSettings())
    audio = render_audio(scene, rec, cam, st)
    audio_path = out / "audio.wav"
    audio.write(audio_path, out / "stems")
    if args.ab:
        variants = {
            "a_same_sound": replace(st, material_variation=False, random_variation=False, spatial=False,
                                    friction=False, reverb=False, room_tone=False),
            "b_materials_variation": replace(st, spatial=False, reverb=False, room_tone=False),
            "c_full": st,
        }
        for name, s in variants.items():
            render_audio(scene, rec, cam, s).write(out / f"ab_{name}.wav")
        print(f"  聴き比べ用: {out}/ab_*.wav")
    timings["audio_s"] = round(time.time() - t0, 1)

    # 4. チェック
    print("[3/5] 自動チェック")
    report = run_checks(scene, rec, audio)
    for issue in report["issues"]:
        print(f"  要確認: {issue}")
    if audio.report.get("note"):
        print(f"  メモ: {audio.report['note']}")
    print(f"  映像と音のズレ: {report['av_sync']}")

    if args.audio_only:
        _write_report(out, report, timings, t_start)
        return

    # 5. 映像
    from realsim.render import blender_render as br  # bpy の読み込みは重いのでここで

    t0 = time.time()
    frame_range = None
    if args.range:
        frame_range = (int(args.range[0] * scene.fps), min(rec.n_frames, int(args.range[1] * scene.fps)))
    print(f"[4/5] 描画 ({args.quality})")
    br.setup(scene, rec, cam, args.quality, vertical=args.vertical, frame_range=frame_range, exposure=args.exposure)
    if args.save_blend:
        br.save_blend(out / f"{scene.name}.blend")
    frames_dir = out / f"frames_{args.quality}{'_v' if args.vertical else ''}"
    if args.still:
        if any(t < 0 or t > scene.duration for t in args.still):
            raise SystemExit(f"--still の秒数は 0〜{scene.duration} の範囲で指定してください")
        frames = [min(rec.n_frames - 1, int(t * scene.fps)) for t in args.still]
        paths = br.render(out / "stills", frames)
        print("  静止画:", *paths, sep="\n    ")
        timings["render_s"] = round(time.time() - t0, 1)
        _write_report(out, report, timings, t_start)
        return
    br.render(frames_dir)
    timings["render_s"] = round(time.time() - t0, 1)

    print("[5/5] 書き出し")
    first = frame_range[0] if frame_range else 0
    clip_audio = audio_path
    if frame_range:
        a, b = (int(f / scene.fps * audio.sr) for f in frame_range)
        clip_audio = out / "audio_range.wav"
        sf.write(clip_audio, audio.mix[a:b], audio.sr, subtype="PCM_24")
    captions = getattr(mod, "CAPTIONS", [])
    video = out / f"{scene.name}_{args.quality}{'_vertical' if args.vertical else ''}.mp4"
    encode(frames_dir, first, scene.fps, clip_audio, video, getattr(mod, "POST", PostSettings()), captions)
    n = len(report["issues"])
    print(f"  完成: {video}" + (f"（要確認 {n} 件。report.json の issues を見てください）" if n else ""))
    _write_report(out, report, timings, t_start)


def _write_report(out: Path, report: dict, timings: dict, t_start: float) -> None:
    timings["total_s"] = round(time.time() - t_start, 1)
    report["timings"] = timings
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, default=_json_default),
                                     encoding="utf-8")
    print(f"  所要時間: {timings}")


def _json_default(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.bool_):
        return bool(o)
    return str(o)


if __name__ == "__main__":
    main()
