package com.plcm.casemanager.feature.vault

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.plcm.casemanager.navigation.PlcmDestination
import com.plcm.casemanager.ui.PlaceholderScreen

@Composable
fun VaultScreen(modifier: Modifier = Modifier) {
    PlaceholderScreen(
        title = "Vault",
        plannedIn = "Encrypted storage status, settings and backup — Chunks 26–28.",
        testTag = PlcmDestination.VAULT.testTag,
        modifier = modifier,
    )
}
