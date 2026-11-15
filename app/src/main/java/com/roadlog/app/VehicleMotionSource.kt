package com.roadlog.app

import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.SystemClock
import android.util.Log
import kotlin.math.abs

internal class VehicleMotionSource(
    private val context: Context,
    private val onSpeed: (Double?, Long) -> Unit,
    private val onGear: (TripGear?, Long) -> Unit
) {
    private var car: Car? = null
    private var manager: CarPropertyManager? = null
    private val traceSpeed = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0 &&
        Log.isLoggable("RoadlogSpeed", Log.VERBOSE)
    private val callback = object : CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(value: CarPropertyValue<*>) {
            val sample = if (value.status == CarPropertyValue.STATUS_AVAILABLE) value.value as? Number else null
            val at = value.timestamp / 1_000_000
            when (value.propertyId) {
                VehiclePropertyIds.GEAR_SELECTION -> onGear(when (sample?.toInt()) {
                    VehicleGear.GEAR_PARK -> TripGear.PARK
                    VehicleGear.GEAR_DRIVE -> TripGear.DRIVE
                    VehicleGear.GEAR_REVERSE -> TripGear.REVERSE
                    null -> null
                    else -> TripGear.OTHER
                }, at)
                VehiclePropertyIds.PERF_VEHICLE_SPEED -> {
                    val speed = sample?.let { abs(it.toDouble()) }
                    if (traceSpeed && speed != null) Log.v("RoadlogSpeed", "$at $speed")
                    onSpeed(speed, at)
                }
            }
        }

        override fun onErrorEvent(propertyId: Int, areaId: Int) {
            val at = SystemClock.elapsedRealtime()
            when (propertyId) {
                VehiclePropertyIds.GEAR_SELECTION -> onGear(null, at)
                VehiclePropertyIds.PERF_VEHICLE_SPEED -> onSpeed(null, at)
            }
        }
    }

    fun start(): Boolean {
        car = Car.createCar(context)
        val properties = car?.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager ?: return false
        manager = properties
        fun subscribe(id: Int, rate: Float) = runCatching {
            properties.getCarPropertyConfig(id) != null && properties.registerCallback(callback, id, rate)
        }.getOrDefault(false)
        return subscribe(VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE) &&
            subscribe(VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_UI)
    }

    fun stop() {
        runCatching { manager?.unregisterCallback(callback) }
        runCatching { car?.disconnect() }
        manager = null
        car = null
    }
}
