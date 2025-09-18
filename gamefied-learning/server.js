// server.js
const express = require('express');
const path = require('path');
const db = require('./db');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Session (MemoryStore for demo only)
app.use(session({
  secret: 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 }
}));

// Middleware: attach user object if logged
app.use((req, res, next) => {
  if (req.session.userId) {
    db.get(`SELECT id, username, name, role, xp FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
      if (user) req.user = user;
      next();
    });
  } else next();
});

// -------- auth helpers --------
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return res.status(403).send('Forbidden');
    next();
  };
}

// -------- Routes --------
app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  if (req.user.role === 'teacher') return res.redirect('/teacher/dashboard');
  return res.redirect('/student/dashboard');
});

// Login
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user) return res.render('login', { error: 'Invalid credentials' });
    bcrypt.compare(password, user.password, (errCmp, ok) => {
      if (!ok) return res.render('login', { error: 'Invalid credentials' });
      req.session.userId = user.id;
      res.redirect('/');
    });
  });
});

// Register (simple)
app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) return res.render('register', { error: 'All fields required' });
  bcrypt.hash(password, 10, (err, hash) => {
    db.run(`INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)`,
      [username, hash, name, role], function(err2) {
        if (err2) return res.render('register', { error: 'Username may already exist' });
        // create progress rows for each subject
        const userId = this.lastID;
        db.each(`SELECT id FROM subjects`, (er, row) => {
          db.run(`INSERT INTO user_progress (user_id, subject_id, progress) VALUES (?, ?, 0)`, [userId, row.id]);
        }, () => {
          req.session.userId = userId;
          res.redirect('/');
        });
      });
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Student dashboard
app.get('/student/dashboard', requireLogin, requireRole('student'), (req, res) => {
  // load subjects + progress
  db.all(`SELECT s.id, s.name, IFNULL(up.progress,0) AS progress
          FROM subjects s
          LEFT JOIN user_progress up ON up.subject_id = s.id AND up.user_id = ?
          ORDER BY s.id`, [req.user.id], (err, subjects) => {
    res.render('dashboard_student', { user: req.user, subjects });
  });
});

// Teacher dashboard
app.get('/teacher/dashboard', requireLogin, requireRole('teacher'), (req, res) => {
  // list students and their xp
  db.all(`SELECT id, username, name, xp FROM users WHERE role = 'student'`, [], (err, students) => {
    res.render('dashboard_teacher', { user: req.user, students });
  });
});

// Quiz page
app.get('/quiz/:subjectId', requireLogin, (req, res) => {
  const subjectId = req.params.subjectId;
  db.all(`SELECT id, question, options FROM quizzes WHERE subject_id = ?`, [subjectId], (err, rows) => {
    const qs = rows.map(r => ({ id: r.id, question: r.question, options: JSON.parse(r.options)}));
    res.render('quiz', { user: req.user, subjectId, qs });
  });
});

// Submit quiz
app.post('/quiz/:subjectId/submit', requireLogin, (req, res) => {
  const subjectId = req.params.subjectId;
  const answers = req.body; // key = questionId => selected index
  db.all(`SELECT id, answer FROM quizzes WHERE subject_id = ?`, [subjectId], (err, rows) => {
    let correct = 0;
    rows.forEach(r => {
      const sel = answers['q_'+r.id];
      if (sel !== undefined && parseInt(sel) === r.answer) correct++;
    });
    // award xp and update progress
    const xpGain = correct * 10;
    db.run(`UPDATE users SET xp = xp + ? WHERE id = ?`, [xpGain, req.user.id], () => {
      // update progress roughly as percent
      db.get(`SELECT COUNT(*) as total FROM quizzes WHERE subject_id = ?`, [subjectId], (e, trow) => {
        const total = trow.total || 1;
        const progress = Math.round((correct / total) * 100);
        db.run(`UPDATE user_progress SET progress = ? WHERE user_id = ? AND subject_id = ?`,
          [progress, req.user.id, subjectId], () => {
            res.render('quiz', { user: req.user, subjectId, qs: [], result: { correct, total, xpGain } });
          });
      });
    });
  });
});

// Serve a simple memory game
app.get('/game/memory', requireLogin, (req, res) => {
  res.render('game_memory', { user: req.user });
});

// API for awarding XP from games
app.post('/api/award', requireLogin, (req, res) => {
  const { xp } = req.body;
  const value = parseInt(xp) || 0;
  db.run(`UPDATE users SET xp = xp + ? WHERE id = ?`, [value, req.user.id], (err) => {
    if (err) return res.json({ ok: false, err });
    db.get(`SELECT xp FROM users WHERE id = ?`, [req.user.id], (e, row) => {
      req.user.xp = row.xp;
      res.json({ ok: true, xp: row.xp });
    });
  });
});

app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
