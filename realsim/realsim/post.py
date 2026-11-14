"""FFmpeg による書き出し（映像＋音声＋テロップ＋レンズの質感）。"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ASSETS = Path(__file__).resolve().parents[1] / "assets"


@dataclass
class Caption:
    start: float
    end: float
    text: str
    size: float = 0.055         # 画面の高さに対する文字の大きさ
    y: float = 0.12             # 画面上端からの位置（高さに対する割合）


@dataclass
class PostSettings:
    grain: float = 3.0          # フィルムグレイン（0で無効）。強すぎると圧縮で汚くなる
    vignette: bool = True       # 周辺減光（レンズの自然な特性）
    crf: int = 16               # 画質（小さいほど高画質・大容量）
    audio_bitrate: str = "320k"


def find_font() -> Optional[Path]:
    d = ASSETS / "fonts"
    if d.is_dir():
        for f in sorted(d.iterdir()):
            if f.suffix.lower() in (".ttf", ".otf", ".ttc"):
                return f
    return None


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")


def encode(frames_dir: Path, first_frame: int, fps: int, audio: Optional[Path], out: Path,
           post: PostSettings = PostSettings(), captions: list[Caption] = ()) -> Path:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg が見つかりません")
    filters = []
    if post.vignette:
        filters.append("vignette=angle=PI/7")
    if post.grain > 0:
        filters.append(f"noise=c0s={post.grain}:c0f=t+u")
    font = find_font()
    if captions:
        if font is None:
            print("  注意: assets/fonts/ にフォントがないためテロップを省略しました（日本語は Noto Sans JP 等を置いてください）")
        else:
            for c in captions:
                filters.append(
                    f"drawtext=fontfile='{font}':text='{_escape(c.text)}':fontcolor=white:"
                    f"fontsize=h*{c.size}:x=(w-text_w)/2:y=h*{c.y}:shadowcolor=black@0.6:shadowx=2:shadowy=2:"
                    f"enable='between(t,{c.start},{c.end})'")
    filters.append("format=yuv420p")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-start_number", str(first_frame),
           "-i", str(frames_dir / "frame_%05d.png")]
    if audio:
        cmd += ["-i", str(audio)]
    cmd += ["-vf", ",".join(filters), "-c:v", "libx264", "-preset", "slow", "-crf", str(post.crf),
            "-profile:v", "high", "-r", str(fps)]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", post.audio_bitrate, "-shortest"]
    cmd += ["-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    return out
