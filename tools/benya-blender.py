# Беня (Benya) the lamb, built from primitives to match the app's flat mascot. Run: blender -b --factory-startup --python benya.py -- OUTDIR [samples]
import bpy, math, sys, os, random
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/benya'
SAMPLES = int(argv[1]) if len(argv) > 1 else 96
os.makedirs(OUT, exist_ok=True)
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def mat(name, rgb, rough=0.6, sss=0.0, sheen=0.0, coat=0.0, emit=None, bump=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (0.35, 0.25, 0.2)
        b.inputs['Subsurface Scale'].default_value = 0.08
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
        b.inputs['Sheen Tint'].default_value = (1, 0.97, 0.94, 1)
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.05
    if bump:
        tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = bump[0]; tex.inputs['Detail'].default_value = 8
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump[1]; bp.inputs['Distance'].default_value = 0.02
        nt.links.new(tex.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def hexrgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


WOOL = mat('wool', (0.95, 0.94, 0.96), rough=0.9, sss=0.2, sheen=0.8, bump=(55, 0.5))
FACE = mat('face', hexrgb('#FFD3BD'), rough=0.5, sss=0.3)
EAR = mat('ear', hexrgb('#F2B8A2'), rough=0.6, sss=0.3)
LEG = mat('leg', hexrgb('#4A3A52'), rough=0.45)
EYE = mat('eye', hexrgb('#2E2236'), rough=0.15, coat=1.0)
HI = mat('hi', (1, 1, 1), rough=0.2, emit=None)
CHEEK = mat('cheek', hexrgb('#FF7F98'), rough=0.6, sss=0.15)
MOUTH = mat('mouth', hexrgb('#8A3448'), rough=0.4)

parts = []


def ball(loc, r, m, scale=(1, 1, 1), rot=(0, 0, 0), seg=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.object; o.scale = scale; o.rotation_euler = Euler([math.radians(a) for a in rot])
    bpy.ops.object.shade_smooth(); o.data.materials.append(m); parts.append(o); return o


# ---- body: an ellipsoid core with wool curls over it (the flat logo is a cloud of circles)
BC, BR = Vector((0, 0.1, 0.5)), Vector((0.6, 0.48, 0.36))
ball(BC, 1, WOOL, scale=tuple(BR * 0.96))
N = 78
for i in range(N):
    k = i + 0.5; phi = math.acos(1 - 2 * k / N); th = math.pi * (1 + 5 ** 0.5) * k
    d = Vector((math.cos(th) * math.sin(phi), math.sin(th) * math.sin(phi), math.cos(phi)))
    if d.z < -0.55: continue
    p = BC + Vector((d.x * BR.x, d.y * BR.y, d.z * BR.z)) * 0.93
    r = random.uniform(0.12, 0.21) * (0.8 if d.z < 0 else 1)
    ball(p, r, WOOL, seg=32)

# ---- legs
for x, y, h in [(-0.25, -0.1, 0.26), (0.25, -0.1, 0.26), (-0.22, 0.32, 0.25), (0.22, 0.32, 0.25)]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=h, location=(x, y, h / 2 + 0.02), vertices=40)
    o = bpy.context.object; bpy.ops.object.shade_smooth(); o.data.materials.append(LEG); parts.append(o)
    ball((x, y, 0.07), 0.078, LEG, scale=(1, 1, 0.75))

# ---- head
HC, HR = Vector((0, -0.32, 0.93)), Vector((0.31, 0.26, 0.28))
ball(HC, 1, FACE, scale=tuple(HR))
for p, r in [((-0.15, -0.3, 1.16), 0.115), ((0.0, -0.28, 1.21), 0.13), ((0.15, -0.3, 1.16), 0.11), ((-0.07, -0.18, 1.2), 0.11), ((0.09, -0.17, 1.19), 0.105)]:
    ball(p, r, WOOL, seg=40)
for s in (-1, 1):
    ball((s * 0.34, -0.24, 1.0), 1, EAR, scale=(0.17, 0.06, 0.08), rot=(0, s * -24, s * 14))


def on_head(x, z, inset=0.0):
    t = 1 - ((x - HC.x) / HR.x) ** 2 - ((z - HC.z) / HR.z) ** 2
    return HC.y - HR.y * math.sqrt(max(t, 0)) + inset


for s in (-1, 1):
    ex, ez = s * 0.115, 0.95
    ball((ex, on_head(ex, ez, 0.022), ez), 1, EYE, scale=(0.056, 0.034, 0.074), rot=(0, 0, s * -8))
    ball((ex + 0.017, on_head(ex, ez, 0.0) - 0.016, ez + 0.03), 0.019, HI, seg=24)
    cx, cz = s * 0.195, 0.85
    ball((cx, on_head(cx, cz, 0.012), cz), 1, CHEEK, scale=(0.062, 0.016, 0.046), rot=(0, 0, s * -34))

# smile: a short bevelled curve across the lower face
cu = bpy.data.curves.new('smile', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.014; cu.bevel_resolution = 6
sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
for bp_, (x, z) in zip(sp.bezier_points, [(-0.06, 0.845), (0.0, 0.815), (0.06, 0.845)]):
    bp_.co = (x, on_head(x, z, 0.006), z); bp_.handle_left_type = bp_.handle_right_type = 'AUTO'
mo = bpy.data.objects.new('smile', cu); sc.collection.objects.link(mo); mo.data.materials.append(MOUTH); parts.append(mo)

# ---- floor shadow catcher, camera, light
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0)); fl = bpy.context.object; fl.is_shadow_catcher = True
bpy.ops.object.camera_add(location=(0.75, -3.5, 1.55)); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 62
tgt = bpy.data.objects.new('tgt', None); tgt.location = (0, -0.05, 0.6); sc.collection.objects.link(tgt)
c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'


def area(loc, power, size, col, look=(0, 0, 0.7)):
    bpy.ops.object.light_add(type='AREA', location=loc); l = bpy.context.object
    l.data.energy = power; l.data.size = size; l.data.color = col
    d = Vector(look) - Vector(loc); l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return l


area((-2.2, -2.8, 3.4), 700, 2.6, (1.0, 0.93, 0.84))
area((2.8, -2.0, 1.6), 230, 2.5, (0.82, 0.88, 1.0))
area((0.4, 3.0, 2.8), 420, 2.0, (1.0, 0.9, 0.78))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.7, 0.85, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 1200
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

views = {'front': (0.75, -3.5, 1.55), 'side': (3.3, -1.4, 1.4)}
for name, loc in views.items():
    if len(argv) > 2 and name not in argv[2:]: continue
    cam.location = loc
    sc.render.filepath = os.path.join(OUT, 'benya-' + name + '.png'); bpy.ops.render.render(write_still=True)

# export the model itself (without floor, camera and lights)
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'benya.glb'), use_selection=True, export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'benya.blend'))
print('DONE')
