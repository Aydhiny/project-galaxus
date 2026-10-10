// YouTube Data API v3 — public channel and video data with a plain API key.
// Quota: each call here costs 1 unit of the free 10,000/day, so a full sync
// of a 200-video channel is ~10 units.
//
// What it CAN'T read: retention, "viewed vs swiped away", impressions, CTR.
// Those need the owner's OAuth (YouTube Analytics API); Galaxus lets you type
// them in from YouTube Studio instead.

const BASE = "https://www.googleapis.com/youtube/v3";

async function get<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const url = `${BASE}/${path}?${new URLSearchParams({ ...params, key })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (/API key not valid/i.test(msg)) throw new Error("YouTube rejected your API key — paste a valid one in YouTube → Setup (it starts with \"AIza\").");
    if (/has not been used|is disabled|blocked/i.test(msg)) throw new Error("Your Google key can't use the YouTube Data API yet — enable \"YouTube Data API v3\" for that key's project in Google Cloud.");
    if (/quota/i.test(msg)) throw new Error("YouTube's free daily quota is used up — try again tomorrow.");
    throw new Error(`YouTube API: ${msg}`);
  }
  return json;
}

export type ApiChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  description: string;
  thumbnailUrl: string | null;
  subscribers: number | null;
  totalViews: number;
  videoCount: number;
  uploadsPlaylistId: string;
};

type RawChannel = {
  id: string;
  snippet: { title: string; description: string; customUrl?: string; thumbnails?: Record<string, { url: string }> };
  statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean; viewCount?: string; videoCount?: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
};

export async function fetchChannel(key: string, ref: { id: string } | { handle: string }): Promise<ApiChannel | null> {
  const params: Record<string, string> = { part: "snippet,statistics,contentDetails" };
  if ("id" in ref) params.id = ref.id;
  else params.forHandle = `@${ref.handle}`;
  const { items } = await get<{ items?: RawChannel[] }>("channels", params, key);
  const c = items?.[0];
  if (!c) return null;
  const thumbs = c.snippet.thumbnails ?? {};
  return {
    channelId: c.id,
    title: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    description: c.snippet.description,
    thumbnailUrl: (thumbs.medium ?? thumbs.default)?.url ?? null,
    subscribers: c.statistics.hiddenSubscriberCount ? null : Number(c.statistics.subscriberCount ?? 0),
    totalViews: Number(c.statistics.viewCount ?? 0),
    videoCount: Number(c.statistics.videoCount ?? 0),
    uploadsPlaylistId: c.contentDetails.relatedPlaylists.uploads,
  };
}

export type ApiVideo = {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  duration: string; // ISO-8601
  views: number;
  likes: number;
  comments: number;
  thumbnailUrl: string | null;
  hasCaptions: boolean;
};

type RawVideo = {
  id: string;
  snippet: { title: string; description: string; tags?: string[]; publishedAt: string; thumbnails?: Record<string, { url: string }> };
  contentDetails: { duration: string; caption?: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
};

/** Most recent uploads (up to `limit`), with stats. */
export async function fetchUploads(key: string, uploadsPlaylistId: string, limit = 200): Promise<ApiVideo[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get<{ items?: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(
      "playlistItems",
      { part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: "50", ...(pageToken ? { pageToken } : {}) },
      key
    );
    ids.push(...(page.items ?? []).map((i) => i.contentDetails.videoId));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < limit);

  const videos: ApiVideo[] = [];
  for (let i = 0; i < Math.min(ids.length, limit); i += 50) {
    const { items } = await get<{ items?: RawVideo[] }>(
      "videos",
      { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") },
      key
    );
    for (const v of items ?? []) {
      const thumbs = v.snippet.thumbnails ?? {};
      videos.push({
        videoId: v.id,
        title: v.snippet.title,
        description: v.snippet.description ?? "",
        tags: v.snippet.tags ?? [],
        publishedAt: v.snippet.publishedAt,
        duration: v.contentDetails.duration,
        views: Number(v.statistics.viewCount ?? 0),
        likes: Number(v.statistics.likeCount ?? 0),
        comments: Number(v.statistics.commentCount ?? 0),
        thumbnailUrl: (thumbs.high ?? thumbs.medium ?? thumbs.default)?.url ?? null,
        hasCaptions: v.contentDetails.caption === "true",
      });
    }
  }
  return videos;
}
