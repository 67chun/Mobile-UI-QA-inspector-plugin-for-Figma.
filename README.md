# Mobile UI QA Inspector

Mobile UI QA Inspector 是一个面向移动端 UI 设计稿的 Figma 规范检查插件。插件会在用户选中一个 Frame 后读取该 Frame 内的图层数据，检查移动端页面中的基础 UI QA 风险，并在插件面板中输出可读的问题列表。

当前版本定位为本地运行的轻量检查工具，不接入后端服务，不上传截图，不调用 AI API，也不会直接修改 Figma 画布。

## 项目状态

当前插件已经具备以下能力：

- 读取当前选中的 Figma Frame。
- 判断 Frame 是否符合移动端 375px 宽度基准。
- 扫描 Frame 内的 Text 图层。
- 按字体 family、字重/样式、字号、具体图层四级结构展示文本图层。
- 检查文字规范问题。
- 检查基础间距问题。
- 检查圆角规范问题。
- 检查对齐规范问题。
- 支持定位具体问题图层。
- 支持忽略单条问题。
- 支持恢复单条已忽略问题。
- 支持一键恢复当前检测结果中的已忽略问题。
- 支持本地保存检查规范设置。
- 支持问题分类导航。
- 使用深色、竖向手机比例的插件面板 UI。

## 技术栈

- Figma Plugin API
- TypeScript
- 普通 HTML / CSS / JavaScript 插件面板
- esbuild
- Figma clientStorage

项目没有使用：

- React / Vue
- 后端服务
- OpenAI / 通义千问 / 其他 AI API
- 截图上传
- 网页部署

## 目录结构

```text
mobile-ui-qa-inspector/
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ manifest.json
├─ README.md
├─ scripts/
│  ├─ build.js
│  └─ watch.js
├─ src/
│  ├─ code.ts
│  ├─ ui.html
│  ├─ types.ts
│  ├─ rules/
│  │  ├─ frameRules.ts
│  │  ├─ typographyRules.ts
│  │  ├─ spacingRules.ts
│  │  ├─ radiusRules.ts
│  │  └─ alignmentRules.ts
│  └─ utils/
│     ├─ nodeUtils.ts
│     ├─ messageUtils.ts
│     ├─ settingsUtils.ts
│     └─ issueIgnoreUtils.ts
└─ dist/
   ├─ code.js
   └─ ui.html
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建插件

```bash
npm run build
```

构建完成后会生成：

```text
dist/code.js
dist/ui.html
```

### 3. 开发监听

```bash
npm run watch
```

`watch` 会监听 TypeScript 和 `src/ui.html` 的变化，适合开发阶段使用。

## 在 Figma 中加载插件

1. 打开 Figma 桌面端。
2. 进入菜单：`Plugins` -> `Development` -> `Import plugin from manifest...`
3. 选择项目根目录下的 `manifest.json`。
4. 导入成功后，在 `Plugins` -> `Development` 中运行 `Mobile UI QA Inspector`。
5. 在 Figma 画布中选中一个移动端 Frame。
6. 点击插件面板底部的「开始检查」按钮。

## manifest 配置

`manifest.json` 指向构建后的产物：

```json
{
  "main": "dist/code.js",
  "ui": "dist/ui.html"
}
```

插件设置：

- `editorType`: 仅支持 Figma。
- `networkAccess.allowedDomains`: `none`，表示插件不需要访问网络。
- `documentAccess`: `dynamic-page`。

## 插件运行流程

整体流程如下：

1. 用户打开插件。
2. `src/code.ts` 调用 `figma.showUI` 打开插件面板。
3. UI 面板请求本地设置。
4. 用户选中 Frame 并点击「开始检查」。
5. UI 发送消息：

```js
{ type: "start-inspection" }
```

6. `code.ts` 获取当前选中对象。
7. 如果未选中对象或选中对象不是 Frame，返回错误提示。
8. 如果选中的是 Frame，依次执行：

- Frame 检查
- 文本扫描
- 文字规范检查
- 间距规范检查
- 圆角规范检查
- 对齐规范检查
- 忽略问题拆分

9. `code.ts` 将结果发送给 UI：

```js
{
  type: "inspection-result",
  result
}
```

10. `ui.html` 渲染 Frame 检查结果、问题分类、问题列表、已忽略问题和文本扫描结果。

## 当前插件窗口

当前插件窗口尺寸在 `src/code.ts` 中配置：

```ts
figma.showUI(__html__, {
  width: 390,
  height: 844,
  themeColors: true
});
```

UI 面板按接近手机竖屏比例设计：

- 顶部：插件标题、使用反馈、检查状态。
- 中部：独立滚动内容区。
- 底部：固定「开始检查」按钮。

## 检查设置

默认设置位于 `src/utils/settingsUtils.ts`：

```ts
export const DEFAULT_QA_SETTINGS = {
  frameWidth: 375,
  pageHorizontalMargin: 16,
  minTinyTextSize: 10,
  smallTextWarningSize: 12,
  bodyTextReferenceSize: 14,
  spacingBaseUnit: 2,
  spacingTolerance: 1
};
```

说明：

- `frameWidth`: 移动端页面基准宽度，当前固定为 375，不在 UI 中开放修改。
- `pageHorizontalMargin`: 页面左右安全边距，用于后续边距类检查。
- `minTinyTextSize`: 最小弱化信息字号。低于该值会被视为严重可读性风险。
- `smallTextWarningSize`: 小字号提醒阈值。
- `bodyTextReferenceSize`: 正文参考字号。
- `spacingBaseUnit`: 基础间距单位，当前默认 2px。
- `spacingTolerance`: 间距误差容忍。

设置通过 `figma.clientStorage` 保存，下次打开插件仍然保留。

## Frame 检查

实现文件：

```text
src/rules/frameRules.ts
```

检查内容：

- Frame 名称
- Frame 宽度
- Frame 高度
- 子图层数量
- 页面类型判断

规则：

- 宽度等于 375，高度等于 812：标准移动端页面。
- 宽度等于 375，高度大于 812：移动端长页面。
- 宽度不等于 375：宽度基准警告。
- 宽度等于 375，但高度小于 812：信息提示。

Frame 检查只输出结果，不会修改画布。

## 文本扫描

实现文件：

```text
src/rules/typographyRules.ts
```

文本扫描会递归读取当前 Frame 内的 Text 图层，但不会进入 INSTANCE 内部。

每个文本图层会读取：

- 图层 ID
- 图层名称
- 文本内容预览
- 字号
- 字体 family
- 字体 style
- 字体完整名称
- 字重
- 文本颜色
- x / y 坐标
- width / height

文本扫描结果会按以下结构展示：

```text
字体 family
└─ 字重 / 样式
   └─ 字号
      └─ 具体文本图层
```

这样可以避免几十个 Text 图层直接平铺导致信息过载。

## 文字规范检查

实现文件：

```text
src/rules/typographyRules.ts
```

当前规则包括：

### 1. 字号风险

基于用户设置判断：

- 小于 `minTinyTextSize`：严重问题。
- 大于等于 `minTinyTextSize` 且小于 `smallTextWarningSize`：提醒问题。
- 大于等于 `smallTextWarningSize` 且小于 `bodyTextReferenceSize`：轻提示。
- 大于等于 `bodyTextReferenceSize`：不提示字号风险。

注意：插件不会简单把 10px 或 12px 判定为错误，而是使用风险提示口径。

### 2. Mixed 样式

如果单个 Text 图层内存在 Mixed 字体、字号或字重，会输出提醒。

### 3. 字体种类偏多

如果单页正常字体 family 数量大于 3，会输出整体提醒。

Mixed 不计入正常字体数量。

### 4. 字号层级偏多

如果单页不同字号数量大于 8，会输出整体提醒。

### 5. 字重种类偏多

如果同一个 fontFamily 下出现 3 种及以上正常字重，会输出整体提醒。

Mixed 不计入正常字重数量。

## 间距规范检查

实现文件：

```text
src/rules/spacingRules.ts
```

当前主要检查：

- 同父级相邻节点之间的水平 / 垂直 gap。
- 节点到父级边缘的 padding。
- Auto Layout 容器的边距和 gap。
- 非 Auto Layout 容器的边距和 gap。
- 图标按钮、圆形按钮、胶囊按钮内部图标居中关系。

基础单位：

- 默认按 2px 倍数检查。
- 10 / 12 / 14 / 16 / 18 视为符合基础单位。
- 11 / 13 / 15 / 17 / 19 这类奇数会提示。

过滤策略：

- 忽略不可见节点。
- 忽略宽高为 0 的节点。
- 忽略接近全屏的背景层。
- 忽略明显重叠关系。
- 忽略小于 2px 的贴合关系。
- 忽略大于 80px 的大模块分区间距。
- 不做所有节点两两距离扫描，只检查同父级相邻关系。

Auto Layout 特殊处理：

- 左对齐：只检查左侧边距和内部 gap，不检查右侧剩余空间。
- 右对齐：只检查右侧边距和内部 gap，不检查左侧剩余空间。
- 居中：只检查明显左右不对称。
- `SPACE_BETWEEN` / stretch：不把剩余空间当作普通间距问题。

图标按钮特殊处理：

如果父级接近圆形 / 胶囊，且内部只有一个主要图标或一个图标视觉组，则优先判断：

- 图标是否接近父级中心。
- 左右 padding 是否近似相等。
- 上下 padding 是否近似相等。

如果图标居中，即使 padding 是 5px / 7px / 9px，也不会按普通 2px 倍数报错。

## 圆角规范检查

实现文件：

```text
src/rules/radiusRules.ts
```

当前主要检查：

### 1. 同类节点圆角一致性

在同一父级下，名称或尺寸相似的普通圆角节点，如果圆角差异明显，会提示：

- 圆角关系疑似不一致。

胶囊组件会单独分组，不会和普通圆角组件混在一起比较。

### 2. 内外圆角关系

检查嵌套容器的内外圆角关系：

```text
内层圆角 ≈ 外层圆角 - 内外间距
```

如果内层圆角明显大于外层，或内层圆角明显过小导致关系断裂，会输出提醒。

过滤策略：

- 忽略不可见节点。
- 忽略 INSTANCE 节点。
- 忽略宽高为 0 的节点。
- 忽略接近全屏的背景层。
- 忽略 `cornerRadius` 为 0 的普通背景或分割层。

## 对齐规范检查

实现文件：

```text
src/rules/alignmentRules.ts
```

当前主要检查：

- 同父级下的明显左对齐错位。
- 图标与文字、按钮内文本等相邻节点的垂直中心错位。
- 同类卡片或按钮在同一行 / 同一列时的明显错位。

过滤和降噪策略：

- 忽略不可见节点。
- 忽略宽高为 0 的节点。
- 忽略接近全屏背景层。
- 忽略 Auto Layout 内部已有明确对齐方式的容器，避免重复误报。
- 不扫描所有节点两两关系，优先同父级相邻节点。
- 不把不同视觉组强行比较。
- 先按通栏 / 内容边距 / 自定义位置 / 宽度特征分组，再做对齐比较。

通栏卡片和 16px 内容卡片不会互相报左对齐问题。

## INSTANCE 扫描规则

项目中对 INSTANCE 有明确限制：

- INSTANCE 本身可以作为整体参与外部间距 / 对齐检测。
- 不递归扫描 INSTANCE 内部 children。
- INSTANCE 内部 Text / Shape / Icon / Vector 不参与 typography / spacing / radius / alignment 检测。

这样可以避免设计系统组件、状态栏、NavBar、TabBar 内部元素产生大量无效问题。

相关逻辑在：

```text
src/utils/nodeUtils.ts
```

核心原则：

```text
FRAME / GROUP / SECTION / COMPONENT / COMPONENT_SET 可以继续扫描 children。
INSTANCE 不继续扫描 children。
```

## 问题数据结构

通用问题基础结构在 `src/types.ts` 中定义：

```ts
interface InspectIssueBase {
  id: string;
  stableId: string;
  ignoreKey: string;
  ignoreKeyAliases?: string[];
  severity: "serious" | "warning" | "info";
  title: string;
  layerId?: string;
  layerName?: string;
  textPreview?: string;
  currentValue?: string;
  suggestion: string;
  detail?: string;
}
```

各类问题在此基础上扩展：

- `TypographyIssue`
- `SpacingIssue`
- `RadiusIssue`
- `AlignmentIssue`

UI 端默认展示：

- 问题标题
- 严重程度
- 涉及图层
- 当前值
- 建议
- 定位图层 / 忽略 / 详情按钮

详情内容默认折叠。

## 问题严重程度

当前支持三种问题严重程度：

```text
serious  严重
warning  提醒
info     轻提示
```

设计原则：

- 不把所有偏差都描述为错误。
- 尽量使用“风险提示”“建议确认”口径。
- 对移动端 UI 中可能合理存在的小字号、特殊间距、组件内部结构保持谨慎。

## 忽略与恢复

忽略逻辑涉及：

```text
src/code.ts
src/utils/issueIgnoreUtils.ts
src/ui.html
```

忽略记录存储在：

```text
figma.clientStorage
```

存储 key：

```text
mobile-ui-qa-inspector-ignored-issues
```

核心机制：

- 每个问题都带有稳定的 `stableId` / `ignoreKey`。
- 用户点击「忽略」后，UI 立即从主问题列表移除。
- 问题进入「已忽略问题」区域。
- `code.ts` 将对应 ignoreKey 保存到 `clientStorage`。
- 重新检查同一 Frame 时，被忽略的问题仍然保持隐藏。

已支持：

- 单条忽略
- 单条恢复
- 当前检测结果中的已忽略问题全部恢复

一键恢复不会清空全局 storage，只会逐条恢复当前检测结果中的 ignored issue key，避免误删其他 Frame 的忽略记录。

## 定位图层

具体图层问题会显示「定位图层」按钮。

点击后 UI 发送：

```js
{
  type: "focus-node",
  nodeId: "xxx"
}
```

`code.ts` 收到后：

1. 使用 `figma.getNodeByIdAsync(nodeId)` 查找节点。
2. 如果节点存在：
   - 设置 `figma.currentPage.selection = [node]`
   - 调用 `figma.viewport.scrollAndZoomIntoView([node])`
3. 如果节点不存在：
   - 返回失败提示。

整体统计类问题没有单一图层，不显示定位按钮。

## 问题分类导航

UI 中的「问题分类」区域位于 Frame 检查结果下方。

当前分类顺序：

1. Typography / 文字
2. Spacing / 间距
3. Radius / 圆角
4. Alignment / 对齐

每项显示：

- 简单字符图标
- 分类名称
- 当前未忽略问题数量
- 右侧箭头

点击分类只滚动插件内容区，不会修改 Figma 画布选择。

## UI 面板

实现文件：

```text
src/ui.html
```

当前 UI 特征：

- 深色设计工具风格。
- 轻微磨砂感。
- 紫色主强调。
- 橙色定位按钮。
- 青绿色恢复按钮。
- 底部固定「开始检查」按钮。
- 主内容区独立滚动。
- 适配 `390 × 844` 手机竖屏比例。

面板包含：

- 顶部标题区
- 使用反馈：小红书 ID 1693560303
- 检查规范设置
- Frame 检查结果
- 问题分类
- 文字规范问题
- 间距规范问题
- 圆角规范问题
- 对齐规范问题
- 已忽略问题
- 文本图层扫描结果

## 构建脚本

实现文件：

```text
scripts/build.js
scripts/watch.js
```

### build

```bash
npm run build
```

会执行：

1. TypeScript 类型检查。
2. esbuild 打包 `src/code.ts` 到 `dist/code.js`。
3. 复制 `src/ui.html` 到 `dist/ui.html`。

### watch

```bash
npm run watch
```

会执行：

- esbuild watch。
- TypeScript watch。
- 监听 `src/ui.html` 并同步到 `dist/ui.html`。

## 开发约定

### 1. 不直接修改 dist

开发时优先修改：

```text
src/code.ts
src/ui.html
src/rules/*
src/utils/*
src/types.ts
```

然后运行：

```bash
npm run build
```

`dist` 是构建产物。

### 2. 规则逻辑不要堆在 code.ts

`code.ts` 主要负责：

- UI 打开
- 接收 UI 消息
- 调用各检查规则
- 保存设置
- 处理忽略
- 定位图层
- 向 UI 返回结果

检查规则应放在 `src/rules/`。

### 3. UI 逻辑不要改检测规则

`src/ui.html` 负责：

- 面板视觉
- 用户点击
- 消息发送
- 结果渲染
- 本地即时 UI 状态更新

它不应该改变检测规则本身。

### 4. INSTANCE 内部默认不扫描

不要轻易改回扫描 INSTANCE 内部，否则状态栏、导航栏、TabBar 等系统组件会产生大量无效问题。

### 5. 问题文案保持谨慎

插件是 QA 风险提示工具，不是强制判错工具。文案应该优先使用：

- 建议确认
- 疑似不一致
- 风险提示
- 如果承担正文功能

避免使用：

- 绝对错误
- 必须修改
- 不符合规范

除非是明确的 Frame 宽度基准或严重可读性风险。

## 常见问题

### 1. Figma 导入后没有更新怎么办？

先运行：

```bash
npm run build
```

然后在 Figma 中重新运行开发插件。必要时可以移除后重新导入 `manifest.json`。

### 2. 修改了 ui.html 但 Figma 中没变化？

确保修改的是：

```text
src/ui.html
```

并运行：

```bash
npm run build
```

因为 Figma 加载的是：

```text
dist/ui.html
```

### 3. 为什么状态栏 / TabBar 内部文字不被检查？

因为它们通常是 INSTANCE 组件内部元素。插件当前刻意跳过 INSTANCE 内部 children，只检查实例整体与外部页面内容之间的关系。

### 4. 为什么 10px 字号不一定是错误？

移动端 UI 中 10px 可能用于弱化信息、辅助说明、标签、角标等低优先级内容。插件会做风险提示，但不会简单判定为错误。

### 5. 为什么圆形按钮里 7px padding 不报错？

圆形 / 胶囊 / 图标按钮会优先判断图标是否居中、上下左右是否对称。如果视觉居中，即使 padding 不是 2px 倍数，也不会按普通间距报错。

### 6. 为什么通栏卡片和内容卡片不互相比较对齐？

它们属于不同视觉类型。插件会先按宽度和边距特征分组，再在同类组内检查对齐，避免通栏和 16px 内容卡片互相误报。

## 后续规划

可以继续扩展的方向：

- 更精细的文本层级识别。
- 支持用户自定义更多规则参数。
- 页面左右边距检查的完整规则。
- 更稳定的模块分组策略。
- 更准确的图标 / 文本组合识别。
- 导出 QA 报告。
- 在 Figma 画布上生成可选标注。
- 点击问题后高亮对应列表项。
- 支持规则开关。
- 支持项目级配置导入 / 导出。

暂不建议优先做：

- AI 总结。
- 一键修复。
- 自动修改画布。
- 上传截图。
- 复杂语义判断。

当前阶段更重要的是保持规则稳定、误报可控、结果可解释。

