# Беня (Benya) the lamb, built from primitives to match the app's flat mascot. Run: blender -b --factory-startup --python benya.py -- OUTDIR [samples]
import bpy, math, sys, os, random
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/benya'
SAMPLES = int(argv[1]) if len(argv) > 1 else 96
os.makedirs(OUT, exist_ok=True)
random.seed(7)
MOOD = os.environ.get('MOOD', 'happy'); SKIN = os.environ.get('SKIN', ''); VARIANT = bool(os.environ.get('MOOD') or SKIN)

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
    if MOOD == 'wink' and s < 0:
        wc = bpy.data.curves.new('wink', 'CURVE'); wc.dimensions = '3D'; wc.bevel_depth = 0.013; wc.bevel_resolution = 6
        wsp = wc.splines.new('BEZIER'); wsp.bezier_points.add(2)
        for bp_, (x, z) in zip(wsp.bezier_points, [(ex - 0.05, ez - 0.01), (ex, ez + 0.025), (ex + 0.05, ez - 0.01)]):
            bp_.co = (x, on_head(x, z, 0.004), z); bp_.handle_left_type = bp_.handle_right_type = 'AUTO'
        wo = bpy.data.objects.new('wink', wc); sc.collection.objects.link(wo); wo.data.materials.append(EYE); parts.append(wo)
    else:
        ball((ex, on_head(ex, ez, 0.022), ez), 1, EYE, scale=(0.056, 0.034, 0.074) if MOOD != 'wow' else (0.062, 0.036, 0.082), rot=(0, 0, s * -8))
        ball((ex + 0.017, on_head(ex, ez, 0.0) - 0.016, ez + 0.03), 0.019, HI, seg=24)
    cx, cz = s * 0.195, 0.85
    ball((cx, on_head(cx, cz, 0.012), cz), 1, CHEEK, scale=(0.062, 0.016, 0.046), rot=(0, 0, s * -34))

# smile: a short bevelled curve across the lower face («wow»: a small open mouth)
if MOOD == 'wow':
    ball((0, on_head(0, 0.83, 0.012), 0.83), 1, MOUTH, scale=(0.032, 0.02, 0.04))
cu = bpy.data.curves.new('smile', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.014; cu.bevel_resolution = 6
sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
for bp_, (x, z) in zip(sp.bezier_points, [(-0.06, 0.845), (0.0, 0.815), (0.06, 0.845)]):
    bp_.co = (x, on_head(x, z, 0.006), z); bp_.handle_left_type = bp_.handle_right_type = 'AUTO'
mo = bpy.data.objects.new('smile', cu)
if MOOD != 'wow': sc.collection.objects.link(mo); mo.data.materials.append(MOUTH); parts.append(mo)

# ---- costumes for the app's seasonal skins
def tube(pts, r, m, name):
    c = bpy.data.curves.new(name, 'CURVE'); c.dimensions = '3D'; c.bevel_depth = r; c.bevel_resolution = 6; c.use_fill_caps = True
    sp_ = c.splines.new('BEZIER'); sp_.bezier_points.add(len(pts) - 1)
    for bp_, co in zip(sp_.bezier_points, pts): bp_.co = co; bp_.handle_left_type = bp_.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, c); sc.collection.objects.link(o); o.data.materials.append(m); parts.append(o); return o
if SKIN == 'xmas':
    BR_ = mat('antler', hexrgb('#8A5A3C'), rough=0.6); RED = mat('red', hexrgb('#A51D1A'), rough=0.7, bump=(70, 0.4)); NOSE = mat('nose', hexrgb('#E4312B'), rough=0.2, coat=1.0)
    for s in (-1, 1):
        tube([(s * 0.1, -0.24, 1.22), (s * 0.2, -0.25, 1.42), (s * 0.3, -0.24, 1.55)], 0.022, BR_, 'antler')
        tube([(s * 0.17, -0.25, 1.36), (s * 0.27, -0.25, 1.4), (s * 0.33, -0.25, 1.38)], 0.018, BR_, 'tine')
        tube([(s * 0.23, -0.245, 1.47), (s * 0.15, -0.245, 1.55), (s * 0.12, -0.245, 1.6)], 0.016, BR_, 'tine2')
    ball((0, on_head(0, 0.9, 0.03), 0.9), 0.05, NOSE, seg=32)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.33, minor_radius=0.055, location=(0, -0.22, 0.66), rotation=(math.radians(14), 0, 0))
    o = bpy.context.object; bpy.ops.object.shade_smooth(); o.data.materials.append(RED); parts.append(o)
    ball((0.2, -0.53, 0.5), 1, RED, scale=(0.065, 0.035, 0.14), rot=(0, -12, 0))
if SKIN == 'cosmos':
    GL = bpy.data.materials.new('glass'); GL.use_nodes = True; gb = GL.node_tree.nodes['Principled BSDF']
    gb.inputs['Base Color'].default_value = (0.85, 0.93, 1, 1); gb.inputs['Roughness'].default_value = 0.02; gb.inputs['Transmission Weight'].default_value = 1.0; gb.inputs['IOR'].default_value = 1.08
    gb.inputs['Alpha'].default_value = 0.35
    ball((0, -0.3, 0.98), 0.46, GL, seg=64)
    MET = mat('metal', hexrgb('#DDE5F2'), rough=0.25); MET.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.8
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.06, location=(0, -0.28, 0.64), rotation=(math.radians(-10), 0, 0))
    o = bpy.context.object; bpy.ops.object.shade_smooth(); o.data.materials.append(MET); parts.append(o)
    tube([(0.24, -0.28, 1.36), (0.3, -0.28, 1.44), (0.33, -0.28, 1.5)], 0.012, MET, 'antenna'); ball((0.33, -0.28, 1.52), 0.03, mat('tip', hexrgb('#FF6F5B'), rough=0.3), seg=24)
if SKIN == 'joy':
    PK = mat('petal', hexrgb('#FFB3D4'), rough=0.5, sss=0.3); YL = mat('core', hexrgb('#FFC94D'), rough=0.4)
    fc = Vector((0.2, -0.36, 1.2))
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3; ball(fc + Vector((math.cos(a) * 0.095, -0.02, math.sin(a) * 0.095)), 0.07, PK, seg=32)
    ball(fc + Vector((0, -0.06, 0)), 0.055, YL, seg=32)

# ---- floor shadow catcher, camera, light
# no floor: only the lamb itself, so the picture has no shadow square around it
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
if VARIANT:
    cam.location = views['front']; sc.render.resolution_x = sc.render.resolution_y = 640
    sc.render.filepath = os.path.join(OUT, 'v-' + MOOD + ('-' + SKIN if SKIN else '') + '.png'); bpy.ops.render.render(write_still=True)
    print('DONE'); sys.exit(0)
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
