# 电子木鱼小道具材质修订 v2

日期：2026-10-13。内置 image_gen；沿用用户无 UI 概念图作为风格与视角参考。未改变房间构图，未覆盖 v1 母版或运行文件。

## 新制作的四项独立透明素材

- `beads-v2.png` → `public/assets/muyu/beads-v2.webp`：真实深棕木纹手串、绳结与垂落丝穗。替换程序规则圆点及细线丝穗。
- `candle-v2.png` → `public/assets/muyu/candle-v2.webp`：暖铜莲纹蜡碟、天然蜡面与黑色灯芯，完全未点燃，无火焰和背景光晕。
- `lantern-table-v2.png` → `public/assets/muyu/lantern-table-v2.webp`：右侧带短底座、支脚的古典纸灯，不再使用悬空吊灯。未点亮纸面，适合独立暖光合成。
- `incense-v2.png` → `public/assets/muyu/incense-v2.webp`：三根细竹香、自然细粉纹理及灰白燃烧端。无烟、无橙色发光球。

透明 PNG 中透明像素存在 RGB 底色是生成器行为，其 alpha 为 0，运行合成应尊重 alpha；不能把该 RGB 直接合成成光晕。运行图由 alpha >= 32 的有效边界外扩 2px 后等比缩小到最长边 1024，保留半透明边缘，不做色相换肤或实体重绘。

`manifest-v2.json` 记录源尺寸、有效边界、运行尺寸、归一化锚点、运行像素锚点、建议场景布局。运行集成由主代理完成，本文件不宣称已经验证桌面版构建。

## 对齐说明

- 手串的 `frontTableEdge` 对齐桌缘，串的上部压在桌面，丝穗向下垂在桌前；不要把整个图压扁以匹配旧代码的珠串椭圆。集成布局建议为 x=270,y=578,w=180,h=175，珠圈前缘约 y=649，对齐桌边 y=650。
- 蜡台的 `wickTip` 是火焰底部，不是蜡块几何中心。铜碟底部接触阴影应很小；灯灭时火焰、亮点及反光都停止。
- 新右灯为台灯，底脚放在真实右后台阶/边柜顶，背景复核后建议 scene foot=(1250,514)（该处水平踏面约 y=496–523）；旧估值 y=529 在立面附近，应弃用。可在脚底 (1250,513) 绘制 rx=30,ry=4 的轻薄接触阴影。不能继续使用吊线或悬挂摆动。纸面三个 polygon 已提供，可只对纸面暖化/发光，保留木框自然暗度。
- 后左背景香炉本身已是同风格精细器物，无需换整张房间。旧坐标 `INCENSE.y=472` 指向炉身，并非炉口；根据 room.png 提议插入点 scene≈(409,425)。前三根竹香末端需要有约 6–10% 插入炉口，并由背景前沿裁片遮挡；建议前沿遮挡区间 scene y≈425–433，仅覆盖香根。烟从各自 `tips` 起始，不能三缕烟都从同一高度生出。建议整体可见约 19×106 scene px。
- 上述场景坐标是从背景图视觉量测的接入建议，实际落脚与烟/火接触仍需在集成画面验证。

## 最终提示词摘要

1. 手串：photorealistic premium game prop for dark walnut Zen room; dark reddish-brown sandalwood bracelet in naturally irregular overlapping wide oval, real fine wood grain and worn satin gloss, ~22 beads; front-left knot and long loose silk tassel over table edge; same slight top-down camera, warm-neutral upper-right light; true transparent alpha, no surface/glow/labels.
2. 蜡台：one small realistic tabletop votive; shallow aged warm bronze lotus saucer with rolled rim and short foot, natural ivory beeswax stump with concave top and single charred black wick; UNLIT, no flame/smoke/glow; same three-quarter camera; clear alpha, no surface/shadow plane.
3. 台灯：classical dark walnut hexagonal paper lantern, ivory unlit paper, low pagoda roof, NO hanging hook; SHORT solid pedestal and small feet; neutral daylight, complete silhouette, true alpha, no floor/room/glow/text.
4. 竹香：exactly three slender bamboo-core sticks, fine light-brown matte powder, near parallel with subtle irregularity and different tip heights; short gray-white burned ash at tips with dark carbon boundary; no orange LED glow, no flame/smoke; bare bamboo at bottom for insertion, aligned bases; true alpha, no censer or ash pile.

## 已检查与待验证

- 已视觉检查四张生成物件；全部完整、符合独立素材和未点燃要求。
- 已检查四图均为 RGBA，alpha 范围包含 0 与 254/255，四角透明，运行有效边界合理。
- 未修改 renderer、geometry、场景状态或其他主题。
- 等待主代理完成实际组合对齐、日夜切换、烟火锚点和桌面构建验证；素材制作完成不等于以上测试已运行。
