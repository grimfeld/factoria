import { fetch } from "@tauri-apps/plugin-http";
import { writeFile, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { downloadDir } from "@tauri-apps/api/path";

/**
 * Download an APK from GitHub and launch the Android installer (self-hosted
 * updates). The file is written under the Download directory; opening it hands
 * off to Android's package installer (the app holds REQUEST_INSTALL_PACKAGES and
 * a FileProvider, so the install prompt appears). The user confirms the install.
 *
 * @param apkUrl  GitHub release asset URL (https)
 * @param version target version, used in the filename
 * @param onProgress optional 0..1 download progress
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  version: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const res = await fetch(apkUrl, { method: "GET" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total > 0) onProgress?.(received / total);
      }
    }
  } else {
    chunks.push(new Uint8Array(await res.arrayBuffer()));
  }

  const bytes = new Uint8Array(received || chunks[0]?.length || 0);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }

  const dir = "factoria";
  const fileName = `${dir}/factoria-${version}.apk`;
  await mkdir(dir, { baseDir: BaseDirectory.Download, recursive: true }).catch(
    () => {},
  );
  await writeFile(fileName, bytes, { baseDir: BaseDirectory.Download });

  // Resolve the absolute path and hand off to the Android package installer.
  const abs = `${await downloadDir()}/${fileName}`;
  await openPath(abs);
}
