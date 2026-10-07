package cn.berry.hita.watchbridge;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import com.huawei.wearengine.HiWear;
import com.huawei.wearengine.auth.AuthCallback;
import com.huawei.wearengine.auth.Permission;
import com.huawei.wearengine.device.Device;
import com.huawei.wearengine.p2p.Message;
import com.huawei.wearengine.p2p.P2pClient;
import com.huawei.wearengine.p2p.Receiver;
import com.huawei.wearengine.p2p.SendCallback;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Foreground companion, deliberately no permanent service or background wakeups. */
public final class WearEngineLink implements AutoCloseable {
    public interface Devices {
        void found(List<Device> devices);
        void failed(String reason);
    }
    public interface State extends WatchSyncSession.Listener {
        void ready();
    }
    private final Handler main = new Handler(Looper.getMainLooper());
    private final P2pClient client;
    private final Device device;
    private final State state;
    private final WatchSyncSession session;
    private final Receiver receiver;
    private boolean closed;
    private boolean registered;

    /** Call from an Activity after the user explicitly chooses to connect a watch. */
    public static void requestDevices(Activity activity, Devices callback) {
        Handler main = new Handler(Looper.getMainLooper());
        HiWear.getAuthClient(activity).requestPermission(new AuthCallback() {
            @Override public void onOk(Permission[] permissions) {
                HiWear.getDeviceClient(activity).getBondedDevices()
                        .addOnSuccessListener(devices -> main.post(() -> callback.found(devices)))
                        .addOnFailureListener(error -> main.post(() -> callback.failed("DEVICE_LIST")));
            }
            @Override public void onCancel() { main.post(() -> callback.failed("PERMISSION_DENIED")); }
        }, Permission.DEVICE_MANAGER).addOnFailureListener(error ->
                main.post(() -> callback.failed("AUTH_UNAVAILABLE")));
    }

    public WearEngineLink(Activity activity, Device device, String watchPackage,
                          String watchSha256, State state) {
        if (!watchPackage.matches("[a-zA-Z][a-zA-Z0-9_.]+") ||
                !watchSha256.matches("[a-fA-F0-9]{64}")) throw new IllegalArgumentException("PEER_IDENTITY");
        this.device = device;
        this.state = state;
        client = HiWear.getP2pClient(activity);
        client.setPeerPkgName(watchPackage);
        client.setPeerFingerPrint(watchSha256);
        session = new WatchSyncSession(this::send, new WatchSyncSession.Scheduler() {
            @Override public void later(Runnable task, long delay) { main.postDelayed(task, delay); }
            @Override public void cancel(Runnable task) { main.removeCallbacks(task); }
        }, state);
        receiver = message -> {
            if (message == null || message.getData() == null || message.getData().length > 2048) return;
            String text = new String(message.getData(), StandardCharsets.UTF_8);
            main.post(() -> { if (!closed) session.receive(text); });
        };
    }
    public void open() {
        main.post(() -> {
            if (closed || registered) return;
            if (!device.isConnected()) { state.failed("DEVICE_DISCONNECTED"); return; }
            client.registerReceiver(device, receiver).addOnSuccessListener(ignored -> main.post(() -> {
                if (closed) { client.unregisterReceiver(receiver); return; }
                registered = true;
                state.ready();
            })).addOnFailureListener(error -> main.post(() -> {
                if (!closed) state.failed("REGISTER_RECEIVER");
            }));
        });
    }
    public void sync(String snapshot) {
        main.post(() -> {
            if (closed || !registered) { state.failed("NOT_READY"); return; }
            if (session.isBusy()) { state.failed("BUSY"); return; }
            session.start(snapshot);
        });
    }
    private void send(String text, Runnable failed) {
        Message message = new Message.Builder().setPayload(text.getBytes(StandardCharsets.UTF_8)).build();
        client.send(device, message, new SendCallback() {
            @Override public void onSendResult(int code) {
                if (code != 207) main.post(failed);
            }
            @Override public void onSendProgress(long progress) {}
        }).addOnFailureListener(error -> main.post(failed));
    }
    @Override public void close() {
        main.post(() -> {
            if (closed) return;
            closed = true;
            session.cancel();
            client.unregisterReceiver(receiver);
            registered = false;
        });
    }
}
