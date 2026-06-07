package com.grimfeld.factoria

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class InstallApkArgs {
  lateinit var path: String
}

/**
 * App-local Tauri plugin that launches Android's package installer for a
 * downloaded APK (self-hosted in-app updates).
 *
 * The stock tauri-plugin-opener cannot do this: its mobile `open_path` sends a
 * bare String to a Kotlin command that expects an OpenArgs object, and even when
 * that is worked around its Intent has no FileProvider URI, no package-archive
 * MIME type, and no read-URI grant, so the installer never launches.
 *
 * Registered from Rust via register_android_plugin and invoked through the
 * `install_apk` app command.
 */
@TauriPlugin
class InstallerPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun install_apk(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(InstallApkArgs::class.java)
      val file = File(args.path)
      if (!file.exists()) {
        invoke.reject("APK not found at ${args.path}")
        return
      }

      val authority = "${activity.packageName}.fileprovider"
      val uri: Uri = FileProvider.getUriForFile(activity, authority, file)

      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      invoke.resolve()
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: ex.toString())
    }
  }
}
