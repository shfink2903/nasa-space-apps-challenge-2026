import bpy, json
from pathlib import Path
from mathutils import Vector, Quaternion
root=Path('/Volumes/AÜGMENT T7 SSD/nasa-space-apps-challenge-2026')
scene=bpy.data.scenes.new('NASA - Lune et Starship - Sources')
bpy.context.window.scene=scene
moon_col=bpy.data.collections.new('LUNE - NASA LRO')
scene.collection.children.link(moon_col)
bpy.ops.wm.usd_import(filepath=str(root/'assets/3d/source/Lune_NASA_LRO_23k_Topo.usdz'))
moon=list(scene.objects)
for o in moon:
 for c in list(o.users_collection): c.objects.unlink(o)
 moon_col.objects.link(o)
pts=[o.matrix_world@Vector(v) for o in moon if o.type=='MESH' for v in o.bound_box]
lo=Vector(tuple(min(p[i] for p in pts) for i in range(3))); hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
center=(lo+hi)/2
factor=500/max(hi-lo)
parent=bpy.data.objects.new('Lune - echelle de presentation',None);moon_col.objects.link(parent)
for o in moon:
 if o.parent is None: o.parent=parent
parent.scale=(factor,)*3;parent.location=Vector((-420,0,250))-center*factor
star=bpy.data.collections.new('STARSHIP V3 - Pieces STL sources')
scene.collection.children.link(star)
report=[]
files=sorted(p for p in (root/'assets/3d/source').glob('starship-part*/files/*') if p.suffix.lower()=='.stl')
for n,p in enumerate(files):
 bpy.ops.wm.stl_import(filepath=str(p))
 o=bpy.context.object
 for c in list(o.users_collection):c.objects.unlink(o)
 star.objects.link(o)
 o['source_file']=str(p.relative_to(root));o['source_location']=list(o.location)
 bbox=[o.matrix_world@Vector(v) for v in o.bound_box]
 low=Vector(tuple(min(v[i] for v in bbox) for i in range(3)));high=Vector(tuple(max(v[i] for v in bbox) for i in range(3)))
 o.location += Vector(((n%6)*160, (n//6)*180, 0))-Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
 report.append({'object':o.name,'triangles':len(o.data.polygons),'source':o['source_file']})
scene['note']='Sources importees. Pieces Starship disposees en grille, non assemblees. Echelles de presentation non physiques. Optimisation web non effectuee.'
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type=='MESH':o.select_set(True)
bpy.ops.file.pack_all()
(root/'assets/3d/blender/import-report.json').write_text(json.dumps({'moon_objects':[o.name for o in moon],'starship_parts':report},indent=2))
# Restore viewport for inspection before saving.
area=bpy.context.area
area.type='VIEW_3D'
area.spaces.active.clip_end=1000000
area.spaces.active.shading.color_type='TEXTURE'
with bpy.context.temp_override(area=area, region=next(r for r in area.regions if r.type=='WINDOW')):
 bpy.ops.view3d.view_all(center=False)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/3d/blender/Lune-Starship-Sources.blend'))
print('IMPORT_COMPLETE',len(moon),len(report))
