"use client";

import { useState, useTransition } from "react";
import { MonitorSmartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutOtherSessions } from "@/lib/actions/account";

export function SessionSettings() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MonitorSmartphone className="w-4 h-4" /> Sessions</CardTitle>
        <CardDescription>
          Lost a device or signed in somewhere public? Sign out everywhere except this browser.
          Changing your password or 2FA does this automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await signOutOtherSessions();
                setDone(true);
                toast.success("Signed out of all other devices.");
              } catch {
                toast.error("Couldn't sign out other devices. Try again.");
              }
            })
          }
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? "Other devices signed out" : "Sign out other devices"}
        </Button>
      </CardContent>
    </Card>
  );
}
