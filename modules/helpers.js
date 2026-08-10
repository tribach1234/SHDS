const { dbGet } = require('../modules/db');

function formatEmail(inputEmail) {
  if (!inputEmail) return '';
  const cleanEmail = inputEmail.trim();
  if (cleanEmail.includes('@')) return cleanEmail;
  return `${cleanEmail}@tmts.io.vn`;
}

async function checkEmailExists(email) {
  const tables = ['users.admins', 'users.teachers', 'users.tas', 'users.students'];
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