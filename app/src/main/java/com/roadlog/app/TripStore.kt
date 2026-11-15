package com.roadlog.app

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.FileNotFoundException

object TripStore {
    @Volatile var active: JSONObject? = null
    @Volatile var error = ""
    @Volatile var recording = false
    @Volatile var monitoring = false
    private fun file(context: Context,name: String) = AtomicFile(File(context.filesDir,name))
    private fun read(context: Context, name: String): String? {
        val atomic = file(context, name)
        return try {
            atomic.openRead().bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (e: FileNotFoundException) {
            if (atomic.baseFile.exists() || File(atomic.baseFile.path + ".bak").exists()) throw e
            null
        }
    }
    private fun write(context:Context,name:String,text:String) {
        val atomic=file(context,name);val stream=atomic.startWrite()
        try {stream.write(text.toByteArray(Charsets.UTF_8));atomic.finishWrite(stream)} catch(e:Exception){atomic.failWrite(stream);throw e}
    }
    private var historyRevision = 0L
    @Synchronized fun history(context: Context): JSONArray = JSONArray(read(context, "trips.json") ?: "[]")
    @Synchronized fun journal(context: Context): JSONObject = JSONObject(read(context, "journal.json") ?: "{}")
    private const val FOLDERS = "@folders"
    private fun folders(entries: JSONObject) = entries.optJSONObject(FOLDERS) ?: JSONObject()
    private fun usableName(name: String, list: JSONObject, except: String = ""): Boolean =
        name.isNotBlank() && name.length <= 32 && list.keys().asSequence().none {
            it != except && list.optString(it).equals(name.trim(), ignoreCase = true)
        }
    @Synchronized fun createFolder(context: Context, name: String): String {
        val entries = journal(context)
        val list = folders(entries)
        if (!usableName(name, list)) return ""
        val id = java.util.UUID.randomUUID().toString()
        list.put(id, name.trim())
        entries.put(FOLDERS, list)
        write(context, "journal.json", entries.toString())
        return id
    }
    @Synchronized fun editFolder(context: Context, id: String, name: String?, delete: Boolean): Boolean {
        val entries = journal(context)
        val list = folders(entries)
        if (!list.has(id)) return false
        if (delete) {
            list.remove(id)
            for (key in entries.keys()) {
                if (key == FOLDERS) continue
                val entry = entries.optJSONObject(key) ?: continue
                if (entry.optString("folder") == id) entry.remove("folder")
            }
        } else {
            if (name == null || !usableName(name, list, id)) return false
            list.put(id, name.trim())
        }
        if (list.length() == 0) entries.remove(FOLDERS) else entries.put(FOLDERS, list)
        write(context, "journal.json", entries.toString())
        return true
    }
    // A null collected value edits only the name, preserving the saved drive and its folder.
    @Synchronized fun saveConstellation(context: Context, id: String, name: String, collected: Boolean?, folder: String? = null,
                                         newFolder: String = ""): Boolean {
        if (id.isBlank() || name.length > 40) return false
        val records = history(context)
        if ((0 until records.length()).none { records.optJSONObject(it)?.optString("id") == id }) return false
        val entries = journal(context)
        val entry = entries.optJSONObject(id) ?: JSONObject()
        val list = folders(entries)
        val dest = if (newFolder.isNotEmpty()) {
            if (collected != true || !folder.isNullOrEmpty() || !usableName(newFolder, list)) return false
            val fresh = java.util.UUID.randomUUID().toString()
            list.put(fresh, newFolder.trim())
            entries.put(FOLDERS, list)
            fresh
        } else folder ?: entry.optString("folder")
        if (collected == true && (dest.isEmpty() || !list.has(dest))) return false
        if (collected == false) entry.remove("folder") else if (collected == true) entry.put("folder", dest)
        if (name.isBlank()) entry.remove("constellationName")
        else entry.put("constellationName", name.trim())
        when (collected) {
            true -> entry.put("starred", true)
            false -> entry.remove("starred")
            null -> Unit
        }
        if (entry.length() == 0) entries.remove(id) else entries.put(id, entry)
        write(context, "journal.json", entries.toString())
        return true
    }
    @Synchronized fun checkpoint(context:Context,trip:JSONObject) {active=trip;write(context,"active.json",trip.toString())}
    @Synchronized fun finish(context:Context,trip:JSONObject) {
        val all=history(context);val next=JSONArray().put(trip)
        for(i in 0 until all.length()) if(all.getJSONObject(i).optString("id")!=trip.optString("id")) next.put(all.get(i))
        write(context,"trips.json",next.toString())
        historyRevision++
        file(context,"active.json").delete()
        active=null
    }
    @Synchronized fun recover(context:Context): Boolean {
        if(recording)return true
        return try {
            val saved=read(context,"active.json") ?: return true
            val trip = JSONObject(saved)
            val trips = history(context)
            if ((0 until trips.length()).any { trips.getJSONObject(it).optString("id") == trip.optString("id") }) {
                file(context,"active.json").delete()
            } else finish(context,trip.put("title","중단된 주행 기록").put("interrupted",true))
            true
        } catch (_: Exception) {
            error = "이전 주행을 복구하지 못했습니다. 기기의 저장 공간과 기록 파일을 확인해 주세요."
            false
        }
    }
    @Synchronized fun snapshot(context:Context,restricted:Boolean,includeHistory:Boolean): String {
        val state=JSONObject().put("historyRevision",historyRevision).put("active",recording)
        .put("autoEnabled",AutoRecording.enabled(context)).put("monitoring",monitoring)
        .put("recordingAccess",AutoRecording.hasPermissions(context))
        .put("bootAccess",AutoRecording.canResumeAtBoot(context))
        .put("error",error).put("restricted",restricted)
        if(includeHistory && !restricted && !recording) {
            state.put("trips",history(context)).put("active",active ?: JSONObject.NULL)
        }
        return state.toString()
    }
}
