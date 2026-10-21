/**
 * Where chat images are kept on disk (GP2 addition).
 *
 * Every stored name is generated here - a random UUID plus the extension the
 * bytes justify - and no part of a client's filename ever reaches a path. A
 * key is checked against that exact shape before it is joined to the folder,
 * so a tampered database value cannot point outside it either. The folder is
 * not served statically: files leave only through the authenticated route.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const env = require('../config/env');

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

/** Creates the uploads folder if it is missing (called at startup). */
function ensureUploadsDir(dir = env.uploadsDir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function newKey(ext) {
  return `${crypto.randomUUID()}.${ext}`;
}

/** Absolute path for a key, or null when the key is not one this module made. */
function pathFor(key, dir = env.uploadsDir) {
  if (!KEY_PATTERN.test(String(key))) return null;
  return path.join(dir, key);
}

async function write(key, buffer) {
  const file = pathFor(key);
  if (!file) throw new Error(`Refusing to write unexpected upload key ${key}`);
  ensureUploadsDir();
  // 'wx': never overwrite an existing file, however unlikely a UUID clash is.
  await fs.promises.writeFile(file, buffer, { flag: 'wx' });
}

/** Deletes a stored file. A missing file is not an error. */
async function remove(key) {
  const file = pathFor(key);
  if (!file) return;
  await fs.promises.rm(file, { force: true });
}

module.exports = { ensureUploadsDir, newKey, pathFor, write, remove, KEY_PATTERN };
