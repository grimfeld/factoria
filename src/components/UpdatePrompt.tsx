import { useEffect, useState } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { checkForUpdate, type UpdateInfo } from "@/lib/updates/checker";
import { downloadAndInstallApk } from "@/lib/updates/install";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * On launch (Android only), checks GitHub Releases for a newer version and, if
 * found, prompts the user to download + install it (self-hosted updates). A
 * failed check is swallowed — it must never block the app. Desktop and web are
 * no-ops (desktop has its own update story; the browser can't sideload).
 */
export function UpdatePrompt() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isAndroid = false;
    try {
      isAndroid = platform() === "android";
    } catch {
      isAndroid = false; // not in a Tauri context
    }
    if (!isAndroid) return;

    checkForUpdate()
      .then((res) => {
        if (res?.available && res.apkUrl) {
          setInfo(res);
          setOpen(true);
        }
      })
      .catch(() => {
        /* update check is best-effort */
      });
  }, []);

  async function update() {
    if (!info?.apkUrl) return;
    setBusy(true);
    setError(null);
    try {
      await downloadAndInstallApk(info.apkUrl, info.latestVersion, setProgress);
      // The Android installer takes over from here.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            Version {info.latestVersion} is available (you have{" "}
            {info.currentVersion}).
          </DialogDescription>
        </DialogHeader>

        {info.notes && (
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm text-muted-foreground">
            {info.notes}
          </div>
        )}

        {busy && (
          <div className="text-sm text-muted-foreground">
            Downloading… {Math.round(progress * 100)}%
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Later
          </Button>
          <Button onClick={update} disabled={busy}>
            {busy ? "Updating…" : "Update now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
