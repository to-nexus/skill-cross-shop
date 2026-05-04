// _session.mjs — load/save per-game cross.shop sessions.
//
// Session file lives at:
//   ~/.claude/skills/cross-shop/.sessions/<game>.json
//
// Stored fields (NEVER the raw UUID):
//   { token, expiresAt, uuidHash, savedAt }
//
// Permissions: written with chmod 600. UUID is held in process memory only;
// at rest we keep sha256(uuid) so that a future invocation can detect
// "is this the same UUID as last time?" without ever persisting the raw
// credential. See REQUIREMENTS SEC-02 / SEC-03.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SESSION_DIR = path.join(os.homedir(), '.claude', 'skills', 'cross-shop', '.sessions');

export function uuidHash(uuid) {
  if (typeof uuid !== 'string' || uuid.length === 0) {
    const err = new Error('uuid must be a non-empty string');
    err.code = 'bad_uuid';
    throw err;
  }
  return crypto.createHash('sha256').update(uuid).digest('hex');
}

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  }
}

function sessionPath(game) {
  return path.join(SESSION_DIR, `${game}.json`);
}

export function loadSession(game) {
  const p = sessionPath(game);
  if (!fs.existsSync(p)) return null;
  try {
    // Refuse to load a session file that isn't owned by the current user.
    const st = fs.statSync(p);
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
      const err = new Error(`session file ${p} not owned by current user (uid mismatch)`);
      err.code = 'session_file_alien';
      throw err;
    }
    const txt = fs.readFileSync(p, 'utf8');
    const json = JSON.parse(txt);
    return { ...json, _path: p };
  } catch (err) {
    if (err.code === 'session_file_alien') throw err;
    const e = new Error(`failed to read session file ${p}: ${err.message}`);
    e.code = 'session_read_failed';
    throw e;
  }
}

export function saveSession(game, { token, expiresAt, uuid }) {
  if (!token) {
    const err = new Error('saveSession: token required');
    err.code = 'bad_session';
    throw err;
  }
  ensureSessionDir();
  const p = sessionPath(game);
  const payload = {
    game,
    token,
    expiresAt: expiresAt ?? null,
    uuidHash: uuid ? uuidHash(uuid) : null,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), { mode: 0o600 });
  // Defensive: re-chmod in case the OS umask interfered.
  fs.chmodSync(p, 0o600);
  return { ...payload, _path: p };
}

/**
 * Compare a candidate UUID against the stored uuidHash in a session.
 * Returns null if there is no stored hash, true on match, false on mismatch.
 */
export function uuidMatchesSession(session, uuid) {
  if (!session || !session.uuidHash) return null;
  if (!uuid) return null;
  return uuidHash(uuid) === session.uuidHash;
}

export function deleteSession(game) {
  const p = sessionPath(game);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return p;
}
