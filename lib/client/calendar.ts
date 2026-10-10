// Client-side entry points for lib/actions/calendar.ts: same functions, but
// errors come back as readable messages (see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  addCalendar, removeCalendar, getUpcomingMeetings,
} from "@/lib/actions/calendar";

const addCalendar_ = unwrapped(addCalendar);
const removeCalendar_ = unwrapped(removeCalendar);
export { addCalendar_ as addCalendar, removeCalendar_ as removeCalendar, getUpcomingMeetings };
