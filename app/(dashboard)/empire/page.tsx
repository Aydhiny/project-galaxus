// The empire scene itself lives in the dashboard layout (components/empire/
// empire-host.tsx) so it stays alive between visits; this route just makes
// room for it.
export const metadata = { title: "Empire" };

export default function EmpirePage() {
  return <div className="h-full min-h-[70vh]" />;
}
