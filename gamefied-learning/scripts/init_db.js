// scripts/init_db.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbFile = path.join(__dirname, '..', 'data.sqlite');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  // Drop old tables (safe for dev)
  db.run(`DROP TABLE IF EXISTS users`);
  db.run(`DROP TABLE IF EXISTS subjects`);
  db.run(`DROP TABLE IF EXISTS quizzes`);
  db.run(`DROP TABLE IF EXISTS user_progress`);

  // Create tables
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT,
    xp INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
  )`);

  db.run(`CREATE TABLE quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    question TEXT,
    options TEXT, -- JSON string
    answer INTEGER, -- index
    FOREIGN KEY(subject_id) REFERENCES subjects(id)
  )`);

  db.run(`CREATE TABLE user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subject_id INTEGER,
    progress INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(subject_id) REFERENCES subjects(id)
  )`);

  // Seed subjects
  const subjects = ['Mathematics', 'Science', 'Technology', 'English'];
  const sStmt = db.prepare(`INSERT INTO subjects (name) VALUES (?)`);
  subjects.forEach(s => sStmt.run(s));
  sStmt.finalize();

  // Seed sample quizzes (for math subject id 1)
  const qStmt = db.prepare(`INSERT INTO quizzes (subject_id, question, options, answer) VALUES (?, ?, ?, ?)`);
  qStmt.run(1, 'What is 2 + 2?', JSON.stringify(['2','3','4','5']), 2);
  qStmt.run(1, 'What is 5 * 3?', JSON.stringify(['8','15','10','20']), 1);
  qStmt.run(2, 'Water boils at?', JSON.stringify(['50°C','100°C','150°C','200°C']), 1);
  qStmt.finalize();

  // Seed users: one teacher, one student (password: password123)
  const salt = bcrypt.genSaltSync(10);
  const pw = bcrypt.hashSync('password123', salt);
  const uStmt = db.prepare(`INSERT INTO users (username, password, name, role, xp) VALUES (?, ?, ?, ?, ?)`);
  uStmt.run('teacher1', pw, 'Mrs. Smith', 'teacher', 200);
  uStmt.run('student1', pw, 'Rama', 'student', 50);
  uStmt.finalize();

  // Seed progress rows for student
  setTimeout(() => {
    db.get(`SELECT id FROM users WHERE username = ?`, ['student1'], (err, row) => {
      if (!row) {
        console.error('Could not find seeded user student1');
        db.close();
        return;
      }
      const userId = row.id;
      db.all(`SELECT id FROM subjects`, (e, rows) => {
        const ip = db.prepare(`INSERT INTO user_progress (user_id, subject_id, progress) VALUES (?, ?, ?)`);
        rows.forEach((r, i) => ip.run(userId, r.id, i * 10));
        ip.finalize();
        console.log('DB seeded successfully.');
        db.close();
      });
    });
  }, 200);
});
