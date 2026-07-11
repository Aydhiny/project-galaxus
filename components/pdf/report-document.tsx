import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { WeeklyDigestStats } from "@/lib/email";
import type { LeaderboardData } from "@/lib/leaderboard-utils";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#1a1a2e" },
  header: { marginBottom: 24, borderBottom: 2, borderBottomColor: "#173eff", borderBottomStyle: "solid", paddingBottom: 12 },
  brand: { fontSize: 20, fontWeight: 700, color: "#173eff", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#666666" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#173eff" },
  statRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: 4,
    borderBottom: 1, borderBottomColor: "#eeeeee", borderBottomStyle: "solid",
  },
  statLabel: { color: "#444444" },
  statValue: { fontWeight: 700 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#999999", textAlign: "center" },
});

const RANGE_LABEL: Record<string, string> = { week: "Weekly", month: "Monthly", all: "All-Time" };

interface Props {
  userName: string;
  range: "week" | "month" | "all";
  generatedAt: string;
  stats: WeeklyDigestStats;
  allTime: LeaderboardData;
}

function label(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function ReportDocument({ userName, range, generatedAt, stats, allTime }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Galaxus</Text>
          <Text style={styles.subtitle}>{RANGE_LABEL[range]} Report for {userName} — generated {generatedAt}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.statRow}><Text style={styles.statLabel}>Days logged</Text><Text style={styles.statValue}>{stats.daysLogged}</Text></View>
          <View style={styles.statRow}><Text style={styles.statLabel}>Perfect prayer days</Text><Text style={styles.statValue}>{stats.perfectPrayerDays}</Text></View>
          <View style={styles.statRow}><Text style={styles.statLabel}>Training days</Text><Text style={styles.statValue}>{stats.trainingDays}</Text></View>
          <View style={styles.statRow}><Text style={styles.statLabel}>Gratitude entries</Text><Text style={styles.statValue}>{stats.gratitudeDays}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Streaks</Text>
          {Object.entries(allTime.currentStreaks).map(([habit, days]) => (
            <View style={styles.statRow} key={habit}>
              <Text style={styles.statLabel}>{label(habit)}</Text>
              <Text style={styles.statValue}>{days} days</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Best Streaks Ever</Text>
          {Object.entries(allTime.bestStreaks).map(([habit, data]) => (
            <View style={styles.statRow} key={habit}>
              <Text style={styles.statLabel}>{label(habit)}</Text>
              <Text style={styles.statValue}>{data.streak} days</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>Built by Plansio</Text>
      </Page>
    </Document>
  );
}
