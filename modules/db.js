// db.js
// Unified database layer — creates/returns a better-sqlite3 Database
const path = require('path');
const Database = require('better-sqlite3');

const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
const classesDbPath = path.join(dataDir, 'classes.db');
const phucKhaoDbPath = path.join(dataDir, 'phuckhao.db');

if (!fs.existsSync(phucKhaoDbPath)) {
  fs.writeFileSync(phucKhaoDbPath, '');
}

const db = new Database(classesDbPath);

try {
  db.exec(`ATTACH DATABASE '${path.join(dataDir, 'users.db').replace(/'/g, "''")}' AS users;`);
} catch (err) {
  // ignore attach error (file may not exist yet)
}

try {
  db.exec(`ATTACH DATABASE '${path.join(dataDir, 'homeworks.db').replace(/'/g, "''")}' AS hw;`);
} catch (err) {
  // ignore attach error
}

try {
  db.exec(`ATTACH DATABASE '${phucKhaoDbPath.replace(/'/g, "''")}' AS pk;`);
} catch (err) {
  // ignore attach error
}

// ── 1. Đảm bảo các schema phụ đã được ATTACH (Nếu trong Database.js chưa ATTACH) ──
// Ví dụ:
// db.exec(`ATTACH DATABASE './data/users.db' AS users;`);
// db.exec(`ATTACH DATABASE './data/hw.db' AS hw;`);
// db.exec(`ATTACH DATABASE './data/phuckhao.db' AS pk;`);

// ── User tables (in attached "users" schema) ──────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS users.admins (
  id TEXT PRIMARY KEY,
  fullName TEXT,
  email TEXT,
  pass TEXT,
  activate TEXT DEFAULT 'false'
)`);

db.exec(`CREATE TABLE IF NOT EXISTS users.teachers (
  id TEXT PRIMARY KEY,
  fullName TEXT,
  email TEXT,
  pass TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS users.tas (
  id TEXT PRIMARY KEY,
  fullName TEXT,
  email TEXT,
  pass TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS users.students (
  id TEXT PRIMARY KEY,
  fullName TEXT,
  email TEXT,
  pass TEXT
)`);

// ── Class tables (in main "classes.db" schema) ────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS classes (
  classId TEXT PRIMARY KEY,
  className TEXT,
  description TEXT,
  status TEXT,
  note TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS class_members (
  classId TEXT,
  userId TEXT,
  fullName TEXT,
  role TEXT,
  PRIMARY KEY (classId, userId)
)`);

// ── Homework tables (in attached "hw" schema) ─────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS hw.homeworks (
  homeworkId TEXT PRIMARY KEY,
  teacherId TEXT,
  classId TEXT,
  title TEXT,
  note TEXT,
  deadline TEXT,
  createdAt TEXT,
  joinLink TEXT,
  points REAL DEFAULT 10,
  status TEXT DEFAULT 'published'
)`);

db.exec(`CREATE TABLE IF NOT EXISTS hw.submissions (
  id TEXT PRIMARY KEY,
  homeworkId TEXT,
  studentId TEXT,
  fileLink TEXT,
  submittedAt TEXT,
  score REAL,
  comment TEXT,
  appealReason TEXT,
  appealStatus TEXT DEFAULT 'none',
  appealSubmittedAt TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS pk.requests (
  id TEXT PRIMARY KEY,
  submissionId TEXT,
  homeworkId TEXT,
  studentId TEXT,
  studentName TEXT,
  classId TEXT,
  className TEXT,
  homeworkTitle TEXT,
  appealReason TEXT,
  appealStatus TEXT DEFAULT 'pending',
  requestedAt TEXT,
  updatedAt TEXT
)`);

// The CREATE TABLE above only applies to brand-new databases — SQLite skips
// it (IF NOT EXISTS) if hw.db already exists from before teacherId/points/
// status existed. Backfill those columns for existing databases too.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so try each and ignore the
// "duplicate column name" error when it's already there.
for (const alterStmt of [
  `ALTER TABLE hw.homeworks ADD COLUMN teacherId TEXT`,
  `ALTER TABLE hw.homeworks ADD COLUMN points REAL DEFAULT 10`,
  `ALTER TABLE hw.homeworks ADD COLUMN status TEXT DEFAULT 'published'`,
  `ALTER TABLE hw.submissions ADD COLUMN appealReason TEXT`,
  `ALTER TABLE hw.submissions ADD COLUMN appealStatus TEXT DEFAULT 'none'`,
  `ALTER TABLE hw.submissions ADD COLUMN appealSubmittedAt TEXT`,
  `ALTER TABLE pk.requests ADD COLUMN teacherId TEXT`,
]) {
  try {
    db.exec(alterStmt);
  } catch (err) {
    // column already exists or table doesn't yet exist — ignore
  }
}

// ── Helper wrappers ───────────────────────────────────────────────
// Chuẩn hóa tham số để tránh lỗi rã chuỗi khi truyền tham số đơn
function normalizeParams(params) {
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

// Lấy 1 dòng
function dbGet(query, params = []) {
  return Promise.resolve(db.prepare(query).get(...normalizeParams(params)));
}

// Lấy nhiều dòng (Đã bổ sung)
function dbAll(query, params = []) {
  return Promise.resolve(db.prepare(query).all(...normalizeParams(params)));
}

// Thực thi INSERT / UPDATE / DELETE
function dbRun(query, params = []) {
  return Promise.resolve(db.prepare(query).run(...normalizeParams(params)));
}

module.exports = { db, dbGet, dbAll, dbRun };