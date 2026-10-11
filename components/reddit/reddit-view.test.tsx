import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RedditState } from "@/lib/client/reddit";

const markPosted = vi.fn(async () => undefined);
const setStatus = vi.fn(async () => undefined);
const updatePost = vi.fn(async () => undefined);
vi.mock("@/lib/client/reddit", () => ({
  addRedditCommunityC: vi.fn(),
  discoverCommunitiesC: vi.fn(),
  draftRedditPostC: vi.fn(),
  markRedditPostedC: (...a: unknown[]) => (markPosted as (...x: unknown[]) => unknown)(...a),
  redraftRedditPostC: vi.fn(),
  refreshCommunitiesC: vi.fn(),
  saveRedditSettingsC: vi.fn(),
  setRedditCommunityStatusC: (...a: unknown[]) => (setStatus as (...x: unknown[]) => unknown)(...a),
  skipRedditPostC: vi.fn(),
  updateRedditPostC: (...a: unknown[]) => (updatePost as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/components/claude-job", () => ({ ClaudeJob: () => null }));

import { RedditView } from "./reddit-view";

const community = (over: object) => ({
  id: 1, userId: 1, name: "BanjoKazooie", title: "Banjo", description: "", subscribers: 90000,
  rules: [{ title: "Be nice", description: "No flame wars" }], promoPolicy: "ok", promoNote: "No rule about self-promotion.",
  hot: [{ title: "My Banjo fan art", url: "https://www.reddit.com/r/BanjoKazooie/comments/a/b/", score: 3, comments: 2 }],
  status: "active", source: "seed", priority: 10, lastPostedAt: null, skipUntil: null, fetchedAt: new Date(), createdAt: new Date(),
  ...over,
});

const draft = {
  id: 7, userId: 1, communityId: 1, subreddit: "BanjoKazooie", day: "2026-10-12", title: "I rebuilt my collectathon & learned a lot",
  body: "I'm the solo dev behind Hunter Mouse 2.\nWhat would you have kept?", firstComment: "Happy to share the Steam page.\n\nhttps://store.steampowered.com/app/1",
  mediaHint: "10s clip of a world", flairHint: "Showcase", angle: "rebuilding", warnings: ["A link was removed from the post text."],
  status: "draft", note: null, postUrl: null, postedAt: null, createdAt: new Date(),
};

function state(over: Partial<Record<string, unknown>> = {}): RedditState {
  return {
    settings: { userId: 1, enabled: true, dailyCap: 1, gameName: "Hunter Mouse 2", tagline: "", about: "facts", wishlistUrl: "https://store.steampowered.com/app/1", keywords: "", updatedAt: new Date() },
    communities: [community({}), community({ id: 2, name: "indiegames", promoPolicy: "banned", promoNote: "No self-promotion", hot: [], priority: 40 })],
    posts: [],
    today: "2026-10-12",
    redditConnected: true,
    next: "BanjoKazooie",
    unread: 0,
    ...over,
  } as unknown as RedditState;
}

beforeEach(() => vi.clearAllMocks());

describe("Reddit page", () => {
  it("asks for a Reddit key only when none is saved", () => {
    const { unmount } = render(<RedditView state={state({ redditConnected: false })} />);
    expect(screen.getByText(/Reddit key needed/)).toBeInTheDocument();
    unmount();
    render(<RedditView state={state()} />);
    expect(screen.queryByText(/Reddit key needed/)).not.toBeInTheDocument();
  });

  it("with no draft, shows what's next and a way to start one", () => {
    render(<RedditView state={state()} />);
    expect(screen.getByText("Next up: r/BanjoKazooie.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Draft today's post/ })).toBeEnabled();
  });

  it("opens Reddit with the post prefilled — and follows your edits", () => {
    render(<RedditView state={state({ posts: [draft] })} />);
    const open = screen.getByRole("link", { name: /Open on Reddit/ });
    expect(open).toHaveAttribute("target", "_blank");
    expect(open.getAttribute("href")).toContain("/r/BanjoKazooie/submit?");
    expect(open.getAttribute("href")).toContain("title=I%20rebuilt%20my%20collectathon%20%26%20learned%20a%20lot");

    fireEvent.change(screen.getByLabelText("Post title"), { target: { value: "A new title?" } });
    expect(screen.getByRole("link", { name: /Open on Reddit/ }).getAttribute("href")).toContain("title=A%20new%20title%3F");
  });

  it("shows warnings, the attachment hint and the rules to re-read", () => {
    render(<RedditView state={state({ posts: [draft] })} />);
    expect(screen.getByText("A link was removed from the post text.")).toBeInTheDocument();
    expect(screen.getByText(/10s clip of a world/)).toBeInTheDocument();
    expect(screen.getByText(/rules \(1\)/)).toBeInTheDocument();
  });

  it("saves an edit when you leave the field", async () => {
    render(<RedditView state={state({ posts: [draft] })} />);
    const title = screen.getByLabelText("Post title");
    fireEvent.change(title, { target: { value: "Better title" } });
    fireEvent.blur(title);
    await waitFor(() => expect(updatePost).toHaveBeenCalledWith(7, { title: "Better title" }));
  });

  it("records a post with the link you paste", async () => {
    render(<RedditView state={state({ posts: [draft] })} />);
    fireEvent.click(screen.getByRole("button", { name: /I posted it/ }));
    fireEvent.change(screen.getByPlaceholderText(/Paste the post link/), { target: { value: "https://www.reddit.com/r/BanjoKazooie/comments/zzz/x/" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark as posted" }));
    await waitFor(() => expect(markPosted).toHaveBeenCalledWith(7, "https://www.reddit.com/r/BanjoKazooie/comments/zzz/x/"));
  });

  it("labels communities by what their rules say and lets you mute one", async () => {
    render(<RedditView state={state()} />);
    expect(screen.getByText("Promo OK")).toBeInTheDocument();
    expect(screen.getByText("No self-promo")).toBeInTheDocument();
    expect(screen.getByText("Next up")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Mute" })[1]);
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(2, "muted"));
  });

  it("nudges you to take part before promoting", () => {
    render(<RedditView state={state()} />);
    expect(screen.getByText(/Give first/)).toBeInTheDocument();
    expect(screen.getByText(/Threads to help in \(1\)/)).toBeInTheDocument();
  });
});
