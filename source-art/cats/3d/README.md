# 四足猫三维动作样板

当前状态：真实骨骼蒙皮的技术/动作试验资产，**尚未作为所有猫咪的正式美术替换**。原图、所有品种、完整睡姿/进食/转身动作仍待制作与逐个视觉验收。本资产没有把 Idle 重命名成未实现的睡觉动作。

## 重建

在项目根目录执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python source-art/cats/3d/prepare_pilot.py
```

已在 Blender 5.2.2 LTS 实际执行。输入 `source-cat.fbx`，输出：

- `source-art/cats/3d/pilot-cat.blend`：连续猫身、28 根变形骨骼、四足 IK 控制骨、热权重、可编辑控制动作、烘焙动作和审阅相机。
- `public/assets/cats/3d/pilot-cat.glb`：仅运行所需猫网格、眼鼻网格、蒙皮、烘焙动作。
- `public/assets/cats/3d/pilot-cat.json`：尺度、步幅、脚骨名称、动作和许可元数据。

为了直接播放烘焙动作，`.blend` 中 IK/脚掌姿态约束默认 mute。若编辑 `*Controls` 控制动作，先启用这些约束；烘焙动作播放时再次 mute，避免重复求解。原始 FBX 没有骨骼或动画，当前骨架、蒙皮与动作是本次新建，并非从素材中假定存在。

## 接地验证

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python source-art/cats/3d/validate_pilot.py
```

该检查实际求值蒙皮后脚掌顶点，验证支撑期足底高度、抵消根速度后的脚掌滑差、关节弯曲范围及 GLB 中真实骨骼/动作。结果写入 `validation-report.json`。这只覆盖几何和导出正确性，不能替代正常速度、慢放及正侧背视的视觉验收。

## 坐标与动作

Blender `-Y` 为前，`+Z` 为上；导出 glTF 后 `+Z` 为前，`+Y` 为上。模型前后长约 0.7m，最低原始脚掌面为 Z=0。相机建议俯角 55 度，实际由现有庭院投影校准。

`Idle`、`Walk`、`HopUp`、`HopDown` 均为 in-place，没有场景全局行走/跳跃位移。跳跃世界位移由游戏层提供。Walk 周期 1.2s，步幅 0.24m，支撑期 64%；支撑脚在模型局部向后反移，以抵消正确速度下的世界前进。四足触地顺序为左后、左前、右后、右前。前腿肩/肘/腕/爪与后腿髋/膝/跗/爪均为独立骨链。

这是手工依据四足步态原理编制的 IK 动作，不是从用户视频自动提取的 mocap 数据。模型不是由用户原画重建，其轮廓与现有手绘猫不同，毛色和材质仍是暖灰色审阅材质。尚未包含毛发、完整表情、真实睡姿、进食、抓板、爬架动作。

## 原始来源与许可

- 原作者：JonasDichelle，**Rigged and animated Cat**。
- 原作者页：https://blendswap.com/blend/18519
- 许可：Creative Commons Attribution 3.0 Unported (CC BY 3.0)。
- 许可全文：https://creativecommons.org/licenses/by/3.0/
- 本次母网格来源：Antti Nuortimo 在 Ylikuutio 项目公开再分发的 FBX 转换。
- 下载：https://raw.githubusercontent.com/nrz/ylikuutio/master/res/objects/www.blendswap.com/86110_rigged_and_animated_cat/cat.fbx
- `SOURCE-LICENSE.html` 与 `source-provenance.json` 保存原始许可和 SHA-256。
- Ylikuutio 的软件代码许可证不适用于这里单独标注 CC BY 3.0 的猫模型。

改动：保留原作者连续猫身网格；缩放与落脚对齐；新建真实四足骨架、热权重、IK 控制及烘焙动作；补充绑定到头骨的眼/鼻网格；替换暖灰材质。发布资源必须同时携带 `public/assets/cats/3d/ATTRIBUTION.txt`。
