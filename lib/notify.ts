/** Fires a local browser notification if permission is already granted. No-op otherwise. */
export function sendBrowserNotification(title: string, options?: NotificationOptions) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, options);
  } catch {
    // Some browsers (e.g. mobile Safari) don't support the Notification constructor directly.
  }
}
