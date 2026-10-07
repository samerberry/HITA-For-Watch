# 原生鸿蒙互联接入

本说明面向 HarmonyOS 5.0 及之后版本的手机 HITA，以及 GT 6 Pro / API 23 轻量级手表。HarmonyOS 2/3/4 上的安卓 APK 使用 [安卓接入说明](android-integration.md)。

## 本次范围

- 已完成手表侧的鸿蒙身份校验、构建配置切换、Wear Engine 收发接入及同步状态提示。
- 手表继续复用协议 v1、分片校验和双槽离线缓存，不改变课表数据格式。
- **未修改任何手机端 HITA 源码、依赖、权限、签名、数据库或界面。** 鸿蒙手机导出快照和实现可靠发送器留待后续适配；本目录没有声称可直接使用的鸿蒙手机同步组件。
- 默认鸿蒙配置为空，不会自动获取手机身份或用安卓指纹代替。现有缓存不因切换平台而主动删除；新数据仍须校验并成功保存后才能替换。

## 身份不能混用

华为官方《如何获取应用指纹》区分了以下身份，核对日期为 2026-10-06：

| 位置 | 包名 | `fingerprint` 的值 |
| --- | --- | --- |
| 手表 `common/pairing.js` | 鸿蒙**手机**实际 `bundleName` | 手机应用在 AGC 的 **APP ID**，按字符串保存 |
| 手表 `config.json` 的 `supportLists` | 同上 | `手机bundleName:手机APP_ID` |
| 后续鸿蒙手机 `P2pAppParam.remoteApp` | `cn.berry.hita.watch`，以实际手表包名为准 | 对于 HarmonyOS 5+ 轻量级设备，为 `手表包名_base64Encode(手表签名证书公钥)` |

手机 APP ID 从 AppGallery Connect“项目设置 > 常规 > 应用”获取，不是 Project ID、Client ID、`appIdentifier`、手机证书 SHA-256，也不是手表应用的 APP ID。

轻量级手表的公钥指纹应按华为文档从**实际用于手表签名的证书**生成：将证书公钥的十六进制内容转为字节后做 Base64，再加上手表包名和下划线。不要对十六进制文本、整个证书或 PEM 头尾做 Base64，也不要将这个长字符串填入手表的手机 APP ID 字段。没有完成手表签名前，不能确定最终对端指纹。不要上传私钥或密码。

本路径使用鸿蒙的原生应用身份，手机 `P2pAppParam.transformLocalAppInfo` 保持 `false`。不要开启兼容安卓的云侧身份转换后仍沿用鸿蒙 APP ID 白名单；那是另一种接入方案，不在本次范围。

## 配置手表

在 `HITA_For_Watch` 目录：

```powershell
node scripts/configure-pairing.cjs --platform harmonyos YOUR_PHONE_BUNDLE_NAME YOUR_AGC_APP_ID
npm run check
```

将占位符替换为真实值。脚本只修改本目录中的三个文件：

1. `pairing-profiles.json`：保留两平台公开身份，选择 `harmonyos`。
2. `entry/src/main/js/MainAbility/common/pairing.js`：生成本次构建使用的手机身份。
3. `entry/src/main/config.json`：仅写入所选手机的 `supportLists`，保留其他元数据。

不需要手工改 vendor SDK，不需要升级手表目标 API，也不要导入手机的 ArkUI 页面。

切换回已配置的安卓档或再次选鸿蒙档：

```powershell
node scripts/configure-pairing.cjs --select android
node scripts/configure-pairing.cjs --select harmonyos
```

选择未配置的档位是允许的，此时会移除旧允许清单，界面显示对应手机“待接入”。它不会偷偷改用另一个平台。参数不合法时脚本不写文件；`npm run check` 会检查配置档、JS 身份和原生允许清单的一致性。

**每次配置改变都需要重新构建、签名和安装。** 当前是一份构建对应一个手机应用身份，不提供运行时自动探测、多手机并发、身份广播或无需重装的切换。

## 后续手机端接口

以下是下一次适配的接口约定，不是本次已接入手机的代码。接口已对照本机 DevEco SDK 的 `@hms.health.wearEngine.d.ts`：

| 目的 | 原生鸿蒙接口 |
| --- | --- |
| 引入服务 | `import { wearEngine } from '@kit.WearEngine'` |
| 创建客户端 | `wearEngine.getDeviceClient(context)`、`wearEngine.getP2pClient(context)` |
| 获取连接设备 | `DeviceClient.getConnectedDevices()` |
| 注册消息接收 | `P2pClient.registerMessageReceiver(deviceRandomId, appParam, callback)` |
| 发送消息 | `P2pClient.sendMessage(deviceRandomId, appParam, message)` |
| 页面退出清理 | `P2pClient.unregisterMessageReceiver(deviceRandomId, appParam, callback)` |

`context` 使用手机 `UIAbilityContext`。`appParam` 是 `wearEngine.P2pAppParam`，包含上表的 `remoteApp` 及 `transformLocalAppInfo: false`。`message` 是 `wearEngine.P2pMessage`，正文放在 `content: Uint8Array`；一条协议 JSON 对应一条 UTF-8 消息，不使用 UTF-16、Base64 正文或文件消息。注销时使用注册时的同一个 callback。

后续手机端工作顺序：

1. 完成鸿蒙应用的 Wear Engine 开发者接入及用户隐私授权，确认运动健康配对和目标设备支持情况。不要照搬 Android 的 `DEVICE_MANAGER` 权限枚举。
2. 让用户进入“同步到手表”，展示连接设备并明确选择；不要静默选第一台。注册接收器成功后才允许发送。
3. 从**当前选择的真实课表**读取并展开具体课程/考试/日程，过滤已删除条目，生成 [协议 v1 快照](sync-protocol.md)。不传整个数据库、密码、Cookie、姓名、学号或登录令牌。
4. 实现逐片确认发送器：`begin -> ack -> chunk -> ack -> end -> done`。分片正文最多 384 字节、快照最多 65536 字节、封装消息最多 2048 字节；按 UTF-8 字节计数，不能截断 Unicode 代理对。
5. 校验响应的 `p/v/id` 和序号；普通 ACK 等待 6 秒，保存确认等待 12 秒，最多重发 3 次。`busy` 不代表成功；`error` 或重试耗尽应显示失败。
6. 收到手表 `request` 时，在前台生成最新真实快照并开始同步。传输中不要并发启动另一条同步。
7. `sendMessage()` 返回 `code === 207` 仅代表消息送达，**只有本次传输 ID 的 `done` 才代表手表已保存**。
8. 离开前台时注销回调、清理超时和停止发送。拒绝授权、未连接、未安装、未启动、签名不匹配均应可重试，不创建永久后台服务。

时间、日期范围、开学日期、覆盖无课日、跨午夜及删除条目的语义与安卓一致。手机适配不能依赖 `tests/fixtures.mjs` 的演示内容，也不能根据节次猜测实际起止时间。

## 验收与已知边界

- 手表缺少手机 APP ID 时，应显示“鸿蒙手机待接入”，不能发起同步或显示已连接。
- 已配置身份但手机 HITA 未适配或未打开时，原生发送失败应显示“暂未连接手机”；若发送后没有协议回应，应在 15 秒后显示“手机未回应”。两种情况都保留原课表。
- 两端前台打开后，分别验证手机主动发送和手表请求同步。检查中文、长标题、教师、地点、考试、空课日和跨周。
- 中途断连、丢 ACK、丢 done、保存失败、旧快照、退出前台及迟到回调都不能覆盖原有成功状态或错误显示成功。
- 收到 done 后断开蓝牙并重启手表，课表仍可离线显示。
- 若报 206，按官方 FAQ 核对双方包名/身份、手表允许清单、前台状态、接收器注册和蓝牙连接。不能靠关闭身份校验绕过。

Node 测试使用真实项目 JS 接收器、缓存、页面和随项目分发的 Huawei JS SDK，但将设备原生服务替换成模拟实现。它验证 APP ID 传递、消息协议与生命周期，不验证真实蓝牙、鸿蒙授权、手机发送器或安装签名。设备联调必须等手机端完成适配后进行。

官方出处及本机 SDK 路径见 [参考资料](references.md)。
