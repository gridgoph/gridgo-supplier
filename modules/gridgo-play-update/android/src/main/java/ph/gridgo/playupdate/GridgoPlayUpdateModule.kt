package ph.gridgo.playupdate

import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Flexible updates only. Nothing initializes Play until JS calls a method. */
class GridgoPlayUpdateModule : Module() {
  private var manager: AppUpdateManager? = null
  private val listener by lazy {
    InstallStateUpdatedListener { state ->
      if (state.installStatus() == InstallStatus.DOWNLOADED) {
        // Installing is a separate, explicit user action; never restart here.
        sendEvent("downloaded", emptyMap<String, Any>())
      }
    }
  }

  private fun updateManager(): AppUpdateManager {
    manager?.let { return it }
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    return AppUpdateManagerFactory.create(context).also {
      it.registerListener(listener)
      manager = it
    }
  }

  override fun definition() = ModuleDefinition {
    Name("GridgoPlayUpdate")
    Events("downloaded")

    AsyncFunction("checkForUpdate") { promise: Promise ->
      updateManager().appUpdateInfo
        .addOnSuccessListener { info ->
          promise.resolve(mapOf(
            "available" to (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE),
            "flexibleAllowed" to info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
            "downloaded" to (info.installStatus() == InstallStatus.DOWNLOADED)
          ))
        }
        .addOnFailureListener { promise.reject("ERR_PLAY_UPDATE", it.message, it) }
    }

    AsyncFunction("startFlexibleUpdate") { promise: Promise ->
      val updates = updateManager()
      // Each flow needs fresh AppUpdateInfo; Play info objects are single use.
      updates.appUpdateInfo
        .addOnSuccessListener { info ->
          val activity = appContext.currentActivity
          if (activity == null ||
            info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE ||
            !info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) ||
            info.installStatus() == InstallStatus.PENDING ||
            info.installStatus() == InstallStatus.DOWNLOADING ||
            info.installStatus() == InstallStatus.DOWNLOADED
          ) {
            promise.resolve(false)
          } else {
            try {
              promise.resolve(updates.startUpdateFlowForResult(
                info,
                activity,
                AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
                7421
              ))
            } catch (error: Exception) {
              promise.reject("ERR_PLAY_UPDATE", error.message, error)
            }
          }
        }
        .addOnFailureListener { promise.reject("ERR_PLAY_UPDATE", it.message, it) }
    }

    AsyncFunction("completeUpdate") { promise: Promise ->
      updateManager().completeUpdate()
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject("ERR_PLAY_UPDATE", it.message, it) }
    }

    OnDestroy {
      manager?.let { it.unregisterListener(listener) }
      manager = null
    }
  }
}
