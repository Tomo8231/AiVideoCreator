"""Blender（bpy モジュール）で Recording を再生し、Cycles でレンダリングする。

物理は再計算しない。physics.py が記録した位置・回転をそのままキーフレームにする。
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import bpy  # bpy を先に読み込まないと bmesh 等が使えない
import bmesh
import numpy as np
from bpy_extras import anim_utils
from mathutils import Vector

from .. import materials
from ..physics import Recording
from ..scene import Body, CameraPath, Scene
from . import looks

ASSETS = Path(__file__).resolve().parents[2] / "assets"


@dataclass
class Quality:
    width: int
    height: int
    samples: int
    adaptive_threshold: float
    motion_blur: bool = True
    bounces: int = 8


QUALITIES = {
    "draft": Quality(640, 360, 16, 0.05),
    "preview": Quality(960, 540, 64, 0.03),
    "final": Quality(1920, 1080, 384, 0.01, bounces=12),
    "final4k": Quality(3840, 2160, 384, 0.01, bounces=12),
}


# ---------------------------------------------------------------- アニメーション

def _fcurve(id_block, data_path: str, index: int):
    ad = id_block.animation_data or id_block.animation_data_create()
    if ad.action is None:
        ad.action = bpy.data.actions.new(f"{id_block.name}_action")
    action = ad.action
    if getattr(ad, "action_slot", None) is None:
        slot = action.slots.new(id_type=id_block.id_type, name=id_block.name)
        ad.action_slot = slot
    bag = anim_utils.action_ensure_channelbag_for_slot(action, ad.action_slot)
    return bag.fcurves.new(data_path, index=index)


def _keyframes(id_block, data_path: str, values: np.ndarray, start_frame: int = 1) -> None:
    """values: [F] または [F, C]。全フレームに線形補間のキーを打つ。"""
    if values.ndim == 1:
        values = values[:, None]
    frames = np.arange(start_frame, start_frame + len(values), dtype=np.float32)
    for c in range(values.shape[1]):
        fc = _fcurve(id_block, data_path, c)
        fc.keyframe_points.add(len(frames))
        co = np.empty(2 * len(frames), dtype=np.float32)
        co[0::2] = frames
        co[1::2] = values[:, c]
        fc.keyframe_points.foreach_set("co", co)
        fc.keyframe_points.foreach_set("interpolation", np.full(len(frames), 1, dtype=np.int32))  # LINEAR
        fc.update()


def _continuous_quats(q_xyzw: np.ndarray) -> np.ndarray:
    """クォータニオンの符号反転を除去（補間・モーションブラーが破綻しないように）。"""
    q = q_xyzw.copy()
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    return q[:, [3, 0, 1, 2]]  # Blender は w, x, y, z


# ---------------------------------------------------------------- 形状

_mesh_cache: dict = {}


def _auto_bevel(b: Body) -> float:
    if b.bevel is not None:
        return b.bevel
    return max(0.0004, min(b.size) * 0.06) if b.shape != "sphere" else 0.0


def _mesh_for(b: Body) -> bpy.types.Mesh:
    key = (b.shape, tuple(round(v, 6) for v in b.size))
    if key in _mesh_cache:
        return _mesh_cache[key]
    me = bpy.data.meshes.new(f"{b.shape}_{len(_mesh_cache)}")
    bm = bmesh.new()
    sx, sy, sz = b.size
    if b.shape == "box":
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
    elif b.shape == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=sx / 2)
    elif b.shape == "cylinder":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=sx / 2, radius2=sx / 2, depth=sz)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    _mesh_cache[key] = me
    return me


def _add_body(b: Body, mat: bpy.types.Material) -> bpy.types.Object:
    obj = bpy.data.objects.new(b.name, _mesh_for(b))
    bpy.context.scene.collection.objects.link(obj)
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    obj.material_slots[0].link = "OBJECT"
    obj.material_slots[0].material = mat
    bevel = _auto_bevel(b)
    if b.shape != "sphere" and bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 4
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
        mod.harden_normals = True
    obj.rotation_mode = "QUATERNION"
    obj.location = b.position
    x, y, z, w = b.rotation
    obj.rotation_quaternion = (w, x, y, z)
    obj.hide_render = not b.visible
    return obj


def _materials_for(scene: Scene) -> dict:
    cache = {}
    out = {}
    for b in scene.bodies:
        m = materials.get(b.material)
        color = b.color or m.visual.base_color
        params = dict(m.visual.params)
        if m.visual.preset == "wood" and "grain_axis" not in params:
            # 木目は一番長い辺の方向に流す
            params["grain_axis"] = "XYZ"[int(np.argmax(b.size))] if b.shape == "box" else "Z"
        key = (b.material, tuple(color), tuple(sorted(params.items())))
        if key not in cache:
            cache[key] = looks.build_material(f"{b.material}_{len(cache)}", m.visual.preset, color,
                                              m.visual.roughness, params)
        out[b.name] = cache[key]
    return out


# ---------------------------------------------------------------- 環境・照明

def _scene_bounds(scene: Scene) -> tuple[np.ndarray, float]:
    pts = np.array([b.position for b in scene.bodies if not b.static] or [b.position for b in scene.bodies])
    c = (pts.min(0) + pts.max(0)) / 2
    r = max(float(np.linalg.norm(pts.max(0) - pts.min(0))) / 2, 0.15)
    return c, r


def _area_light(name: str, loc, target, size: float, energy: float, kelvin: float) -> None:
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "RECTANGLE"
    ld.size = size
    ld.size_y = size * 0.7
    ld.energy = energy
    ld.use_temperature = True
    ld.temperature = kelvin
    obj = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(obj)
    obj.visible_camera = False  # ライトの板そのものが画面に写らないようにする（tabletop_drop の上端に写った。2026-11-14）
    obj.location = loc
    d = Vector(target) - Vector(loc)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = d.to_track_quat("-Z", "Y")


def _backdrop(scene: Scene, cam_dir: np.ndarray, center: np.ndarray, r: float) -> None:
    """カメラの反対側に、床から壁へ曲面でつながる背景（ホリゾント）を置く。"""
    statics = [b for b in scene.bodies if b.static]
    floor_z = min((b.position[2] - b.size[2] / 2 for b in statics), default=center[2] - r) - 0.75
    R, L, H, W = 1.2, 8.0, 5.0, 14.0
    dist = max(3.0, 6 * r)
    profile = [(-L, floor_z)]
    for i in range(17):
        a = i / 16 * math.pi / 2
        profile.append((dist - R + R * math.sin(a), floor_z + R - R * math.cos(a)))
    profile.append((dist, floor_z + H))
    me = bpy.data.meshes.new("backdrop")
    bm = bmesh.new()
    rows = []
    for x in (-W / 2, W / 2):
        rows.append([bm.verts.new((x, y, z)) for y, z in profile])
    for i in range(len(profile) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new("backdrop", me)
    bpy.context.scene.collection.objects.link(obj)
    yaw = math.atan2(-cam_dir[1], -cam_dir[0]) - math.pi / 2
    obj.rotation_euler = (0, 0, yaw)
    obj.location = (center[0], center[1], 0)
    bg = scene.environment.background_color
    mat = looks.build_material("backdrop", "matte", tuple(min(1, c * 1.6) for c in bg), 0.9, {})
    obj.data.materials.append(mat)


def _environment(scene: Scene, cam: CameraPath) -> None:
    env = scene.environment
    world = bpy.data.worlds.new("world")
    bpy.context.scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bgn = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(bgn.outputs[0], out.inputs["Surface"])
    center, r = _scene_bounds(scene)
    cam_dir = cam.target[0] - cam.position[0]
    cam_dir = cam_dir / (np.linalg.norm(cam_dir) + 1e-9)

    hdri = (ASSETS / "hdri" / env.hdri) if env.hdri else None
    if hdri is not None and hdri.exists():
        tex = nt.nodes.new("ShaderNodeTexEnvironment")
        tex.image = bpy.data.images.load(str(hdri))
        mapping = nt.nodes.new("ShaderNodeMapping")
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping.inputs["Rotation"].default_value = (0, 0, math.radians(env.hdri_rotation_deg))
        nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs[0], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bgn.inputs["Color"])
        bgn.inputs["Strength"].default_value = env.hdri_strength
        return
    if env.hdri:
        print(f"  注意: HDRI {hdri} が見つからないため、手続き的なスタジオ照明を使います")

    # 手続き的スタジオ照明：大きなソフトボックス（キー）、弱い補助光、輪郭を出す逆光
    bgn.inputs["Color"].default_value = (*env.background_color, 1.0)
    bgn.inputs["Strength"].default_value = 1.0
    side = np.cross(cam_dir, [0, 0, 1.0])
    side /= np.linalg.norm(side) + 1e-9
    d = max(1.2, 5 * r)
    k = env.studio_key_strength * d * d
    key_pos = center - cam_dir * d * 0.5 + side * d * 0.8 + np.array([0, 0, d * 0.9])
    fill_pos = center - cam_dir * d * 0.7 - side * d * 0.9 + np.array([0, 0, d * 0.4])
    rim_pos = center + cam_dir * d * 0.9 - side * d * 0.3 + np.array([0, 0, d * 0.7])
    _area_light("key", key_pos, center, d * 0.9, 26 * k, 5000)
    _area_light("fill", fill_pos, center, d * 1.2, 5 * k, 6200)
    _area_light("rim", rim_pos, center, d * 0.5, 22 * k, 7000)
    if env.backdrop:
        _backdrop(scene, cam_dir, center, r)


# ---------------------------------------------------------------- カメラ

def _camera(cam: CameraPath, frames: int) -> bpy.types.Object:
    cd = bpy.data.cameras.new("camera")
    cd.sensor_width = 36.0
    cd.dof.use_dof = True
    cd.clip_start = 0.01
    obj = bpy.data.objects.new("camera", cd)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.scene.camera = obj
    obj.rotation_mode = "QUATERNION"
    quats = []
    for i in range(frames):
        d = Vector(cam.target[i]) - Vector(cam.position[i])
        q = d.to_track_quat("-Z", "Y")
        quats.append((q.x, q.y, q.z, q.w))
    _keyframes(obj, "location", cam.position[:frames].astype(np.float32))
    _keyframes(obj, "rotation_quaternion", _continuous_quats(np.array(quats, dtype=np.float32)))
    _keyframes(cd, "lens", cam.focal_mm[:frames].astype(np.float32))
    _keyframes(cd, "dof.aperture_fstop", cam.fstop[:frames].astype(np.float32))
    focus = np.linalg.norm(cam.target - cam.position, axis=1)[:frames].astype(np.float32)
    _keyframes(cd, "dof.focus_distance", focus)
    return obj


# ---------------------------------------------------------------- 本体

def setup(scene: Scene, rec: Recording, cam: CameraPath, quality: str, vertical: bool = False,
          frame_range: Optional[tuple[int, int]] = None, exposure: float = 0.0) -> None:
    q = QUALITIES[quality]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mesh_cache.clear()
    sc = bpy.context.scene
    F = rec.n_frames
    sc.render.fps = rec.fps
    sc.frame_start = 1 if frame_range is None else frame_range[0] + 1
    sc.frame_end = F if frame_range is None else frame_range[1]

    mats = _materials_for(scene)
    for i, b in enumerate(scene.bodies):
        obj = _add_body(b, mats[b.name])
        if not b.static:
            tr = rec.transforms[:, i]
            _keyframes(obj, "location", tr[:, :3])
            _keyframes(obj, "rotation_quaternion", _continuous_quats(tr[:, 3:]))
    _camera(cam, F)
    _environment(scene, cam)

    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = (q.height, q.width) if vertical else (q.width, q.height)
    r.resolution_percentage = 100
    r.use_motion_blur = q.motion_blur
    r.motion_blur_shutter = 0.5  # 180度シャッター（映画の標準）
    r.use_persistent_data = True
    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "16"
    r.film_transparent = False
    cy = sc.cycles
    cy.samples = q.samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = q.adaptive_threshold
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.max_bounces = q.bounces
    cy.glossy_bounces = 6
    cy.transmission_bounces = 12
    cy.sample_clamp_indirect = 8.0
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.filter_width = 1.5
    _select_device(cy)
    vs = sc.view_settings
    vs.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            vs.look = look
            break
        except TypeError:
            pass
    vs.exposure = exposure


def _select_device(cy) -> None:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
        except (TypeError, ValueError):
            continue
        gpus = [d for d in prefs.devices if d.type != "CPU"]
        if gpus:
            for d in prefs.devices:
                d.use = d.type != "CPU"
            cy.device = "GPU"
            print(f"  レンダリング: GPU ({kind}: {', '.join(d.name for d in gpus)})")
            return
    cy.device = "CPU"
    import os
    print(f"  レンダリング: CPU（GPU なし、{os.cpu_count()} スレッド）。本番品質は時間がかかります")


def render(out_dir: Path, frames: Optional[list[int]] = None) -> list[Path]:
    """frames は Recording のフレーム番号（0始まり）。None なら全フレーム。"""
    sc = bpy.context.scene
    out_dir.mkdir(parents=True, exist_ok=True)
    if frames is None:
        frames = list(range(sc.frame_start - 1, sc.frame_end))
    paths = []
    t0 = time.time()
    for k, f in enumerate(frames):
        sc.frame_set(f + 1)
        path = out_dir / f"frame_{f:05d}.png"
        sc.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
        el = time.time() - t0
        eta = el / (k + 1) * (len(frames) - k - 1)
        print(f"  描画: {k + 1}/{len(frames)} フレーム（1枚 {el / (k + 1):.1f} 秒、残り約 {eta / 60:.1f} 分）", flush=True)
    return paths


def save_blend(path: Path) -> None:
    """Blender の GUI で開いて確認・手直しできるように .blend を保存する。"""
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
