const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, '../game.db');
let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database file if it exists, otherwise create a new one
  if (fs.existsSync(dbFile)) {
    const filebuffer = fs.readFileSync(dbFile);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  // Helper function to save database changes to disk automatically
  global.saveDatabase = function() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFile, buffer);
  };

  // Create your tables here if they don't exist yet
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      balance REAL DEFAULT 0
    );
  `);
  global.saveDatabase();
  
  console.log("Database initialized successfully with sql.js!");
}

initDatabase();

module.exports = {
  // Mimic basic sqlite3 query wrappers so you don't have to rewrite your whole app
  query: (sql, params = []) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  },
  run: (sql, params = []) => {
    db.run(sql, params);
    global.saveDatabase();
  }
};
