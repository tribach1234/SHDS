// db.js
// Unified database layer — uses better-sqlite3 via Database.js
// All tables are auto-created on first require().

const db = require('../backend/hocsinh/Database');

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
  classId TEXT,
  title TEXT,
  note TEXT,
  deadline TEXT,
  createdAt TEXT,
  joinLink TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS hw.submissions (
  id TEXT PRIMARY KEY,
  homeworkId TEXT,
  studentId TEXT,
  fileLink TEXT,
  submittedAt TEXT,
  score REAL,
  comment TEXT
)`);

// ── Helper wrappers ───────────────────────────────────────────────
// Wrapped in Promises so existing `await dbGet(...)` / `await dbRun(...)`
// calls in routes.js continue to work without modification.

function dbGet(query, params = []) {
  return Promise.resolve(db.prepare(query).get(...params));
}

function dbRun(query, params = []) {
  return Promise.resolve(db.prepare(query).run(...params));
}

module.exports = { db, dbGet, dbRun };