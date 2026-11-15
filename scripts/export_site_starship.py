import bpy
from pathlib import Path
names=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_get() and not o.hide_render and (o.name.lower().startswith(('ss3-ship','ss3_-_ship')) or o.name.startswith(('NASA |','États-Unis |','SpaceX |')))]
print('Export objects:',[o.name for o in names])
original_selected=list(bpy.context.selected_objects);original_active=bpy.context.view_layer.objects.active
bpy.ops.object.select_all(action='DESELECT'); copies=[]
for o in names:
 c=o.copy();c.data=o.data.copy();bpy.context.collection.objects.link(c);c.name='web | '+o.name;copies.append(c);c.select_set(True)
 for i, mat in enumerate(c.data.materials):
  if mat is None:continue
  m=mat.copy();c.data.materials[i]=m
  if m.name.startswith(('HLS | Revêtement','Raptor | métal','Super Heavy | jupe')):
   bs=m.node_tree.nodes.get('Principled BSDF') or next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if bs:
    for l in list(bs.inputs['Base Color'].links):m.node_tree.links.remove(l)
    col=(.75,.77,.75,1) if 'Revêtement' in m.name else (.23,.21,.19,1)
    bs.inputs['Base Color'].default_value=col
  elif m.name.startswith('SS | Protection'):
   nt=m.node_tree; bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');tex=next((n for n in nt.nodes if n.type=='TEX_IMAGE' and n.image),None)
   for l in list(bs.inputs['Base Color'].links):nt.links.remove(l)
   if tex:
    uv=c.data.uv_layers.new(name='Shield projection')
    xs=[v.co.x for v in c.data.vertices]; zs=[v.co.z for v in c.data.vertices]
    xmin,xmax=min(xs),max(xs); zmin,zmax=min(zs),max(zs)
    for poly in c.data.polygons:
     for li in poly.loop_indices:
      v=c.data.vertices[c.data.loops[li].vertex_index].co
      uv.data[li].uv=((v.x-xmin)/max(xmax-xmin,1e-8),(v.z-zmin)/max(zmax-zmin,1e-8))
    for l in list(tex.inputs['Vector'].links):nt.links.remove(l)
    nt.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
   else:bs.inputs['Base Color'].default_value=(.035,.038,.04,1)
  if m.use_nodes:
   bs=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if bs:
    for l in list(bs.inputs['Normal'].links):m.node_tree.links.remove(l)
bpy.context.view_layer.objects.active=copies[0]
path=str(Path(bpy.data.filepath).resolve().parents[3] / 'touchdown/public/models/starship.glb')
try:
 bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_animations=False,export_apply=True)
finally:
 for c in copies:
  d=c.data;bpy.data.objects.remove(c,do_unlink=True);bpy.data.meshes.remove(d)
 for o in original_selected:
  if o.name in bpy.data.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=original_active
print('Exported',path)
