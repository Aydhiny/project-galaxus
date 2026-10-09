import type { Metadata } from "next";
import { InstallGuide } from "@/components/install/install-guide";
import { getDesktopDownloads } from "@/lib/desktop-release";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Install Galaxus on iPhone, iPad, Mac, Windows or Android.",
};

// Re-check GitHub for new desktop installers at most every 10 minutes.
export const revalidate = 600;

export default async function InstallPage() {
  const downloads = await getDesktopDownloads();
  return <InstallGuide downloads={downloads} />;
}
