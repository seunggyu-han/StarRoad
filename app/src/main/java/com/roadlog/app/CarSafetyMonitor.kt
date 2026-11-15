package com.roadlog.app

import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context

/** If automotive UX restriction state cannot be read, MainActivity remains restricted. */
class CarSafetyMonitor(private val context:Context,private val change:(Boolean)->Unit){
    private var car:Car?=null
    private var manager:CarUxRestrictionsManager?=null
    fun start(){
        car=Car.createCar(context)
        val mgr=car?.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager ?: return
        manager=mgr
        change(mgr.currentCarUxRestrictions.isRequiresDistractionOptimization)
        mgr.registerListener {restriction->change(restriction.isRequiresDistractionOptimization)}
    }
    fun stop(){runCatching{manager?.unregisterListener()};runCatching{car?.disconnect()};manager=null;car=null}
}
