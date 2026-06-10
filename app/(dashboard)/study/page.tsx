"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getCourses,
  addCourse,
  updateCourseProgress,
  deleteCourse,
} from "@/lib/actions/courses";
import type { Course } from "@/lib/db/schema";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, GraduationCap, ExternalLink, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import PomodoroTimer from "@/components/pomodoro-timer";

const MONTH_GOAL = 1;

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", platform: "", instructor: "", url: "", notes: "" });
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const data = await getCourses();
      setCourses(data);
    });
  }

  useEffect(() => { reload(); }, []);

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
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Pomodoro Timer */}
      <PomodoroTimer />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Study</p>
          <h1 className="text-xl font-bold mt-0.5">Courses & Learning</h1>
        </div>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" /> Add Course
        </Button>
      </div>

      {/* Monthly goal */}
      <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Monthly Goal</p>
            <p className="text-sm font-semibold mt-0.5">
              {completedThisMonth} / {MONTH_GOAL} course this month
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[var(--gold)]">{completed.length}</p>
            <p className="text-xs text-muted-foreground">total completed</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/6 overflow-hidden">
          <div
            className="h-full rounded-full progress-bar transition-all duration-700"
            style={{ width: `${Math.min((completedThisMonth / MONTH_GOAL) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-6">
          <h2 className="font-semibold mb-4">Add Course</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Course Title *</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Course title" required className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Platform</Label>
                <Input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} placeholder="e.g. Udemy, YouTube, Coursera" className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Instructor</Label>
                <Input value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} placeholder="Instructor name" className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">URL</Label>
                <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="Course URL (optional)" className="bg-white/5 border-white/10" />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={pending} className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl">
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
    <div className={`rounded-xl border p-5 space-y-3 ${isComplete ? "border-[var(--emerald)]/20 bg-card" : "border-white/6 bg-card"}`}>
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
          <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
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
