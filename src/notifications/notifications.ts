/**
 * The "Web Push + in-app reminders" chunk splits into two genuinely different
 * capabilities, and it matters which one this file actually provides.
 *
 * "In-app reminders" — showing a notification for a deadline the app already knows
 * about, at the moment it's relevant — is real and implemented here.
 * `showLocalNotification` fires immediately, in the current session. That's honest
 * about what it is: nothing on the web platform lets an unopened PWA wake itself at
 * a future date without a server pushing to it (the Notification Triggers API that
 * would have enabled true scheduled local notifications shipped behind a flag in
 * Chrome and was never standardized or shipped broadly — relying on it would mean
 * silently not working almost everywhere).
 *
 * "Web Push" proper — a notification arriving while the app is closed — requires a
 * server holding a subscription and actually sending to it, which this project does
 * not have (Stage 8's backend track is explicitly unresolved: "whether to deploy a
 * server at all"). Building a "turn on push notifications" toggle now, wired to
 * nothing, would silently never fire again after the one moment it's tested — for a
 * legal-deadline app, that's a false sense of security, not a shortcut. So it isn't
 * built. The real reminder path for "the app is closed" is Chunk 14's calendar
 * export, which hands the deadline to the OS's own alarm system instead.
 */

export function getNotificationPermission(): NotificationPermission {
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission()
}

/**
 * Shows a notification right now. Routed through the active service worker
 * registration when one exists, rather than the plain `Notification` constructor —
 * an installed PWA's notification then belongs to the app itself (its click/dismiss
 * handling ties back to the service worker) instead of to a specific page instance,
 * which matters because a user is reasonably likely to have moved to another tab or
 * app by the time a reminder becomes relevant.
 */
export async function showLocalNotification(title: string, options?: NotificationOptions): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, options)
    return
  }
  new Notification(title, options)
}
