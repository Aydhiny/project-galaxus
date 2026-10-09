"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPage } from "@/lib/actions/pages";
import { toast } from "sonner";

export function NewPageButton({ parentId }: { parentId?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const id = await createPage(parentId ?? null);
            router.push(`/pages/${id}`);
          } catch {
            toast.error("Couldn't create the page. Try again.");
          }
        })
      }
    >
      <Plus /> New page
    </Button>
  );
}
