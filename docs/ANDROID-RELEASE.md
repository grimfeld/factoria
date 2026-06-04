# Android release & self-hosted updates

Factoria ships its Android app as a **signed APK hosted on GitHub Releases**, and
the app checks that repo on launch to offer in-app updates (no Play Store). This
doc covers cutting a release.

## One-time: signing keystore

Self-hosted updates only install over a previous version if **signed with the
same key**. Generate one release keystore and **never lose it** — losing it means
you can never update installed apps, only ship a fresh-install replacement.

```powershell
keytool -genkey -v `
  -keystore $env:USERPROFILE\factoria-release.jks `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -alias factoria
```

**Back up `factoria-release.jks` somewhere safe and private.** It is NOT in the
repo (and must never be).

### Wire it into Gradle

Create `src-tauri/gen/android/keystore.properties` (gitignored — see below):

```properties
storeFile=C:/Users/<you>/factoria-release.jks
storePassword=<store password>
keyAlias=factoria
keyPassword=<key password>
```

In `src-tauri/gen/android/app/build.gradle.kts`, add a signing config that reads
that file and apply it to the `release` build type. (Tauri's generated Gradle
project supports this; see the Tauri "Android Code Signing" guide for the exact
block to paste.)

Add to `.gitignore` (repo root) if not already covered:

```
**/keystore.properties
*.jks
*.keystore
```

## Per release (automated via CI/CD)

Releases are built and published by GitHub Actions
(`.github/workflows/release.yml`). You don't build APKs by hand — you push a tag.

1. **Bump the version** in `src-tauri/tauri.conf.json` (`version`) and
   `package.json` (keep in sync). The app reads its version from Tauri at
   runtime; the GitHub tag must be **newer** than the installed version for the
   update prompt to fire. `versionCode` is derived from the version by Tauri.

2. **Commit, tag, push:**

   ```powershell
   git commit -am "Release v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```

3. The **Release workflow** runs:
   - `gate` job — typecheck, lint, test, web build, cargo check. **If any fail,
     nothing publishes.**
   - `android` job (only `needs: gate`) — builds the **signed** APK and creates
     the GitHub Release with auto-generated notes. The APK build is itself the
     final gate: if it fails, no Release is created.

4. Done. On next launch, installed apps call
   `GET https://api.github.com/repos/<owner>/<repo>/releases/latest`, see the
   newer tag, and prompt the user to download + install.

> A faulty build can never publish: every check runs before the release step,
> and the release step depends on them passing.

## Continuous integration

`.github/workflows/ci.yml` runs on every push/PR to `main`: typecheck, lint,
test, web build (one job) and cargo check (another). This catches breakage before
it ever reaches a release tag.

## Required GitHub Actions secrets

Set these under **Settings → Secrets and variables → Actions** before the first
release:

| Secret | What it is |
| --- | --- |
| `KEYSTORE_BASE64` | The release keystore, base64-encoded (see below) |
| `KEYSTORE_PASSWORD` | Keystore store password |
| `KEY_ALIAS` | Key alias (e.g. `factoria`) |
| `KEY_PASSWORD` | Key password |
| `VITE_POCKETBASE_URL` | Hosted PocketBase URL (e.g. `https://factoria-pb.fly.dev`) |

`VITE_GITHUB_REPO` is set automatically from `github.repository` in the workflow.

### Encode the keystore for `KEYSTORE_BASE64`

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\factoria-release.jks")) | Set-Clipboard
```

Paste the clipboard contents as the `KEYSTORE_BASE64` secret value.

## Manual release (fallback, no CI)

If you ever need to build locally instead of via CI, with a local
`keystore.properties` (see signing section above):

```powershell
pnpm tauri android build --apk
gh release create v0.2.0 `
  "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk" `
  --notes "What changed."
```

## How the in-app updater works

- `src/lib/updates/checker.ts` — fetches the latest GitHub release, compares its
  tag to the running app's version (`src/lib/updates/semver.ts`), returns the APK
  asset URL when newer.
- `src/lib/updates/install.ts` — downloads the APK (http plugin) to the Download
  directory (fs plugin) and opens it (opener plugin); Android's package installer
  takes over. Requires `REQUEST_INSTALL_PACKAGES` and a FileProvider, both in the
  Android manifest.
- `src/components/UpdatePrompt.tsx` — runs the check on launch **only on
  Android**, shows the prompt, drives the download. Desktop/web are no-ops.

## Notes

- The repo hosting releases is **public**, so the API and APK downloads need no
  auth. If it ever goes private, the update check and download would need a token
  (which can't safely live in the client) — keep it public.
- First-ever release: the check returns "no update" until a release with a tag
  **newer** than the installed app's version exists.
