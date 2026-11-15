package com.roadlog.app

import org.junit.Assert.*
import org.junit.Test

class AutoTripDetectorTest {
    private val detector = AutoTripDetector(100)

    @Test fun onlyFreshMovementInDriveOrReverseStarts() {
        for (gear in listOf(null, TripGear.OTHER, TripGear.PARK)) {
            val d = AutoTripDetector(100)
            d.gearChanged(gear, 80)
            assertFalse(d.shouldStart(5.0, 150, 150))
        }
        for (gear in listOf(TripGear.DRIVE, TripGear.REVERSE)) {
            val d = AutoTripDetector(100)
            d.gearChanged(gear, 80)
            assertFalse(d.shouldStart(4.0, 99, 110))
            assertFalse(d.shouldStart(0.5, 110, 110))
            assertFalse(d.shouldStart(null, 120, 120))
            assertFalse(d.shouldStart(8.0, 130, 4_500))
            assertTrue(d.shouldStart(3.0/3.6, 4_501, 4_510))
        }
    }

    @Test fun trafficAndNeutralAreOneTrip() {
        detector.gearChanged(TripGear.DRIVE, 100)
        assertTrue(detector.shouldStart(5.0, 101, 101))
        detector.started()
        assertFalse(detector.shouldStart(0.0, 10_050, 10_050))
        assertFalse(detector.shouldFinish(120_000))
        detector.gearChanged(TripGear.OTHER, 121_000)
        assertFalse(detector.shouldFinish(200_000))
        detector.gearChanged(TripGear.DRIVE, 201_000)
        assertFalse(detector.shouldStart(6.0, 201_010, 201_010))
    }

    @Test fun parkingNeedsTenContinuousSecondsAndAllowsNextDeparture() {
        detector.started()
        detector.gearChanged(TripGear.PARK, 1_000)
        detector.gearChanged(TripGear.PARK, 5_000)
        assertFalse(detector.shouldFinish(10_999))
        detector.gearChanged(TripGear.REVERSE, 10_999)
        assertFalse(detector.shouldFinish(20_000))
        detector.gearChanged(TripGear.PARK, 21_000)
        detector.gearChanged(TripGear.DRIVE, 20_000) // out of order
        assertTrue(detector.shouldFinish(31_000))
        detector.finished()
        assertFalse(detector.shouldFinish(40_000))
        assertFalse(detector.shouldStart(9.0, 40_000, 40_000))
        detector.gearChanged(TripGear.DRIVE, 41_000)
        assertTrue(detector.shouldStart(4.0, 41_001, 41_001))
    }

    @Test fun missingGearCancelsParkingAndOldSpeedCannotStart() {
        detector.gearChanged(TripGear.REVERSE, 1_000)
        assertFalse(detector.shouldStart(3.0, 999, 1_001))
        detector.started()
        detector.gearChanged(TripGear.PARK, 2_000)
        detector.gearChanged(null, 8_000)
        assertFalse(detector.shouldFinish(20_000))
    }
}
