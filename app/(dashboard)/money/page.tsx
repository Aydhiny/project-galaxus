import { getMoney } from "@/lib/actions/money";
import { MoneyView } from "@/components/money/money-view";

export const metadata = { title: "Money" };
export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  return <MoneyView state={await getMoney()} />;
}
