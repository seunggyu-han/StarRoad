package com.roadlog.app

import kotlin.math.*
import org.json.JSONArray
import org.json.JSONObject

/** No GPS-derived hard braking or safety score: speed sensors need separate validation. */
data class TrackPoint(val latitude: Double, val longitude: Double, val at: Long) {
    fun valid() = latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0 && at > 0
    fun json() = JSONObject().put("lat", latitude).put("lon", longitude).put("at", at)
}
object TripMath {
    fun metres(a: TrackPoint, b: TrackPoint): Double {
        val dLat = Math.toRadians(b.latitude-a.latitude)
        val dLon = Math.toRadians(b.longitude-a.longitude)
        val h = sin(dLat/2).pow(2) + cos(Math.toRadians(a.latitude))*cos(Math.toRadians(b.latitude))*sin(dLon/2).pow(2)
        return 6371000.0 * 2 * atan2(sqrt(h.coerceIn(0.0,1.0)),sqrt((1-h).coerceIn(0.0,1.0)))
    }
}
class TripAccumulator(val startedAt: Long) {
    val points = mutableListOf<TrackPoint>()
    var distanceMetres = 0.0; private set
    var movingSeconds = 0.0; private set
    var gaps = 0; private set
    private var anchor: TrackPoint? = null
    fun accept(point: TrackPoint): Boolean {
        if (!point.valid()) return false
        val last = anchor
        if (last != null) {
            val dt = (point.at-last.at)/1000.0
            if(dt<=0) return false
            val distance=TripMath.metres(last,point)
            if(dt>30) { gaps++; anchor=point; points.add(point); return true }
            if(distance/dt>70.0) return false // reject a GPS jump; 70 m/s is a rejection ceiling, never a goal
            if(distance>=4.0) { distanceMetres+=distance; if(distance/dt>1.2) movingSeconds+=dt; anchor=point; points.add(point) }
            else if(dt>=10) { anchor=point; points.add(point) } // discard accumulated stationary jitter
        } else { anchor=point; points.add(point) }
        return true
    }
    fun snapshot(now: Long, id: String, socUsed: Int? = null): JSONObject {
        val elapsed=((now-startedAt).coerceAtLeast(0)/1000)
        return JSONObject().put("id",id).put("title","나의 드라이브")
            .put("startedAt",startedAt)
            .put("date",java.text.SimpleDateFormat("yyyy.MM.dd",java.util.Locale.KOREA).format(java.util.Date(startedAt)))
            .put("km",distanceMetres/1000).put("seconds",elapsed).put("movingSeconds",movingSeconds.coerceAtMost(elapsed.toDouble()))
            .put("tag","내 주행").put("demo",false).put("gaps",gaps)
            .put("socUsed",socUsed ?: JSONObject.NULL).put("points",JSONArray(points.map { it.json() }))
    }
}
