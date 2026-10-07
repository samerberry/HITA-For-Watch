package cn.berry.hita.watchbridge

import cn.limpu.hita.data.model.timetable.EventItem
import cn.limpu.hita.data.model.timetable.Timetable
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

/**
 * Copy into the Android application's source set, not the generic bridge module.
 * visibleEvents must be the current timetable's actual, non-deleted event instances.
 * Query on Dispatchers.IO; do not fetch EAS or expand course week rules on the watch.
 */
object HitaSnapshotAdapter {
    private val zone = ZoneId.of("Asia/Shanghai")

    fun export(
        timetable: Timetable,
        visibleEvents: List<EventItem>,
        campus: String,
        now: Long = System.currentTimeMillis()
    ): String {
        require(timetable.startTime.time > 0) { "请先在手机确认开学日期" }
        val monday = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val termStart = timetable.startTime.toInstant().atZone(zone).toLocalDate()
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val from = monday.atStartOfDay(zone).toInstant().toEpochMilli()
        val until = monday.plusDays(14).atStartOfDay(zone).toInstant().toEpochMilli()
        val events = visibleEvents.filter {
            it.timetableId == timetable.id && it.type != EventItem.TYPE.TAG &&
                it.from.time < until && it.to.time > from
        }.distinctBy { it.id }.sortedBy { it.from.time }
        require(events.size <= 240) { "同步范围内课程过多，请缩小范围" }
        // Expand coverage for rare midnight-spanning events instead of altering class times.
        val rangeStart = Instant.ofEpochMilli(minOf(from, events.minOfOrNull { it.from.time } ?: from))
            .atZone(zone).toLocalDate()
        val rangeEnd = Instant.ofEpochMilli(maxOf(until - 1, events.maxOfOrNull { it.to.time - 1 } ?: (until - 1)))
            .atZone(zone).toLocalDate()
        val array = JSONArray()
        events.forEach { event ->
            require(event.to.time > event.from.time)
            val sections = if (event.type == EventItem.TYPE.CLASS && event.fromNumber > 0 &&
                event.lastNumber >= event.fromNumber) "第${event.fromNumber}-${event.lastNumber}节" else ""
            array.put(JSONObject()
                .put("id", event.id).put("title", event.name)
                .put("room", event.place.orEmpty()).put("teacher", event.teacher.orEmpty())
                .put("kind", event.type.name).put("sections", sections)
                .put("startAt", event.from.time).put("endAt", event.to.time))
        }
        return JSONObject().put("version", 1).put("timezone", "Asia/Shanghai")
            .put("generatedAt", now).put("rangeStart", rangeStart.toString())
            .put("rangeEnd", rangeEnd.toString())
            .put("timetable", JSONObject().put("id", timetable.id)
                .put("name", timetable.name?.takeIf { it.isNotBlank() } ?: "我的课表")
                .put("campus", campus).put("termStart", termStart.toString()))
            .put("events", array).toString().also {
                require(it.toByteArray(Charsets.UTF_8).size <= 65536) { "课表超过同步容量" }
            }
    }
}
