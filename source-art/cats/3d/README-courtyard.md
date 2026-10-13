# 庭院三维母版与完整动作

> v4.3 状态：这是显式 `?cat3d=pilot` 或 `?cat3d=all` 启用的开发预览资产。正常启动与桌面版默认使用原画猫咪；下文数值验证不表示三维外观与全部动作已经通过视觉验收。

这一版沿用 `source-cat.fbx` 的 CC BY 3.0 连续猫身网格，重新绑定四足骨架并补足庭院动作。没有引入私人验证用的 Blendkit 模型；原来的 `pilot-cat.*` 保留，方便回退。运行时毛色、品种体形由 `three-cat-appearance.js` 与 `cat_art.py` 的变形键共同完成。

## 重建和验证

在项目根目录运行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python source-art/cats/3d/prepare_cats.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python source-art/cats/3d/validate_cats.py
node source-art/cats/3d/verify_cats_export.mjs
```

`validate_cats.py -- --render` 会额外生成 `audit/` 下的正侧后及庭院角度审阅图；可用 `--only=Sleep,Eat,HopUp` 限定动作。Blender 图使用审阅材质，实际品种毛色以程序运行时为准。

输出：

- `courtyard-cat.blend`：可编辑骨架、独立 IK 控制动作、烘焙动作、品种变形键、审阅相机。
- `public/assets/cats/3d/courtyard-cat.glb`：运行模型，28 根变形骨骼，26,209 个导出顶点。
- `public/assets/cats/3d/courtyard-cat.json`：动画、支撑脚、嘴部接触点、坐标与许可数据。
- `courtyard-validation-report.json`：Blender 求值蒙皮检查。
- `courtyard-export-contact-check.json`：直接加载最终 GLB 的 Three.js CPU 蒙皮检查。
- `courtyard-export-morph-check.json`：16 个品种的默认及最大体格，在 Sleep / Rest / Walk / Eat 下共 128 项实际 GLB 接地检查。
- `courtyard-export-transition-check.json`：同样 32 种体形在入睡、醒来与休息切换中的 128 组过渡、896 个混合权重点；使用程序实际的短暂接地修正后，重新检查完整导出皮肤。
- `courtyard-export-face-check.json`：16 个品种真实导出眼部闭合与口鼻变形验证；闭眼时同时消除 EyeSize 放大，鼻部变形与食碗定位修正误差低于 0.001 mm。

## 动作语义

| 动作 | 秒 | 实际姿态与循环 |
| --- | ---: | --- |
| Idle | 4.0 | 四脚站立、细微呼吸和头部关注；循环 |
| Walk | 1.2 | 左后、左前、右后、右前依次踏步；步幅 0.24 m；支撑期 64% |
| Rest | 4.0 | 降低身体、屈肘屈跗、抬头休息、尾巴绕向体侧；循环 |
| Sleep | 4.8 | 脊柱分段侧弯成 C 形、头部靠向前爪、收腿卷尾、轻微呼吸；循环 |
| SleepPlush / RestPlush | 4.8 / 4.0 | 厚毛或大体格猫使用的支撑姿态，身体留出厚毛体积，四脚继续通过 IK 留在地面 |
| Eat | 2.4 | 肩颈和头部前低探向食碗、细微咀嚼；循环 |
| Drink | 2.0 | 更密的舔水节奏；循环 |
| Groom | 3.2 | 单前爪抬至嘴边，头部舔爪；循环 |
| Scratch | 2.0 | 两前爪交替向前抓挠；循环 |
| Play | 2.4 | 重心降低、前爪交替拨弄；循环 |
| Pet | 3.0 | 抬头轻蹭、舒缓摆尾；循环 |
| HopUp/HopDown | 0.9 | 支撑蓄力、前脚先离地、后肢蹬伸、收腿、前脚先落地、后脚跟进与落地缓冲 |

动作没有烘焙世界根位移；场景位移、草垫/平台高度和抛物线由现有游戏逻辑提供一次。跳跃的归一化分段为 `0..0.24` 蓄力、`0.24..0.78` 腾空、`0.78..1` 落地。所有导出动画从 0 秒起，避免一帧时差破坏步幅对应关系。

休息为抬头伏卧，睡眠为侧向收拢的 C 形姿态，均采用稳定低姿态循环，由运行时骨骼混合完成进入和退出，不会每圈反复躺下/站起。`CloseEyes` 是独立面部变形键，运行时根据睡眠、抚摸和眨眼状态驱动。`Head` 骨骼上的 `mouthOffset` 根据当前鼻部几何生成，可用于对齐已有食碗，不修改猫咪游戏根坐标；扁脸品种同时使用 `mouthMorphOffsets.MuzzleShort` 修正口鼻接触点。

## 当前验证的含义

最终 GLB 的四足直线路径检查：支撑期最大世界滑差约 0.022 mm，最低脚底高度误差约 0.046 mm。Blender 多动作采样检查没有非有限顶点、失控骨骼或超过 2 mm 的基础体形穿地。16 个品种的默认体格及最大体格共 128 项实际 GLB 采样均通过 2 mm 地面容差；厚毛或体格较大的猫在休息、睡眠时使用 Plush 姿态，避免为了容纳体积而抬起整个模型和脚掌。骨骼交叉混合时，原始前爪会短暂下穿约 29.2 mm；运行时只在 Sleep / Rest 切换期间按实际蒙皮最低点补偿高度，并在进入稳定动作后归零。128 组过渡的 896 个采样点通过完整皮肤复查。数值验证不能替代转弯、食碗位置与真实庭院镜头下的视觉检查。

这是依据四足运动规律手工编制、通过 IK 求解后烘焙的动作；不是自动从用户视频提取的 mocap。原作者署名、许可与源文件记录见同目录 `README.md` / `SOURCE-LICENSE.html` / `source-provenance.json`。分发时保留 `public/assets/cats/3d/ATTRIBUTION.txt`。
