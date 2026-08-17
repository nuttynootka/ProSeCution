package com.plcm.casemanager.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Placeholder theme.
 *
 * This is deliberately thin: it exists so the scaffold renders on a dark surface
 * instead of Material's default light one. The real design system — matte charcoal
 * base, royal-purple/cobalt accents, frosted-glass surfaces, Manrope and IBM Plex
 * Mono type — arrives in Chunk 2 and replaces this file wholesale.
 */
private val PlaceholderDarkColors = darkColorScheme(
    primary = Color(0xFFA78BFA),
    onPrimary = Color(0xFF1A1024),
    secondary = Color(0xFF60A5FA),
    background = Color(0xFF08080B),
    onBackground = Color(0xFFE8E8EE),
    surface = Color(0xFF131316),
    onSurface = Color(0xFFE8E8EE),
    surfaceVariant = Color(0xFF1C1C20),
    onSurfaceVariant = Color(0xFF9A9AA5),
)

@Composable
fun PlcmTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = PlaceholderDarkColors,
        content = content,
    )
}
