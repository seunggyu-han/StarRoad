package com.roadlog.app

import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.model.LocationData
import android.app.*
import android.content.Intent
import android.os.*
import java.util.UUID

class RecordingService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var fused: FusedLocation? = null
    private var listener: FusedLocationListener? = null
    private var motion: VehicleMotionSource? = null
    private var detector = AutoTripDetector(SystemClock.elapsedRealtime())
    private var recorder: TripAccumulator? = null
    private var id = ""
    private var startedAt = 0L
    private var elapsedAt = 0L
    private val checkParking = Runnable {
        if (detector.shouldFinish(SystemClock.elapsedRealtime())) finishTrip()
    }
    private val ticker = object : Runnable {
        override fun run() {
            if (recorder == null) return
            checkpoint()
            handler.postDelayed(this, 5000)
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel("recording", "주행 기록", NotificationManager.IMPORTANCE_LOW))
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!AutoRecording.enabled(this)) { stopSelf(); return START_NOT_STICKY }
        if (motion == null) {
            try {
                startForeground(1, notification("다음 출발을 기다립니다."))
                if (!TripStore.recover(this)) { stopSelf(); return START_NOT_STICKY }
                detector = AutoTripDetector(SystemClock.elapsedRealtime())
                val source = VehicleMotionSource(this, ::onSpeed, ::onGear)
                motion = source
                check(source.start()) { "기어와 차속 신호에 연결하지 못했습니다." }
                TripStore.monitoring = true
                TripStore.error = ""
            } catch (e: Exception) {
                TripStore.error = e.message ?: "차량에 연결하지 못했습니다."
                stopSelf()
                return START_NOT_STICKY
            }
        }
        return START_STICKY
    }
    private fun onSpeed(speed: Double?, at: Long) {
        if (TripStore.monitoring && recorder == null && detector.shouldStart(speed, at, SystemClock.elapsedRealtime())) beginTrip()
    }
    private fun onGear(gear: TripGear?, at: Long) {
        val old = detector.parkedAt
        detector.gearChanged(gear, at)
        val parked = detector.parkedAt
        if (old == parked) return
        handler.removeCallbacks(checkParking)
        if (parked != null)
            handler.postDelayed(checkParking, (parked + AutoTripDetector.PARK_MILLIS - SystemClock.elapsedRealtime()).coerceAtLeast(0))
    }
    private fun beginTrip() {
        try {
            val source = FusedLocation(this)
            fused = source
            check(source.isSupported()) { "차량 위치 서비스를 사용할 수 없습니다." }
            source.initialize()
            startedAt = System.currentTimeMillis()
            elapsedAt = SystemClock.elapsedRealtime()
            id = UUID.randomUUID().toString()
            val trip = TripAccumulator(startedAt)
            recorder = trip
            TripStore.recording = true
            detector.started()
            val callback = object : FusedLocationListener {
                override fun onChanged(location: LocationData?) {
                    if (location == null) return
                    handler.post {
                        if (recorder !== trip) return@post
                        val t = location.timestampMillis
                        val now = System.currentTimeMillis()
                        if (t < startedAt - 1000 || t > now + 5000 || now - t > 30000) return@post
                        val first = trip.points.isEmpty()
                        if (trip.accept(TrackPoint(location.latitude, location.longitude, t)) && first) checkpoint()
                    }
                }
                override fun onError(exception: Exception) {
                    handler.post { if (recorder === trip) TripStore.error = "차량의 위치 신호를 확인해 주세요." }
                }
            }
            listener = callback
            source.registerFusedLocationCallback(callback)
            checkpoint()
            getSystemService(NotificationManager::class.java).notify(1, notification("주행 경로를 기록하고 있습니다."))
            handler.postDelayed(ticker, 5000)
        } catch (e: Exception) {
            TripStore.error = e.message ?: "기록을 시작할 수 없습니다."
            TripStore.monitoring = false
            closeTrip()
            stopSelf()
        }
    }
    private fun snapshot() = recorder?.snapshot(startedAt + SystemClock.elapsedRealtime() - elapsedAt, id)?.put("automatic", true)
    private fun checkpoint() {
        val trip = snapshot() ?: return
        runCatching { TripStore.checkpoint(this, trip) }.onFailure { TripStore.error = "경로를 저장할 공간이 부족합니다." }
    }
    private fun notification(message: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, "recording").setContentTitle(getString(R.string.app_name)).setContentText(message)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).setContentIntent(open).build()
    }
    private fun finishTrip() {
        val trip = snapshot() ?: return
        val saved = runCatching { TripStore.finish(this, trip) }.isSuccess
        if (!saved) runCatching { TripStore.checkpoint(this, trip) }
        closeTrip()
        if (!saved) {
            TripStore.error = "저장에 실패했습니다. 다음 실행 때 마지막 위치 기록을 복구합니다."
            TripStore.monitoring = false
            stopSelf()
        } else if (TripStore.monitoring && AutoRecording.enabled(this)) {
            getSystemService(NotificationManager::class.java).notify(1, notification("주행 저장 완료 · 다음 출발을 기다립니다."))
        } else stopSelf()
    }
    private fun closeTrip() {
        handler.removeCallbacks(ticker)
        handler.removeCallbacks(checkParking)
        recorder = null
        TripStore.recording = false
        TripStore.active = null
        detector.finished()
        listener?.let { runCatching { fused?.unregisterFusedLocationCallback(it) } }
        listener = null
        runCatching { fused?.release() }
        fused = null
    }
    override fun onDestroy() {
        TripStore.monitoring = false
        motion?.stop()
        motion = null
        snapshot()?.put("interrupted", true)?.let { runCatching { TripStore.finish(this, it) } }
        closeTrip()
        handler.removeCallbacksAndMessages(null)
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
