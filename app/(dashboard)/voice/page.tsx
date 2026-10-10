import { getVoiceSetup, listVoiceCommands } from "@/lib/actions/voice";
import { VoicePage } from "@/components/voice/voice-page";

export const metadata = { title: "Voice" };
export const dynamic = "force-dynamic";

export default async function Voice() {
  const [history, setup] = await Promise.all([listVoiceCommands(), getVoiceSetup()]);
  return <VoicePage history={history} setup={setup} />;
}
