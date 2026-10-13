# 电子木鱼分层美术 · 2026-10-13

## 已制作并接入

生成方式：Codex 内置 image_gen，参考用户第二张无 UI 的概念夜景。未把概念夜图直接铺进游戏。以下 PNG 为母版，WebP 为运行文件。

|文件|用途|运行文件|
|---|---|---|
|room.png|白天、中性光、全部灯火熄灭的干净禅房；保留桌面、家具、花器、香炉；移除了木鱼、软垫、木槌、手串、灯笼、月亮、烟及火光|public/assets/muyu/room.webp|
|walnut.png|独立经典胡桃木鱼，清晰木纹与雕刻|public/assets/muyu/walnut.webp|
|ebony.png|乌木细纹及深色抛光|public/assets/muyu/ebony.webp|
|jade.png|白玉内部云纹与柔和透光质感|public/assets/muyu/jade.webp|
|celadon.png|青瓷独立釉面、细开片|public/assets/muyu/celadon.webp|
|lacquer.png|朱漆光泽、独立云纹|public/assets/muyu/lacquer.webp|
|gold.png|鎏金金属与莲瓣浅浮雕|public/assets/muyu/gold.webp|
|bamboo.png|竹材层压、细纤维和竹节|public/assets/muyu/bamboo.webp|
|clay.png|暖陶哑光、矿物微孔|public/assets/muyu/clay.webp|
|pad.png|深蓝金莲软垫，独立渲染，不跟随木鱼回弹|public/assets/muyu/pad.webp|
|mallet.png|右上方皮包木槌，独立动作与固定接触点|public/assets/muyu/mallet.webp|
|lantern.png|熄灯状态的木框纸灯；点亮时只在纸面生成暖光版|public/assets/muyu/lantern.webp|
|window-bamboo.png|窗外完整竹枝，取代早期简单叶片测试绘制|public/assets/muyu/window-bamboo.webp|

八种材质分别由图像工具生成；没有用一个木鱼图加八个 CSS 色相替代。源图基本外形、视角、落脚点保持一致；透明边界经 alpha >= 32 的可见边界计算（带 2 像素外扩）后优化为最长边 1024 的运行图。`manifest.json` 记录母版尺寸、有效边界与运行尺寸。房间保持 1672×941；不进行逐帧图像读取。全部运行图约 2.5 MiB。

## 运行分层与程序效果

- 干净房间是静态层；当前光阴/灯火组合的底图只在切换状态时重新缓存，平时直接绘制缓存。
- 窗玻璃通过加载时生成的独立遮罩承载天空、竹枝、月亮、花瓣/落叶/雨/雪，窗框和室内不被天气覆盖。
- 夜晚在窗中加月亮，点亮纸面和蜡烛，并生成局部暖光、桌面反光；白天可完全不绘制这些层。
- 木鱼、软垫、槌头分别绘制；同一 sceneTransform 同时用于画面及命中。窄窗口按等比 cover 裁左右边缘，不纵向拉伸，木槌静息位置按可见边缘调整，接触点不变。
- 香烟使用多缕连续曲线及透明衰减，不是重复贴图；火苗、月光和天气本身采用程序效果。
- 字体使用已有系统中文衬线字体；自定义竖排按 grapheme 分组，emoji 组合字符不会被拆开。

## 如实区分：开发美术占位与缺口

- **手串和小蜡台实体目前为可交互的程序绘制开发美术占位。** 它们已能响应轻点/灯火，但不是与主木鱼同等级的独立写实透明素材。
- 若继续精修，缺少正式手串透明图（建议 1024×512，细珠串、侧视椭圆、完整垂穗，无桌面及投影）和未点燃小蜡台透明图（建议 512×512，青铜或黄铜托碟、白蜡/灯芯，无火焰和光晕）。
- 没有制作独立 HDR 光照或真实三维反射贴图；目前灯光是 Canvas2D 合成，四季是窗外竹枝色调和天气/花瓣变化，不是四套完整庭园照片。
- 房间中香炉为静态背景器物；香、烟及点击检测为独立层。用户未要求移动香炉，本次不虚构已经拆分香炉资产。

## 检查记录

- 已在独立 Chrome `http://localhost:5189/` 实际检查组合场景：白天没有夜图残留，窗竹只在玻璃内、夜间金色纸面和月亮独立出现；木鱼、垫、槌清晰、没有重复烘焙物件。
- 已运行几何自检：1600×900、1045×905、1920×1080、2560×1080、1440×900 五种尺寸 cover 覆盖完整，场景坐标与指针往返误差 <1e-10，固定木鱼/香炉命中通过。
- 已运行 renderer.js 的 Node 语法检查。
- 手动 100 次、自动计数、专注和跨主题回归由集成测试执行；本美术代理未宣称独立运行这些验证。

## 生成提示词记录

背景：Production game background clean plate, 16:9. Preserve dark polished walnut Zen study, carved central table and navy gold lotus cloth, left books and incense vessel, timber beams and right windows. Remove central fish, cushion, mallet, all flames, glowing lanterns, candles, smoke, gold reflections, lens flares, moon and prayer beads. No people, Buddha, statue, faces, UI, logos or letters. Blank linen scroll. Neutral daylight, no baked orange or night-blue light. Plain pale blue-gray glass for runtime seasons. Reference architecture and empty central table retained.

木鱼母体：Single isolated central wooden fish with richly grained walnut and carved front-left cloud scroll, dark curved sound slit. Same three-quarter camera and oval shape as reference, neutral studio daylight. No cushion, mallet, table, smoke, shadow plane, light ring or background. Entire object on true transparent alpha.

各皮肤的共同提示：Replace ONLY material. Preserve exact outline, proportions, camera, placement, slit and front-left carving. Independent physically credible material, not a tint. No pedestal/cushion/mallet/shadow plane/glow/text/background. 材质分别为：polished dense ebony; milky white nephrite with cloudy inclusions; blue-green celadon glaze with fine crackle; cinnabar layered lacquer; gilded metal with lotus-petal relief; laminated bamboo fiber and nodes; matte warm terracotta with mineral pores.

软垫：Isolated wide navy-blue brocade round cushion beneath the reference instrument; entire unobstructed depressed top, gold lotus embroidery, slight top-down camera, no other object/shadow plane/background.

木槌：Only the floating upper-right mallet. Leather cylindrical head upper left, pale striking face toward lower left, polished walnut handle diagonally lower right. Whole object, neutral light, clear alpha.

灯笼：Single unlit traditional dark wood/ivory paper hanging lantern, neutral daylight, front with slight right side, no glow/flame/bloom or outside haze, true alpha. 第二次修订明确要求移除边缘雾状背景、保留灯体尺寸与细节。

窗竹：Three slender bamboo stalks in a graceful coherent grove, narrow sage green leaves in full clusters, subtle atmospheric depth, no pot/ground/window/interior, true alpha; distant garden layer.
