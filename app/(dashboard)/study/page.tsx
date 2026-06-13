"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getCourses,
  addCourse,
  updateCourseProgress,
  deleteCourse,
} from "@/lib/actions/courses";
import { getStudySessions, addStudySession, deleteStudySession } from "@/lib/actions/study-sessions";
import type { Course, StudySession } from "@/lib/db/schema";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, GraduationCap, ExternalLink, Clock, CheckCircle2, BookOpen, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format, subDays, eachDayOfInterval } from "date-fns";
import PomodoroTimer from "@/components/pomodoro-timer";

const MONTH_GOAL = 1;
const STUDY_TOPICS = ["Programming", "Math", "Design", "Language", "Business", "Science", "Religion", "Music Theory", "Other"];

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [form, setForm] = useState({ title: "", platform: "", instructor: "", url: "", notes: "" });
  const [sessionForm, setSessionForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    topic: "",
    hours: "",
    notes: "",
    courseId: "",
  });
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const [data, sess] = await Promise.all([getCourses(), getStudySessions(30)]);
      setCourses(data);
      setSessions(sess);
    });
  }

  useEffect(() => { reload(); }, []);

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionForm.hours) return;
    await addStudySession({
      date: sessionForm.date,
      topic: sessionForm.topic || undefined,
      hours: parseFloat(sessionForm.hours),
      notes: sessionForm.notes || undefined,
      courseId: sessionForm.courseId ? parseInt(sessionForm.courseId) : undefined,
    });
    toast.success(`${sessionForm.hours}h study session logged!`);
    setSessionForm({ date: format(new Date(), "yyyy-MM-dd"), topic: "", hours: "", notes: "", courseId: "" });
    setShowSessionForm(false);
    reload();
  }

  // Build weekly bar chart data (last 7 days)
  const last7 = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
  const sessionsByDate = new Map<string, number>();
  sessions.forEach(s => {
    const d = s.date;
    sessionsByDate.set(d, (sessionsByDate.get(d) ?? 0) + s.hours);
  });
  const weeklyHours = last7.map(day => ({
    label: format(day, "EEE"),
    hours: sessionsByDate.get(format(day, "yyyy-MM-dd")) ?? 0,
  }));
  const totalHoursThisWeek = weeklyHours.reduce((s, d) => s + d.hours, 0);
  const maxHours = Math.max(...weeklyHours.map(d => d.hours), 1);

  // Topic breakdown
  const topicMap = new Map<string, number>();
  sessions.forEach(s => {
    const t = s.topic ?? "Other";
    topicMap.set(t, (topicMap.get(t) ?? 0) + s.hours);
  });
  const topicData = [...topicMap.entries()].sort((a, b) => b[1] - a[1]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await addCourse(form);
      setForm({ title: "", platform: "", instructor: "", url: "", notes: "" });
      setShowAdd(false);
      toast.success(`"${form.title}" added`);
      reload();
    });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const completedThisMonth = courses.filter(
    (c) => c.status === "completed" && c.month === month && c.year === year
  ).length;
  const inProgress = courses.filter((c) => c.status === "in_progress");
  const completed = courses.filter((c) => c.status === "completed");

  return (
    <div className="page max-w-4xl">
      {/* Pomodoro Timer */}
      <PomodoroTimer />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label mb-1">Study</p>
          <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Courses & Learning</h1>
        </div>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="] font-semibold rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" /> Add Course
        </Button>
      </div>

      {/* Monthly goal */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-label mb-1">Monthly Goal</p>
            <p className="text-sm font-semibold mt-0.5">
              {completedThisMonth} / {MONTH_GOAL} course this month
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[var(--gold)]">{completed.length}</p>
            <p className="text-xs text-muted-foreground">total completed</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full progress-bar transition-all duration-700"
            style={{ width: `${Math.min((completedThisMonth / MONTH_GOAL) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* ── Study Time Logger ─────────────────────────────────────────────── */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--gold)]" /> Study Time Log
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--gold)] tabular-nums">{totalHoursThisWeek.toFixed(1)}h</span>
            <span className="text-xs text-muted-foreground">this week</span>
            <button
              onClick={() => setShowSessionForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ml-2"
              style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}
            >
              <Plus className="w-3.5 h-3.5" /> Log
            </button>
          </div>
        </div>

        {showSessionForm && (
          <form onSubmit={handleAddSession} className="rounded-xl border border-[var(--gold)]/25 bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input type="date" value={sessionForm.date}
                onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
              <input type="number" step="0.25" min="0.25" max="24"
                value={sessionForm.hours} required
                onChange={e => setSessionForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="Hours *"
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
              <select value={sessionForm.topic}
                onChange={e => setSessionForm(f => ({ ...f, topic: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50">
                <option value="">Topic (optional)</option>
                {STUDY_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={sessionForm.courseId}
                onChange={e => setSessionForm(f => ({ ...f, courseId: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50">
                <option value="">Link course (opt.)</option>
                {courses.filter(c => c.status === "in_progress").map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <input value={sessionForm.notes}
                onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notes"
                className="col-span-2 sm:col-span-4 px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowSessionForm(false)}
                className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}>Save</button>
            </div>
          </form>
        )}

        {/* Weekly bar chart */}
        <div className="flex items-end gap-1.5 h-24">
          {weeklyHours.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-[var(--gold)] font-semibold tabular-nums opacity-80">{d.hours > 0 ? `${d.hours.toFixed(1)}` : ""}</span>
              <div className="w-full rounded-t-md transition-all duration-500"
                style={{
                  height: d.hours > 0 ? `${(d.hours / maxHours) * 100}%` : "4px",
                  background: d.hours > 0 ? "var(--gold)" : "oklch(1 0 0 / 8%)",
                  minHeight: "4px",
                }} />
              <span className="text-[9px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>

        {/* Topic breakdown */}
        {topicData.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            {topicData.map(([topic, hours]) => (
              <div key={topic} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 truncate shrink-0">{topic}</span>
                <div className="flex-1 h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--gold)]"
                    style={{ width: `${(hours / (topicData[0]?.[1] ?? 1)) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums w-10 text-right">{hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Recent sessions</p>
            {sessions.slice(0, 8).map(s => (
              <div key={s.id} className="flex items-center gap-2 text-xs group">
                <span className="text-muted-foreground w-16 shrink-0">{s.date}</span>
                <span className="font-semibold text-[var(--gold)] tabular-nums">{s.hours}h</span>
                {s.topic && <span className="text-muted-foreground">{s.topic}</span>}
                {s.notes && <span className="text-muted-foreground/60 flex-1 truncate">{s.notes}</span>}
                <button onClick={() => deleteStudySession(s.id).then(reload)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all ml-auto">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="glass p-6">
          <h2 className="font-semibold mb-4">Add Course</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label className="section-label mb-1">Course Title *</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Course title" required className="bg-foreground/[0.05] border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="section-label mb-1">Platform</Label>
                <Input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} placeholder="e.g. Udemy, YouTube, Coursera" className="bg-foreground/[0.05] border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="section-label mb-1">Instructor</Label>
                <Input value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} placeholder="Instructor name" className="bg-foreground/[0.05] border-border" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="section-label mb-1">URL</Label>
                <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="Course URL (optional)" className="bg-foreground/[0.05] border-border" />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={pending} className="] font-semibold rounded-xl">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Course"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* In Progress */}
      {inProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" /> In Progress <Badge variant="secondary">{inProgress.length}</Badge>
          </h2>
          {inProgress.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onProgress={(p) => startTransition(async () => { await updateCourseProgress(course.id, p); reload(); })}
              onDelete={() => startTransition(async () => { await deleteCourse(course.id); toast.success("Course removed"); reload(); })}
            />
          ))}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--emerald)]" /> Completed <Badge variant="secondary">{completed.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {completed.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onDelete={() => startTransition(async () => { await deleteCourse(course.id); toast.success("Course removed"); reload(); })}
              />
            ))}
          </div>
        </div>
      )}

      {courses.length === 0 && !showAdd && (
        <div className="text-center py-20 text-muted-foreground">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No courses yet</p>
          <p className="text-sm mt-1">Add a course to track your learning journey.</p>
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  onProgress,
  onDelete,
}: {
  course: Course;
  onProgress?: (p: number) => void;
  onDelete: () => void;
}) {
  const isComplete = course.status === "completed";

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${isComplete ? "border-[var(--emerald)]/20 bg-card" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{course.title}</p>
            {isComplete && <Badge className="bg-[var(--emerald)]/20 text-[var(--emerald)] border-[var(--emerald)]/30 text-[10px]">Completed</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {course.platform && <span className="text-[11px] text-muted-foreground">{course.platform}</span>}
            {course.instructor && <span className="text-[11px] text-muted-foreground">· {course.instructor}</span>}
          </div>
          {course.completedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Completed {format(new Date(course.completedAt), "MMM d, yyyy")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {course.url && (
            <a href={course.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={onDelete} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isComplete && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="text-[var(--gold)] font-medium">{course.progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div className="h-full rounded-full progress-bar transition-all duration-500" style={{ width: `${course.progress}%` }} />
          </div>
          {onProgress && (
            <div className="flex gap-2 items-center">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                defaultValue={course.progress ?? 0}
                onMouseUp={(e) => onProgress(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => onProgress(Number((e.target as HTMLInputElement).value))}
                className="flex-1 accent-[var(--gold)] h-1.5"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
