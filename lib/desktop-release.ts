// Finds the latest desktop installers on the public GitHub Releases page.
// Server-side + cached for an hour, so visitors never hit GitHub's
// unauthenticated API rate limit (60 req/hour per IP) themselves.

const REPO = "Aydhiny/project-galaxus";

export interface DesktopDownloads {
  version: string | null;
  mac: string | null; // universal .dmg (Apple Silicon + Intel)
  windows: string | null; // NSIS -setup.exe
  releaseUrl: string;
}

interface GithubRelease {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

export async function getDesktopDownloads(): Promise<DesktopDownloads> {
  const fallback: DesktopDownloads = { version: null, mac: null, windows: null, releaseUrl: `https://github.com/${REPO}/releases` };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return fallback;
    const releases = (await res.json()) as GithubRelease[];
    // The repo may get other releases later — only look at desktop ones.
    const rel = releases.find((r) => r.tag_name.startsWith("desktop-v") && r.assets.length > 0);
    if (!rel) return fallback;
    const find = (re: RegExp) => rel.assets.find((a) => re.test(a.name))?.browser_download_url ?? null;
    return {
      version: rel.tag_name.replace(/^desktop-v/, ""),
      mac: find(/\.dmg$/i),
      windows: find(/-setup\.exe$/i) ?? find(/\.msi$/i),
      releaseUrl: rel.html_url,
    };
  } catch {
    return fallback;
  }
}
