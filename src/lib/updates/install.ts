import { fetch } from "@tauri-apps/plugin-http";
import { writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
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

  // Write flat into the Download dir. We previously nested under a `factoria/`
  // subdir, but the fs capability scope only grants write (not mkdir) and the
  // swallowed mkdir failure left the subdir missing, so the install hand-off
  // opened a path that did not exist.
  const fileName = `factoria-${version}.apk`;
  await writeFile(fileName, bytes, { baseDir: BaseDirectory.Download });

  // Resolve the absolute path and hand off to the Android package installer via
  // our own `install_apk` command. The stock opener's open_path is broken on
  // Android (sends a bare String to a Kotlin command expecting an object) and
  // never builds a FileProvider install Intent, so we do it ourselves in Rust +
  // Kotlin (see src-tauri InstallerPlugin). downloadDir() and
  // BaseDirectory.Download resolve to the same app-scoped Download dir.
  const abs = `${await downloadDir()}/${fileName}`;
  await invoke("install_apk", { path: abs });
}
