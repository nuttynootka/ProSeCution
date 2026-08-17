package com.plcm.casemanager.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.plcm.casemanager.feature.cases.CasesScreen
import com.plcm.casemanager.feature.counsel.CounselScreen
import com.plcm.casemanager.feature.deadlines.DeadlinesScreen
import com.plcm.casemanager.feature.intake.IntakeScreen
import com.plcm.casemanager.feature.vault.VaultScreen

/**
 * Root navigation shell: a bottom bar over a [NavHost] holding the five top-level
 * destinations.
 *
 * The bar is stock Material 3 for now. Chunk 2 replaces it with the neomorphic
 * frosted-glass bar from the mockup, including the shifting violet-blue glow behind
 * the active tab.
 */
@Composable
fun PlcmApp(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Scaffold(
        modifier = modifier,
        bottomBar = {
            NavigationBar {
                PlcmDestination.entries.forEach { destination ->
                    val selected = currentDestination?.hierarchy
                        ?.any { it.route == destination.route } == true
                    val label = stringResource(destination.labelRes)

                    NavigationBarItem(
                        selected = selected,
                        onClick = { navController.navigateToTopLevel(destination) },
                        icon = { Icon(destination.icon, contentDescription = label) },
                        label = { Text(label) },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = PlcmDestination.START.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(PlcmDestination.CASES.route) { CasesScreen() }
            composable(PlcmDestination.DEADLINES.route) { DeadlinesScreen() }
            composable(PlcmDestination.INTAKE.route) { IntakeScreen() }
            composable(PlcmDestination.COUNSEL.route) { CounselScreen() }
            composable(PlcmDestination.VAULT.route) { VaultScreen() }
        }
    }
}

/**
 * Standard bottom-bar navigation: pop back to the start destination so the back stack
 * does not accumulate a trail of tabs, keep a single copy of each destination, and
 * restore whatever state the tab had when the user last left it.
 */
private fun NavHostController.navigateToTopLevel(destination: PlcmDestination) {
    navigate(destination.route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
