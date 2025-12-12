const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

console.log(">>> VERSAO SERVER: 2025-12-12 v6 FULL");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const JWT_SECRET = process.env.JWT_SECRET || "DEV_SECRET";

// Render Free: /tmp (gravável). Local: __dirname
const isRender = !!process.env.RENDER;
const dataDir = isRender ? "/tmp" : __dirname;

try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
  console.error("Falha criando dataDir:", dataDir, e?.message);
}

const dbPath = path.join(dataDir, "barbearia.db");
console.log(">>> DB PATH =", dbPath);

const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error("❌ ERRO AO ABRIR SQLITE:", err.message);
      process.exit(1);
    }
    console.log("✅ SQLITE OK:", dbPath);
  }
);

// Helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// Auth
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Sem token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso negado" });
  next();
}

// Init DB
async function initDB() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER NOT NULL,
      date TEXT NOT NULL,      -- YYYY-MM-DD
      time TEXT NOT NULL,      -- HH:MM
      status TEXT NOT NULL,    -- FREE | BOOKED | BLOCKED
      client_id INTEGER,
      type TEXT,               -- AVULSO | ASSINATURA
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(barber_id, date, time)
    )
  `);

  // Admin seed
  const admin = await get("SELECT * FROM users WHERE email = ?", ["admin@teste.com"]);
  if (!admin) {
    const hash = await bcrypt.hash("123456", 10);
    await run(
      "INSERT INTO users (name,phone,email,password,role,active) VALUES (?,?,?,?,?,1)",
      ["Admin", "", "admin@teste.com", hash, "admin"]
    );
    console.log("✅ Admin seed: admin@teste.com / 123456");
  }

  // ✅ SEM barbeiro seed (não cria nenhum automático)
}

// Rotas
app.get("/api/health", (req, res) => res.json({ ok: true, db: dbPath }));

app.post("/api/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const user = await get("SELECT * FROM users WHERE email = ? AND active=1", [email]);
  if (!user) return res.status(401).json({ error: "Email ou senha inválidos" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Email ou senha inválidos" });

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

// Barbeiros (cliente/admin)
app.get("/api/barbers", auth, async (req, res) => {
  const rows = await all("SELECT id,name FROM barbers WHERE active=1 ORDER BY name");
  res.json(rows);
});

// Slots livres (cliente)
app.get("/api/slots", auth, async (req, res) => {
  const barberId = Number(req.query?.barber_id);
  const date = String(req.query?.date || "");

  if (!barberId || !date) return res.status(400).json({ error: "barber_id e date são obrigatórios" });

  const rows = await all(
    "SELECT id,barber_id,date,time,status FROM slots WHERE barber_id=? AND date=? AND status='FREE' ORDER BY time",
    [barberId, date]
  );
  res.json(rows);
});

// Marcar (cliente)
app.post("/api/book", auth, async (req, res) => {
  const slotId = Number(req.body?.slot_id);
  const type = String(req.body?.type || "AVULSO").toUpperCase();

  if (!slotId) return res.status(400).json({ error: "slot_id é obrigatório" });
  if (type !== "AVULSO" && type !== "ASSINATURA") return res.status(400).json({ error: "type inválido" });

  const slot = await get("SELECT * FROM slots WHERE id=?", [slotId]);
  if (!slot) return res.status(404).json({ error: "Horário não encontrado" });
  if (slot.status !== "FREE") return res.status(409).json({ error: "Este horário não está livre" });

  await run(
    "UPDATE slots SET status='BOOKED', client_id=?, type=? WHERE id=? AND status='FREE'",
    [req.user.id, type, slotId]
  );
  res.json({ ok: true });
});

// ===================== ADMIN =====================

// criar usuário
app.post("/api/admin/users", auth, adminOnly, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "client").trim();

  if (!name || !email || !password) return res.status(400).json({ error: "Nome, email e senha são obrigatórios" });
  if (role !== "client" && role !== "admin") return res.status(400).json({ error: "role inválido" });

  const exists = await get("SELECT id FROM users WHERE email=?", [email]);
  if (exists) return res.status(409).json({ error: "Email já cadastrado" });

  const hash = await bcrypt.hash(password, 10);
  await run(
    "INSERT INTO users (name,phone,email,password,role,active) VALUES (?,?,?,?,?,1)",
    [name, phone, email, hash, role]
  );

  res.json({ ok: true });
});

// listar usuários
app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  const rows = await all("SELECT id,name,phone,email,role,active,created_at FROM users ORDER BY created_at DESC");
  res.json(rows);
});

// criar barbeiro
app.post("/api/admin/barbers", auth, adminOnly, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome do barbeiro é obrigatório" });
  await run("INSERT INTO barbers (name,active) VALUES (?,1)", [name]);
  res.json({ ok: true });
});

// listar barbeiros
app.get("/api/admin/barbers", auth, adminOnly, async (req, res) => {
  const rows = await all("SELECT id,name,active,created_at FROM barbers ORDER BY created_at DESC");
  res.json(rows);
});

// criar slot LIVRE
app.post("/api/admin/slots/free", auth, adminOnly, async (req, res) => {
  const barberId = Number(req.body?.barber_id);
  const date = String(req.body?.date || "");
  const time = String(req.body?.time || "");

  if (!barberId || !date || !time) return res.status(400).json({ error: "barber_id, date, time obrigatórios" });

  try {
    await run("INSERT INTO slots (barber_id,date,time,status) VALUES (?,?,?,'FREE')", [barberId, date, time]);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Esse horário já existe" });
  }
});

// criar slot BLOQUEADO
app.post("/api/admin/slots/block", auth, adminOnly, async (req, res) => {
  const barberId = Number(req.body?.barber_id);
  const date = String(req.body?.date || "");
  const time = String(req.body?.time || "");

  if (!barberId || !date || !time) return res.status(400).json({ error: "barber_id, date, time obrigatórios" });

  try {
    await run("INSERT INTO slots (barber_id,date,time,status) VALUES (?,?,?,'BLOCKED')", [barberId, date, time]);
    res.json({ ok: true });
  } catch {
    await run(
      "UPDATE slots SET status='BLOCKED', client_id=NULL, type=NULL WHERE barber_id=? AND date=? AND time=?",
      [barberId, date, time]
    );
    res.json({ ok: true, updated: true });
  }
});

// ver agenda do dia
app.get("/api/admin/slots", auth, adminOnly, async (req, res) => {
  const barberId = Number(req.query?.barber_id);
  const date = String(req.query?.date || "");
  if (!barberId || !date) return res.status(400).json({ error: "barber_id e date obrigatórios" });

  const rows = await all(
    `
    SELECT s.id,s.barber_id,s.date,s.time,s.status,s.type,
           u.name as client_name, u.email as client_email
    FROM slots s
    LEFT JOIN users u ON u.id = s.client_id
    WHERE s.barber_id=? AND s.date=?
    ORDER BY s.time
    `,
    [barberId, date]
  );
  res.json(rows);
});

initDB().then(() => {
  app.listen(PORT, () => console.log("✅ Servidor rodando na porta", PORT));
});
