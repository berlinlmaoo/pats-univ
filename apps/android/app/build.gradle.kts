plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}
android {
    namespace = "id.znetworks.patsuniv"
    compileSdk = 37
    defaultConfig {
        applicationId = "id.znetworks.patsuniv"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_URL", "\"${findProperty("patsApiUrl") ?: "https://pats-univ.tail765d02.ts.net"}\"")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
    sourceSets["test"].resources.srcDir("../../../tools/card-station/tests/fixtures")
    buildTypes {
        debug { buildConfigField("String", "DEV_IP", "\"${findProperty("patsDevIp") ?: ""}\"") }
        release { buildConfigField("String", "DEV_IP", "\"\"") }
    }
}
dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.socket.io.client) { exclude(group = "com.squareup.okhttp3"); exclude(group = "org.json") }
    implementation(libs.zxing.core)
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    testImplementation(libs.junit)
}
