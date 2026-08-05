require("dotenv").config()

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_DIR = process.env.SHDS_DB_DIR || path.join(__dirname, "..", "..", "data");

if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, {recursive : true});

const DB_PATHS = {
    classes: path.join(DB_DIR, "classes.db"),
    homeworks: path.join(DB_DIR, "homeworks.db"),
    users: path.join(DB_DIR, "users.db")
};

const db = new Database(DB_PATHS.classes);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`attach database '${DB_PATHS.homeworks.replace(/'/g, "''")}' as hw`);
db.exec(`attach database '${DB_PATHS.users.replace(/'/g, "''")}' as users`);

module.exports = db;