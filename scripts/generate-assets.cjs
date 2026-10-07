const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'entry/src/main/js/MainAbility/common');
const lucide = path.dirname(require.resolve('lucide-static/package.json'));
async function main() {
  for (const [name, icon] of Object.entries({
    sync: 'refresh-cw', calendar: 'calendar-days', back: 'chevron-left', watch: 'watch'
  })) {
    const svg = fs.readFileSync(path.join(lucide, 'icons', icon + '.svg'), 'utf8')
      .replace(/currentColor/g, '#B6D5FF');
    await sharp(Buffer.from(svg)).resize(96, 96).png().toFile(path.join(out, name + '.png'));
  }
  const source = process.argv[2] || path.resolve(root, '../HitaNEXT/AppScope/resources/base/media/app_icon.png');
  const media = path.join(root, 'entry/src/main/resources/base/media');
  fs.mkdirSync(media, { recursive: true });
  await sharp(source).resize(192, 192).png().toFile(path.join(media, 'app_icon.png'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
