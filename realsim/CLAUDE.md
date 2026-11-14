# realsim で作業するときの決まり

- 新しい動画は `scenes/<名前>.py` を作って `build()` を書く。基盤（`realsim/`）は汎用のまま保つ
- 実寸（m, kg）で書く。中空の物は `mass=` を指定する
- 物理は `physics.py`（MuJoCo）だけで計算する。pybullet は CVE-2025-8854 が未修正のため使わない。Blender 側で物理を再計算しない（映像と音がずれるため）
- 見た目の調整は `--still <秒> --reuse-physics --quality draft` で静止画を出して確認してから全体を描画する
- 音を変えたら `--audio-only --ab` で聴き比べ用を出し、**依頼者に聴いてもらう**。AI は音を聴けないので「良くなった」と報告しない。数値（report.json）とスペクトログラムで確認できたことだけを報告する
- 変更後は `.venv/Scripts/python.exe -m pytest tests` を通す
- 素材を追加したら `assets/CREDITS.md` に出典とライセンスを書く。ライセンス不明の素材は使わない
- 物理の破綻（めり込み・弾け飛び）を手で修正して隠さない。`substeps` を増やすか配置を変える
