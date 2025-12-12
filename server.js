const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const isRender = !!process.env.RENDER;
const dbPath = isRender ? "/var/data/barbearia.db" : path.join(__dirname, "barbearia.db");
const db = new sqlite3.Database(dbPath);

const JWT_SECRET = process.env.JWT_SECRET || "JWT_DEV_SECRET_TROQUE_ISSO";

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','client')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER NOT NULL,
      date TEXT NOT NULL,         -- YYYY-MM-DD
      time TEXT NOT NULL,         -- HH:MM
      status TEXT NOT NULL CHECK(status IN ('FREE','BOOKED','BLOCKED')) DEFAULT 'FREE',
      client_id INTEGER,
      appointment_type TEXT CHECK(appointment_type IN ('ASSINATURA','AVULSO')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(barber_id) REFERENCES barbers(id),
      FOREIGN KEY(client_id) REFERENCES users(id),
      UNIQUE(barber_id, date, time)
    )
  `);

  // Seed admin padrão (homologação) se não existir nenhum admin
  const adminCount = await get(`SELECT COUNT(*) as c FROM users WHERE role='admin'`);
  if (!adminCount || adminCount.c === 0) {
    const hash = await bcrypt.hash("123456", 10);
    await run(
      `INSERT INTO users (name, phone, email, password_hash, role, active)
       VALUES (?, ?, ?, ?, 'admin', 1)`,
      ["Admin", "", "admin@teste.com", hash]
    );
    console.log("Admin seed criado: admin@teste.com / 123456");
  }

  // Seed de barbeiros (opcional)
  const barberCount = await get(`SELECT COUNT(*) as c FROM barbers`);
  if (!barberCount || barberCount.c === 0) {
    await run(`INSERT INTO barbers (name, active) VALUES (?,1)`, ["João Victor"]);
    await run(`INSERT INTO barbers (name, active) VALUES (?,1)`, ["Renan Lopes"]);
    console.log("Barbeiros seed criados.");
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sem token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido/expirado" });
  }
}

function isAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Acesso negado (admin)" });
  next();
}

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, dbPath, render: isRender });
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email e senha obrigatórios" });

    const user = await get(`SELECT * FROM users WHERE email = ? AND active = 1`, [email.trim().toLowerCase()]);
    if (!user) return res.status(401).json({ error: "Usuário ou senha inválidos" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Usuário ou senha inválidos" });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ error: "Erro no login", details: String(e.message || e) });
  }
});

// Listar barbeiros (cliente)
app.get("/api/barbers", auth, async (req, res) => {
  try {
    const rows = await all(`SELECT id, name FROM barbers WHERE active = 1 ORDER BY name`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Erro ao listar barbeiros" });
  }
});

// Listar dias disponíveis para um barbeiro (opcional)
app.get("/api/available-dates", auth, async (req, res) => {
  try {
    const barberId = Number(req.query.barber_id);
    if (!barberId) return res.status(400).json({ error: "barber_id obrigatório" });

    const rows = await all(
      `SELECT date, COUNT(*) as free_count
       FROM slots
       WHERE barber_id = ? AND status = 'FREE'
       GROUP BY date
       ORDER BY date`,
      [barberId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Erro ao listar datas" });
  }
});

// Listar horários livres por barbeiro e data
app.get("/api/slots", auth, async (req, res) => {
  try {
    const barberId = Number(req.query.barber_id);
    const date = String(req.query.date || "");
    if (!barberId || !date) return res.status(400).json({ error: "barber_id e date obrigatórios" });

    const rows = await all(
      `SELECT id, date, time
       FROM slots
       WHERE barber_id = ? AND date = ? AND status = 'FREE'
       ORDER BY time`,
      [barberId, date]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Erro ao listar horários" });
  }
});

// Marcar um horário
app.post("/api/book", auth, async (req, res) => {
  try {
    const { slot_id, appointment_type } = req.body || {};
    const slotId = Number(slot_id);
    const type = appointment_type === "ASSINATURA" ? "ASSINATURA" : "AVULSO";

    if (!slotId) return res.status(400).json({ error: "slot_id obrigatório" });

    const slot = await get(`SELECT * FROM slots WHERE id = ?`, [slotId]);
    if (!slot) return res.status(404).json({ error: "Horário não encontrado" });
    if (slot.status !== "FREE") return res.status(409).json({ error: "Horário indisponível" });

    await run(
      `UPDATE slots
       SET status='BOOKED', client_id=?, appointment_type=?
       WHERE id=? AND status='FREE'`,
      [req.user.id, type, slotId]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Erro ao marcar", details: String(e.message || e) });
  }
});

// ======================
// ADMIN
// ======================

// Criar usuário (cliente/admin)
app.post("/api/admin/users", auth, isAdmin, async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password obrigatórios" });

    const r = role === "admin" ? "admin" : "client";
    const hash = await bcrypt.hash(password, 10);

    await run(
      `INSERT INTO users (name, phone, email, password_hash, role, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [name, phone || "", email.trim().toLowerCase(), hash, r]
    );

    res.json({ ok: true });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("UNIQUE")) return res.status(409).json({ error: "Email já existe" });
    res.status(500).json({ error: "Erro ao criar usuário", details: msg });
  }
});

// Listar usuários (admin)
app.get("/api/admin/users", auth, isAdmin, async (req, res) => {
  try {
    const rows = await all(`SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Erro ao listar usuários" });
  }
});

// Criar barbeiro
app.post("/api/admin/barbers", auth, isAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "name obrigatório" });

    await run(`INSERT INTO barbers (name, active) VALUES (?, 1)`, [name]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Erro ao criar barbeiro" });
  }
}

