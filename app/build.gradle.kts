plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.roadlog.app"
    compileSdk = 35
    useLibrary("android.car")
    defaultConfig { applicationId = "com.roadlog.app"; minSdk = 28; targetSdk = 35; versionCode = 48; versionName = "2.7.1" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        release { isMinifyEnabled = false }
    }
}
dependencies {
    implementation("ai.pleos.playground:FusedLocation:1.1.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.15.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
