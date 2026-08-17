package com.plcm.casemanager.feature.deadlines

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.plcm.casemanager.navigation.PlcmDestination
import com.plcm.casemanager.ui.PlaceholderScreen

@Composable
fun DeadlinesScreen(modifier: Modifier = Modifier) {
    PlaceholderScreen(
        title = "Deadlines",
        plannedIn = "Jurisdiction-aware deadline timeline and alarms — Chunks 12–16.",
        testTag = PlcmDestination.DEADLINES.testTag,
        modifier = modifier,
    )
}
