// Client-side entry points for lib/actions/voice.ts: same functions, but
// errors come back as readable messages (see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  submitVoiceCommand, retryVoiceCommand, saveVoiceGithubKey, getVoiceCommand,
} from "@/lib/actions/voice";

const submitVoiceCommand_ = unwrapped(submitVoiceCommand);
const retryVoiceCommand_ = unwrapped(retryVoiceCommand);
const saveVoiceGithubKey_ = unwrapped(saveVoiceGithubKey);
export { submitVoiceCommand_ as submitVoiceCommand, retryVoiceCommand_ as retryVoiceCommand, saveVoiceGithubKey_ as saveVoiceGithubKey, getVoiceCommand };
