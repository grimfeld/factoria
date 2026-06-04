import { getVersion } from "@tauri-apps/api/app";
import { githubLatestReleaseUrl } from "./config";
import { isNewer } from "./semver";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  notes: string;
  apkUrl: string | null;
}

interface GithubRelease {
  tag_name: string;
  body: string;
  assets: { name: string; browser_download_url: string }[];
}

/**
 * Check GitHub Releases for a newer version (self-hosted Android updates). Reads
 * the running app's version via Tauri, compares to the latest release tag, and
 * returns the APK asset URL when an update exists. Public repo → no auth needed.
 * Throws are the caller's to swallow (a failed check must never block the app).
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const url = githubLatestReleaseUrl();
  if (!url) return null; // update feature disabled (no repo configured)

  const currentVersion = await getVersion();

  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    if (res.status === 404) return null; // no releases yet
    throw new Error(`GitHub release check failed: ${res.status}`);
  }
  const release = (await res.json()) as GithubRelease;

  const latestVersion = release.tag_name.replace(/^v/i, "");
  const apk = release.assets.find((a) =>
    a.name.toLowerCase().endsWith(".apk"),
  );

  return {
    available: isNewer(latestVersion, currentVersion),
    currentVersion,
    latestVersion,
    notes: release.body ?? "",
    apkUrl: apk?.browser_download_url ?? null,
  };
}
