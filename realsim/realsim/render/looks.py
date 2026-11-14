"""手続き的な PBR マテリアル（Blender シェーダーノード）。

リアルさの要点：
- 完全に均一な表面は作らない（色・粗さに必ずわずかなムラを入れる）
- 物体ごとに模様をずらす（Object Info の Random）。同じ部品が並んでもコピーに見えない
- テクスチャは物体座標に貼る（物体と一緒に動く）

外部テクスチャを使いたい場合は assets/textures/<preset名>/ に
basecolor / roughness / normal 画像を置くと優先して使う（load_texture_set 参照）。
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import bpy

ASSETS = Path(__file__).resolve().parents[2] / "assets"


class G:
    """ノード作成の小さなヘルパー。"""

    def __init__(self, mat: bpy.types.Material):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def n(self, kind: str, **inputs):
        node = self.nt.nodes.new(kind)
        node.location = (self.x, 0)
        self.x += 200
        for k, v in inputs.items():
            if k.startswith("_"):
                setattr(node, k[1:], v)
            else:
                self.set(node.inputs[k], v)
        return node

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        elif isinstance(v, (tuple, list)) and len(v) == 3 and sock.type == "RGBA":
            sock.default_value = (*v, 1.0)
        else:
            sock.default_value = v

    def math(self, op: str, a, b=0.0):
        node = self.nt.nodes.new("ShaderNodeMath")
        node.operation = op
        self.set(node.inputs[0], a)
        self.set(node.inputs[1], b)
        return node.outputs[0]

    def ramp(self, fac, stops: list[tuple[float, tuple]]):
        node = self.nt.nodes.new("ShaderNodeValToRGB")
        self.set(node.inputs["Fac"], fac)
        els = node.color_ramp.elements
        while len(els) > 1:
            els.remove(els[-1])
        els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
        for pos, col in stops[1:]:
            e = els.new(pos)
            e.color = (*col, 1.0)
        return node.outputs["Color"]

    def range(self, v, lo: float, hi: float):
        node = self.nt.nodes.new("ShaderNodeMapRange")
        self.set(node.inputs["Value"], v)
        node.inputs["To Min"].default_value = lo
        node.inputs["To Max"].default_value = hi
        return node.outputs["Result"]

    def noise(self, vec, scale: float, detail: float = 4.0, rough: float = 0.55, distortion: float = 0.0):
        node = self.n("ShaderNodeTexNoise", Vector=vec, Scale=scale, Detail=detail, Roughness=rough,
                      Distortion=distortion)
        return node.outputs["Fac"]

    def output(self, bsdf):
        out = self.n("ShaderNodeOutputMaterial")
        self.nt.links.new(bsdf.outputs[0], out.inputs["Surface"])


def _coords(g: G, scale_xyz=(1.0, 1.0, 1.0)):
    """物体座標 + 物体ごとのランダムなずらし。"""
    tc = g.n("ShaderNodeTexCoord")
    info = g.n("ShaderNodeObjectInfo")
    off = g.n("ShaderNodeVectorMath", _operation="SCALE")
    g.set(off.inputs[0], info.outputs["Random"])
    off.inputs["Scale"].default_value = 137.0
    add = g.n("ShaderNodeVectorMath", _operation="ADD")
    g.set(add.inputs[0], tc.outputs["Object"])
    g.set(add.inputs[1], off.outputs[0])
    mp = g.n("ShaderNodeMapping")
    g.set(mp.inputs["Vector"], add.outputs[0])
    mp.inputs["Scale"].default_value = scale_xyz
    return mp.outputs[0], info.outputs["Random"]


def _tint(c, k):
    return tuple(min(1.0, x * k) for x in c)


def _bump(g: G, height, strength: float, distance: float):
    b = g.n("ShaderNodeBump", Height=height, Strength=strength, Distance=distance)
    return b.outputs["Normal"]


def _hue_jitter(g: G, color, rnd, amount: float):
    """物体ごとに色をわずかに変える（明るさ・彩度）。"""
    hs = g.n("ShaderNodeHueSaturation", Color=color)
    g.set(hs.inputs["Value"], g.range(rnd, 1 - amount, 1 + amount))
    g.set(hs.inputs["Saturation"], g.range(g.math("FRACT", g.math("MULTIPLY", rnd, 7.13)), 1 - amount, 1 + amount))
    return hs.outputs["Color"]


def wood(g: G, color, roughness, ring_scale=60.0, grain_axis="X", coat=0.15, **_):
    """木目は grain_axis 方向に流れる（物体の一番長い辺の方向を渡す）。"""
    stretch = {"X": (1.0, 6.0, 6.0), "Y": (6.0, 1.0, 6.0), "Z": (6.0, 6.0, 1.0)}[grain_axis]
    vec, rnd = _coords(g, stretch)
    rings = g.n("ShaderNodeTexWave", Vector=vec, Scale=ring_scale / 6.0, Distortion=4.0, Detail=6.0,
                **{"Detail Scale": 2.5, "Detail Roughness": 0.6}, _wave_type="RINGS",
                _rings_direction=grain_axis).outputs["Fac"]
    fine = g.noise(vec, ring_scale * 3.0, 10.0, 0.75)
    pores = g.n("ShaderNodeTexNoise", Vector=vec, Scale=ring_scale * 15.0, Detail=2.0).outputs["Fac"]
    mix = g.math("ADD", g.math("MULTIPLY", rings, 0.55), g.math("MULTIPLY", fine, 0.45))
    col = g.ramp(mix, [(0.2, _tint(color, 0.72)), (0.5, color), (0.85, _tint(color, 1.12))])
    col = _hue_jitter(g, col, rnd, 0.1)
    rough = g.range(g.math("ADD", fine, g.math("MULTIPLY", pores, 0.3)), roughness * 0.8, roughness * 1.2)
    height = g.math("ADD", g.math("MULTIPLY", rings, 0.3), g.math("MULTIPLY", pores, 0.7))
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col, "Roughness": rough,
                                               "Normal": _bump(g, height, 0.1, 0.0003),
                                               "Coat Weight": coat, "Coat Roughness": 0.3})
    g.output(bsdf)


def painted(g: G, color, roughness, **_):
    vec, rnd = _coords(g)
    smudge = g.noise(vec, 18.0, 6.0, 0.6)
    peel = g.noise(vec, 900.0, 2.0)
    col = _hue_jitter(g, color, rnd, 0.05)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col,
                                               "Roughness": g.range(smudge, roughness * 0.7, roughness * 1.4),
                                               "Normal": _bump(g, peel, 0.04, 0.0002),
                                               "Coat Weight": 0.35, "Coat Roughness": 0.15})
    g.output(bsdf)


def plastic(g: G, color, roughness, **_):
    vec, rnd = _coords(g)
    smudge = g.noise(vec, 12.0, 6.0, 0.65)
    col = _hue_jitter(g, color, rnd, 0.04)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col,
                                               "Roughness": g.range(smudge, roughness * 0.6, roughness * 1.5),
                                               "Subsurface Weight": 0.08, "Subsurface Scale": 0.003,
                                               "Specular IOR Level": 0.5})
    g.output(bsdf)


def metal(g: G, color, roughness, **_):
    vec, rnd = _coords(g)
    prints = g.ramp(g.noise(vec, 25.0, 8.0, 0.7, 0.4), [(0.45, (0.0,) * 3), (0.7, (1.0,) * 3)])
    scratches = g.noise(vec, 400.0, 2.0)
    rough = g.math("ADD", roughness * 0.8, g.math("MULTIPLY", g.n("ShaderNodeRGBToBW", Color=prints).outputs[0], 0.18))
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": color, "Metallic": 1.0, "Roughness": rough,
                                               "Normal": _bump(g, scratches, 0.03, 0.0001)})
    g.output(bsdf)


def ceramic(g: G, color, roughness, **_):
    vec, rnd = _coords(g)
    wav = g.noise(vec, 6.0, 3.0)
    col = _hue_jitter(g, color, rnd, 0.03)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col, "Roughness": 0.35,
                                               "Subsurface Weight": 0.15, "Subsurface Scale": 0.002,
                                               "Coat Weight": 1.0, "Coat Roughness": roughness,
                                               "Coat Normal": _bump(g, wav, 0.05, 0.001)})
    g.output(bsdf)


def glass(g: G, color, roughness, **_):
    vec, _ = _coords(g)
    smudge = g.noise(vec, 20.0, 6.0, 0.6)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": color, "Transmission Weight": 1.0, "IOR": 1.5,
                                               "Roughness": g.range(smudge, roughness, roughness + 0.06)})
    g.output(bsdf)


def rubber(g: G, color, roughness, **_):
    vec, rnd = _coords(g)
    grain = g.noise(vec, 1500.0, 2.0)
    dust = g.noise(vec, 30.0, 5.0)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": _hue_jitter(g, color, rnd, 0.1),
                                               "Roughness": g.range(dust, roughness * 0.85, roughness * 1.15),
                                               "Normal": _bump(g, grain, 0.15, 0.0002),
                                               "Sheen Weight": 0.15})
    g.output(bsdf)


def concrete(g: G, color, roughness, **_):
    vec, rnd = _coords(g)
    big = g.noise(vec, 3.0, 6.0, 0.6)
    small = g.noise(vec, 250.0, 4.0)
    pits = g.ramp(g.n("ShaderNodeTexVoronoi", Vector=vec, Scale=120.0).outputs["Distance"],
                  [(0.0, (0.0,) * 3), (0.08, (1.0,) * 3)])
    col = g.ramp(g.math("ADD", g.math("MULTIPLY", big, 0.7), g.math("MULTIPLY", small, 0.3)),
                 [(0.3, _tint(color, 0.75)), (0.7, _tint(color, 1.15))])
    height = g.math("MULTIPLY", g.math("ADD", small, g.n("ShaderNodeRGBToBW", Color=pits).outputs[0]), 0.5)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col,
                                               "Roughness": g.range(big, roughness * 0.85, min(1.0, roughness * 1.15)),
                                               "Normal": _bump(g, height, 0.3, 0.001)})
    g.output(bsdf)


def cardboard(g: G, color, roughness, **_):
    vec, rnd = _coords(g)
    fib = g.noise(vec, 300.0, 8.0, 0.7)
    blotch = g.noise(vec, 8.0, 4.0)
    col = g.ramp(g.math("ADD", g.math("MULTIPLY", blotch, 0.6), g.math("MULTIPLY", fib, 0.4)),
                 [(0.3, _tint(color, 0.85)), (0.7, _tint(color, 1.1))])
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col, "Roughness": roughness,
                                               "Normal": _bump(g, fib, 0.2, 0.0003), "Sheen Weight": 0.3})
    g.output(bsdf)


def matte(g: G, color, roughness, **_):
    vec, _ = _coords(g)
    big = g.noise(vec, 1.5, 4.0)
    col = g.ramp(big, [(0.3, _tint(color, 0.9)), (0.7, _tint(color, 1.08))])
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col, "Roughness": roughness})
    g.output(bsdf)


def load_texture_set(g: G, folder: Path) -> bool:
    """assets/textures/<名前>/ に basecolor・roughness・normal 画像があれば使う（三面投影）。"""
    files = {f.stem.lower(): f for f in folder.glob("*") if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".exr", ".tif")}

    def find(*keys) -> Optional[Path]:
        for stem, f in files.items():
            if any(k in stem for k in keys):
                return f
        return None

    base = find("basecolor", "albedo", "diff", "color")
    if base is None:
        return False
    tc = g.n("ShaderNodeTexCoord")

    def img(path: Path, non_color: bool):
        node = g.n("ShaderNodeTexImage", Vector=tc.outputs["Object"], _projection="BOX", _projection_blend=0.2)
        node.image = bpy.data.images.load(str(path), check_existing=True)
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        return node

    inputs = {"Base Color": img(base, False).outputs["Color"]}
    r = find("rough")
    if r:
        inputs["Roughness"] = img(r, True).outputs["Color"]
    nrm = find("normal", "nor_gl", "nrm")
    if nrm:
        nm = g.n("ShaderNodeNormalMap", Color=img(nrm, True).outputs["Color"])
        inputs["Normal"] = nm.outputs["Normal"]
    g.output(g.n("ShaderNodeBsdfPrincipled", **inputs))
    return True


PRESETS = {f.__name__: f for f in (wood, painted, plastic, metal, ceramic, glass, rubber, concrete, cardboard, matte)}


def build_material(name: str, preset: str, color, roughness: float, params: dict) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    g = G(mat)
    tex_dir = ASSETS / "textures" / name
    if tex_dir.is_dir() and load_texture_set(g, tex_dir):
        return mat
    PRESETS[preset](g, tuple(color), roughness, **params)
    return mat
