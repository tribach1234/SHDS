const { dbGet } = require('./db');
// Note: dbGet is now a sync better-sqlite3 call wrapped in Promise.resolve()
// so existing `await dbGet(...)` usage continues to work unchanged.

function formatEmail(inputEmail) {
  if (!inputEmail) return '';
  const cleanEmail = inputEmail.trim();
  if (cleanEmail.includes('@')) return cleanEmail;
  return `${cleanEmail}@tmts.io.vn`;
}

async function checkEmailExists(email) {
  const tables = ['admins', 'teachers', 'tas', 'students'];
  for (const table of tables) {
    const user = await dbGet(`SELECT email FROM ${table} WHERE email = ?`, [email]);
    if (user) return true;
  }
  return false;
}

module.exports = {
  formatEmail,
  checkEmailExists
};