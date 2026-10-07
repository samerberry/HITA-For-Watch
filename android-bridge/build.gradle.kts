plugins {
    id("com.android.library")
}

android {
    namespace = "cn.berry.hita.watchbridge"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

// Add https://developer.huawei.com/repo/ to the host project's repositories.
dependencies {
    implementation("com.huawei.hms:wearengine:5.0.2.306")
}
