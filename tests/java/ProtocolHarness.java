import cn.berry.hita.watchbridge.WatchSyncSession;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/** Line-based peer used to test the real Java sender against the real watch receiver. */
public final class ProtocolHarness {
    public static void main(String[] args) throws Exception {
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        final Runnable[] timeout = {null};
        final boolean[] complete = {false};
        WatchSyncSession session = new WatchSyncSession(
            (text, failed) -> System.out.println("TX " + text),
            new WatchSyncSession.Scheduler() {
                public void later(Runnable task, long delay) { timeout[0] = task; }
                public void cancel(Runnable task) { if (timeout[0] == task) timeout[0] = null; }
            },
            new WatchSyncSession.Listener() {
                public void progress(int progress) {}
                public void requested() {}
                public void complete() { complete[0] = true; System.out.println("DONE"); }
                public void failed(String reason) { complete[0] = true; System.out.println("FAIL " + reason); }
            });
        session.start(input.readLine());
        String line;
        while (!complete[0] && (line = input.readLine()) != null) {
            if (line.equals("!timeout")) {
                Runnable task = timeout[0];
                timeout[0] = null;
                if (task != null) task.run();
            } else session.receive(line);
        }
    }
}
