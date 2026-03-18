#!/usr/bin/env node
/**
 * ServerCtrl Setup Script
 * Run once: node setup.js
 * Creates the SQLite DB and prompts for admin credentials
 */

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const sequelize = require('./src/config/db');
const User = require('./src/models/User');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   ServerCtrl — Initial Setup     ║');
  console.log('╚══════════════════════════════════╝\n');

  await sequelize.sync({ force: true });
  console.log('✓ Database initialized\n');

  const username = (await ask('Admin username: ')).trim();
  if (!username) { console.error('Username cannot be empty'); process.exit(1); }

  const password = await ask('Admin password: ');
  if (password.length < 8) { console.error('Password must be at least 8 characters'); process.exit(1); }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ username, passwordHash });

  console.log(`\n✓ Admin user "${username}" created`);
  console.log('✓ Setup complete — run: node server.js\n');
  rl.close();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });