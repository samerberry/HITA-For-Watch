# 平台选择与参考依据

核对日期：2026-10-06（安卓组件的原始核对日期为 2026-10-05）。

## 目标

当前按用户要求增加 FIT 5 Pro 矩形适配，并保留 GT 6 Pro 圆屏布局。工程仍采用 DevEco 的 liteWearable FA 模板体系、JS/HML/CSS，兼容/目标 API 均为 23，不是手机 ArkUI 页面或 Android Wear OS 工程。未从设备读取过 FIT 5 Pro 的固件 API，不把官网的 HarmonyOS 6 文案当作 API 23 兼容性证明。

本机 SDK 的 `@hms.health.WearEngineLite.d.ts` 将新接口标注为 `@since 6.1.1(24)`。所以当前 API 23 工程没有导入这套新接口，选择旧版轻量级 JS Wear Engine SDK 的 `@system.wearengine` 对接路径。具体固件上的原生模块是否可用仍须真机确认，编译通过不等于平台接入获批。

## 华为资料

- FIT 5 Pro 官方规格：分辨率 480 × 408，PPI 328；本工程按竖屏窗口宽 408、高 480 适配。
  https://consumer.huawei.com/cn/wearables/watch-fit5-pro/specs/
- FIT 5 Pro 官方产品页：HarmonyOS 6，手表应用通过运动健康中的应用市场安装。是否支持本工程所需 API、签名与通信模块仍需实机确认。
  https://consumer.huawei.com/cn/wearables/watch-fit5-pro/
- GT 6 Pro 官方规格：1.47英寸，466 × 466像素；保留该圆屏参考尺寸。
  https://consumer.huawei.com/cn/wearables/watch-gt6-pro/specs/

- Wear Engine 轻量级穿戴 SDK：
  https://developer.huawei.com/consumer/cn/doc/connectivity-Guides/litewearable-sdk-0000001053562589
- 华为官方 Android Codelab 示例：
  https://github.com/huaweicodelabs/WearEngine
- 本次读取的官方 Android 收发代码：
  https://github.com/huaweicodelabs/WearEngine/blob/master/app/src/main/java/com/huawei/wearengine/app/WearEngineMainActivity.java
- 华为穿戴示例中的轻量级 JS SDK：
  https://github.com/Explore-In-HMOS-Wearable/sportwatch-wear-engine-lite-wearable-to-mobile
- 华为 Maven 中使用的 Android SDK POM：
  https://developer.huawei.com/repo/com/huawei/hms/wearengine/5.0.2.306/wearengine-5.0.2.306.pom

华为开发文档网页主要由脚本加载，原安卓接入核对时的浏览工具未取得完整正文。因此同时核对了本机 SDK 的 lite 类型定义、官方示例源码以及实际 Maven AAR 中的类和方法签名，没有用猜测的方法名替代接口。鸿蒙补充文档的正文获取方式见下一节。

Android 适配器已针对官方 `wearengine:5.0.2.306` 和 `tasks:1.4.1.300` 的实际类编译检查。

## 鸿蒙互联补充

本次通过浏览器执行官方文档页面脚本，取得了以下两页正文，并对照本机 SDK 核对手机 API。没有把第三方教程中的接口名当作实现依据：

- 华为《如何获取应用指纹》：区分 Android 的 SHA-256、HarmonyOS 5+ Phone/Tablet/Wearable 的 AGC APP ID，以及 Lite Wearable 的包名加 Base64 公钥。页面标注更新时间为 2026-09-20。
  https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/wearengine_faq-9
- 华为《手机和轻量级智能穿戴设备通信，提示错误码206》：核对身份、允许清单、前台、接收器及蓝牙。页面标注更新时间为 2026-08-24。
  https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/wearengine_faq-6
- 手机端接入资格和兼容应用身份转换需按官方申请要求处理：
  https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/wearengine_apply

本工程新增的是原生鸿蒙手机 APP ID 对端配置，不启用 `transformLocalAppInfo` 的兼容安卓身份映射。鸿蒙手机业务端尚未适配；旧安卓桥接库的手表 SHA-256 校验限制已在安卓接入说明单独标明。

## 本机一手资料

以下路径相对于 `C:\Program Files\Huawei\DevEco Studio\sdk\default`：

- `hms/js/api/@hms.health.WearEngineLite.d.ts`：API 24 起的新轻量级接口。
- `hms/ets/api/@hms.health.wearEngine.d.ts`：手机端 `AppInfo`、`P2pAppParam`、`P2pMessage`、`getConnectedDevices`、`sendMessage`、`registerMessageReceiver`、`unregisterMessageReceiver`。这些手机接口标注始于 5.0.0(12)，不能因此认为相同接口也可导入 API 23 轻量级手表。
- `hms/ets/kits/@kit.WearEngine.d.ts`：手机侧 `wearEngine` 导出。
- `openharmony/js/api/@system.storage.d.ts`：liteWearable 保留的存储接口、键名限制。
- `openharmony/js/api/@system.device.d.ts`：`getInfo` 返回 `windowWidth`、`windowHeight`、`screenShape`（`rect` / `circle`），用于实际窗口布局，不使用型号白名单。
- `openharmony/js/api/@internal/lite/viewmodel.d.ts`：轻量级列表 `scrollTo`。
- DevEco 自带 legacy Hvigor 任务：`legacyAppTasks` / `legacyHapTasks`。

## 模拟器限制与原生验证

本机 Windows Lite SDK 即使以 `-shape circle` 启动，`getInfo` 仍返回 `rect`，已在 466 × 466 与 390 × 390 原生预览日志中复现。OpenHarmony 上游的 `defaultScreenShape = "rect"` 实现可作为对照：

https://github.com/openharmony/utils_native_lite/blob/master/js/builtin/deviceinfokit/src/nativeapi_deviceinfo.cpp

没有修改 SDK 来隐藏这一限制。圆屏回归脚本使用显式 `--mock-shape`，仅在隔离产物副本中替换响应字段；矩形验证不需要替换字段。真实设备的形状返回值尚未验证。

本机原生存储对大值的读取被截断为 128 字节，在完整课表预填测试中通过长度及 CRC 日志确认。现采用不超过 120 字节的 UTF-8 缓存片段，不变更手机传输片段大小。SDK 自带 JerryScript 实测 `typeof String.prototype.replace === "undefined"`，课表日期显示已移除该依赖。

README 标记的结果覆盖静态检查、SDK 编译、逻辑测试、跨语言协议、浏览器及官方原生模拟器交互。未报告任何不存在的 FIT 5 Pro / GT 6 Pro 蓝牙、安装、后台或续航测试结果。
