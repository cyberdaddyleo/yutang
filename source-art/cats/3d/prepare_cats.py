"""Reproducible, real skinned quadruped with full courtyard actions. Run with Blender 5.2:
  blender -b --python source-art/cats/3d/prepare_cats.py
Original mesh: JonasDichelle, CC BY 3.0. See SOURCE-LICENSE.html.
Production courtyard mother rig. See courtyard-validation-report.json and audit views.
Blender -Y forward / +Z up exports to glTF +Z forward / +Y up.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler

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
        pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=Euler(rot,'XYZ').to_quaternion()
        pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(HERE/'source-cat.fbx'))
mesh = bpy.data.objects['Cat']; mesh.name='CourtyardCatBody'
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for vert in mesh.data.vertices: vert.co=v(vert.co)
for poly in mesh.data.polygons: poly.use_smooth=True
coat=material('Pilot warm grey coat',(.32,.285,.245,1))
mesh.data.materials.clear(); mesh.data.materials.append(coat)
# Smooth shoulder and muzzle highlights; retain the author's actual continuous mesh.
# No separated rigid leg primitives and no image-based limb duplication.

ad=bpy.data.armatures.new('CourtyardCatSkeleton')
arm=bpy.data.objects.new('CourtyardCatRig',ad); bpy.context.collection.objects.link(arm)
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

# Optional production-art module reshapes and textures the same continuous skin.
# Art changes must retain paw support anchors and the quadruped skeleton.
art_result={}
if (HERE/'cat_art.py').exists():
    sys.path.insert(0,str(HERE))
    import cat_art
    art_result=cat_art.apply_art(mesh,arm,attachments,{'v':v,'SCALE':SCALE,'material':material,'ellipsoid':ellipsoid,'HERE':HERE,'OUT':OUT}) or {}
    for obj in art_result.get('attachments',[]):
        if obj not in attachments:attachments.append(obj)
for obj in [mesh]+attachments:
    if obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:key.value=0
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
        pb.location=(0,0,0);pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)

def bump(t,a,b):
    return math.sin(math.pi*(t-a)/(b-a)) if a<t<b else 0.

def worldloc(pb,delta):
    return pb.bone.matrix_local.to_3x3().inverted()@Vector(delta)

CLIP_SPECS=[('Idle',4.),('Walk',WALK_SECONDS),('Rest',4.),('Sleep',4.8),('RestPlush',4.),('SleepPlush',4.8),('Eat',2.4),('Drink',2.),('Groom',3.2),('Scratch',2.),('Play',2.4),('Pet',3.),('HopUp',.9),('HopDown',.9)]
for clip,seconds in CLIP_SPECS:
    pose_clip=clip.replace('Plush','')
    reset_pose()
    action=bpy.data.actions.new(clip+'Controls');arm.animation_data_create();arm.animation_data.action=action
    count=round(seconds*FPS)
    for f in range(count+1):
        t=f/count;frame=f+1;breath=math.sin(t*math.tau)
        root_z=0.;root_y=0.;bodypitch=0.;pelvis_rot=Vector();chest_rot=Vector();neck_rot=Vector();head_rot=Vector()
        offsets={n:Vector() for n in legs};foot_rots={n:0. for n in legs};paw_rots={n:0. for n in legs}
        tail_rots={i:Vector(([.015,.025,.08,.19,.30][i-1]+.012*math.sin(t*math.tau+i*.3),.024*math.sin(t*math.tau-i*.35),0)) for i in range(1,6)}
        blink=0.
        if pose_clip=='Idle':
            root_z=.0009*breath
            # The Head bone local X is opposite Neck X. Positive Head X
            # raises the muzzle toward the elevated courtyard camera.
            neck_rot.x=-.13;neck_rot.z=.018*math.sin(t*math.tau)
            head_rot.x=.25;head_rot.y=.012*math.sin(t*math.tau+.5)
            blink=max(bump(t,.17,.22),bump(t,.77,.83))
        elif pose_clip=='Walk':
            root_z=-.020+.0018*math.cos(4*math.pi*t)
            bodypitch=.008*math.sin(4*math.pi*t)
            for name in legs:
                q=(t+phases[name])%1
                if q<STANCE:
                    y=STRIDE*(q-STANCE/2);lift=0.
                else:
                    u=(q-STANCE)/(1-STANCE);a=STRIDE*STANCE/2;m=STRIDE*(1-STANCE)
                    y=(2*u**3-3*u*u+1)*a+(u**3-2*u*u+u)*m+(-2*u**3+3*u*u)*(-a)+(u**3-u*u)*m
                    lift=.029*math.sin(math.pi*u)**1.3
                offsets[name]=Vector((0,y,lift))
                foot_rots[name]=min(.13,lift*2.3);paw_rots[name]=-min(.10,lift*2)
            neck_rot.x=-bodypitch*.32-.09;head_rot.x=.17
        elif pose_clip in ('Rest','Sleep'):
            # Sternum and pelvis recline; elbows and hocks fold through IK.
            # The support paws remain attached to the floor; no model scaling.
            asleep=pose_clip=='Sleep';root_z=(-.197 if asleep else -.188)+((.025 if asleep else .032) if clip.endswith('Plush') else 0)+.0008*breath
            bodypitch=.016
            chest_rot.x=.055 if asleep else .015
            for name,cfg in legs.items():
                offsets[name]=Vector((cfg['sgn']*(.008 if cfg['fore'] else .011),-.016 if cfg['fore'] else -.038,0))
                if asleep and cfg['fore']:offsets[name]+=Vector((.11,.075,0))
            for name,cfg in legs.items():
                if not cfg['fore']:
                    fold=.35 if asleep else .30
                    control=arm.data.bones[name+'FootCtl']
                    tailvec=control.matrix_local.to_3x3() @ Euler((fold,0,0)).to_matrix() @ Vector((0,control.length,0))
                    offsets[name]+=cfg['ankle']-tailvec-cfg['wrist']
                    foot_rots[name]=fold;paw_rots[name]=-fold
            neck_rot=Vector((.78 if asleep else .09,0,-.18 if asleep else .04*breath))
            head_rot=Vector((.31 if asleep else -.035,0,-.09 if asleep else 0))
            for i in range(1,6):tail_rots[i]=Vector(([-1.65,.45,.52,.56,.52][i-1],.12,.17))
            blink=1. if asleep else max(.15,bump(t,.22,.34))
        elif pose_clip in ('Eat','Drink'):
            # Lower the shoulder girdle into a real feeding stance. Forepaws
            # spread slightly, rear feet stay planted, neck/head reach the bowl.
            root_z=-.071+.0012*math.sin(t*math.tau*3)
            bodypitch=.12;chest_rot.x=.19
            neck_rot.x=.83+.018*math.sin(t*math.tau*4)
            head_rot.x=.51+.035*math.sin(t*math.tau*(5 if pose_clip=='Drink' else 3))
            head_rot.z=.02*math.sin(t*math.tau*2)
            for name,cfg in legs.items():
                offsets[name]=Vector((cfg['sgn']*(.008 if cfg['fore'] else 0),-.018 if cfg['fore'] else .008,0))
            blink=.18
        elif pose_clip=='Groom':
            root_z=-.109+.001*breath;bodypitch=-.04
            for name,cfg in legs.items():offsets[name]=Vector((cfg['sgn']*.009,-.012 if cfg['fore'] else -.035,0))
            # A forepaw is drawn to the mouth while the other three support.
            offsets['FrontL']=Vector((-.027,-.055,.084+.006*math.sin(t*math.tau*3)))
            foot_rots['FrontL']=.56;paw_rots['FrontL']=-.42
            neck_rot=Vector((.37,0,.17));head_rot=Vector((.24+.075*math.sin(t*math.tau*3),0,.12))
            blink=.45
            for i in tail_rots:tail_rots[i]=Vector((-.15,-.28,.10))
        elif pose_clip=='Scratch':
            root_z=-.04;bodypitch=.08;neck_rot.x=.18
            for name,cfg in legs.items():
                if cfg['fore']:
                    phase=t*math.tau*3+(0 if cfg['side']=='L' else math.pi)
                    offsets[name]=Vector((cfg['sgn']*.004,-.035+.025*math.sin(phase),.008+.014*(.5+.5*math.cos(phase))))
                    paw_rots[name]=-.2*(.5+.5*math.cos(phase))
        elif pose_clip=='Play':
            root_z=-.045-.013*math.sin(t*math.tau)**2;bodypitch=.075
            neck_rot.x=.12;head_rot.z=.05*breath
            swing=math.sin(t*math.tau)
            name='FrontL' if swing>=0 else 'FrontR'
            offsets[name]=Vector((-legs[name]['sgn']*.012,-.052*abs(swing),.028*abs(swing)))
            paw_rots[name]=-.18*abs(swing)
            for i in tail_rots:tail_rots[i].y+=.08*breath
        elif pose_clip=='Pet':
            root_z=-.012+.003*breath
            chest_rot.x=-.018;neck_rot.x=-.10-.045*breath
            head_rot=Vector((-.08,0,.09*breath));blink=.82+.18*math.sin(t*math.tau)**2
            for i in tail_rots:tail_rots[i].y+=.045*breath
        else:
            # Matching sections are shared with runtime phase mapping. No world
            # movement is baked: runtime owns the parabolic root trajectory.
            up=pose_clip=='HopUp';crouch_end=.24;flight_end=.78
            if t<=crouch_end:
                q=smoothstep(t/crouch_end)
                root_z=-.068*q;root_y=.012*q;bodypitch=(-.085 if up else .060)*q
                chest_rot.x=.045*q;neck_rot.x=-.065*q
                tail_rots[1].x-=.28*q
                # All four feet remain planted through anticipation.
            elif t<flight_end:
                q=(t-crouch_end)/(flight_end-crouch_end)
                # Hind-leg extension completes after forefeet release.
                root_z=-.068*(1-smoothstep(q/.20));root_y=.012*(1-smoothstep(q/.20))
                chest_rot.x=.045*(1-smoothstep(q/.20))
                tail_rots[1].x-=.28*(1-smoothstep(q/.20))+.42*math.sin(math.pi*q)
                bodypitch=(-.085 if up else .060)*(1-smoothstep(q/.20))+(-.15 if up else .10)*math.sin(math.pi*q)
                for name,cfg in legs.items():
                    fore=cfg['fore'];release=0. if fore else .11
                    tuck_end=.62 if fore else .80
                    a=max(0.,min(1.,(q-release)/(tuck_end-release)))
                    lift=(.086 if fore else .061)*math.sin(math.pi*a)**.9 if release<q<tuck_end else 0.
                    reach=-.055*math.sin(math.pi*a) if fore else .030*math.sin(math.pi*a)
                    # Reaching front feet extend before the back feet unfold.
                    if fore and q>.50:reach-=.030*bump(q,.50,1.)
                    offsets[name]=Vector((0,reach,lift))
                    foot_rots[name]=min(.25,lift*3);paw_rots[name]=-min(.20,lift*2.8)
                    if not fore and q>.80:offsets[name].z=.010*(1-smoothstep((q-.80)/.20))
                neck_rot.x=-bodypitch*.42+(-.065+(-.085 if up else .060)*.42)*(1-smoothstep(q/.20))
            else:
                q=(t-flight_end)/(1-flight_end)
                absorb=math.sin(math.pi*q)**1.1
                root_z=-.048*absorb;bodypitch=.060*absorb;chest_rot.x=.025*absorb
                for name,cfg in legs.items():
                    # Forefeet are planted first. Hindfeet settle in first 25%.
                    if not cfg['fore']:offsets[name].z=.010*(1-smoothstep(q/.25))
                neck_rot.x=-.012*absorb
        pelvis_rot.x+=bodypitch
        track_key(arm.pose.bones['Pelvis'],frame,loc=worldloc(arm.pose.bones['Pelvis'],(0,root_y,root_z)),rot=pelvis_rot)
        track_key(arm.pose.bones['Chest'],frame,rot=chest_rot)
        track_key(arm.pose.bones['Spine'],frame,rot=(0,0,0))
        for name,cfg in legs.items():
            target_key(name,offsets[name]+Vector((0,0,-.0034 if cfg['fore'] else 0)),frame)
            track_key(arm.pose.bones[name+'FootCtl'],frame,rot=(foot_rots[name],0,0))
            track_key(arm.pose.bones[name+'Paw'],frame,rot=(paw_rots[name],0,0))
            if cfg['fore']:track_key(arm.pose.bones[name+'Scapula'],frame,rot=(0,0,0))
        track_key(arm.pose.bones['Neck'],frame,rot=neck_rot)
        track_key(arm.pose.bones['Head'],frame,rot=head_rot)
        if pose_clip=='Sleep':
            # Sleep is a tucked C-shape, not a standing silhouette translated
            # downwards. Distribute the bend across the actual spinal joints.
            for name,angle in [('Pelvis',-.08),('Spine',.52),('Chest',.46),('Neck',.43),('Head',.48)]:
                pb=arm.pose.bones[name]
                axis=pb.bone.matrix_local.to_3x3().inverted()@Vector((0,0,1))
                pb.rotation_quaternion=Quaternion(axis,angle)@pb.rotation_quaternion
                pb.keyframe_insert('rotation_quaternion',frame=frame,group=name)
        for i in range(1,6):track_key(arm.pose.bones[f'Tail{i}'],frame,rot=tail_rots[i])
        if pose_clip in ('Sleep','Rest'):
            # Curl the tail around a flank in world space, with exact bone
            # lengths. This avoids an upright rigid tail on a sleeping cat.
            directions=([(.050,.028,-.060),(.064,-.028,-.032),(.032,-.068,-.017),(-.006,-.076,-.008),(-.038,-.064,-.003)] if pose_clip=='Sleep' else
                        [(.025,.058,-.035),(.045,.048,-.028),(.060,.010,-.019),(.051,-.032,-.011),(.023,-.060,-.004)])
            bpy.context.view_layer.update()
            for i,direction in enumerate(directions,1):
                pb=arm.pose.bones[f'Tail{i}'];par=pb.parent
                wanted=Vector(direction).to_track_quat('Y','Z')
                basis=pb.bone.matrix_local.to_quaternion().inverted() @ par.bone.matrix_local.to_quaternion() @ par.matrix.to_quaternion().inverted() @ wanted
                pb.rotation_mode='QUATERNION';pb.rotation_quaternion=basis;pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
                bpy.context.view_layer.update()

        # Art can provide a head-bound eyelid via a deform bone instead of
        # object visibility; glTF then blends expressions with the action.
        if 'Eyelids' in arm.pose.bones:
            lid=arm.pose.bones['Eyelids'];lid.scale=(1,1,max(.025,1-blink*.975));lid.keyframe_insert('scale',frame=frame)
    action.use_fake_user=True
    scene.frame_start=1;scene.frame_end=count+1
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.nla.bake(frame_start=1,frame_end=count+1,step=1,only_selected=False,visual_keying=True,clear_constraints=False,clear_parents=False,use_current_action=False,clean_curves=False,bake_types={'POSE'})
    baked=arm.animation_data.action;baked.name=clip;baked.use_fake_user=True
    clipdata[clip]={'duration':count/FPS,'frames':count+1,'fps':FPS,'action':baked.name,'loop':clip not in ('HopUp','HopDown')}
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
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'courtyard-cat.blend'))

# Export selected skinned meshes and rig, with baked actions only (controller actions excluded).
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);mesh.select_set(True)
for o in attachments:o.select_set(True)
bpy.context.view_layer.objects.active=arm
for a in list(bpy.data.actions):
    if a.name.endswith('Controls'):bpy.data.actions.remove(a)
# Remove NLA to avoid duplicate tracks; action export gathers only named baked actions.
for tr in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(tr)
arm.animation_data.action=bpy.data.actions['Idle']
bpy.ops.export_scene.gltf(filepath=str(OUT/'courtyard-cat.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_anim_slide_to_zero=True,export_force_sampling=True,export_frame_range=False,export_anim_single_armature=True,export_nla_strips_merged_animation_name='Animation',export_def_bones=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_apply=False)
nose=bpy.data.objects.get('Nose')
mouth_world=(sum((nose.matrix_world@vertex.co for vertex in nose.data.vertices),Vector())/len(nose.data.vertices)+Vector((0,-.002,-.009))) if nose else v((0,-4.87,2.39))
mouth_morph_offsets={}
if nose and nose.data.shape_keys:
    keys=nose.data.shape_keys.key_blocks
    if 'MuzzleShort' in keys:
        delta=sum((a.co-b.co for a,b in zip(keys['MuzzleShort'].data,keys['Basis'].data)),Vector())/len(keys['Basis'].data)
        mouth_morph_offsets['MuzzleShort']=list(arm.data.bones['Head'].matrix_local.to_3x3().inverted() @ nose.matrix_world.to_3x3() @ delta)
manifest={
 'schemaVersion':1,'asset':'courtyard-cat.glb','status':'courtyard-full-3d-actions',
 'modelLength':.7,'cameraElevationDegrees':55,'scale':1,'groundOffset':0,
 'walkStride':STRIDE,'walkDuration':WALK_SECONDS,'stanceFraction':STANCE,
 'forwardAxis':'+Z','upAxis':'+Y','rootMotionNodes':[],
 'jumpSections':{'crouch':.24,'jump':.78},
 'mouthBone':'Head','mouthOffset':list(arm.data.bones['Head'].matrix_local.inverted()@mouth_world),'mouthMorphOffsets':mouth_morph_offsets,
 'footBones':{'frontLeft':'FrontLPaw','frontRight':'FrontRPaw','hindLeft':'HindLPaw','hindRight':'HindRPaw'},
 'clips':clipdata,'deformBoneCount':len([b for b in arm.data.bones if b.use_deform]),'vertexCount':len(mesh.data.vertices),
 'source':{'author':'JonasDichelle','conversionBy':'Antti Nuortimo','url':'https://blendswap.com/blend/18519','download':'https://raw.githubusercontent.com/nrz/ylikuutio/master/res/objects/www.blendswap.com/86110_rigged_and_animated_cat/cat.fbx','license':'CC-BY-3.0','licenseUrl':'https://creativecommons.org/licenses/by/3.0/'},
 'changes':'Original continuous body retained and restyled. Newly authored quadruped armature, heat skinning, IK controls and distinct baked in-place locomotion, recumbent sleep/rest, feeding, drinking, grooming, scratching, play, pet feedback and jump clips. No original animation was in the public FBX.',
 'notes':['World displacement and jump arc must be applied by the game, not the clips.','Control actions and muted IK constraints remain in the .blend for editing; GLB contains baked deformation joints.','Sleep, Eat and other actions are newly authored bone motion, not inferred video mocap.']
}
manifest.update(art_result.get('manifest',{}))
(OUT/'courtyard-cat.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('COURTYARD_EXPORTED',str(OUT/'courtyard-cat.glb'))
