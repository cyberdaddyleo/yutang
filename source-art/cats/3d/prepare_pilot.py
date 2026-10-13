"""Reproducible, real skinned quadruped pilot. Run with Blender 5.2:
  blender -b --python source-art/cats/3d/prepare_pilot.py
Original mesh: JonasDichelle, CC BY 3.0. See SOURCE-LICENSE.html.
This is a locomotion pilot, not approved final replacement art.
Blender -Y forward / +Z up exports to glTF +Z forward / +Y up.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / 'public/assets/cats/3d'
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 0.7 / 9.209949970245361
Z0 = -2.8800864219665527
FPS = 30
STRIDE = .24
WALK_SECONDS = 1.2
STANCE = .64

def v(p):
    return Vector((p[0] * SCALE, p[1] * SCALE, (p[2] - Z0) * SCALE))

def bone(name, head, tail, parent=None, deform=True):
    b = arm.data.edit_bones.new(name)
    b.head = Vector(head); b.tail = Vector(tail)
    b.use_deform = deform
    if parent: b.parent = arm.data.edit_bones[parent]
    # Stable bend plane: local X is lateral, with the limb flexing around X.
    b.align_roll(Vector((0, -1, 0)))
    return b

def material(name, rgba, roughness=.8):
    m = bpy.data.materials.new(name); m.use_nodes=True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=rgba
    p.inputs['Roughness'].default_value=roughness
    p.inputs['Specular IOR Level'].default_value=.22
    return m

def smoothstep(t):
    t=max(0., min(1.,t)); return t*t*(3-2*t)

def track_key(pb,frame,loc=None,rot=None):
    if loc is not None:
        pb.location=Vector(loc); pb.keyframe_insert('location',frame=frame,group=pb.name)
    if rot is not None:
        pb.rotation_mode='XYZ'; pb.rotation_euler=rot
        pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(HERE/'source-cat.fbx'))
mesh = bpy.data.objects['Cat']; mesh.name='PilotCatBody'
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for vert in mesh.data.vertices: vert.co=v(vert.co)
for poly in mesh.data.polygons: poly.use_smooth=True
coat=material('Pilot warm grey coat',(.32,.285,.245,1))
mesh.data.materials.clear(); mesh.data.materials.append(coat)
# Smooth shoulder and muzzle highlights; retain the author's actual continuous mesh.
# No separated rigid leg primitives and no image-based limb duplication.

ad=bpy.data.armatures.new('PilotCatSkeleton')
arm=bpy.data.objects.new('PilotCatRig',ad); bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm; mesh.select_set(False); arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bone('Root',(0,0,0),(0,0,.07),deform=False)
bone('Pelvis',v((0,2.45,.9)),v((0,1.3,1.15)),'Root')
bone('Spine',v((0,1.3,1.15)),v((0,-.3,1.4)),'Pelvis')
bone('Chest',v((0,-.3,1.4)),v((0,-1.8,1.55)),'Spine')
bone('Neck',v((0,-1.8,1.55)),v((0,-2.9,2.65)),'Chest')
bone('Head',v((0,-2.9,2.65)),v((0,-4.55,2.55)),'Neck')
# Tail follows the original upright silhouette instead of being a rigid rod.
tail=[(0,3.3,1.7),(0,3.78,2.55),(0,4.01,3.5),(0,4.10,4.5),(0,4.14,5.45),(0,4.07,6.35)]
for i in range(len(tail)-1): bone(f'Tail{i+1}',v(tail[i]),v(tail[i+1]),'Pelvis' if i==0 else f'Tail{i}')
legs={}
for side,sgn in [('L',1),('R',-1)]:
    for fore in (True,False):
        prefix=('Front' if fore else 'Hind')+side
        x=(.68 if fore else .80)*sgn
        if fore:
            shoulder=(x,-1.5,1.0); elbow=(x,-1.28,-.43)
            wrist=(x,-1.75,-2.20); ankle=(x,-1.84,-2.64); toe=(x,-2.20,-2.66)
            bone(prefix+'Scapula',v((x*.75,-1.35,1.7)),v(shoulder),'Chest')
            parent=prefix+'Scapula'
        else:
            shoulder=(x,2.65,1.08); elbow=(x,2.03,-.33)
            wrist=(x,3.03,-1.35); ankle=(x,2.19,-2.67); toe=(x,1.78,-2.70)
            parent='Pelvis'
        bone(prefix+'Upper',v(shoulder),v(elbow),parent)
        bone(prefix+'Lower',v(elbow),v(wrist),prefix+'Upper')
        bone(prefix+('Wrist' if fore else 'Hock'),v(wrist),v(ankle),prefix+'Lower')
        bone(prefix+'Paw',v(ankle),v(toe),prefix+('Wrist' if fore else 'Hock'))
        # IK target is at the wrist/hock; distal segment keeps its authored orientation.
        bone(prefix+'IK',v(wrist),v(wrist)+Vector((0,0,.045)),'Root',False)
        p=Vector(v(elbow)); p.y += (.45 if fore else -.45)
        bone(prefix+'Pole',p,p+Vector((0,0,.035)),'Root',False)
        bone(prefix+'FootCtl',v(wrist),v(ankle),'Root',False)
        legs[prefix]={'fore':fore,'side':side,'sgn':sgn,'wrist':v(wrist),'ankle':v(ankle),'toe':v(toe), 'bend':prefix+('Wrist' if fore else 'Hock')}
bpy.ops.object.mode_set(mode='POSE')
for name,cfg in legs.items():
    lower=arm.pose.bones[name+'Lower']
    ik=lower.constraints.new('IK'); ik.name='Two segment feline IK'
    ik.target=arm; ik.subtarget=name+'IK'; ik.pole_target=arm;ik.pole_subtarget=name+'Pole';ik.chain_count=2
    ik.use_stretch=False
    # Bone roll is aligned explicitly; choose pole angle after checking rest positions below.
    ik.pole_angle=0
    for bn in [name+'Upper',name+'Lower']:
        arm.pose.bones[bn].ik_stretch=0
    distal=arm.pose.bones[cfg['bend']]
    cr=distal.constraints.new('COPY_ROTATION');cr.name='Planted distal alignment'
    cr.target=arm;cr.subtarget=name+'FootCtl';cr.target_space='WORLD';cr.owner_space='WORLD'
bpy.ops.object.mode_set(mode='OBJECT')
# Calibrate the IK pole angle against the authored anatomical rest knee location.
# This avoids relying on left/right bone-roll assumptions.
for name,cfg in legs.items():
    lower=arm.pose.bones[name+'Lower']; con=lower.constraints[0]
    ideal=arm.data.bones[name+'Lower'].head_local.copy()
    best=(1e9,0)
    for k in range(72):
        angle=-math.pi+2*math.pi*k/72; con.pole_angle=angle
        bpy.context.view_layer.update()
        err=(lower.head-ideal).length
        if err<best[0]: best=(err,angle)
    con.pole_angle=best[1]
    bpy.context.view_layer.update()
    print('IK REST',name,'error',best[0],'pole',best[1])

# Real heat-weight skinning on the continuous cat body.
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);arm.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
mesh.parent=arm
mod=next((m for m in mesh.modifiers if m.type=='ARMATURE'),None)
assert mod is not None,'Armature modifier missing'
# Keep only deformation groups and normalize, detect any unweighted vertices.
def_names={b.name for b in arm.data.bones if b.use_deform}
for g in list(mesh.vertex_groups):
    if g.name not in def_names:mesh.vertex_groups.remove(g)
missing=[vert.index for vert in mesh.data.vertices if not any(g.weight>1e-7 for g in vert.groups)]
if missing: raise RuntimeError(f'Heat skinning left {len(missing)} vertices unweighted')

# The public FBX omits eyeballs. Add small spherical eyes, pupils and a nose;
# they are weighted to the head bone, not unrelated world-position billboards.
eye_white=material('Amber iris',(.44,.38,.15,1),.35)
pupil_mat=material('Dark pupils',(.013,.019,.017,1),.33)
inner_mat=material('Muted nose',(.26,.105,.09,1),.65)
eye_lights=material('Eye glints',(.68,.67,.54,1),.22)
attachments=[]
def ellipsoid(name,co,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=v(co))
    o=bpy.context.object;o.name=name;o.scale=Vector(scale)*SCALE
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    o.data.materials.append(mat)
    vg=o.vertex_groups.new(name='Head');vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
    m=o.modifiers.new('Head skin','ARMATURE');m.object=arm
    o.parent=arm;attachments.append(o)
    return o
for side,sign in [('L',1),('R',-1)]:
    ellipsoid('Eye'+side,(sign*.590,-4.080,3.015),(.210,.145,.17),eye_white)
    ellipsoid('Pupil'+side,(sign*.625,-4.188,3.020),(.058,.060,.133),pupil_mat)
    ellipsoid('Glint'+side,(sign*.641,-4.240,3.071),(.022,.020,.027),eye_lights)
ellipsoid('Nose',(0,-4.859,2.515),(.155,.07,.094),inner_mat)

scene=bpy.context.scene;scene.render.fps=FPS
# Controllers use armature-local offset vectors. Inherit no root/world translation.
rest_targets={n:arm.data.bones[n+'IK'].matrix_local.to_3x3() for n in legs}
phases={'HindL':0.,'FrontL':.75,'HindR':.5,'FrontR':.25}
clipdata={}

def target_key(name, delta, frame):
    # location is in the bone's local basis, not armature world XYZ.
    local=rest_targets[name].inverted()@Vector(delta)
    track_key(arm.pose.bones[name+'IK'],frame,loc=local)

def reset_pose():
    for pb in arm.pose.bones:
        pb.location=(0,0,0);pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)

for clip,seconds in [('Idle',3.2),('Walk',WALK_SECONDS),('HopUp',.72),('HopDown',.68)]:
    reset_pose()
    action=bpy.data.actions.new(clip+'Controls');arm.animation_data_create();arm.animation_data.action=action
    count=round(seconds*FPS)
    for f in range(count+1):
        t=f/count;frame=f+1
        breath=math.sin(t*math.tau)
        root_z=0.; bodypitch=0.; offsets={n:Vector() for n in legs}
        if clip=='Idle':
            root_z=.0012*breath
        elif clip=='Walk':
            root_z=-.020+.0018*math.cos(4*math.pi*t)
            bodypitch=.008*math.sin(4*math.pi*t)
            for name in legs:
                p=(t+phases[name])%1
                if p<STANCE:
                    y=STRIDE*(p-STANCE/2)
                    lift=0.
                else:
                    u=(p-STANCE)/(1-STANCE)
                    # Hermite swing has the same local Y velocity at either contact.
                    a=STRIDE*STANCE/2; m=STRIDE*(1-STANCE)
                    h00=2*u**3-3*u*u+1;h10=u**3-2*u*u+u;h01=-2*u**3+3*u*u;h11=u**3-u*u
                    y=h00*a+h10*m+h01*(-a)+h11*m
                    lift=.031*math.sin(math.pi*u)**1.3
                offsets[name]=Vector((0,y,lift))
        else:
            # Root/world arc belongs to the runtime. Only leg tuck and body compression here.
            # Forefeet release first, hindfeet extend for push; forefeet reach/land first.
            up=clip=='HopUp'
            crouch=math.sin(math.pi*min(1,t/.22)) if t<.22 else 0.
            root_z=-.023*crouch
            bodypitch=(-.055 if up else .045)*math.sin(math.pi*t)
            for name,cfg in legs.items():
                fore=cfg['fore']
                leave=.14 if fore else .27
                land=.73 if fore else .87
                u=max(0,min(1,(t-leave)/(land-leave)))
                lift=(.066 if fore else .049)*math.sin(math.pi*u)**1.1 if leave<t<land else 0.
                y=(-.034 if fore else .016)*math.sin(math.pi*u) if leave<t<land else 0.
                # Forward reach just before front-paw contact, then absorb into crouch.
                if fore and .53<t<.8:y-=.027*math.sin(math.pi*(t-.53)/.27)
                offsets[name]=Vector((0,y,lift))
            if t>.73:
                absorb=math.sin(math.pi*min(1,(t-.73)/.27))
                root_z-=.017*absorb
        track_key(arm.pose.bones['Pelvis'],frame,loc=(0,0,0),rot=(bodypitch,0,0))
        # Local Z translation is derived from bone basis for stable world vertical breathing.
        pelvis=arm.pose.bones['Pelvis'];localz=pelvis.bone.matrix_local.to_3x3().inverted()@Vector((0,0,root_z))
        track_key(pelvis,frame,loc=localz)
        for name,cfg in legs.items():
            target_key(name,offsets[name] + Vector((0,0,-.0034 if cfg['fore'] else 0)),frame)
            # Distal alignment is stable during stance. Subtle paw flex only in airborne phase.
            lift=offsets[name].z
            track_key(arm.pose.bones[name+'FootCtl'],frame,rot=(min(.16,lift*2.3),0,0))
            track_key(arm.pose.bones[name+'Paw'],frame,rot=(-min(.12,lift*2),0,0))
        for i in range(1,6):track_key(arm.pose.bones[f'Tail{i}'],frame,rot=(.015*math.sin(t*math.tau+i*.3),.028*math.sin(t*math.tau-i*.35),0))
        track_key(arm.pose.bones['Neck'],frame,rot=(-bodypitch*.32,0,.005*breath))
        track_key(arm.pose.bones['Head'],frame,rot=(0,.008*breath,0))
    # Save control action as an editable source, then visual-bake the actual IK results.
    action.use_fake_user=True
    scene.frame_start=1;scene.frame_end=count+1
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.nla.bake(frame_start=1,frame_end=count+1,step=1,only_selected=False,visual_keying=True,clear_constraints=False,clear_parents=False,use_current_action=False,clean_curves=False,bake_types={'POSE'})
    baked=arm.animation_data.action;baked.name=clip;baked.use_fake_user=True
    clipdata[clip]={'duration':count/FPS,'frames':count+1,'fps':FPS,'action':baked.name,'loop':clip in ('Walk','Idle')}
    bpy.ops.object.mode_set(mode='OBJECT')

# Constraints stay on editable source rig, muted for baked playback/export.
for pb in arm.pose.bones:
    for c in pb.constraints:c.mute=True
arm.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(1)
arm.show_in_front=True
# Export deformation joints only. Assign one NLA strip per named animation.
for clip in clipdata:
    tr=arm.animation_data.nla_tracks.new();tr.name=clip
    strip=tr.strips.new(clip,1,bpy.data.actions[clip]);strip.action_frame_start=1;strip.action_frame_end=clipdata[clip]['frames'];tr.mute=True
# .blend is usable immediately: Idle action selected, custom IK controllers remain editable.
scene.frame_end=clipdata['Walk']['frames']
scene.render.engine='BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'CYCLES'
scene.world=bpy.data.worlds.new('StudioWorld');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.45,.47,.48,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
# Audit views are not exported.
bpy.ops.object.camera_add(location=(1.0,-1.20,.78));cam=bpy.context.object;cam.name='AuditCamera';target=Vector((0,-.03,.30));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.9;scene.camera=cam
for name,loc,power,size in [('Softbox',(1,-1.3,1.6),85,1.5),('Fill',(-1,.4,.8),35,1.2)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.film_transparent=True
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'pilot-cat.blend'))

# Export selected skinned meshes and rig, with baked actions only (controller actions excluded).
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);mesh.select_set(True)
for o in attachments:o.select_set(True)
bpy.context.view_layer.objects.active=arm
for a in list(bpy.data.actions):
    if a.name.endswith('Controls'):bpy.data.actions.remove(a)
# Remove NLA to avoid duplicate tracks; action export gathers only named baked actions.
for tr in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(tr)
arm.animation_data.action=bpy.data.actions['Idle']
bpy.ops.export_scene.gltf(filepath=str(OUT/'pilot-cat.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_anim_single_armature=True,export_nla_strips_merged_animation_name='Animation',export_def_bones=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_apply=False)
manifest={
 'schemaVersion':1,'asset':'pilot-cat.glb','status':'locomotion-pilot-not-final-art',
 'modelLength':.7,'cameraElevationDegrees':55,'scale':1,'groundOffset':0,
 'walkStride':STRIDE,'walkDuration':WALK_SECONDS,'stanceFraction':STANCE,
 'forwardAxis':'+Z','upAxis':'+Y','rootMotionNodes':[],
 'jumpSections':{'crouch':.22,'jump':.73},
 'footBones':{'frontLeft':'FrontLPaw','frontRight':'FrontRPaw','hindLeft':'HindLPaw','hindRight':'HindRPaw'},
 'clips':clipdata,'deformBoneCount':len(def_names),'vertexCount':len(mesh.data.vertices),
 'source':{'author':'JonasDichelle','conversionBy':'Antti Nuortimo','url':'https://blendswap.com/blend/18519','download':'https://raw.githubusercontent.com/nrz/ylikuutio/master/res/objects/www.blendswap.com/86110_rigged_and_animated_cat/cat.fbx','license':'CC-BY-3.0','licenseUrl':'https://creativecommons.org/licenses/by/3.0/'},
 'changes':'Original continuous body retained. Newly authored quadruped armature, Blender heat skinning, IK control rig, baked in-place Idle/Walk/HopUp/HopDown clips, warm-grey material and skinned eye/nose additions. No original animation was in the public FBX.',
 'notes':['World displacement and jump arc must be applied by the game, not the clips.','Control actions and muted IK constraints remain in the .blend for editing; GLB contains baked deformation joints.','Shading/coat styling is provisional and needs visual approval before replacing existing cats.']
}
(OUT/'pilot-cat.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('PILOT_EXPORTED',str(OUT/'pilot-cat.glb'))
