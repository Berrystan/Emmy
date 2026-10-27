const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file will be created automatically in your project root
const dbPath = path.resolve(__dirname, '../../game.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database', err.message);
  } else {
    console.log('Connected to SQLite database successfully.');
  }
});

// Initialize Tables
db.serialize(() => {
  // Users Table
  db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Wallets Table
  db.run(`CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      balance REAL DEFAULT 0.00,
      locked_balance REAL DEFAULT 0.00,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Transactions Audit Ledger
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT CHECK(type IN ('DEPOSIT', 'WITHDRAWAL', 'STAKE', 'WIN', 'RAKE')),
      amount REAL NOT NULL,
      reference TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Matches Table
  db.run(`CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'WAITING' CHECK(status IN ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
      stake_amount REAL NOT NULL,
      max_players INTEGER DEFAULT 7,
      winner_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(winner_id) REFERENCES users(id)
  )`);
});

module.exports = db;
//transaction history	
db.run(`CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT,
  amount REAL,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);

