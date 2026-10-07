import { hasCharacters, allZero } from './characters.js';

export function peerPlatform(peer) {
  // Keep the original two-field Android configuration readable.
  return peer && peer.platform === undefined ? 'android' : (peer ? peer.platform : '');
}

export function validPackageName(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (parts.length < 2) return false;
  for (let i = 0; i < parts.length; i++) {
    if (!hasCharacters(parts[i], letters + '0123456789_', 1, value.length) ||
      letters.indexOf(parts[i].charAt(0)) < 0) return false;
  }
  return true;
}

export function isPeerConfigured(peer) {
  if (!peer || !validPackageName(peer.packageName) || typeof peer.fingerprint !== 'string') return false;
  const platform = peerPlatform(peer);
  if (platform === 'harmonyos') {
    // Native HarmonyOS phone identities are AGC APP IDs, not certificate hashes.
    return hasCharacters(peer.fingerprint, '0123456789', 1, 32) && !allZero(peer.fingerprint);
  }
  return platform === 'android' && hasCharacters(peer.fingerprint, 'ABCDEFabcdef0123456789', 64, 64) &&
    !allZero(peer.fingerprint);
}

export function normalizePeer(platform, packageName, input) {
  let fingerprint = '';
  if (typeof input === 'string') {
    if (platform === 'android') {
      for (let i = 0; i < input.length; i++) {
        const character = input.charAt(i);
        if (character !== ':' && character.trim() !== '') fingerprint += character;
      }
      fingerprint = fingerprint.toUpperCase();
    } else fingerprint = input.trim();
  }
  const peer = { platform: platform, packageName: packageName, fingerprint: fingerprint };
  if (!isPeerConfigured(peer)) throw new Error('PEER_IDENTITY');
  return peer;
}
