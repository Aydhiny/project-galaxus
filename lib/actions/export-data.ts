"use server";

import { db } from "@/lib/db";
import {
  dailyCheckins, books, courses, trainingPlans, trainingExercises, dailyGoals,
  goalCompletions, journalEntries, beats, beatSales, personalRecords,
  readingSessions, bookmarks, bookContent, studySessions, beatsAudio, userSettings,
  users,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth-session";

/** Everything this account owns, as one JSON object — for the "download my data" button in Settings. */
export async function exportUserData() {
  const userId = await requireUserId();

  const [
    profile, checkins, userBooks, userCourses, plans, exercises, goals,
    completions, journal, userBeats, sales, records, sessions, marks,
    content, study, audio, settings,
  ] = await Promise.all([
    db.select({ name: users.name, email: users.email, plan: users.plan, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(dailyCheckins).where(eq(dailyCheckins.userId, userId)),
    db.select().from(books).where(eq(books.userId, userId)),
    db.select().from(courses).where(eq(courses.userId, userId)),
    db.select().from(trainingPlans).where(eq(trainingPlans.userId, userId)),
    db.select().from(trainingExercises).where(eq(trainingExercises.userId, userId)),
    db.select().from(dailyGoals).where(eq(dailyGoals.userId, userId)),
    db.select().from(goalCompletions).where(eq(goalCompletions.userId, userId)),
    db.select().from(journalEntries).where(eq(journalEntries.userId, userId)),
    db.select().from(beats).where(eq(beats.userId, userId)),
    db.select().from(beatSales).where(eq(beatSales.userId, userId)),
    db.select().from(personalRecords).where(eq(personalRecords.userId, userId)),
    db.select().from(readingSessions).where(eq(readingSessions.userId, userId)),
    db.select().from(bookmarks).where(eq(bookmarks.userId, userId)),
    db.select().from(bookContent).where(eq(bookContent.userId, userId)),
    db.select().from(studySessions).where(eq(studySessions.userId, userId)),
    db.select().from(beatsAudio).where(eq(beatsAudio.userId, userId)),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: profile[0] ?? null,
    dailyCheckins: checkins,
    books: userBooks,
    courses: userCourses,
    trainingPlans: plans,
    trainingExercises: exercises,
    dailyGoals: goals,
    goalCompletions: completions,
    journalEntries: journal,
    beats: userBeats,
    beatSales: sales,
    personalRecords: records,
    readingSessions: sessions,
    bookmarks: marks,
    bookContent: content,
    studySessions: study,
    beatsAudio: audio,
    settings: settings[0] ?? null,
  };
}
