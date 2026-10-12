import { WallpaperView } from "./wallpaper-view";

export const metadata = { title: "Galaxus wallpaper" };

// Opened by the desktop app in a borderless window that sits behind your other apps.
export default function WallpaperPage() {
  return <WallpaperView />;
}
