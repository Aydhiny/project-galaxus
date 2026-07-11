"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { getNotifications, markRead, markAllRead } from "@/lib/actions/notifications";
import { useNotificationCount } from "@/lib/store/notifications";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date | null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Shared across both mounted <NotificationBell /> instances (desktop
  // sidebar + mobile top bar are both always mounted, just CSS-hidden
  // depending on viewport) so the unread count is fetched once, not twice.
  const { unread, refresh, decrement, setUnread } = useNotificationCount();

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!open || loaded) return;
    getNotifications().then((rows) => { setItems(rows); setLoaded(true); });
  }, [open, loaded]);

  async function handleItemClick(id: number, readAt: Date | null) {
    if (readAt) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)));
    decrement();
    await markRead(id);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })));
    setUnread(0);
    await markAllRead();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[9px] rounded-full">
            {unread > 9 ? "9+" : unread}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 gap-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={handleMarkAllRead} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <CheckCheck className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-hide">
          {!loaded ? (
            <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No notifications yet.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n.id, n.readAt)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors",
                  !n.readAt && "bg-primary/[0.04]"
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                  <div className={cn("min-w-0", n.readAt && "pl-3.5")}>
                    <p className="text-xs font-medium truncate">{n.title}</p>
                    {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    {n.createdAt && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
