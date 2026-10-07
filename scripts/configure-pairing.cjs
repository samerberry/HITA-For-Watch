const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const usage = [
  'Usage:',
  '  node scripts/configure-pairing.cjs --platform harmonyos <PHONE_BUNDLE_NAME> <AGC_APP_ID>',
  '  node scripts/configure-pairing.cjs --platform android <ANDROID_PACKAGE> <CERT_SHA256>',
  '  node scripts/configure-pairing.cjs --select <harmonyos|android>',
  '  node scripts/configure-pairing.cjs <ANDROID_PACKAGE> <CERT_SHA256> (legacy)',
  'HarmonyOS 5+ uses its numeric AGC APP ID, NOT a SHA-256 fingerprint or appIdentifier.'
].join('\n');

async function configure(directory, args) {
  const { normalizePeer, isPeerConfigured, validPackageName } = await import(pathToFileURL(
    path.join(root, 'entry/src/main/js/MainAbility/common/peer-identity.js')).href);
  let platform, peer;
  if (args[0] === '--select' && args.length === 2) {
    platform = args[1];
  } else if (args[0] === '--platform' && args.length === 4) {
    platform = args[1];
    peer = normalizePeer(platform, args[2], args[3]);
  } else if (args.length === 2 && !args[0].startsWith('-')) {
    platform = 'android';
    peer = normalizePeer(platform, args[0], args[1]);
  } else throw new Error(usage);
  if (!['android', 'harmonyos'].includes(platform)) throw new Error(usage);

  const profilesPath = path.join(directory, 'pairing-profiles.json');
  const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
  if (peer) profiles[platform] = { packageName: peer.packageName, fingerprint: peer.fingerprint };
  for (const name of ['android', 'harmonyos']) {
    const profile = profiles[name];
    if (!profile || (!isPeerConfigured({ ...profile, platform: name }) &&
        !(profile.fingerprint === '' && (profile.packageName === '' || validPackageName(profile.packageName))))) {
      throw new Error('Invalid saved profile: ' + name);
    }
  }
  profiles.activePlatform = platform;
  peer = { platform, packageName: profiles[platform].packageName, fingerprint: profiles[platform].fingerprint };

  const configPath = path.join(directory, 'entry/src/main/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.module.metaData ??= {};
  config.module.metaData.customizeData ??= [];
  config.module.metaData.customizeData = config.module.metaData.customizeData.filter(x => x.name !== 'supportLists');
  if (isPeerConfigured(peer)) {
    config.module.metaData.customizeData.push({
      name: 'supportLists', value: `${peer.packageName}:${peer.fingerprint}`, extra: ''
    });
  }
  const pairingPath = path.join(directory, 'entry/src/main/js/MainAbility/common/pairing.js');
  const updates = [
    [configPath, JSON.stringify(config, null, 2) + '\n'],
    [pairingPath, '// Generated public peer identity. Configure with scripts/configure-pairing.cjs.\n' +
      '// HarmonyOS: AGC APP ID. Android: signing-certificate SHA-256. No private keys.\nexport default ' +
      JSON.stringify(peer, null, 2) + ';\n'],
    [profilesPath, JSON.stringify(profiles, null, 2) + '\n']
  ];
  const originals = updates.map(([file]) => fs.readFileSync(file));
  let written = 0;
  try {
    for (const [file, text] of updates) {
      written++;
      fs.writeFileSync(file, text);
    }
  } catch (error) {
    for (let i = written - 1; i >= 0; i--) fs.writeFileSync(updates[i][0], originals[i]);
    throw error;
  }
  return { platform, configured: isPeerConfigured(peer) };
}
module.exports = { configure };
if (require.main === module) {
  configure(root, process.argv.slice(2)).then(result => {
    console.log(`Selected ${result.platform}; ${result.configured ? 'peer identity configured' : 'phone setup pending'}.`);
    console.log('Updated profiles, supportLists and watch peer identity. Rebuild and sign the watch application.');
  }).catch(error => {
    console.error(error.message === 'PEER_IDENTITY' ? usage : error.message);
    process.exitCode = 1;
  });
}
