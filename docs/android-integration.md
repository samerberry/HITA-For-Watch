# 安卓手机接入

## 先确认身份

本页只说明 Android（以及运行安卓 APK 的旧鸿蒙系统）接入 GT 6 Pro / API 23 的路径。原生鸿蒙手机见 [鸿蒙互联接入说明](harmonyos-integration.md)。本次没有修改任何安卓或鸿蒙手机 HITA 仓库。

`cn.limpu.hita` 来自工作区安卓版 `applicationId`，实际打包时以最终 APK 为准。如果使用带 `.debug` 后缀的调试包，包名和指纹都必须匹配对应 APK。

双方核对：

| 配置位置 | 应填内容 |
| --- | --- |
| 手表 `common/pairing.js` | 安卓包名、安卓签名证书 SHA-256 |
| 手表 `config.json` 的 `supportLists` | 安卓包名:安卓签名证书 SHA-256 |
| 安卓 `WearEngineLink` 构造参数 | 手表包名、手表签名证书 SHA-256 |

**旧桥接库身份限制：** 上表最后一行描述的是现有 `android-bridge` 构造器的 SHA-256 校验，并非对所有手表的通用指纹规则。2026-10-06 核对的华为文档要求 HarmonyOS 5+ 轻量级设备使用 `手表包名_base64Encode(签名证书公钥)`。原安卓桥接库本次未修改；若目标设备要求该格式，后续安卓接入时需先更新其身份校验与配置，不能将公钥指纹截断/哈希成 64 位或宣称已经真机互通。原生鸿蒙手机的后续接入应直接遵循新文档，不复用这个 Java 构造器。

以上都是公开身份，不是密码。指纹变化后要更新对端并重新构建。禁止把签名私钥、密码、教务 Cookie 放进协议或 Git。

手表工程现在默认为鸿蒙档；接入安卓前先运行 `node scripts/configure-pairing.cjs --platform android <安卓包名> <安卓SHA256>`，或选择已保存的 `--select android`，再重新构建、签名并安装手表包。原来的双参数命令仍可使用。

手机端还需完成华为 Wear Engine 的开发者接入与相关申请，并确认运动健康支持该设备的应用通信。`DEVICE_MANAGER` 用户授权不能替代开发者侧的 SDK 接入资格。

## 加入已有安卓工程

以下修改在安卓版工程内由接入方完成；当前目录仅提供组件，不会自动改动原仓库。

`settings.gradle.kts` 加入模块路径及仓库，例如：

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://developer.huawei.com/repo/")
    }
}
include(":watch-bridge")
project(":watch-bridge").projectDir = file("../HITA_For_Watch/android-bridge")
```

应用模块依赖：

```kotlin
implementation(project(":watch-bridge"))
```

桥接模块复用宿主工程 Android Gradle Plugin，不独立钉死插件版本。当前 `compileSdk=35`、`minSdk=26`，按宿主工具链协调；不要通过降低权限校验解决接入失败。

将 `examples/HitaSnapshotAdapter.kt` 放入安卓应用源码。它引用工作区现有 `Timetable`、`EventItem` 字段，需要跟随安卓版后续模型变更维护。

## 前台交互流程

1. 用户进入手机“同步到手表”入口，显式触发 `WearEngineLink.requestDevices(activity, callback)`。
2. 展示已配对且 `isConnected` 的设备，用户选择自己的 GT 6 Pro；不能静默任选第一台。
3. 创建 `WearEngineLink`，调用 `open()`，等待 `State.ready()`。
4. 在 IO 线程读取当前选择的课表及实际显示的非删除课程，生成快照；回主线程调用 `link.sync(json)`。
5. 展示百分比；收到 `complete()` 才显示“手表已保存”。收到 `failed(reason)` 则保留重试入口。
6. `requested()` 表示手表主动请求。仍需从手机生成最新快照并调用 `sync()`。
7. 页面/前台会话结束调用 `close()`；不要额外创建永久后台服务。

示意：

```kotlin
val link = WearEngineLink(
    activity, chosenDevice, "cn.berry.hita.watch", actualWatchSha256,
    object : WearEngineLink.State {
        override fun ready() { exportAndSendCurrentTimetable() }
        override fun requested() { exportAndSendCurrentTimetable() }
        override fun progress(percent: Int) { showProgress(percent) }
        override fun complete() { showSavedOnWatch() }
        override fun failed(reason: String) { showRetry(reason) }
    }
)
link.open()
// 读取和转换完成后：link.sync(snapshotJson)
// 离开会话：link.close()
```

示意中的界面方法由宿主实现，不属于桥接库。

## 数据必须来自手机真实课表

- 先通过手机已有规则展开课程，传入**具体课时**的起止时间戳。手表不根据节次自行推断时间，避免威海第7节时间再次错位。
- 当前课表 ID 必须匹配，避免把新建空课表和其他学期混合。
- 在手机读取层处理已删除/隐藏课程，转换器不猜测删除逻辑；不要直接发送整个数据库。
- 导出查询需覆盖本周一到下周日，也要包含跨午夜的相交事件。转换器会相应扩展声明日期范围。
- 手机如果尚未获取正确开学日期，应提示用户修正，不能悄悄使用某个固定日期。
- 无课日也要在覆盖范围内明确发送空安排。断网不影响导出手机已有缓存。
- 从手机真实数据生成快照，禁止发送 `tests/fixtures.mjs` 的预览内容。

## 真机验收

- 两端签名、包名、SDK 申请正确，手机运动健康中设备已连接。
- 两端同时打开，手机主动同步后，手表标题、教师、地点、开学周数与手机一致。
- 在手表请求同步，安卓前台应能回应；手机未打开时应超时，不显示成功。
- 同步完成后断开蓝牙并重启手表应用，仍显示已保存课表。
- 中途断连、拒绝授权、修改签名指纹分别显示可重试错误，旧课表保持不变。
- 测试周日、跨月、跨周、无课日、长教室名、一节课和考试；校验16:05等真实起点。
- 实机检查上下滚动、顶部点击和左右切日是否冲突，以及中文字体的实际换行。
- 当前没有完成上述真机验收，不应按可公开发布版本对外宣传。
