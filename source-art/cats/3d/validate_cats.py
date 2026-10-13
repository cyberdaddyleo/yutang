"""Validate production skin, distinct actions, support and render true rig poses.
Run with Blender --background --python source-art/cats/3d/validate_cats.py.
The report does not replace real-time game visual verification.
"""
import bpy,json,math,struct,sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[2]/'public/assets/cats/3d'
AUDIT=HERE/'audit';AUDIT.mkdir(exist_ok=True)
meta=json.loads((OUT/'courtyard-cat.json').read_text())
data=(OUT/'courtyard-cat.glb').read_bytes()
assert data[:4]==b'glTF'
chunklen,kind=struct.unpack_from('<II',data,12);gltf=json.loads(data[20:20+chunklen])
required={'Idle','Walk','Rest','Sleep','RestPlush','SleepPlush','Eat','Drink','Groom','Scratch','Play','Pet','HopUp','HopDown','SleepPlush','RestPlush'}
assert len(gltf.get('skins',[]))>=1
assert len(gltf['skins'][0]['joints'])>=28
assert required.issubset({x['name'] for x in gltf['animations']})
nodenames={n.get('name') for n in gltf['nodes']}
assert set(meta['footBones'].values()).issubset(nodenames)
bpy.ops.wm.open_mainfile(filepath=str(HERE/'courtyard-cat.blend'))
arm=bpy.data.objects['CourtyardCatRig'];mesh=bpy.data.objects['CourtyardCatBody'];scene=bpy.context.scene
assert any(m.type=='ARMATURE' and m.object==arm for m in mesh.modifiers)
assert all(any(g.weight>0 for g in vert.groups) for vert in mesh.data.vertices)
for tr in arm.animation_data.nla_tracks:tr.mute=True
arm.animation_data.action=bpy.data.actions['Walk']
phases={'HindL':0.,'FrontL':.75,'HindR':.5,'FrontR':.25}
footsets={n:[v.index for v in mesh.data.vertices if v.co.z<.040 and ((v.co.x>0)==n.endswith('L')) and ((v.co.y<0)==n.startswith('Front'))] for n in phases}
frames=int(arm.animation_data.action.frame_range[1]);samples={n:[] for n in phases};angles={n:[] for n in phases}
for f in range(1,frames+1):
 scene.frame_set(f);bpy.context.view_layer.update()
 assert arm.pose.bones['Root'].location.length<1e-7
 evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());dm=evaluated.to_mesh()
 for n,offset in phases.items():
  p=((f-1)/(frames-1)+offset)%1
  upper=arm.pose.bones[n+'Upper'];lower=arm.pose.bones[n+'Lower']
  angles[n].append(math.degrees((upper.tail-upper.head).angle(lower.tail-lower.head)))
  if p<meta['stanceFraction']:
   verts=[dm.vertices[i].co for i in footsets[n]]
   samples[n].append({'z':min(v.z for v in verts),'y':sum(v.y for v in verts)/len(verts)-meta['walkStride']*p})
 evaluated.to_mesh_clear()
feet={}
for n,ps in samples.items():
 zmin=min(p['z'] for p in ps);zmax=max(p['z'] for p in ps);slip=max(p['y'] for p in ps)-min(p['y'] for p in ps)
 assert -.001<zmin<=zmax<.001,f'{n} contact height {zmin},{zmax}'
 assert slip<.001,f'{n} stance slip {slip}'
 assert 8<min(angles[n])<max(angles[n])<150,f'{n} joint angle'
 feet[n]={'stanceSamples':len(ps),'soleMinimumMeters':zmin,'soleMaximumMeters':zmax,'stanceSkinSlipMeters':slip,'jointFlexionDegrees':[min(angles[n]),max(angles[n])]}
poses={}
for clip in required:
 action=bpy.data.actions[clip];arm.animation_data.action=action
 minima=[];maxima=[];heads=[]
 for t in [0,.125,.25,.375,.5,.625,.75,.875,1]:
  frame=1+(action.frame_range[1]-1)*t;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
  evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());dm=evaluated.to_mesh()
  minima.append(min(v.co.z for v in dm.vertices));maxima.append(max(v.co.z for v in dm.vertices));heads.append(list(arm.pose.bones['Head'].head))
  assert all(math.isfinite(c) for vert in dm.vertices for c in vert.co)
  evaluated.to_mesh_clear()
 poses[clip]={'minBodyZ':min(minima),'maxBodyZ':max(maxima),'headCenterAtMiddle':heads[4]}
 assert min(minima)>-.002,f'{clip} body below support plane: {min(minima)}'
 assert max(maxima)<1.,f'{clip} exploded mesh'
assert poses['Sleep']['headCenterAtMiddle'][2]<poses['Idle']['headCenterAtMiddle'][2]-.08
assert poses['Eat']['headCenterAtMiddle'][2]<poses['Idle']['headCenterAtMiddle'][2]-.05
report={'passed':True,'deformationJoints':len(gltf['skins'][0]['joints']),'animations':sorted(required),'feet':feet,'poses':poses,'limitations':['Contact test covers canonical straight-line Walk, not curved navigation.','Actions authored with quadruped IK, not claimed automatic video mocap.','Visual review at runtime is still required.']}
(HERE/'courtyard-validation-report.json').write_text(json.dumps(report,indent=2))
print('COURTYARD_VALIDATION',json.dumps(report))
if '--render' in sys.argv:
 scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100
 scene.render.engine='CYCLES';scene.cycles.samples=24
 camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=1.08
 target=Vector((0,-.02,.29))
 for clip in ['Idle','Walk','Rest','Sleep','RestPlush','SleepPlush','Eat','Drink','Groom','Scratch','Play','Pet','HopUp','HopDown']:
  requested=next((x.split('=',1)[1].split(',') for x in sys.argv if x.startswith('--only=')),None)
  if requested and clip not in requested:continue
  arm.animation_data.action=bpy.data.actions[clip]
  for view,loc in [('quarter',(.85,-1.05,.77)),('side',(1.2,0,.43)),('back',(.02,1.2,.53))]:
   if view=='back' and clip not in ['Idle','Walk']:continue
   scene.frame_set(1+int((arm.animation_data.action.frame_range[1]-1)*.4))
   for obj in bpy.data.objects:
    if obj.type=='MESH' and obj.data.shape_keys and 'CloseEyes' in obj.data.shape_keys.key_blocks:
     obj.data.shape_keys.key_blocks['CloseEyes'].value=1 if clip in ('Sleep','SleepPlush') else .8 if clip=='Pet' else 0
   camera.location=loc;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
   scene.render.filepath=str(AUDIT/(clip+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
