package com.roadlog.app

import android.app.Activity
import android.app.ActivityManager.TaskDescription
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import android.webkit.*
import androidx.webkit.WebViewAssetLoader
import androidx.core.content.FileProvider
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity:Activity(){
    private lateinit var web:WebView
    @Volatile private var restricted=false
    private var safety:CarSafetyMonitor?=null
    private val sharing = AtomicBoolean(false)
    private companion object {
        const val AUTO_REQUEST = 41
        const val APP_PAGE = "https://appassets.androidplatform.net/assets/index.html"
    }
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);TripStore.recover(this)
        val appName = getString(R.string.app_name)
        @Suppress("DEPRECATION")
        val task = if (Build.VERSION.SDK_INT >= 33) {
            TaskDescription.Builder().setLabel(appName).setIcon(R.mipmap.drive_route).build()
        } else {
            TaskDescription(appName, R.mipmap.drive_route)
        }
        setTaskDescription(task)
        if(packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)){
            restricted=true
            runCatching {safety=CarSafetyMonitor(this){restricted=it}.also{it.start()}}
        }
        web=WebView(this)
        web.setBackgroundColor(getColor(R.color.drive_stamp_background))
        web.settings.apply{javaScriptEnabled=true;allowFileAccess=false;allowContentAccess=false;mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW}
        val versionName = packageManager.getPackageInfo(packageName, 0).versionName
        web.settings.userAgentString += " $appName/$versionName ($packageName)"
        val loader=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
        val tilePath = Regex("/[0-9]{1,2}/[0-9]{1,7}/[0-9]{1,7}\\.png")
        web.webViewClient=object:WebViewClient(){
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse? {
                val uri = request.url
                if (request.isForMainFrame && request.method == "GET" && uri.toString() == APP_PAGE) {
                    loader.shouldInterceptRequest(uri)?.let { return it }
                }
                if (!restricted && !TripStore.recording && !request.isForMainFrame && request.method == "GET" &&
                    uri.scheme == "https" && uri.encodedAuthority == "tile.openstreetmap.org" &&
                    uri.encodedQuery == null && tilePath.matches(uri.encodedPath.orEmpty())) return null
                return WebResourceResponse("text/plain","UTF-8",403,"Blocked",emptyMap(),java.io.ByteArrayInputStream(ByteArray(0)))
            }
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                if (!restricted && !TripStore.recording && request.isForMainFrame && request.hasGesture() &&
                    request.url.toString() == "https://www.openstreetmap.org/copyright") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                }
                return true
            }
        }
        web.addJavascriptInterface(Bridge(),"RoadlogNative")
        web.setOnApplyWindowInsetsListener{view,insets->view.setPadding(insets.systemWindowInsetLeft,insets.systemWindowInsetTop,insets.systemWindowInsetRight,insets.systemWindowInsetBottom);insets}
        setContentView(web);web.loadUrl(APP_PAGE)
    }
    inner class Bridge{
        @JavascriptInterface fun getStatus():String=TripStore.snapshot(this@MainActivity,restricted,includeHistory=false)
        @JavascriptInterface fun getState():String?=runCatching {
            TripStore.snapshot(this@MainActivity,restricted,includeHistory=true)
        }.getOrElse {
            TripStore.error="저장된 주행 기록을 읽지 못했습니다."
            null
        }
        @JavascriptInterface fun getJournal():String? =
            if (restricted || TripStore.recording) null
            else runCatching { TripStore.journal(this@MainActivity).toString() }.getOrNull()
        @JavascriptInterface fun renameDrive(id: String, name: String): Boolean =
            !restricted && !TripStore.recording && name.isNotBlank() && runCatching {
                TripStore.saveConstellation(this@MainActivity, id, name, collected = null)
            }.getOrDefault(false)
        @JavascriptInterface fun saveConstellation(id: String, name: String, collected: Boolean): Boolean =
            !restricted && !TripStore.recording && runCatching {
                TripStore.saveConstellation(this@MainActivity, id, name, collected)
            }.getOrDefault(false)
        @JavascriptInterface fun fileConstellation(id: String, name: String, folder: String, newFolder: String): Boolean =
            !restricted && !TripStore.recording && runCatching {
                TripStore.saveConstellation(this@MainActivity, id, name, true, folder, newFolder)
            }.getOrDefault(false)
        @JavascriptInterface fun createSkyFolder(name: String): String =
            if (restricted || TripStore.recording) "" else runCatching { TripStore.createFolder(this@MainActivity, name) }.getOrDefault("")
        @JavascriptInterface fun renameSkyFolder(id: String, name: String): Boolean =
            !restricted && !TripStore.recording && runCatching { TripStore.editFolder(this@MainActivity, id, name, false) }.getOrDefault(false)
        @JavascriptInterface fun removeSkyFolder(id: String): Boolean =
            !restricted && !TripStore.recording && runCatching { TripStore.editFolder(this@MainActivity, id, null, true) }.getOrDefault(false)
        @JavascriptInterface fun prepareAutomaticRecording() = runOnUiThread {
            if (!restricted && !TripStore.recording) requestRecording()
        }
        @JavascriptInterface fun openAppPermissions() = runOnUiThread {
            if (!restricted && !TripStore.recording) {
                val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.fromParts("package", packageName, null))
                runCatching { startActivity(intent) }.onFailure { TripStore.error = "차량 설정에서 StarRoad 앱 권한을 확인해 주세요." }
            }
        }
        @JavascriptInterface fun requestBootAccess(){runOnUiThread{
            if(!restricted && !TripStore.recording && Build.VERSION.SDK_INT >= 29 && AutoRecording.hasPermissions(this@MainActivity) &&
                !AutoRecording.canResumeAtBoot(this@MainActivity))
                requestPermissions(arrayOf(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION),43)
        }}
        @JavascriptInterface fun shareImage(data:String){
            if(restricted || TripStore.recording || data.length>8_000_000 ||
                !data.startsWith("data:image/png;base64,") || !sharing.compareAndSet(false,true)) return
            val appName = getString(R.string.app_name)
            // The JS bridge runs off the UI thread. Recheck driving restrictions before opening the chooser.
            val uri=runCatching {
                val bytes=android.util.Base64.decode(data.substringAfter(','),android.util.Base64.DEFAULT)
                val bounds=android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds=true }
                android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                require(bounds.outMimeType=="image/png" && bounds.outWidth==1080 && bounds.outHeight==1080)
                val dir=File(cacheDir,"share").apply{mkdirs()}
                val files=dir.listFiles().orEmpty().filter { it.isFile }.sortedByDescending { it.lastModified() }
                val cutoff=System.currentTimeMillis()-7L*24*60*60*1000
                files.forEachIndexed { i,f -> if(i>=7 || f.lastModified()<cutoff) f.delete() }
                val file=File.createTempFile("$appName-drive-", ".png", dir).apply{writeBytes(bytes)}
                FileProvider.getUriForFile(this@MainActivity,"$packageName.files",file)
            }.getOrElse {
                sharing.set(false)
                TripStore.error="공유 이미지를 준비하지 못했습니다."
                return
            }
            runOnUiThread{try{
                if (restricted || TripStore.recording || isFinishing || isDestroyed) return@runOnUiThread
                val send=Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM,uri).apply {
                    clipData=ClipData.newUri(contentResolver,appName,uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser=Intent.createChooser(send,null).apply {
                    clipData=send.clipData
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(chooser)
            }catch (_:Exception){TripStore.error="공유할 앱을 열 수 없습니다."}
            finally { sharing.set(false) }}
        }
    }
    override fun onResume(){
        super.onResume()
        if(AutoRecording.enabled(this) && !TripStore.monitoring && AutoRecording.hasPermissions(this)) AutoRecording.arm(this)
    }
    private fun requestRecording(){
        TripStore.error=""
        val missing = AutoRecording.permissions.filterNot {AutoRecording.granted(this,it)}.toMutableList()
        if(Build.VERSION.SDK_INT>=33 && !AutoRecording.granted(this,android.Manifest.permission.POST_NOTIFICATIONS))
            missing.add(android.Manifest.permission.POST_NOTIFICATIONS)
        if(missing.isNotEmpty()) requestPermissions(missing.toTypedArray(),AUTO_REQUEST) else begin()
    }
    private fun begin(){
        if (restricted || TripStore.recording) return
        if (!AutoRecording.hasPermissions(this)) {
            TripStore.error="위치와 차량 신호 권한이 필요합니다. 설정에서 앱 권한을 확인해 주세요."
            return
        }
        AutoRecording.setEnabled(this,true)
        AutoRecording.arm(this)
    }
    override fun onRequestPermissionsResult(code:Int,perms:Array<out String>,results:IntArray){super.onRequestPermissionsResult(code,perms,results)
        if(code==AUTO_REQUEST) begin()
        if(code==43) TripStore.error=if(AutoRecording.canResumeAtBoot(this)) "" else
            "이 차량에서 상시 위치 권한을 사용할 수 없으면 차량을 다시 켠 뒤 StarRoad를 한 번 열어 주세요."
    }
    @Deprecated("Android activity back navigation")
    override fun onBackPressed() {
        if (restricted || TripStore.recording) { super.onBackPressed(); return }
        web.evaluateJavascript("typeof window.starRoadBack === 'function' && window.starRoadBack()") { handled ->
            if (handled != "true" && !isFinishing) super.onBackPressed()
        }
    }
    override fun onDestroy(){safety?.stop();if(::web.isInitialized){web.removeJavascriptInterface("RoadlogNative");web.destroy()};super.onDestroy()}
}
