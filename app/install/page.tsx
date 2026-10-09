import type { Metadata } from "next";
import { InstallGuide } from "@/components/install/install-guide";

export const metadata: Metadata = {
  title: "Install the app",
  description: "Add Galaxus to your iPhone, Android or desktop home screen.",
};

export default function InstallPage() {
  return <InstallGuide />;
}
