# Third-Party Notices

## Huawei Wear Engine Lite JavaScript SDK

- File: `entry/src/main/js/MainAbility/vendor/wearengine.js`
- Version in source header: lite wearable 5.0.2.306
- Copyright (c) 2021 Huawei Device Co., Ltd.
- License: Apache License 2.0; full text in `third_party/Huawei-WearEngine-LICENSE.txt`.
- Source: `Explore-In-HMOS-Wearable/sportwatch-wear-engine-lite-wearable-to-mobile`,
  `entry/src/main/js/MainAbility/pages/wearenginesdk/wearengine.js`.
- Retrieved Git blob: `fa9a4f774dd015c4bf78985228afdd32ee0413fb`.
- Local modification: removed a console statement that logged received message
  bodies, to avoid logging private course details. SDK API logic is unchanged.

## Lucide Icons

- Version: lucide-static 1.52.0.
- Copyright (c) 2026 Lucide Icons and Contributors.
- License: ISC; full text in `third_party/Lucide-LICENSE.txt`.
- `refresh-cw`, `calendar-days`, `chevron-left` and `watch` were rendered as PNG
  assets for the liteWearable UI. PNG assets are committed source resources;
  npm is not needed to build the HAP.

## Existing HITA Application Icon

The watch icon was resized from the user's existing
`HitaNEXT/AppScope/resources/base/media/app_icon.png`. This work does not assign
a new license to that artwork or imply Huawei sponsorship.

## Android Build Dependencies

The companion library depends on Huawei Wear Engine 5.0.2.306, obtained from
Huawei's Maven repository. The verification script caches that SDK and the
matching Huawei Tasks dependency only in the operating-system temporary folder.
Android SDK stubs and org.json used by verification are likewise not bundled
in the watch HAP. Their upstream terms continue to apply.
