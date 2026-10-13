"""Authored breed morphology on the CC BY continuous cat mesh.
Keeps paws and four-legged rig; no third-party restricted model content.
Runtime coats are defined in src/themes/cats/three-cat-appearance.js.
"""
import bpy, math
from mathutils import Vector

def ramp(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a))); return t*t*(3-2*t)

def apply_art(mesh, arm, attachments, helpers):
    # Original silhouette is a lean domestic cat. Round the skull/muzzle gently
    # in the shared basis, then expose additive breed shapes in meters.
    def base(p):
        x,y,z=p
        head=ramp(-.14,-.25,y)*ramp(.24,.34,z)
        # Shorten the long nasal bridge without moving the muzzle off the head.
        front=ramp(-.27,-.37,y)*ramp(.30,.36,z)
        # The reference has a compact feline muzzle, a broad forehead and two
        # whisker pads. Shape the existing connected surface, not added spheres.
        cheek=math.exp(-((y+.307)/.052)**2-((z-.414)/.048)**2)
        pads=math.exp(-((abs(x)-.019)/.018)**2-((y+.351)/.024)**2-((z-.402)/.025)**2)
        return Vector((x*(1+.20*head+.10*cheek),y+.018*front-.005*pads,z+.006*head))
    orbit_centers=[base(helpers['v']((sign*.590,-4.080,3.015))) for sign in (-1,1)]
    for vertex in mesh.data.vertices: vertex.co=base(vertex.co)
    mesh.data.update()
    mesh.name='CourtyardCatBody';mesh.data.name='ContinuousFelineBody'
    coat=mesh.data.materials[0];coat.name='Fur'
    bsdf=coat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(.67,.60,.50,1)
    bsdf.inputs['Roughness'].default_value=.95
    bsdf.inputs['Specular IOR Level'].default_value=.16
    mesh.shape_key_add(name='Basis')
    normals=[v.normal.copy() for v in mesh.data.vertices]
    points=[v.co.copy() for v in mesh.data.vertices]
    for name in ['Build','Fluff','Cheeks','MuzzleShort','EarsLarge','EarsRound']:
        key=mesh.shape_key_add(name=name);key.value=0;key.slider_min=-1;key.slider_max=1
        for i,p in enumerate(points):
            x,y,z=p; q=p.copy()
            above=ramp(.045,.16,z)
            torso=ramp(-.29,-.14,y)*(1-ramp(.24,.31,y))*above*(1-ramp(.38,.47,z))
            head=ramp(-.16,-.25,y)*ramp(.25,.36,z)
            ear=ramp(.46,.51,z)*ramp(-.15,-.23,y)
            tail=ramp(.22,.29,y)*ramp(.33,.40,z)
            eye_distance=min((p-center).length for center in orbit_centers)
            orbit_clear=ramp(.020,.055,eye_distance)
            if name=='Build':
                q.x+=x*.30*torso
                q.z-=.022*torso*(1-ramp(.24,.37,z))
            elif name=='Fluff':
                # Breed-defining long hair is concentrated at the ruff, cheeks
                # and plume. Inflating the whole torso loses those landmarks.
                ruff=math.exp(-((y+.184)/.084)**2)*ramp(.205,.28,z)*(1-ramp(.45,.51,z))
                cheek_fan=math.exp(-((y+.273)/.060)**2-((z-.407)/.060)**2)*ramp(.018,.056,abs(x))
                fur=(.005+.006*torso+.037*ruff+.025*cheek_fan+.007*head)*above
                fur*=1-.85*ear
                # Cats have short close-lying fur at the nose and lips. Growing
                # the long coat here previously buried the independent nose
                # inside the skin while the eyes stayed in their protected holes.
                bare_muzzle=ramp(-.280,-.345,y)*(1-ramp(.452,.49,z))
                fur*=1-.99*bare_muzzle
                # A full middle/tip plume tapering at the very end, not a
                # uniform tube nor the formerly pinched upper half of the tail.
                plume=.047*math.sin(math.pi*max(0.,min(1.,(z-.35)/.365)))**.70
                fur=fur*(1-tail)+plume*tail
                q+=normals[i]*fur*orbit_clear
                # A relaxed plume bends as a continuous tail instead of
                # ending in the perfectly vertical column of the base mesh.
                tip=ramp(.46,.704,z)*tail
                q+=Vector((.030*tip*tip,-.021*tip*tip,-.006*tip*tip))
            elif name=='Cheeks':
                q.x+=x*.29*head*(1-.85*ear)*orbit_clear
                q.z+=.009*head*(1-ear)*orbit_clear*ramp(.012,.042,abs(x))
            elif name=='MuzzleShort':
                face=ramp(-.24,-.36,y)*ramp(.28,.34,z)*(1-ramp(.47,.52,z))
                q.y+=.032*face;q.z+=.009*face
            elif name=='EarsLarge':
                q.z+=.027*ear;q.x+=x*.10*ear
            elif name=='EarsRound':
                q.z-=.021*ear;q.x+=x*.09*ear
            key.data[i].co=q
    names=[]
    eye_centers={}
    # Scale each entire eye assembly around the iris center. Scaling each
    # pupil around its own center makes the iris larger but leaves its gaze
    # buried in the skull. All parts share this transform and eyelid anchor.
    for side,sign in [('L',1),('R',-1)]:
        center=base(helpers['v']((sign*.590,-4.080,3.015)))
        eye_centers[side]=(center,Vector((-sign*.0025,-.009,.006)))
    for o in attachments:
        # Eye coordinates are authored in world space; keep face morph centers aligned.
        for vert in o.data.vertices:
            world=o.matrix_world@vert.co
            vert.co=o.matrix_world.inverted()@base(world)
        name=o.name
        if name.startswith(('Eye','Pupil','Glint')):
            eye_center,shift=eye_centers[name[-1]]
            for vert in o.data.vertices:
                world=o.matrix_world@vert.co
                # Wider almond opening, with restrained depth to prevent a
                # protruding toy eyeball. The upper lid supplies its silhouette.
                delta=world-eye_center
                world=eye_center+Vector((delta.x*1.45,delta.y*.90,delta.z*1.48))+shift
                vert.co=o.matrix_world.inverted()@world
        elif name.startswith('Nose'):
            # A soft inverted triangle rather than a button-like sphere. The
            # centre and depth stay unchanged, preserving the feeding anchor.
            center=sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
            for vert in o.data.vertices:
                d=vert.co-center;vert.co.x=center.x+d.x*(.64+.36*ramp(-.007,.004,d.z))
        o.data.update()
        mat=o.data.materials[0]
        mat.name='Iris' if name.startswith('Eye') else 'Pupil' if name.startswith('Pupil') else 'EyeGlint' if name.startswith('Glint') else 'Nose'
        pbsdf=mat.node_tree.nodes.get('Principled BSDF')
        pbsdf.inputs['Roughness'].default_value=.32 if mat.name in ['Iris','EyeGlint'] else .58
        o.shape_key_add(name='Basis')
        center=sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
        # All face attachments track the same breed muzzle shortening.
        k=o.shape_key_add(name='MuzzleShort');k.value=0;k.slider_min=-1;k.slider_max=1
        for i,v in enumerate(o.data.vertices):
            world=o.matrix_world@v.co
            face=ramp(-.24,-.36,world.y)*ramp(.28,.34,world.z)*(1-ramp(.47,.52,world.z))
            world.y+=.032*face;world.z+=.009*face
            k.data[i].co=o.matrix_world.inverted()@world
        if name.startswith(('Eye','Pupil','Glint')):
            k=o.shape_key_add(name='EyeSize');k.value=0;k.slider_min=-1;k.slider_max=1
            world_center=eye_centers[name[-1]][0]+eye_centers[name[-1]][1]
            for i,v in enumerate(o.data.vertices):
                world=o.matrix_world@v.co;d=world-world_center
                k.data[i].co=o.matrix_world.inverted()@(world_center+Vector((d.x*1.18,d.y,d.z*1.25)))
            k=o.shape_key_add(name='CloseEyes');k.value=0
            for i,v in enumerate(o.data.vertices):
                q=v.co.copy();q.z=center.z+(q.z-center.z)*.045;q.y=center.y+(q.y-center.y)*.045-.001
                k.data[i].co=q
            names.append(name)
    # Upper eyelids define an almond eye without a white outline. Both arcs
    # share one small skinned mesh and the existing CloseEyes morph, so sleep
    # never leaves floating open-eye rims behind.
    lid_vertices=[];lid_faces=[];lid_centers=[]
    for side,sign in [('L',1),('R',-1)]:
        center,shift=eye_centers[side];center=center+shift
        for step in range(17):
            angle=math.pi*step/16
            c=center+Vector((math.cos(angle)*.0232,-.006-.002*math.sin(angle),math.sin(angle)*.0186))
            for ring in range(4):
                a=ring*math.tau/4
                radius=.00115*(.7+.3*math.sin(angle))
                p=c+Vector((0,math.cos(a)*radius,math.sin(a)*radius))
                lid_vertices.append(p);lid_centers.append(center)
            if step:
                start=len(lid_vertices)-8
                for ring in range(4):lid_faces.append((start+ring,start+(ring+1)%4,start+4+(ring+1)%4,start+4+ring))
    data=bpy.data.meshes.new('UpperEyelidArcs');data.from_pydata(lid_vertices,[],lid_faces);data.update()
    lids=bpy.data.objects.new('UpperLids',data);bpy.context.collection.objects.link(lids)
    data.materials.append(helpers['material']('EyelidCharcoal',(.055,.047,.040,1),.92))
    for poly in data.polygons:poly.use_smooth=True
    group=lids.vertex_groups.new(name='Head');group.add(list(range(len(data.vertices))),1,'REPLACE')
    modifier=lids.modifiers.new('Head skin','ARMATURE');modifier.object=arm;lids.parent=arm
    lids.shape_key_add(name='Basis')
    k=lids.shape_key_add(name='MuzzleShort');k.value=0
    for i,vertex in enumerate(data.vertices):
        p=vertex.co.copy();face=ramp(-.24,-.36,p.y)*ramp(.28,.34,p.z)*(1-ramp(.47,.52,p.z))
        p.y+=.032*face;p.z+=.009*face;k.data[i].co=p
    k=lids.shape_key_add(name='CloseEyes');k.value=0
    for i,vertex in enumerate(data.vertices):
        p=vertex.co.copy();center=lid_centers[i]
        p.z=center.z+(p.z-center.z)*.045;p.y=center.y+(p.y-center.y)*.045-.001;k.data[i].co=p
    k=lids.shape_key_add(name='EyeSize');k.value=0;k.slider_min=-1;k.slider_max=1
    for i,vertex in enumerate(data.vertices):
        center=lid_centers[i];d=vertex.co-center
        k.data[i].co=center+Vector((d.x*1.18,d.y,d.z*1.25))
    names.append(lids.name)
    # A feline philtrum and two soft lip curves follow the muzzle surface.
    # This tiny shared head mesh makes the nose/mouth readable at game scale
    # without painting a fixed expression onto the animated body.
    mouth_vertices=[];mouth_faces=[]
    paths=[[(0,-.357,.414),(0,-.352,.403),(0,-.350,.399)],
           [(0,-.350,.399),(-.010,-.350,.395),(-.023,-.344,.401)],
           [(0,-.350,.399),(.010,-.350,.395),(.023,-.344,.401)]]
    for a,b,c in paths:
        a,b,c=Vector(a),Vector(b),Vector(c);start=len(mouth_vertices)
        for step in range(9):
            t=step/8;point=(1-t)**2*a+2*(1-t)*t*b+t*t*c
            tangent=(2*(1-t)*(b-a)+2*t*(c-b)).normalized()
            axis=tangent.cross(Vector((0,1,0))).normalized();normal=tangent.cross(axis).normalized()
            radius=.00075*(1-.30*t)
            for side in range(4):
                angle=side*math.tau/4;mouth_vertices.append(point+radius*(math.cos(angle)*axis+math.sin(angle)*normal))
            if step:
                offset=start+(step-1)*4
                for side in range(4):mouth_faces.append((offset+side,offset+(side+1)%4,offset+4+(side+1)%4,offset+4+side))
    data=bpy.data.meshes.new('FelineLipCurves');data.from_pydata(mouth_vertices,[],mouth_faces);data.update()
    mouth=bpy.data.objects.new('MouthLine',data);bpy.context.collection.objects.link(mouth)
    data.materials.append(helpers['material']('MouthUmber',(.105,.072,.060,1),.95))
    for poly in data.polygons:poly.use_smooth=True
    group=mouth.vertex_groups.new(name='Head');group.add(list(range(len(data.vertices))),1,'REPLACE')
    modifier=mouth.modifiers.new('Head skin','ARMATURE');modifier.object=arm;mouth.parent=arm
    mouth.shape_key_add(name='Basis');k=mouth.shape_key_add(name='MuzzleShort');k.value=0
    for i,vertex in enumerate(data.vertices):
        p=vertex.co.copy();face=ramp(-.24,-.36,p.y)*ramp(.28,.34,p.z)*(1-ramp(.47,.52,p.z))
        p.y+=.032*face;p.z+=.009*face;k.data[i].co=p
    # Six fine tapered whiskers share the head skin. They are real curves in
    # the editable source, reduced to a small mesh for the runtime GLB.
    whisker_vertices=[];whisker_faces=[]
    for sign in (-1,1):
        for row in range(3):
            p0=base(Vector((sign*.026,-.348,.401+row*.004)))
            p1=Vector((sign*(.072+row*.002),-.356+row*.011,.408+(row-1)*.010))
            p2=Vector((sign*(.124-row*.009),-.359+row*.023,.401+(row-1)*.025))
            start=len(whisker_vertices)
            for k in range(7):
                t=k/6;center=(1-t)**2*p0+2*t*(1-t)*p1+t*t*p2
                tangent=(2*(1-t)*(p1-p0)+2*t*(p2-p1)).normalized()
                across=tangent.cross(Vector((0,0,1))).normalized();up=tangent.cross(across).normalized()
                radius=.00065*(1-.94*t)
                for j in range(3):
                    angle=j*math.tau/3
                    whisker_vertices.append(center+radius*(math.cos(angle)*across+math.sin(angle)*up))
                if k:
                    for j in range(3):
                        a=start+(k-1)*3+j;b=start+(k-1)*3+(j+1)%3;c=start+k*3+(j+1)%3;d=start+k*3+j
                        whisker_faces.append((a,b,c,d))
    data=bpy.data.meshes.new('TaperedWhiskers');data.from_pydata(whisker_vertices,[],whisker_faces);data.update()
    whiskers=bpy.data.objects.new('Whiskers',data);bpy.context.collection.objects.link(whiskers)
    data.materials.append(helpers['material']('WhiskerIvory',(.69,.68,.60,1),1))
    for poly in data.polygons:poly.use_smooth=True
    group=whiskers.vertex_groups.new(name='Head');group.add(list(range(len(data.vertices))),1,'REPLACE')
    modifier=whiskers.modifiers.new('Head skin','ARMATURE');modifier.object=arm;whiskers.parent=arm
    whiskers.shape_key_add(name='Basis')
    short=whiskers.shape_key_add(name='MuzzleShort');short.value=0
    for i,vertex in enumerate(data.vertices):short.data[i].co=vertex.co+Vector((0,.025,.007))
    return {'attachments':[whiskers,lids,mouth], 'eye_open_objects':names, 'manifest':{
        'appearanceMaterials':{'fur':['Fur'],'eyes':['Iris'],'nose':['Nose']},
        'morphNames':['Build','Fluff','Cheeks','MuzzleShort','EarsLarge','EarsRound','EyeSize','CloseEyes'],
        'art':'16 authored procedural coats, additive continuous-body breed morphs; original portraits remain the art reference',
        'coatCoordinates':'glTF rest position: X lateral, Y up, Z forward; length .7m',
    }}
