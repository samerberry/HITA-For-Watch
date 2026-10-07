package cn.berry.hita.watchbridge;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.CRC32;

/** Single-threaded, stop-and-wait protocol. All entry points use the host scheduler. */
public final class WatchSyncSession {
    public interface Transport { void send(String text, Runnable failed); }
    public interface Scheduler {
        void later(Runnable task, long delayMs);
        void cancel(Runnable task);
    }
    public interface Listener {
        void progress(int percent);
        void complete();
        void failed(String reason);
        void requested();
    }
    private final Transport transport;
    private final Scheduler scheduler;
    private final Listener listener;
    private final Runnable timeout = this::retry;
    private List<String> chunks = new ArrayList<>();
    private JSONObject waiting;
    private String id = "";
    private int next = -1;
    private int attempts;
    private boolean busy;
    private boolean sendingEnd;

    public WatchSyncSession(Transport transport, Scheduler scheduler, Listener listener) {
        this.transport = transport;
        this.scheduler = scheduler;
        this.listener = listener;
    }
    public boolean isBusy() { return busy; }

    public void start(String snapshot) {
        if (busy) throw new IllegalStateException("BUSY");
        try {
            byte[] bytes = snapshot.getBytes(StandardCharsets.UTF_8);
            JSONObject data = new JSONObject(snapshot);
            if (bytes.length == 0 || bytes.length > 65536 || data.getInt("version") != 1 ||
                    !"Asia/Shanghai".equals(data.getString("timezone")) ||
                    data.getJSONArray("events").length() > 240) throw new IllegalArgumentException("SNAPSHOT");
            chunks = split(snapshot);
            CRC32 crc = new CRC32();
            crc.update(bytes);
            id = UUID.randomUUID().toString();
            next = -1;
            sendingEnd = false;
            busy = true;
            JSONObject begin = packet("begin").put("total", chunks.size()).put("bytes", bytes.length)
                    .put("crc", String.format(Locale.ROOT, "%08x", crc.getValue()));
            await(begin);
        } catch (Exception e) {
            fail("INVALID_SNAPSHOT");
        }
    }

    public void receive(String text) {
        try {
            if (text == null || text.getBytes(StandardCharsets.UTF_8).length > 2048) return;
            JSONObject p = new JSONObject(text);
            if (!"hita-watch".equals(p.optString("p")) || p.optInt("v") != 1) return;
            String type = p.optString("t");
            if ("request".equals(type)) {
                if (!busy) listener.requested();
                return;
            }
            if (!busy || !id.equals(p.optString("id"))) return;
            if ("error".equals(type)) { fail(p.optString("error", "WATCH_ERROR")); return; }
            if ("done".equals(type) && sendingEnd) {
                cancel();
                listener.complete();
                return;
            }
            if ("busy".equals(type)) return;
            if (!"ack".equals(type) || sendingEnd) return;
            int ack = p.getInt("next");
            // Duplicate/late ACKs cannot advance or rewind an unrelated packet.
            if (ack != next + 1 || ack > chunks.size()) return;
            next = ack;
            listener.progress((int) Math.floor(100.0 * ack / chunks.size()));
            if (ack == chunks.size()) {
                sendingEnd = true;
                await(packet("end"));
            } else {
                await(packet("chunk").put("n", ack).put("data", chunks.get(ack)));
            }
        } catch (Exception ignored) {
            // Ignore malformed/unrelated traffic; the bounded timeout reports failure.
        }
    }

    public void cancel() {
        busy = false;
        scheduler.cancel(timeout);
        waiting = null;
        chunks.clear();
    }
    private JSONObject packet(String type) throws Exception {
        return new JSONObject().put("p", "hita-watch").put("v", 1).put("t", type).put("id", id);
    }
    private void await(JSONObject packet) {
        scheduler.cancel(timeout);
        waiting = packet;
        attempts = 0;
        transmit();
    }
    private void transmit() {
        if (!busy || waiting == null) return;
        attempts++;
        final JSONObject pending = waiting;
        scheduler.cancel(timeout);
        scheduler.later(timeout, sendingEnd ? 12000 : 6000);
        try {
            transport.send(pending.toString(), () -> {
                if (!busy || waiting != pending) return;
                scheduler.cancel(timeout);
                scheduler.later(timeout, 1200);
            });
        } catch (Exception e) { fail("TRANSPORT"); }
    }
    private void retry() {
        if (!busy) return;
        if (attempts >= 4) fail("TIMEOUT");
        else transmit();
    }
    private void fail(String reason) {
        cancel();
        listener.failed(reason);
    }
    private static List<String> split(String value) {
        List<String> parts = new ArrayList<>();
        StringBuilder part = new StringBuilder();
        int bytes = 0;
        for (int offset = 0; offset < value.length();) {
            int cp = value.codePointAt(offset);
            String character = new String(Character.toChars(cp));
            int length = character.getBytes(StandardCharsets.UTF_8).length;
            if (bytes + length > 384) {
                parts.add(part.toString());
                part.setLength(0);
                bytes = 0;
            }
            part.append(character);
            bytes += length;
            offset += Character.charCount(cp);
        }
        if (part.length() > 0) parts.add(part.toString());
        return parts;
    }
}
