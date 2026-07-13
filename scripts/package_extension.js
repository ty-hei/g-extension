'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const PACKAGE_FILES = [
  'manifest.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'api_config.js',
  'background.js',
  'content_script.js',
  'extraction_core.js',
  'link_content_extractor.js',
  'page_content_extractor.js',
  'reader_content_extractor.js',
  'regex_content_extractor.js',
  'regex_engine.js',
  'regex_worker.js',
  'sidebar.html', 'sidebar.css', 'sidebar.js',
  'options.html', 'options.js',
  'archive.html', 'archive.css', 'archive.js',
  'prompts.html', 'prompts.css', 'prompts.js',
  'libs/marked.min.js',
  'libs/Readability.js',
  'libs/safe_markdown.js',
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json',
  'images/icon16.png',
  'images/icon48.png',
  'images/icon128.png',
  'guide/index.html',
  'guide/index.js',
  'guide/api_guide.html',
  'guide/EN-AR.jpg', 'guide/EN-MAIN.jpg', 'guide/EN-OP.jpg',
  'guide/ZH_AR.jpg', 'guide/ZH_MAIN.jpg', 'guide/ZH-OP.jpg',
  'privacy_policy/index.html',
  'privacy_policy/privacy_policy_zh.html'
];

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xEDB88320 : 0);
    return value >>> 0;
  });
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll(path.sep, '/'), 'utf8');
    const compressed = zlib.deflateRawSync(entry.content, { level: 9 });
    const crc = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildPackage(outputPath) {
  const missing = PACKAGE_FILES.filter(file => !fs.existsSync(path.join(ROOT, file)));
  if (missing.length > 0) throw new Error(`Package allowlist contains missing files: ${missing.join(', ')}`);
  const entries = PACKAGE_FILES.slice().sort().map(name => ({
    name,
    content: fs.readFileSync(path.join(ROOT, name))
  }));
  const resolvedOutput = path.resolve(outputPath || path.join(ROOT, 'dist', `g-extension-${manifest.version}.zip`));
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, createZip(entries));
  return resolvedOutput;
}

if (require.main === module) {
  const outputIndex = process.argv.indexOf('--output');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  process.stdout.write(`${buildPackage(outputPath)}\n`);
}

module.exports = { PACKAGE_FILES, buildPackage, createZip };
