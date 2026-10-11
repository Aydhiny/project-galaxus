import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const save = vi.fn().mockResolvedValue(undefined);
const test = vi.fn(async () => ({ ok: true, message: "Working — reached r/IndieDev." }));
vi.mock("@/lib/client/reddit", () => ({
  saveRedditConnectionC: (...a: unknown[]) => save(...a),
  testRedditConnectionC: () => test(),
}));

import { RedditConnectionCard } from "./reddit-connection";

beforeEach(() => vi.clearAllMocks());

describe("Reddit connection card", () => {
  it("says a key is needed until one is saved — and never shows the key", () => {
    const { unmount } = render(<RedditConnectionCard connection={{ connected: false, username: null }} />);
    expect(screen.getByText("Key needed")).toBeInTheDocument();
    unmount();
    render(<RedditConnectionCard connection={{ connected: true, username: "Aydhiny" }} />);
    expect(screen.getByText("Key saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Reddit username")).toHaveValue("Aydhiny");
    expect(screen.getByLabelText("Reddit client secret")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Reddit client secret")).toHaveValue("");
  });

  it("only enables Save when there is something to save", () => {
    render(<RedditConnectionCard connection={{ connected: true, username: "Aydhiny" }} />);
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reddit username"), { target: { value: "NewName" } });
    expect(saveBtn).toBeEnabled();
  });

  it("saves the key and username together, then clears the secret fields", async () => {
    render(<RedditConnectionCard connection={{ connected: false, username: null }} />);
    fireEvent.change(screen.getByLabelText("Reddit client ID"), { target: { value: "abcDEF123456" } });
    fireEvent.change(screen.getByLabelText("Reddit client secret"), { target: { value: "s3cret-s3cret-s3cret-123" } });
    fireEvent.change(screen.getByLabelText("Reddit username"), { target: { value: "u/Aydhiny" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ clientId: "abcDEF123456", clientSecret: "s3cret-s3cret-s3cret-123", username: "u/Aydhiny" }));
    await waitFor(() => expect(screen.getByLabelText("Reddit client secret")).toHaveValue(""));
    expect(screen.getByLabelText("Reddit client ID")).toHaveValue("");
  });

  it("shows what Reddit said when you test the connection", async () => {
    render(<RedditConnectionCard connection={{ connected: true, username: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText("Working — reached r/IndieDev.")).toBeInTheDocument();
  });

  it("removes the key only after you confirm, and only offers it when one is saved", async () => {
    const { unmount } = render(<RedditConnectionCard connection={{ connected: false, username: null }} />);
    expect(screen.queryByLabelText("Remove Reddit key")).not.toBeInTheDocument();
    unmount();

    render(<RedditConnectionCard connection={{ connected: true, username: null }} />);
    const confirm = vi.spyOn(window, "confirm");
    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByLabelText("Remove Reddit key"));
    expect(save).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByLabelText("Remove Reddit key"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null));
    confirm.mockRestore();
  });

  it("links to both places the key is used", () => {
    render(<RedditConnectionCard connection={{ connected: false, username: null }} />);
    expect(screen.getByRole("link", { name: /Game Reddit/ })).toHaveAttribute("href", "/game/reddit");
    expect(screen.getByRole("link", { name: /Gig radar/ })).toHaveAttribute("href", "/gigs");
  });
});
