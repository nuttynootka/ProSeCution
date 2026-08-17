package com.plcm.casemanager.feature.intake

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.plcm.casemanager.navigation.PlcmDestination
import com.plcm.casemanager.ui.PlaceholderScreen

@Composable
fun IntakeScreen(modifier: Modifier = Modifier) {
    PlaceholderScreen(
        title = "Intake",
        plannedIn = "Document capture, OCR and field extraction — Chunks 8–10.",
        testTag = PlcmDestination.INTAKE.testTag,
        modifier = modifier,
    )
}
