package com.plcm.casemanager.navigation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.plcm.casemanager.MainActivity
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Chunk 1's acceptance test: every top-level destination is reachable from the
 * bottom bar, and the app opens on Cases.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class NavigationTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun setUp() {
        hiltRule.inject()
    }

    @Test
    fun startDestination_isCases() {
        composeRule.onNodeWithTag(PlcmDestination.START.testTag).assertIsDisplayed()
    }

    @Test
    fun everyTopLevelDestination_isReachableFromBottomBar() {
        PlcmDestination.entries.forEach { destination ->
            val label = composeRule.activity.getString(destination.labelRes)

            composeRule.onNodeWithText(label).performClick()
            composeRule.onNodeWithTag(destination.testTag).assertIsDisplayed()
        }
    }

    @Test
    fun returningToStart_afterVisitingAnotherTab_showsCases() {
        val vaultLabel = composeRule.activity.getString(PlcmDestination.VAULT.labelRes)
        val casesLabel = composeRule.activity.getString(PlcmDestination.CASES.labelRes)

        composeRule.onNodeWithText(vaultLabel).performClick()
        composeRule.onNodeWithTag(PlcmDestination.VAULT.testTag).assertIsDisplayed()

        composeRule.onNodeWithText(casesLabel).performClick()
        composeRule.onNodeWithTag(PlcmDestination.CASES.testTag).assertIsDisplayed()
    }
}
