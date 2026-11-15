package com.roadlog.app

internal enum class TripGear { DRIVE, REVERSE, PARK, OTHER }

/** Gear and speed timestamps use the vehicle's monotonic clock. */
internal class AutoTripDetector(private val armedAt: Long) {
    var gear: TripGear? = null
        private set
    var gearAt = -1L
        private set
    var parkedAt: Long? = null
        private set
    private var lastSpeedAt = -1L
    private var tracking = false

    fun gearChanged(value: TripGear?, at: Long) {
        if (at < gearAt) return
        gear = value
        gearAt = at
        if (tracking && value == TripGear.PARK) {
            if (parkedAt == null) parkedAt = at
        } else parkedAt = null
    }

    fun shouldStart(speed: Double?, at: Long, now: Long): Boolean {
        if (at <= lastSpeedAt) return false
        lastSpeedAt = at
        return !tracking && at >= armedAt && at >= gearAt && now - at in 0..2_000 &&
            (gear == TripGear.DRIVE || gear == TripGear.REVERSE) &&
            speed != null && speed in (3.0 / 3.6)..100.0
    }

    fun started() { tracking = true }
    fun finished() { tracking = false; parkedAt = null }
    fun shouldFinish(now: Long) = parkedAt?.let { now - it >= PARK_MILLIS } == true

    companion object { const val PARK_MILLIS = 10_000L }
}
