package com.plcm.casemanager.feature.counsel

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.plcm.casemanager.navigation.PlcmDestination
import com.plcm.casemanager.ui.PlaceholderScreen

@Composable
fun CounselScreen(modifier: Modifier = Modifier) {
    PlaceholderScreen(
        title = "Co-Counsel",
        plannedIn = "Motion drafting and opposing-filing audit — Chunks 42–44.",
        testTag = PlcmDestination.COUNSEL.testTag,
        modifier = modifier,
    )
}
