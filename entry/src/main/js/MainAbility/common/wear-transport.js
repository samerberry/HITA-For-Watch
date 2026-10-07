import { P2pClient, Message, Builder } from '../vendor/wearengine.js';
import { isPeerConfigured } from './peer-identity.js';

export function createWearTransport(peer, onMessage, onState) {
  let client = null;
  let poll = null;
  let ready = false;
  let generation = 0;
  function stop() {
    generation++;
    ready = false;
    if (poll !== null) clearTimeout(poll);
    poll = null;
    if (client) {
      try { client.unregisterReceiver({ onSuccess: function() {}, onFailure: function() {} }); } catch (_) {}
    }
    client = null;
  }
  return {
    configured: function() {
      return isPeerConfigured(peer);
    },
    start: function() {
      stop();
      if (!this.configured()) { onState('unconfigured'); return; }
      const token = generation;
      onState('connecting');
      try { client = new P2pClient(); } catch (_) { onState('unavailable'); return; }
      let attempts = 0;
      function register() {
        if (token !== generation) return;
        // The SDK obtains its native service version asynchronously.
        if (client.version === undefined && attempts++ < 20) {
          poll = setTimeout(register, 150);
          return;
        }
        if (!client.version || Number(client.version) < 401) { onState('unavailable'); return; }
        try {
          client.setPeerPkgName(peer.packageName);
          client.setPeerFingerPrint(peer.fingerprint);
          client.registerReceiver({
            onSuccess: function() {
              if (token !== generation) return;
              ready = true;
              // Registration alone does not prove that either phone app is connected.
              onState('waiting');
            },
            onFailure: function() {
              if (token === generation) { ready = false; onState('disconnected'); }
            },
            onReceiveMessage: function(message) {
              if (token !== generation || (message && message.isFileType)) return;
              let text = message;
              if (message && typeof message === 'object') text = message.data || message.message;
              if (typeof text === 'string') onMessage(text);
            }
          });
        } catch (_) { onState('unavailable'); }
      }
      register();
    },
    send: function(text, done) {
      if (!ready || !client) { if (done) done(new Error('NOT_READY')); return; }
      const token = generation;
      let settled = false;
      function finish(error) {
        if (settled || token !== generation) return;
        settled = true;
        if (done) done(error);
      }
      try {
        const builder = new Builder();
        builder.setDescription(text);
        const message = new Message();
        message.builder = builder;
        client.send(message, {
          onSuccess: function() {},
          onFailure: function() { finish(new Error('SEND_FAILED')); },
          onSendResult: function(result) {
            finish(result && result.code === 207 ? null : new Error('SEND_FAILED'));
          },
          onSendProgress: function() {}
        });
      } catch (e) { finish(e); }
    },
    stop: stop
  };
}
