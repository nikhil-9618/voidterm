export const RELEASE_REPO = process.env.GITHUB_REPOSITORY ?? 'nikhil-9618/voidterm';
export const FALLBACK_APP_VERSION = '1.1.0';
export const FALLBACK_APK_PATH = '/downloads/VOIDTERM-1.1.0.apk';

export type AndroidRelease = {
  version: string;
  tag: string;
  downloadUrl: string;
  releaseUrl: string;
  publishedAt: string | null;
  size: number | null;
  notes: string | null;
  isFallback: boolean;
};

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  body?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
    size?: number;
  }>;
};

/**
 * Resolve the newest Android build from GitHub Releases. The website is the
 * canonical download page, while GitHub remains the release history. If the
 * GitHub request fails, the last build shipped with the website is used.
 */
export async function getLatestAndroidRelease(): Promise<AndroidRelease> {
  const releasesUrl = `https://github.com/${RELEASE_REPO}/releases`;
  const fallback: AndroidRelease = {
    version: FALLBACK_APP_VERSION,
    tag: `v${FALLBACK_APP_VERSION}`,
    downloadUrl: FALLBACK_APK_PATH,
    releaseUrl: releasesUrl,
    publishedAt: null,
    size: null,
    notes: null,
    isFallback: true,
  };

  try {
    const response = await fetch(
      `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'voidterm-site',
        },
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) return fallback;

    const data = (await response.json()) as GitHubRelease;
    const apk = data.assets?.find((asset) =>
      asset.name?.toLowerCase().endsWith('.apk'),
    );

    if (!apk?.browser_download_url) return fallback;

    return {
      version: (data.tag_name ?? `v${FALLBACK_APP_VERSION}`).replace(/^v/, ''),
      tag: data.tag_name ?? `v${FALLBACK_APP_VERSION}`,
      downloadUrl: apk.browser_download_url,
      releaseUrl: data.html_url ?? releasesUrl,
      publishedAt: data.published_at ?? null,
      size: typeof apk.size === 'number' ? apk.size : null,
      notes: data.body?.trim() || null,
      isFallback: false,
    };
  } catch {
    return fallback;
  }
}
