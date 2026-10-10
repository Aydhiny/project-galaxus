// Open the voice overlay from anywhere without importing the voice panel
// (keeps the top bar's bundle small). VoiceButton listens for this event.
export const VOICE_OPEN_EVENT = "galaxus:voice";

export function openVoice() {
  window.dispatchEvent(new Event(VOICE_OPEN_EVENT));
}
