const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ======================================================
   BANCO DE DADOS (SOLUÇÃO PARA RENDER FREE)
   ====================================================== */

// Em produção (Render Free) usamos /tmp
// Em local, usamos a pasta do projeto
const isRender = !!process.env.RENDER;
const dataDir = isRender ? "/tmp" : __dirname;

// Garante que o diretório existe
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
  console.error("Erro ao criar diretório do banco:", e.message);
}

// Caminho FINAL do banco
const dbPath = path.join(dataDir, "barbearia.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Erro ao abrir SQLite:", err.message);
  } else {
    console.log("SQLite conectado em:", dbPath);
  }
});

/* ======================================================
   CONFIG
   ====================================================== */

const JWT_SECRET = process.env.JWT_SECRET || "DEV_SECRET";

/* ======================================================
   HELPERS SQLITE
   ====================================================== */

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

/* ======================================================
   INIT DB
   ====================================================== */

async function initDB() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER,
      date TEXT,
      time TEXT,
      status TEXT,
      client_id INTEGER,
      type TEXT
    )
  `);

  // Admin seed
  const admin = await get(
    "SELECT * FROM users WHERE email = ?",
    ["admin@teste.com"]
  );

  if (!admin) {
    const hash = await bcrypt.hash("123456", 10);
    await run(
      "INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)",
      ["Admin", "admin@teste.com", hash, "admin"]
    );
    console.log("Admin criado: admin@teste.com / 123456");
  }

  // Barbeiros seed
  const count = await get("SELECT COUNT(*) as c FROM barbers");
  if (count.c === 0) {
    await run("INSERT INTO barbers (name) VALUES (?)", ["João Victor"]);
    await run("INSERT INTO barbers (name) VALUES (?)", ["Renan Lopes"]);
    console.log("Barbeiros criados");
  }
}

/* ======================================================
   AUTH
   ====================================================== */

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Sem token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

function admin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Acesso negado" });
  next();
}

/* ======================================================
   ROTAS
   ====================================================== */

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: dbPath });
});

// Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) return res.status(401).json({ error: "Login inválido" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Login inválido" });

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    JWT_SECRET
  );

  res.json({ token, user: { name: user.name, role: user.role } });
});

// Barbeiros
app.get("/api/barbers", auth, async (req, res) => {
  res.json(await all("SELECT * FROM barbers"));
});

// Slots livres
app.get("/api/slots", auth, async (req, res) => {
  const { barber_id, date } = req.query;
  res.json(
    await all(
      "SELECT * FROM slots WHERE barber_id=? AND date=? AND status='FREE'",
      [barber_id, date]
    )
  );
});

// Marcar
app.post("/api/book", auth, async (req, res) => {
  const { slot_id, type } = req.body;
  await run(
    "UPDATE slots SET status='BOOKED', client_id=?, type=? WHERE id=?",
    [req.user.id, type, slot_id]
  );
  res.json({ ok: true });
});

// ADMIN — criar slot
app.post("/api/admin/slots", auth, admin, async (req, res) => {
  const { barber_id, date, time } = req.body;
  await run(
    "INSERT INTO slots (barber_id,date,time,status) VALUES (?,?,?,'FREE')",
    [barber_id, date, time]
  );
  res.json({ ok: true });
});

/* ======================================================
   START
   ====================================================== */

initDB().then(() => {
  app.listen(PORT, () => {
    console.log("Servidor rodando na porta", PORT);
  });
});
