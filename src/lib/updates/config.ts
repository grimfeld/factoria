/**
 * Update-feature config (ADR-0010 sibling — self-hosted Android updates via
 * GitHub Releases). The repo that hosts release APKs is read from the
 * VITE_GITHUB_REPO env var (form "owner/repo"); the GitHub API for that repo is
 * the version manifest. Empty → the update check is disabled.
 */
export const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO ?? "";

export const githubLatestReleaseUrl = (): string | null =>
  GITHUB_REPO
    ? `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
    : null;
