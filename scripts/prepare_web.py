import bpy, math, os
from pathlib import Path
from mathutils import Matrix,Vector
root=Path('/Volumes/AÜGMENT T7 SSD/nasa-space-apps-challenge-2026'); out=root/'assets/3d/web';out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
steel=bpy.data.materials.new('Acier');steel.diffuse_color=(.48,.5,.52,1);steel.metallic=.75;steel.roughness=.3
black=bpy.data.materials.new('Protection thermique');black.diffuse_color=(.035,.038,.04,1);black.roughness=.8
parts=[('SS3_-_Booster_Engine_Plate',50.5,50.5,-13.367),('SS3_-_Booster_Engine_Skirt',47.65,47.5,0),('SS3_-_Booster_Tank_Bottom',58.69,47.5,23.7),('ss3-booster-tank-center',46,47.5,242.98),('ss3-booster-tank-top',46.01,46.01,462.26),('SS3_-_Hot_Stage_Ring',45,45,689.05),('ss3-ship-engine-plate',42.45,42.45,695.05),('ss3-ship-tank-bottom',82.5,45.85,695.05),('ss3-ship-tank-upper',45.3,45,868.9),('SS3_-_Ship_Tank_Bottom_-_Shield',82.5,45.85,704.2),('SS3_-_Ship_Tank_Bottom_-_Flap_L',82.5,45.85,704.2),('SS3_-_Ship_Tank_Bottom_-_Flap_R',82.5,45.85,704.2),('SS3_-_Ship_Tank_Upper_-_Shield',45.3,45,887.2),('SS3_-_Ship_Nose',71.5,45.5,1042.55),('SS3_-_Ship_Nose_-_Shield',71.5,45.5,1042.55),('SS3_-_Ship_Nose_-_Cone',71.5,45.5,1042.55),('SS3_-_Ship_Nose_-_Flap_L',71.5,45.5,1042.55),('SS3_-_Ship_Nose_-_Flap_R',71.5,45.5,1042.55)]
for name,cx,cz,h in parts:
 p=next(p for p in (root/'assets/3d/source').glob('starship-part*/files/*') if p.stem==name and p.suffix.lower()=='.stl')
 bpy.ops.wm.stl_import(filepath=str(p));o=bpy.context.object
 o.data.transform(Matrix(((.1,0,0,-cx*.1),(0,0,-.1,cz*.1),(0,.1,0,h*.1),(0,0,0,1))))
 o.data.materials.append(black if any(x in name.lower() for x in ['shield','plate','skirt','cone','ring']) else steel)
 if len(o.data.polygons)>30000:
  mod=o.modifiers.new('Optimisation','DECIMATE');mod.ratio=max(.04,min(1,45000/len(o.data.polygons)));bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in o.data.polygons:f.use_smooth=True
 print('PART',name,len(o.data.polygons),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/3d/blender/Starship-assemble.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'starship.glb'),export_format='GLB',export_animations=False)
print('STARSHIP_DONE',flush=True)
