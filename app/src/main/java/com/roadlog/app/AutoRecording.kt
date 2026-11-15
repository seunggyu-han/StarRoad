package com.roadlog.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

internal object AutoRecording {
    const val ARM = "com.roadlog.app.ARM"
    val permissions = arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION,
        "pleos.car.permission.FUSED_LOCATION", "android.car.permission.CAR_SPEED", "android.car.permission.CAR_POWERTRAIN")

    fun granted(context: Context, permission: String) =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    fun hasPermissions(context: Context) = permissions.all { granted(context, it) }
    fun canResumeAtBoot(context: Context) = Build.VERSION.SDK_INT < 29 ||
        granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    fun enabled(context: Context) = context.getSharedPreferences("recording", Context.MODE_PRIVATE)
        .getBoolean("auto", true)
    fun setEnabled(context: Context, value: Boolean) =
        context.getSharedPreferences("recording", Context.MODE_PRIVATE).edit().putBoolean("auto", value).apply()
    fun arm(context: Context) {
        runCatching { context.startForegroundService(Intent(context, RecordingService::class.java).setAction(ARM)) }
            .onFailure { TripStore.error = "자동 기록을 시작하지 못했습니다. 주차 후 앱을 다시 열어 주세요." }
    }
}

class StartupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && AutoRecording.enabled(context) &&
            AutoRecording.hasPermissions(context) && AutoRecording.canResumeAtBoot(context)) AutoRecording.arm(context)
    }
}
