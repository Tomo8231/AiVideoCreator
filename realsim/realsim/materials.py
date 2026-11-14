"""材質の定義。1つの材質が「物理」「見た目」「音」の3つの性質をまとめて持つ。

新しい材質を足すときは MATERIALS に1行追加する。数値は実測値ではなく、
文献値の目安と聴感・見た目で調整した値。必要なら実物に合わせて調整すること。
"""
from __future__ import annotations

from dataclasses import dataclass, field

# 固有振動の周波数比（自由端の棒、板、殻、球）
MODE_RATIOS = {
    "bar": [1.0, 2.756, 5.404, 8.933, 13.34, 19.9],
    "plate": [1.0, 1.59, 2.14, 2.30, 2.65, 2.92, 3.16, 3.50, 4.15, 4.62, 5.2, 5.9],
    "shell": [1.0, 2.32, 4.25, 6.63, 9.38, 12.6],
    "sphere": [1.0, 1.37, 2.05, 2.69, 3.4],
    "thud": [1.0, 1.47, 2.09, 2.56, 3.2, 3.9, 4.4, 5.3],
}


@dataclass(frozen=True)
class Acoustic:
    """衝突音のモーダル合成パラメータ（録音素材がない場合に使う）。"""

    freq_k: float            # 基本周波数[Hz] = freq_k / 代表長さ[m]
    modes: str               # MODE_RATIOS のキー
    t60: float               # 基本モードの残響時間[秒]（音量が60dB下がるまで）
    hf_damping: float        # 高いモードほど早く減衰する度合い（0〜2程度）
    click_level: float       # 接触の瞬間の「カチッ」というノイズ成分の大きさ
    click_bright: float      # そのノイズの明るさ（中心周波数[Hz]）
    contact_ms: float        # 接触時間の目安[ms]（硬いほど短い→高域が出る）
    friction_band: tuple[float, float]  # 擦れ音の帯域[Hz]
    loudness: float = 1.0    # 材質ごとの音量の補正
    freq_min: float = 60.0
    freq_max: float = 16000.0


@dataclass(frozen=True)
class Visual:
    """見た目のプリセット。preset は render/looks.py のシェーダー関数名に対応。"""

    preset: str
    base_color: tuple[float, float, float] = (0.8, 0.8, 0.8)
    roughness: float = 0.5
    params: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Material:
    name: str
    density: float           # kg/m^3
    friction: float
    restitution: float
    rolling_friction: float
    acoustic: Acoustic
    visual: Visual


def _m(name, density, friction, restitution, rolling, acoustic, visual) -> Material:
    return Material(name, density, friction, restitution, rolling, acoustic, visual)


MATERIALS: dict[str, Material] = {
    m.name: m
    for m in [
        _m("wood", 700, 0.45, 0.35, 0.002,
           Acoustic(150, "bar", 0.045, 1.2, 0.55, 3500, 0.35, (800, 5000)),
           Visual("wood", (0.55, 0.36, 0.2), 0.45, {"ring_scale": 60.0})),
        _m("wood_table", 650, 0.5, 0.3, 0.003,
           Acoustic(140, "plate", 0.09, 1.0, 0.4, 1800, 0.6, (300, 3000), loudness=0.8, freq_min=90),
           Visual("wood", (0.3, 0.17, 0.09), 0.5, {"ring_scale": 14.0, "coat": 0.04})),
        _m("painted_wood", 700, 0.4, 0.35, 0.002,
           Acoustic(150, "bar", 0.04, 1.2, 0.6, 3800, 0.3, (900, 5500)),
           Visual("painted", (0.75, 0.1, 0.08), 0.3)),
        _m("plastic", 1050, 0.35, 0.45, 0.002,
           Acoustic(190, "bar", 0.03, 1.4, 0.7, 5000, 0.25, (1200, 7000)),
           Visual("plastic", (0.9, 0.9, 0.88), 0.25)),
        _m("steel", 7850, 0.3, 0.55, 0.0005,
           Acoustic(260, "sphere", 0.9, 0.6, 0.5, 6500, 0.12, (2000, 9000), loudness=0.7, freq_max=14000),
           Visual("metal", (0.78, 0.78, 0.8), 0.12)),
        _m("brass", 8500, 0.3, 0.5, 0.0006,
           Acoustic(210, "sphere", 0.7, 0.6, 0.45, 5500, 0.13, (1800, 8000), loudness=0.7),
           Visual("metal", (0.92, 0.72, 0.38), 0.18)),
        _m("ceramic", 2400, 0.4, 0.3, 0.002,
           Acoustic(220, "shell", 0.35, 0.9, 0.6, 5500, 0.18, (1500, 8000)),
           Visual("ceramic", (0.92, 0.9, 0.86), 0.12)),
        _m("glass", 2500, 0.3, 0.4, 0.001,
           Acoustic(270, "shell", 0.6, 0.8, 0.55, 7000, 0.12, (2000, 10000), loudness=0.8),
           Visual("glass", (0.95, 0.97, 0.96), 0.02)),
        _m("rubber", 1100, 0.9, 0.7, 0.01,
           Acoustic(55, "thud", 0.02, 1.5, 0.25, 700, 2.0, (200, 1200), loudness=0.5),
           Visual("rubber", (0.06, 0.06, 0.065), 0.65)),
        _m("concrete", 2300, 0.6, 0.2, 0.004,
           Acoustic(90, "thud", 0.03, 1.5, 0.7, 2500, 0.4, (400, 4000), loudness=0.8, freq_min=80),
           Visual("concrete", (0.5, 0.49, 0.47), 0.8)),
        _m("cardboard", 250, 0.5, 0.15, 0.006,
           Acoustic(45, "plate", 0.02, 1.5, 0.6, 1500, 0.8, (300, 3000), loudness=0.6),
           Visual("cardboard", (0.6, 0.45, 0.3), 0.85)),
    ]
}


def get(name: str) -> Material:
    try:
        return MATERIALS[name]
    except KeyError:
        raise KeyError(f"未定義の材質: {name}（materials.py の MATERIALS に追加してください）") from None
