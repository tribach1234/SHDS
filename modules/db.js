const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'users.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY, 
    fullName TEXT, 
    email TEXT, 
    pass TEXT, 
    activate TEXT DEFAULT 'false'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, fullName TEXT, email TEXT, pass TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS tas (id TEXT PRIMARY KEY, fullName TEXT, email TEXT, pass TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, fullName TEXT, email TEXT, pass TEXT)`);
});

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

module.exports = { db, dbGet, dbRun };