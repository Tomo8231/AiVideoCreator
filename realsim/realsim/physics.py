"""MuJoCo による剛体シミュレーションと記録（元は PyBullet。2026-11-14 に置き換え）。

出力（Recording）は「毎フレームの全物体の位置・回転」と「衝突イベント」「擦れ・転がりの連続量」。
映像はこの記録を再生するだけで、Blender 側で物理を再計算しない。
これにより、映像と音が同じ物理結果から作られ、原理的にずれない。

小さい物体（ドミノなど数cm）の接触を安定させるため、1ステップを 0.5ms 以下にして計算する。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

from . import materials
from .scene import Scene

EVENT_DTYPE = np.dtype([
    ("time", "f8"), ("a", "i4"), ("b", "i4"),
    ("speed", "f4"),       # 衝突直前の接近速度[m/s]
    ("impulse", "f4"),     # 法線方向の力積[N·s]（目安）
    ("x", "f4"), ("y", "f4"), ("z", "f4"),
])

CONTACT_DTYPE = np.dtype([
    ("frame", "i4"), ("a", "i4"), ("b", "i4"),
    ("slide", "f4"),       # 接触点での相対的な滑り速度[m/s]
    ("roll", "f4"),        # 転がり速度[m/s]（球・円柱のみ）
    ("force", "f4"),       # 法線力[N]
    ("x", "f4"), ("y", "f4"), ("z", "f4"),
])


@dataclass
class Recording:
    names: list[str]
    fps: int
    transforms: np.ndarray      # [F, N, 7]  pos(3) + quat xyzw(4)
    events: np.ndarray          # EVENT_DTYPE
    contacts: np.ndarray        # CONTACT_DTYPE
    stats: dict

    @property
    def n_frames(self) -> int:
        return self.transforms.shape[0]

    def index(self, name: str) -> int:
        return self.names.index(name)

    def save(self, path: Path) -> None:
        np.savez_compressed(
            path, names=np.array(self.names), fps=self.fps, transforms=self.transforms,
            events=self.events, contacts=self.contacts,
            stats=np.array([repr(self.stats)]),
        )

    @staticmethod
    def load(path: Path) -> "Recording":
        d = np.load(path, allow_pickle=False)
        import ast
        return Recording(
            names=[str(s) for s in d["names"]], fps=int(d["fps"]), transforms=d["transforms"],
            events=d["events"], contacts=d["contacts"], stats=ast.literal_eval(str(d["stats"][0])),
        )


def _restitution_to_dampratio(e: float) -> float:
    """反発係数 e を、MuJoCo の接触ばねの減衰比に変換する（減衰振動の半周期で速度が e 倍になる値）。"""
    e = float(np.clip(e, 1e-4, 0.999))
    le = np.log(e)
    return float(-le / np.sqrt(np.pi ** 2 + le ** 2))


def _quat_wxyz(q) -> str:
    x, y, z, w = q
    return f"{w} {x} {y} {z}"


def _to_local(q, v) -> np.ndarray:
    """世界座標のベクトル v を、回転 q（x, y, z, w）の物体の座標系に直す。"""
    x, y, z, w = q
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    return R.T @ np.asarray(v, float)


def _joint_xml(b) -> str:
    """動く物体の関節。ふつうは自由（6自由度）、hinge を指定したらその軸まわりの回転だけ。"""
    if b.hinge is None:
        return "<freejoint/>"
    axis, anchor = b.hinge
    ax = _to_local(b.rotation, axis)
    ax = ax / np.linalg.norm(ax)
    pos = _to_local(b.rotation, np.asarray(anchor, float) - np.asarray(b.position, float))
    return (f'<joint type="hinge" axis="{ax[0]} {ax[1]} {ax[2]}" pos="{pos[0]} {pos[1]} {pos[2]}" '
            f'damping="{b.hinge_damping}"/>')


def build_mjcf(scene: Scene, dt: float) -> str:
    """シーンを MuJoCo の MJCF（XML）にする。1物体＝1ボディ＝1ジオメトリ。"""
    # 接触ばねの時定数。時間刻みの数倍ないと不安定になり、落とした高さより高く跳ね返った（2026-11-14 実測）
    parts = []
    for i, b in enumerate(scene.bodies):
        mat = materials.get(b.material)
        sx, sy, sz = b.size
        if b.shape == "box":
            geom = f'type="box" size="{sx / 2} {sy / 2} {sz / 2}"'
        elif b.shape == "sphere":
            geom = f'type="sphere" size="{sx / 2}"'
        elif b.shape == "cylinder":
            geom = f'type="cylinder" size="{sx / 2} {sz / 2}"'
        else:
            raise ValueError(b.shape)
        # 転がり抵抗は丸い物体だけ。箱に付けると「傾く」回転まで止まる
        roll = mat.rolling_friction if b.shape in ("sphere", "cylinder") else 0.0
        geom += (f' friction="{mat.friction} {roll * 0.5} {roll}" condim="6"'
                 f' solref="{8.0 * dt} {_restitution_to_dampratio(mat.restitution)}" solimp="0.95 0.99 0.0005"')
        pos = " ".join(str(v) for v in b.position)
        if b.static:
            parts.append(f'<geom name="g{i}" pos="{pos}" quat="{_quat_wxyz(b.rotation)}" {geom}/>')
        else:
            mass = b.mass if b.mass is not None else mat.density * b.volume()
            parts.append(f'<body name="b{i}" pos="{pos}" quat="{_quat_wxyz(b.rotation)}">'
                         f'{_joint_xml(b)}<geom name="g{i}" {geom} mass="{mass}"/></body>')
    return (f'<mujoco><option timestep="{dt}" gravity="0 0 {-scene.gravity}" integrator="implicitfast" '
            f'cone="elliptic" impratio="1" iterations="150" noslip_iterations="3"/>'
            f'<worldbody>{"".join(parts)}</worldbody></mujoco>')


def simulate(scene: Scene, substeps: Optional[int] = None, scale: float = 1.0,
             speed_threshold: float = 0.03, refractory: float = 0.012,
             solver_iterations: int = 150, progress: bool = True) -> Recording:
    """MuJoCo で計算する（pybullet は未修正の脆弱性 CVE-2025-8854 があるため使わない。2026-11-14）。

    scale・solver_iterations は旧版（pybullet）との互換のために残している引数で、使わない。
    MuJoCo は2物体の摩擦を「大きい方」、反発（solref）を「平均」で合成する。
    """
    import mujoco

    fps = scene.fps
    # 小さい物（数cmのドミノ）の接触を安定させるため、1ステップは 0.5ms 以下にする
    substeps = max(substeps or scene.substeps, int(np.ceil(1.0 / (fps * 0.0005))))
    dt = 1.0 / (fps * substeps)
    m = mujoco.MjModel.from_xml_string(build_mjcf(scene, dt))
    d = mujoco.MjData(m)

    n = len(scene.bodies)
    dynamic = [not b.static for b in scene.bodies]
    geom_to_idx = {mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_GEOM, f"g{i}"): i for i in range(n)}
    body_id = [mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, f"b{i}") if dynamic[i] else -1 for i in range(n)]
    qadr = [int(m.jnt_qposadr[m.body_jntadr[body_id[i]]]) if dynamic[i] else -1 for i in range(n)]
    vadr = [int(m.jnt_dofadr[m.body_jntadr[body_id[i]]]) if dynamic[i] else -1 for i in range(n)]
    hinged = [dynamic[i] and scene.bodies[i].hinge is not None for i in range(n)]
    nq = [1 if hinged[i] else 7 for i in range(n)]   # 位置の数（回転軸は角度 1 つ、自由な物体は位置 3＋回転 4）
    nv = [1 if hinged[i] else 6 for i in range(n)]
    radius_for_roll = np.array([b.size[0] / 2 if b.shape in ("sphere", "cylinder") else 0.0 for b in scene.bodies])
    dyn = [i for i in range(n) if dynamic[i]]

    def set_velocity(i: int, lin_v, ang_world) -> None:
        if hinged[i]:
            # 回転軸の物体は、軸まわりの角速度だけを使う（並進の速度は持てない）
            axis = np.asarray(scene.bodies[i].hinge[0], float)
            d.qvel[vadr[i]] = float(np.asarray(ang_world, float) @ (axis / np.linalg.norm(axis)))
            return
        # freejoint の角速度は物体の座標系で持つので、世界座標から変換する
        R = d.xmat[body_id[i]].reshape(3, 3)
        d.qvel[vadr[i]:vadr[i] + 3] = lin_v
        d.qvel[vadr[i] + 3:vadr[i] + 6] = R.T @ np.asarray(ang_world, float)

    mujoco.mj_forward(m, d)
    for i, b in enumerate(scene.bodies):
        if dynamic[i] and b.release_time <= 0:
            set_velocity(i, b.linear_velocity, b.angular_velocity)

    F = scene.n_frames
    transforms = np.zeros((F, n, 7), dtype=np.float32)
    events: list[tuple] = []
    contacts: list[tuple] = []
    last_event: dict[tuple[int, int], float] = {}
    max_speed = 0.0
    min_dist = 0.0
    pos = np.zeros((n, 3))
    lin = np.zeros((n, 3))
    ang = np.zeros((n, 3))
    tmp6 = np.zeros(6)
    force6 = np.zeros(6)

    def read_state() -> None:
        for i in dyn:
            pos[i] = d.xpos[body_id[i]]
            mujoco.mj_objectVelocity(m, d, mujoco.mjtObj.mjOBJ_BODY, body_id[i], tmp6, 0)
            ang[i] = tmp6[:3]
            lin[i] = tmp6[3:]

    def point_vel(i, pt, use_lin, use_ang, use_pos):
        if not dynamic[i]:
            return np.zeros(3)
        return use_lin[i] + np.cross(use_ang[i], pt - use_pos[i])

    def record_frame(f: int) -> None:
        for i, b in enumerate(scene.bodies):
            if dynamic[i]:
                transforms[f, i, :3] = d.xpos[body_id[i]]
                w, x, y, z = d.xquat[body_id[i]]
                transforms[f, i, 3:] = (x, y, z, w)
            else:
                transforms[f, i, :3] = b.position
                transforms[f, i, 3:] = b.rotation

    held = [i for i in dyn if scene.bodies[i].release_time > 0]
    init_qpos = d.qpos.copy()

    def hold(t_now: float) -> bool:
        changed = False
        for i in held:
            b = scene.bodies[i]
            if t_now < b.release_time:
                d.qpos[qadr[i]:qadr[i] + nq[i]] = init_qpos[qadr[i]:qadr[i] + nq[i]]
                d.qvel[vadr[i]:vadr[i] + nv[i]] = 0
                changed = True
            elif t_now - b.release_time < dt * 1.5:
                mujoco.mj_forward(m, d)
                set_velocity(i, b.linear_velocity, b.angular_velocity)
                changed = True
        return changed

    if hold(0.0):
        mujoco.mj_forward(m, d)
    read_state()
    record_frame(0)
    report_every = max(1, F // 10)
    for f in range(1, F):
        for s in range(substeps):
            if held and hold(((f - 1) * substeps + s) * dt):
                mujoco.mj_forward(m, d)
                read_state()
            pre_pos, pre_lin, pre_ang = pos.copy(), lin.copy(), ang.copy()
            mujoco.mj_step(m, d)
            read_state()
            t = ((f - 1) * substeps + s + 1) * dt
            last = s == substeps - 1
            pairs: dict[tuple[int, int], list] = {}
            for k in range(d.ncon):
                c = d.contact[k]
                if c.exclude:
                    continue
                a, b = geom_to_idx[int(c.geom1)], geom_to_idx[int(c.geom2)]
                key = (a, b) if a < b else (b, a)
                pairs.setdefault(key, []).append((k, a, b))
            for key, pts in pairs.items():
                best_speed, impulse, best_pt, slide, force = 0.0, 0.0, None, 0.0, 0.0
                for k, a, b in pts:
                    c = d.contact[k]
                    pt = np.array(c.pos)
                    nrm = np.array(c.frame[:3])  # geom1(a) → geom2(b) の向き
                    vrel_pre = point_vel(a, pt, pre_lin, pre_ang, pre_pos) - point_vel(b, pt, pre_lin, pre_ang, pre_pos)
                    approach = float(vrel_pre @ nrm)  # a が b に近づく速さ
                    if approach > best_speed:
                        best_speed, best_pt = approach, pt
                    mujoco.mj_contactForce(m, d, k, force6)
                    fn = abs(float(force6[0]))
                    impulse += fn * dt
                    force += fn
                    min_dist = min(min_dist, float(c.dist))
                    if last:
                        vrel = point_vel(a, pt, lin, ang, pos) - point_vel(b, pt, lin, ang, pos)
                        vt = vrel - (vrel @ nrm) * nrm
                        slide = max(slide, float(np.linalg.norm(vt)))
                if best_pt is not None and best_speed > speed_threshold and t - last_event.get(key, -1.0) > refractory:
                    last_event[key] = t
                    events.append((t, key[0], key[1], best_speed, impulse, *best_pt))
                if last:
                    roll = 0.0
                    for i in key:
                        if dynamic[i] and radius_for_roll[i] > 0:
                            roll = max(roll, float(np.linalg.norm(ang[i])) * radius_for_roll[i])
                    cp = d.contact[pts[0][0]].pos
                    contacts.append((f, key[0], key[1], slide, roll, force, cp[0], cp[1], cp[2]))
        record_frame(f)
        if dyn:
            max_speed = max(max_speed, float(np.linalg.norm(lin[dyn], axis=1).max()))
        if progress and f % report_every == 0:
            print(f"  物理: {f}/{F} フレーム（衝突 {len(events)} 回）", flush=True)

    # MuJoCo は発散すると警告を記録して初期状態に戻し、黙って計算を続ける（autoreset）。ここで拾って隠さない
    mj_warn = {name: int(d.warning[int(w)].number) for name, w in mujoco.mjtWarning.__members__.items()
               if int(w) < len(d.warning) and d.warning[int(w)].number > 0}
    diverged = [k for k in mj_warn if k in ("mjWARN_BADQACC", "mjWARN_BADQPOS", "mjWARN_BADQVEL")]
    if diverged or not np.isfinite(transforms).all():
        raise RuntimeError(f"物理シミュレーションが発散しました（{diverged or 'NaN'}）。substeps を増やすか、"
                           "物体の配置（初めから重なっていないか）を見直してください。")
    stats = {"max_speed": max_speed, "min_contact_distance": min_dist, "mujoco_warnings": mj_warn,
             "n_events": len(events), "substeps": substeps, "scale": 1.0, "engine": f"mujoco {mujoco.__version__}"}
    return Recording(
        names=[b.name for b in scene.bodies], fps=fps, transforms=transforms,
        events=np.array(events, dtype=EVENT_DTYPE), contacts=np.array(contacts, dtype=CONTACT_DTYPE),
        stats=stats,
    )


def physics_warnings(rec: Recording, scene: Scene, max_plausible_speed: Optional[float] = None) -> list[str]:
    """物理エンジン由来の不自然な挙動（貫通・異常な速度）を検出する。"""
    warns = []
    limit = max_plausible_speed or max(5.0, np.sqrt(2 * scene.gravity * 2.0) * 1.5)
    if rec.stats["max_speed"] > limit:
        warns.append(f"物体の最大速度が {rec.stats['max_speed']:.2f} m/s（想定上限 {limit:.1f}）。"
                     "物理の破綻（弾け飛び）の可能性があります。")
    for k, n in rec.stats.get("mujoco_warnings", {}).items():
        warns.append(f"MuJoCo の警告 {k} が {n} 回（接触の取りこぼしなどの可能性）。")
    if rec.stats["min_contact_distance"] < -0.002:
        warns.append(f"めり込みが最大 {-rec.stats['min_contact_distance'] * 1000:.1f} mm。"
                     "substeps を増やすか、物体を大きくしてください。")
    return warns
