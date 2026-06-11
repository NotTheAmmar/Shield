const bcrypt = require('bcrypt');
const pool = require('./db');

async function fixUser() {
  try {
    const hash = await bcrypt.hash('Sh13ld@Police2026!', 10);
    await pool.query("UPDATE users SET password_hash = $1, role = $2 WHERE email = $3", [hash, 'police_officer', 'officer@police.gov']);
    console.log('Done');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
fixUser();
