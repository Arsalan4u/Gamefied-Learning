// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create or open database
const db = new sqlite3.Database(path.join(__dirname, 'data.sqlite'));

// Initialize tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        xp INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Add other tables as needed
});

module.exports = db;
