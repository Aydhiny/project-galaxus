// Client entry points for lib/actions/shorts.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { createShortsWorkerToken, deleteShortJob, getShortJobs, retryShortJob } from "@/lib/actions/shorts";

export const getShortJobsC = unwrapped(getShortJobs);
export const createShortsWorkerTokenC = unwrapped(createShortsWorkerToken);
export const retryShortJobC = unwrapped(retryShortJob);
export const deleteShortJobC = unwrapped(deleteShortJob);
export type { ShortJobsState } from "@/lib/actions/shorts";
