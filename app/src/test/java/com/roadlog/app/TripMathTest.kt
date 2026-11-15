package com.roadlog.app

import org.junit.Assert.*
import org.junit.Test
class TripMathTest {
    @Test fun knownDistanceUsesMetres(){val a=TrackPoint(0.0,0.0,1000);val b=TrackPoint(0.0,0.001,11000);assertEquals(111.195,TripMath.metres(a,b),.1)}
    @Test fun duplicateAndReversedTimestampsDoNotAddDistance(){val r=TripAccumulator(1000);r.accept(TrackPoint(37.0,127.0,1000));assertFalse(r.accept(TrackPoint(37.01,127.0,1000)));assertFalse(r.accept(TrackPoint(37.01,127.0,900)));assertEquals(0.0,r.distanceMetres,0.0)}
    @Test fun gpsTeleportIsRejected(){val r=TripAccumulator(1000);r.accept(TrackPoint(37.0,127.0,1000));assertFalse(r.accept(TrackPoint(38.0,128.0,2000)));assertEquals(0.0,r.distanceMetres,0.0)}
    @Test fun signalGapDoesNotDrawAFalseStraightDistance(){val r=TripAccumulator(1000);r.accept(TrackPoint(37.0,127.0,1000));r.accept(TrackPoint(37.1,127.1,62000));assertEquals(0.0,r.distanceMetres,0.0);assertEquals(1,r.gaps)}
    @Test fun stationaryJitterDoesNotBecomeDistance(){val r=TripAccumulator(1000);for(i in 0..40)r.accept(TrackPoint(37.0+(i%2)*0.000001,127.0,1000L+i*1000));assertEquals(0.0,r.distanceMetres,0.0)}
    @Test fun invalidCoordinateCannotPoisonSession(){val r=TripAccumulator(1000);assertFalse(r.accept(TrackPoint(Double.NaN,127.0,1000)));assertFalse(r.accept(TrackPoint(95.0,127.0,1000)));assertTrue(r.points.isEmpty())}
    @Test fun noBatteryDataIsNullNotZero(){val r=TripAccumulator(1000);assertTrue(r.snapshot(11000,"test").isNull("socUsed"));assertEquals(10L,r.snapshot(11000,"test").getLong("seconds"))}
}
