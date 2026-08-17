package com.plcm.casemanager.navigation

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Add
import androidx.compose.ui.graphics.vector.ImageVector
import com.plcm.casemanager.R

/**
 * The five top-level destinations, in bottom-bar order.
 *
 * Icons here are stock Material ones standing in for the custom line icons in the
 * mockup; Chunk 2 swaps them for the real set.
 */
enum class PlcmDestination(
    val route: String,
    @StringRes val labelRes: Int,
    val icon: ImageVector,
    val testTag: String,
) {
    CASES("cases", R.string.nav_cases, Icons.AutoMirrored.Filled.List, "screen_cases"),
    DEADLINES("deadlines", R.string.nav_deadlines, Icons.Filled.DateRange, "screen_deadlines"),
    INTAKE("intake", R.string.nav_intake, Icons.Filled.Add, "screen_intake"),
    COUNSEL("counsel", R.string.nav_counsel, Icons.Filled.Person, "screen_counsel"),
    VAULT("vault", R.string.nav_vault, Icons.Filled.Lock, "screen_vault"),
    ;

    companion object {
        val START: PlcmDestination = CASES
    }
}
