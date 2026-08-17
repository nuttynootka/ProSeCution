package com.plcm.casemanager.feature.cases

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.plcm.casemanager.navigation.PlcmDestination
import com.plcm.casemanager.ui.PlaceholderScreen

@Composable
fun CasesScreen(modifier: Modifier = Modifier) {
    PlaceholderScreen(
        title = "Cases",
        plannedIn = "Dashboard with posture ring, stat cards and case timeline — Chunk 6.",
        testTag = PlcmDestination.CASES.testTag,
        modifier = modifier,
    )
}
