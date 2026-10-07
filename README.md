# HITA For Watch

HITA 的轻量级手表端初版，支持**矩形与圆形屏幕自动布局**，以 **HUAWEI WATCH FIT 5 Pro（竖屏 408 × 480）**和 **WATCH GT 6 Pro（圆屏 466 × 466）**作为适配参考。工程使用 HarmonyOS 6.1.0（API 23）的 liteWearable SDK；真实型号的固件兼容性与安装资格仍需确认。手机负责教务登录、编辑和刷新课表；手表负责接收并离线查看。

**本次屏幕适配及之前的鸿蒙互联入口均只修改手表工程，没有修改任何手机端 HITA 项目。** 原生鸿蒙指 HarmonyOS 5.0 及之后版本（NEXT）；HarmonyOS 2/3/4 上运行的安卓 APK 仍选安卓配置。手机端导出课表、收发协议和同步入口留待之后接入，当前不能直接与未适配的手机 HITA 同步。

## 当前完成

- 顶部选择本周一至周日，默认今天，也可左右滑动切换日期。
- 按时间展示当天课程、考试及日程。完整显示课程名称、起止时间、教室和教师；课程显示节次，考试不显示节次。
- 当前课程高亮，显示进行中、已结束及当天待开始课程的倒计时。
- 通过 `@system.device.getInfo` 读取窗口宽高和 `screenShape`，自动计算方屏/圆屏的内容宽度、日期栏、滚动区及安全留白，不按型号写死布局，也不把正方形分辨率误判成圆屏。
- 黑底、高对比文字。课程标题 27px，时间 23px，地点/教师 22px，字体不随屏幕缩小；长内容按实际宽度换行，课程和同步详情均可纵向滚动。
- 手表主动请求同步、手机主动发送；安卓与鸿蒙沿用同一套分片、重试、完整性校验及保存后确认协议。
- 独立保存安卓和鸿蒙身份配置，构建时选择对端；鸿蒙使用 AGC APP ID，安卓使用签名证书 SHA-256，不混用。
- 同步页面区分“等待鸿蒙手机”和“等待安卓手机”；未配置、手机未回应、退出前台均不会误报同步成功。
- 两份轮换缓存。中断、无效数据、旧版本数据或写入失败不会直接覆盖原课表。
- 首次启动没有虚构课程；已同步的空课日与尚未同步的日期分开显示。

**这是可编译的设备工程，不只是网页设计稿。** 浏览器预览额外读取相同的 HML、CSS 和业务逻辑，使用模拟通信；其演示数据不打包进手表应用。

## 当前边界

1. **不能直接与尚未接入的鸿蒙版或安卓版 HITA 通信。** 鸿蒙后续接入约定见下文；已有 `android-bridge` 保留 Wear Engine 收发适配器、可靠发送逻辑与数据转换示例。没有改动、构建或打包任何手机项目。
2. 默认选择鸿蒙配置，但真实手机包名、AGC APP ID、安卓证书指纹以及手表签名均未配置。手表显示“鸿蒙手机待接入”；改选未配置的安卓档后显示“安卓手机待接入”。没有猜测包名或填入虚构身份。
3. 未连接真实 FIT 5 Pro 或 GT 6 Pro 完成安装和蓝牙联调；API 编译通过不能代替设备安装、SDK 授权和配对验证。FIT 5 Pro 官网标注的 HarmonyOS 6 不足以证明每个固件都支持本工程的 API 23。
4. 初版要求两端应用在前台进行同步，不承诺后台自动刷新、闹钟、通知、表盘组件或表冠操作。
5. 当前只查看当周；手机示例导出当前周及下一周，离线跨周后有数据可继续显示。超过保存范围会提示同步，不会错误显示“无课”。
6. 暂定手表包名 `cn.berry.hita.watch`，应用名 `HITA`，版本 `0.1.0`。申请手表 App ID 时确认此包名，勿混用手机 HAP 的签名配置。

## 方圆屏自动适配

同一份手表源码和构建产物根据设备信息选择布局，无需为每个分辨率各维护一套页面：

| 参考设备/测试尺寸 | 窗口宽 × 高 | 形状 |
| --- | --- | --- |
| WATCH FIT 5 Pro | 408 × 480 | 矩形 |
| WATCH GT 6 Pro | 466 × 466 | 圆形 |
| 小圆屏测试 | 390 × 390 | 圆形 |
| 窄矩形测试 | 336 × 480 | 矩形 |
| 正方形测试 | 400 × 400 | 矩形 |

布局集中在 `common/display-layout.js`。矩形屏充分利用横向空间并保留边距，圆屏保留顶部和底部安全空间；课程行按文字长度计算高度，同步页内容超出屏幕时可滚动。系统未返回可靠信息时先使用保守的 466 × 466 圆屏布局。不会仅凭“宽等于高”判断屏幕是圆形。

**屏幕通用不等于系统平台通用。** 本工程仍是 `liteWearable`，不是全智能手表的 ArkUI/Stage 工程；型号的应用生态、最低系统 API、原生通信模块与签名安装要求也必须兼容。此次没有降低 API 23、修改包名或变更手机通信协议。

## 用 DevEco 打开

直接打开 `C:\heyiwei\HITA_For_Watch` 目录，等待 Hvigor 同步。目录名不含空格；若 DevEco 最近项目仍指向旧目录，请从新路径重新打开。工程采用 **FA / liteWearable / JS + HML + CSS**，目标 SDK `6.1.0(23)`。

本机使用 DevEco 自带 SDK 编译成功；SDK 安装包版本为 `26.0.0.105`，产品兼容/目标版本均设置为 API 23。不要为了使用新接口而把目标设备改为普通手机或智能手表。

PowerShell 命令行：

```powershell
$env:NODE_HOME = 'C:\Program Files\nodejs'
$env:DEVECO_SDK_HOME = 'C:\Program Files\Huawei\DevEco Studio\sdk'
& 'C:\Program Files\Huawei\DevEco Studio\tools\hvigor\bin\hvigorw.bat' --mode module -p product=default assembleHap --no-daemon
```

未签名产物：

```text
entry/build/default/outputs/default/entry-default-unsigned.hap
```

此文件**不能当成已签名测试包**。当前未配置签名，不能假定已经生成可安装的轻量级签名 BIN。真机安装前需按华为轻量级穿戴设备调试流程配置自己的设备、应用身份和签名；不要向手机模拟器安装这个 HAP。

### 官方预览启动与交互

2026-10-06 已修复两项正式工程问题：根目录 `package.json` 的 `"type": "module"` 会使本机 Lite 编译器遗留未打包的 `require(...)`；轻量级 JS 引擎不支持正则表达式，原来的身份、日期及协议校验会在解析阶段失败。现在移除了该模块配置，并使用字符校验保留原有类型、长度和字符限制。**不要重新添加 `"type": "module"`，也不要在手表源码中使用正则字面量或 `new RegExp()`。**

同日继续修复了“能显示页面但点击日期失效”：原实现每次选择日期、每 15 秒刷新时都会整体替换 `days`，重建原生日期控件。现在同一周内只更新现有对象的字段，保留点击目标；跨周才替换数组。源码仍位于 `MainAbility/pages/index`，项目名、页面路由、应用身份均未改动。未配置手机身份时，点击“同步课表”会明确提示“请先完成手机端接入配置”。

若 DevEco 还停留在之前失败的预览：

1. 停止旧运行会话，关闭旧预览面板；项目保持为 `HITA_For_Watch`。
2. 清理并重新构建，然后运行 `entry` 的 **liteWearable** 预览。预览 FIT 5 Pro 布局时选择矩形（`rect`），窗口宽 **408**、高 **480**，密度参考 **328 dpi**。不必等待 IDE 提供同名型号，不要切换成手机或全智能手表设备类型。
3. 若仍复用旧会话，关闭并重新打开该工程后再次运行，不需要先重装 SDK。

关闭旧预览后也可在工程根目录运行：

```powershell
$env:NODE_HOME = 'C:\Program Files\nodejs'
$env:DEVECO_SDK_HOME = 'C:\Program Files\Huawei\DevEco Studio\sdk'
& 'C:\Program Files\Huawei\DevEco Studio\tools\hvigor\bin\hvigorw.bat' --mode module -p product=default -p buildMode=debug clean assembleHap --no-daemon
npm run check:native
npm run test:native
```

`check:native` 检查**正式工程的构建产物**：使用 SDK 的 JerryScript 解析器检查语法，再验证依赖已打包且能创建 ViewModel。`test:native` 默认按 **FIT 5 Pro 的 408 × 480 矩形**在 Windows 上直接启动 SDK 的官方 `Simulator.exe`，通过原生命令通道执行日期点击、返回今天、打开同步页、请求同步、返回和横向滑动；等待 17 秒后再连续两轮点击七天，并检查每次屏幕实际变化。日志、命令、内存回报和截图位于 `artifacts/native-preview/<时间戳>-<设备>/`。测试使用独立的可写工作目录和 SDK 字体，不修改正式缓存、源代码、IDE 配置或 SDK 安装文件，结束后停止自己启动的模拟器。它不是蓝牙通信或真机安装测试。

```powershell
# 使用真实存储读取链路加载测试课表，检查长课程和同步详情滚动
npm run test:native -- --device fit5-pro --courses
npm run test:native -- --device rect336
# 本机 SDK 的圆屏形状接口有缺陷，圆屏回归须显式标记形状模拟
npm run test:native -- --device circle390 --courses --mock-shape
npm run test:native -- --all --mock-shape
```

`--courses` 仅向本次测试的隔离缓存写入虚构课表，不向正式应用打包演示数据，也不是手机同步测试。验证会检查原生 `HITA_CACHE_READY` 日志中的课程数量。

**本机 Windows Lite SDK 即使传入 `-shape circle`，`device.getInfo` 仍返回 `screenShape: "rect"`。** 因此圆形预览可能采用矩形布局，这是设备信息模拟的限制，不应据此把所有正方形窗口强行当成圆屏。`--mock-shape` 只在测试目录复制的构建产物中覆盖该字段，日志和 `result.json` 会明确标记；正式源码、构建产物和 SDK 不受影响。圆屏测试证明布局和交互可用，不证明真机形状检测已完成验收。

本次有课表的原生测试还修复了三个之前空白状态没有触发的问题：Lite 引擎没有 `String.replace`，日期显示现改用兼容格式化；原生列表子项需要显式高度，否则课程可能不显示；本机原生存储每次只读至多 128 字节，缓存现按 UTF-8 分为不超过 120 字节的小片段，并支持更高片段数。两份轮换缓存及完整性校验保留，手机传输协议不变；无法读取完整旧分片时不会把不完整数据当成有效课表，需重新同步。

**若 DevEco 内显示“无法读取课表”或“课表存储未就绪”，这是另一个环境问题，不代表点击事件失效。** 本机 SDK 装在 `C:\Program Files\Huawei\DevEco Studio\sdk`，Lite 模拟器会在自己的工作目录下创建 `file_system\app\ace\data\entry\kvstore`。该目录不可写时，存储接口返回 `System error / 200`；仅开启预览文件操作不能解决目录权限。已用同一模拟器、同一正式构建在可写目录验证：缓存初始化成功，页面显示正常的“鸿蒙手机待接入”。

在 DevEco 内解决此问题，应通过 SDK 管理将 SDK 放到当前用户可写的目录，并让工程使用该 SDK；也可由管理员仅为模拟器的 `bin\file_system` 缓存目录配置当前用户的修改权限。不要给整个 `Program Files` 放开权限，也不要靠吞掉存储错误、重置缓存来绕过。命令行 `test:native` 已自动隔离工作目录，不需要管理员权限。

Debug 的未压缩页面仍可能显示 `bigger than 48 KB`，本机模拟器明确允许此情况；它不是此次崩溃原因。设备打包使用 SDK 自带的 release 压缩和字节码生成流程：

```powershell
& 'C:\Program Files\Huawei\DevEco Studio\tools\hvigor\bin\hvigorw.bat' --mode module -p product=default -p buildMode=release clean assembleHap --no-daemon
```

本轮 release 页面 JS 为 **45,403 字节**，字节码为 **38,460 字节**，均低于 48 KiB。Debug/release 共用输出目录，切换构建模式会覆盖上一次产物；签名配置仍需另行完成。

`inspector preview does not support current device type` 是检查器能力提示，不代表 liteWearable 页面不能预览。`No signingConfig found` 影响签名安装，不是本地预览启动的前置条件。Node 测试出现 `MODULE_TYPELESS_PACKAGE_JSON` 时也不要按提示给工程加回 `"type": "module"`；Node 22.15+ 可识别源码中的 ES 模块语法，该提示不影响测试结果。

## 安卓端接入

完整步骤和 Kotlin 接入示例见 [安卓同步接入说明](docs/android-integration.md)。

关键步骤：

1. 在安卓项目引入 `android-bridge` library 模块及华为 Maven 仓库。
2. 按 Wear Engine 接入要求配置实际安卓包名、签名身份及开发者侧所需权限；手机安装运动健康并完成与 GT 6 Pro 的配对。
3. 向手表工程写入 **安卓 APK 的包名和签名证书 SHA-256 指纹**，同时选中安卓构建配置：

```powershell
node scripts/configure-pairing.cjs --platform android cn.limpu.hita YOUR_ANDROID_CERT_SHA256
```

脚本同步修改配置档、手表 `supportLists` 和 `common/pairing.js`。旧的双参数命令仍按安卓处理。指纹可以带冒号，不能填 MD5、密钥密码或公钥正文。

4. 安卓 `WearEngineLink` 配置手表身份；旧桥接库目前仍校验 SHA-256，目标轻量级设备若要求公钥形式的指纹，须先完成桥接库适配。详见 [安卓接入说明的身份限制](docs/android-integration.md#先确认身份)，不能把两端身份填反。
5. 打开两端应用，选择已连接设备后发送实际课表。仅在手表校验并保存后，安卓 `complete()` 才表示成功。

不需要单独搭建服务器；不传教务密码、Cookie、学号、姓名或访问令牌。

## 鸿蒙端互联

完整身份说明、手机端待办和验收步骤见 [鸿蒙互联接入说明](docs/harmonyos-integration.md)；消息格式见 [同步协议](docs/sync-protocol.md)。

拿到**鸿蒙手机应用的实际 bundleName 和 AGC APP ID** 后，在本目录运行：

```powershell
node scripts/configure-pairing.cjs --platform harmonyos YOUR_PHONE_BUNDLE_NAME YOUR_AGC_APP_ID
npm run check
```

命令中的两个 `YOUR_...` 必须替换为真实值。APP ID 是 AGC“项目设置 > 常规 > 应用”中的数字字符串，**不是**手机签名证书 SHA-256、`appIdentifier` 或手表 APP ID。脚本保留另一平台的配置，不会读取或修改手机项目。

已经配置过的身份可以切换：

```powershell
node scripts/configure-pairing.cjs --select harmonyos
node scripts/configure-pairing.cjs --select android
```

每次修改或切换后都要重新构建、签名和安装手表包。**这是构建时单对端选择，不是运行时自动识别或同时连接两台手机。** `pairing-profiles.json` 保留两个平台的公开身份，HAP 只携带所选对端。未配置的档位不会沿用上一端的白名单。

后续鸿蒙手机接入 `@kit.WearEngine`，使用本协议的 UTF-8 消息与手表通信；默认 `transformLocalAppInfo: false`，直接匹配鸿蒙身份，不依赖安卓开发者或安卓应用身份映射。手表继续使用 API 23 的轻量级 SDK，不引入仅 API 24 起支持的 `WearEngineLite`。

## 预览与验证

逻辑测试使用 Node.js 22.15+ 的模块测试钩子，本机验证版本为 Node.js 24。

```powershell
npm install
npm test
npm run check
npm run preview
```

浏览器打开 `http://127.0.0.1:4187`，默认显示 FIT 5 Pro 矩形布局，也可使用 `?device=fit5-pro`。工具栏可切换上述五种尺寸；切换不会丢失当前演示课表。右侧可以同步虚构课程、清空预览缓存、模拟中断和导入协议 JSON。这些操作只作用于浏览器缓存，浏览器缩放表壳以适应页面不代表应用在缩小字号。

本机附加检查：

```powershell
.\scripts\verify-android.ps1
node scripts/check-native-template.cjs
$env:NODE_PATH = 'C:\Users\samerberry\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node scripts/verify-preview.cjs
```

安卓检查脚本下载固定版本 SDK 到系统临时目录，用 Java 编译检查 API，并将真实 Java 发送器接到真实 JS 接收器验证传输及丢包重试。它**不是安卓 APK 构建或蓝牙真机测试**。浏览器检查使用本机 Edge 和 Playwright，截图输出到被忽略的 `artifacts`。

2026-10-06 方圆屏适配验证：**57 项自动化测试、项目配置检查、原生 HML 检查、五种设备尺寸的桌面/390px 浏览器检查，以及 API 23 debug/release `assembleHap` 均通过。** FIT 5 Pro 尺寸的 debug/release 正式构建均通过带课表的原生点击、长课程滚动、同步返回和定时刷新回归；336 × 480 窄矩形也通过带课表检查。390 × 390 圆屏采用上述显式形状模拟通过相同交互检查，不把这一结果当成真机检测验证。

新增测试覆盖矩形尺寸、方屏与圆屏区分、设备信息失败与迟到回调、长文本高度、Lite 日期格式化及缓存小分片；原有的日期控件稳定性、身份配置、同步协议、前台超时与回调隔离测试保留。

鸿蒙测试没有连接真实手机，也没有构建手机 HAP；手表产物仍未签名。这些检查不能代替 SDK 接入申请、手表签名与 FIT 5 Pro / GT 6 Pro 实机验收。

## 目录

| 路径 | 内容 |
| --- | --- |
| `entry/src/main/js/MainAbility/pages/index` | 原生手表界面 |
| `entry/src/main/js/MainAbility/common` | 日期、课表、缓存和同步逻辑 |
| `entry/src/main/js/MainAbility/common/display-layout.js` | 根据窗口尺寸和形状计算布局 |
| `entry/src/main/js/MainAbility/vendor` | Huawei Wear Engine 轻量级 JS SDK |
| `android-bridge` | 安卓库模块和 HITA 事件转换示例 |
| `pairing-profiles.json` | 安卓/鸿蒙公开身份和当前构建平台，不随 HAP 发布 |
| `scripts/configure-pairing.cjs` | 配置或切换对端，同步维护手表身份和允许清单 |
| `scripts/check-native-runtime.cjs` | 正式产物的 Lite 语法及依赖打包检查 |
| `scripts/verify-native-preview.cjs` | Windows 官方模拟器多尺寸交互、缓存课表读取与截图检查 |
| `preview` | 共享界面资源的浏览器测试工具，不随 HAP 发布 |
| `tests` | 测试与虚构课表，不随 HAP 发布 |
| `docs` | 接入、协议与设备验收说明 |

SDK 选择、来源及许可见 [参考资料](docs/references.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。
