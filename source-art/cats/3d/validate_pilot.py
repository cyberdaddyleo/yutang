"""Validate exported structure and evaluated skin/ground contacts, using Blender 5.2.
Run: blender -b --python source-art/cats/3d/validate_pilot.py
This checks geometry and runtime data; it does not certify art or animation appeal.
"""
import bpy,json,math,struct
from pathlib import Path
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[2]/'public/assets/cats/3d'
meta=json.loads((OUT/'pilot-cat.json').read_text())
data=(OUT/'pilot-cat.glb').read_bytes()
assert data[:4]==b'glTF','Missing binary glTF'
chunklen,kind=struct.unpack_from('<II',data,12)
gltf=json.loads(data[20:20+chunklen])
assert len(gltf.get('skins',[]))>=1,'No real skin'
assert len(gltf['skins'][0]['joints'])>=28,'Missing quadruped deformation bones'
assert {'Idle','Walk','HopUp','HopDown'}.issubset({x['name'] for x in gltf.get('animations',[])})
for name in meta['footBones'].values():assert name in {n.get('name') for n in gltf['nodes']}

bpy.ops.wm.open_mainfile(filepath=str(HERE/'pilot-cat.blend'))
arm=bpy.data.objects['PilotCatRig'];mesh=bpy.data.objects['PilotCatBody'];scene=bpy.context.scene
assert any(m.type=='ARMATURE' and m.object==arm for m in mesh.modifiers)
assert all(any(g.weight>0 for g in v.groups) for v in mesh.data.vertices),'Unweighted vertex'
arm.animation_data.action=bpy.data.actions['Walk']
phases={'HindL':0.,'FrontL':.75,'HindR':.5,'FrontR':.25}
footsets={n:[v.index for v in mesh.data.vertices if v.co.z<.040 and ((v.co.x>0)==n.endswith('L')) and ((v.co.y<0)==n.startswith('Front'))] for n in phases}
frames=int(arm.animation_data.action.frame_range[1]);samples={n:[] for n in phases};angles={n:[] for n in phases}
for f in range(1,frames+1):
 scene.frame_set(f);bpy.context.view_layer.update()
 assert arm.pose.bones['Root'].location.length<1e-7,'Walk baked world translation'
 evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());dm=evaluated.to_mesh()
 for n,offset in phases.items():
  p=((f-1)/(frames-1)+offset)%1
  upper=arm.pose.bones[n+'Upper'];lower=arm.pose.bones[n+'Lower']
  angles[n].append(math.degrees((upper.tail-upper.head).angle(lower.tail-lower.head)))
  if p<meta['stanceFraction']:
   verts=[dm.vertices[i].co for i in footsets[n]]
   samples[n].append({'z':min(v.z for v in verts),'y':sum(v.y for v in verts)/len(verts)-meta['walkStride']*p})
 evaluated.to_mesh_clear()
report={}
for n,ps in samples.items():
 zmin=min(p['z'] for p in ps);zmax=max(p['z'] for p in ps);slip=max(p['y'] for p in ps)-min(p['y'] for p in ps)
 assert -.0005<zmin<=zmax<.0005,f'{n} penetrates/floats above support plane: {zmin},{zmax}'
 assert slip<.0005,f'{n} skin foot glides during stance: {slip}'
 assert 8<min(angles[n])<max(angles[n])<150,f'{n} invalid joint angle range'
 report[n]={'stanceSamples':len(ps),'soleMinimumMeters':zmin,'soleMaximumMeters':zmax,'stanceSkinSlipMeters':slip,'jointFlexionDegrees':[min(angles[n]),max(angles[n])]}
result={'passed':True,'deformationJoints':len(gltf['skins'][0]['joints']),'animations':[x['name'] for x in gltf['animations']],'feet':report,'limitation':'Geometric support checks do not replace front/side/back visual review, scene scale calibration, or art approval.'}
(HERE/'validation-report.json').write_text(json.dumps(result,indent=2))
print('PILOT_GEOMETRY_VALIDATION',json.dumps(result))
