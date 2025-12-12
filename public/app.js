// public/app.js

const KEYS = { session: "barb_session_v1" };

function $(id) { return document.getElementById(id); }

function setSession(data) {
  localStorage.setItem(KEYS.session, JSON.stringify(data));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(KEYS.session)) || null; }
  catch { return null; }
}
function clearSession() {
  localStorage.removeItem(KEYS.session);
}

function setMsg(el, msg, ok = false) {
  if (!el) return;
  el.textContent = msg || "";
  el.className = "msg " + (ok ? "ok" : "err");
}

async function api(url, opts = {}) {
  const s = getSession();
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;

  const res = await fetch(url, { ...opts, headers });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = body?.error || body?.message || (typeof body === "string" ? body : "Erro");
    throw new Error(msg);
  }
  return body;
}

// ===================== LOGIN (index.html) =====================
async function initLogin() {
  const btn = $("btnLogin");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    setMsg($("loginMsg"), "");
    try {
      const email = $("loginEmail").value.trim();
      const password = $("loginPass").value;
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setSession({ token: data.token, user: data.user });

      if (data.user.role === "admin") {
        window.location.href = "/admin.html";
      } else {
        // vai para agendamento na mesma página (se existir fluxo)
        window.location.href = "/";
      }
    } catch (e) {
      setMsg($("loginMsg"), e.message || "Erro no login");
    }
  });
}

// ===================== AGENDAMENTO (index.html) =====================
async function initBooking() {
  // elementos podem variar no seu index.html
  const selBarber = $("selBarber");
  const dateInp = $("selDate");
  const slotsWrap = $("slotsWrap");
  const btnLoad = $("btnLoadSlots");
  const badge = $("userBadgeClient");
  const typeSel = $("selType");

  // Se não existe essa UI no seu index.html, não dá erro
  if (!selBarber || !dateInp || !slotsWrap || !btnLoad || !typeSel) return;

  const s = getSession();
  if (!s?.token) return;

  if (badge) badge.textContent = `${s.user?.name || "Usuário"} • ${s.user?.role || ""}`;

  async function loadBarbers() {
    const barbers = await api("/api/barbers");
    selBarber.innerHTML = `<option value="">Selecione...</option>` +
      barbers.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
  }

  async function loadSlots() {
    slotsWrap.innerHTML = "";
    const barber_id = selBarber.value;
    const date = dateInp.value;
    if (!barber_id || !date) {
      slotsWrap.innerHTML = `<div class="muted">Selecione barbeiro e data.</div>`;
      return;
    }
    const slots = await api(`/api/slots?barber_id=${encodeURIComponent(barber_id)}&date=${encodeURIComponent(date)}`);
    if (!slots.length) {
      slotsWrap.innerHTML = `<div class="muted">Nenhum horário livre nesse dia.</div>`;
      return;
    }
    slotsWrap.innerHTML = slots.map(s => `
      <div class="slot">
        <div><b>${s.time}</b></div>
        <button class="btn btn-sm" data-id="${s.id}">Marcar</button>
      </div>
    `).join("");

    slotsWrap.querySelectorAll("button[data-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const slot_id = Number(btn.dataset.id);
        const type = String(typeSel.value || "AVULSO").toUpperCase();
        try {
          await api("/api/book", {
            method: "POST",
            body: JSON.stringify({ slot_id, type })
          });
          alert("Agendado com sucesso!");
          await loadSlots();
        } catch (e) {
          alert(e.message || "Erro ao agendar");
        }
      });
    });
  }

  btnLoad.addEventListener("click", async () => {
    try { await loadSlots(); } catch (e) { alert(e.message); }
  });

  await loadBarbers();
}

// ===================== ADMIN (admin.html) =====================
async function initAdmin() {
  if (!$("btnCreateUser")) return; // não está no admin.html

  const s = getSession();
  if (!s?.token) {
    window.location.href = "/";
    return;
  }
  if (s.user?.role !== "admin") {
    window.location.href = "/";
    return;
  }

  // Badge
  const badge = $("userBadge");
  if (badge) badge.textContent = `${s.user?.name || "Admin"} • admin`;

  // Logout
  $("btnLogout")?.addEventListener("click", () => {
    clearSession();
    window.location.href = "/";
  });

  // ===== Abas =====
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tabPane").forEach(p => p.classList.add("hidden"));

      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.remove("hidden");
    });
  });

  // ===== Criar usuário =====
  $("btnCreateUser").addEventListener("click", async () => {
    setMsg($("adminMsg1"), "");
    try {
      const name = $("uName").value.trim();
      const phone = $("uPhone").value.trim();
      const email = $("uEmail").value.trim();
      const password = $("uPass").value;
      const role = $("uRole").value;

      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ name, phone, email, password, role }),
      });

      setMsg($("adminMsg1"), "Usuário criado com sucesso!", true);
      $("uName").value = "";
      $("uPhone").value = "";
      $("uEmail").value = "";
      $("uPass").value = "";
    } catch (e) {
      setMsg($("adminMsg1"), e.message || "Erro ao criar usuário");
    }
  });

  // ===== Admin: carregar barbeiros no select de agenda =====
  async function loadAdminBarbers() {
    const sel = $("admSelBarber");
    const list = await api("/api/admin/barbers");
    const active = list.filter(b => b.active === 1 || b.active === true);
    sel.innerHTML =
      `<option value="">Selecione...</option>` +
      active.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
  }

  // ===== Admin: criar barbeiro =====
  $("btnCreateBarber").addEventListener("click", async () => {
    setMsg($("adminMsg2"), "");
    try {
      const name = $("bName").value.trim();
      await api("/api/admin/barbers", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      $("bName").value = "";
      setMsg($("adminMsg2"), "Barbeiro criado!", true);
      await loadBarbersList();
    } catch (e) {
      setMsg($("adminMsg2"), e.message || "Erro ao criar barbeiro");
    }
  });

  // ===== Admin: listar barbeiros + botão para agenda =====
  async function loadBarbersList() {
    const list = await api("/api/admin/barbers");
    renderBarbers(list);
    await loadAdminBarbers();
  }

  function renderBarbers(list) {
    const wrap = $("barbersWrap");
    if (!list.length) {
      wrap.innerHTML = `<div class="muted">Nenhum barbeiro cadastrado ainda.</div>`;
      return;
    }
    wrap.innerHTML = "";
    list.forEach((b) => {
      const row = document.createElement("div");
      row.className = "listItem";
      row.innerHTML = `
        <div>
          <b>${b.name}</b>
          <div class="muted" style="font-size:12px">ID: ${b.id}</div>
        </div>
        <div class="row">
          <button class="btn btn-secondary btn-sm">Gerenciar agenda</button>
        </div>
      `;
      row.querySelector("button").addEventListener("click", () => {
        document.querySelector('[data-tab="tabAgenda"]').click();
        $("admSelBarber").value = String(b.id);

        if (!$("admDate").value) {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          const dd = String(now.getDate()).padStart(2, "0");
          $("admDate").value = `${yyyy}-${mm}-${dd}`;
        }

        $("btnLoadAdminSlots").click();
      });
      wrap.appendChild(row);
    });
  }

  $("btnLoadBarbers")?.addEventListener("click", async () => {
    try {
      await loadBarbersList();
      setMsg($("adminMsg2"), "Lista de barbeiros atualizada.", true);
    } catch (e) {
      setMsg($("adminMsg2"), e.message || "Erro ao listar barbeiros");
    }
  });

  // ===== Admin: listar usuários =====
  async function loadUsers() {
    const rows = await api("/api/admin/users");
    renderUsers(rows);
  }

  function renderUsers(rows) {
    const wrap = $("usersWrap");
    if (!rows.length) {
      wrap.innerHTML = `<div class="muted">Nenhum usuário cadastrado.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nome</th><th>Email</th><th>Tipo</th><th>Ativo</th><th>Criado em</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(u => `
            <tr>
              <td>${u.name || "-"}</td>
              <td>${u.email || "-"}</td>
              <td>${u.role || "-"}</td>
              <td>${u.active ? "Sim" : "Não"}</td>
              <td>${u.created_at || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  $("btnLoadUsers")?.addEventListener("click", async () => {
    setMsg($("adminMsgUsers"), "");
    try {
      await loadUsers();
      setMsg($("adminMsgUsers"), "Lista de usuários atualizada.", true);
    } catch (e) {
      setMsg($("adminMsgUsers"), e.message || "Erro ao carregar usuários");
    }
  });

  // ===== Admin: criar slot livre/bloqueado + carregar agenda =====
  $("btnCreateSlot").addEventListener("click", async () => {
    setMsg($("adminMsg3"), "");
    try {
      const barber_id = Number($("admSelBarber").value);
      const date = $("admDate").value;
      const time = $("admTime").value.trim();

      await api("/api/admin/slots/free", {
        method: "POST",
        body: JSON.stringify({ barber_id, date, time }),
      });
      setMsg($("adminMsg3"), "Horário LIVRE criado!", true);
      $("btnLoadAdminSlots").click();
    } catch (e) {
      setMsg($("adminMsg3"), e.message || "Erro ao criar horário");
    }
  });

  // botão BLOQUEAR (atalho: shift+click no criar horário)
  $("btnCreateSlot").addEventListener("contextmenu", async (ev) => {
    ev.preventDefault();
  });

  // Se você quiser um botão separado "Bloquear", dá pra adicionar no HTML.
  // Por enquanto, faça assim: se a hora começar com "B " ele bloqueia.
  // Ex: digite "B 14:00" para bloquear.
  // (pra não mexer no layout agora)
  $("admTime").addEventListener("keydown", async (ev) => {
    if (ev.key === "Enter") {
      const val = $("admTime").value.trim();
      if (val.toUpperCase().startsWith("B ")) {
        try {
          const barber_id = Number($("admSelBarber").value);
          const date = $("admDate").value;
          const time = val.slice(2).trim();

          await api("/api/admin/slots/block", {
            method: "POST",
            body: JSON.stringify({ barber_id, date, time }),
          });
          $("admTime").value = "";
          setMsg($("adminMsg3"), `Horário BLOQUEADO: ${time}`, true);
          $("btnLoadAdminSlots").click();
        } catch (e) {
          setMsg($("adminMsg3"), e.message || "Erro ao bloquear horário");
        }
      }
    }
  });

  $("btnLoadAdminSlots").addEventListener("click", async () => {
    setMsg($("adminMsg3"), "");
    try {
      const barber_id = Number($("admSelBarber").value);
      const date = $("admDate").value;
      if (!barber_id || !date) throw new Error("Selecione barbeiro e data");

      const rows = await api(`/api/admin/slots?barber_id=${barber_id}&date=${encodeURIComponent(date)}`);
      const wrap = $("adminSlotsWrap");

      if (!rows.length) {
        wrap.innerHTML = `<div class="muted">Nenhum horário cadastrado nesse dia.</div>`;
        return;
      }

      wrap.innerHTML = rows.map(r => {
        const tag =
          r.status === "FREE" ? "LIVRE" :
          r.status === "BLOCKED" ? "BLOQUEADO" :
          "MARCADO";
        const client = r.client_name ? ` • ${r.client_name}` : "";
        const type = r.type ? ` • ${r.type}` : "";
        return `
          <div class="slot">
            <div><b>${r.time}</b> <span class="muted">(${tag}${client}${type})</span></div>
          </div>
        `;
      }).join("");
    } catch (e) {
      setMsg($("adminMsg3"), e.message || "Erro ao carregar agenda");
    }
  });

  // Inicial
  await loadBarbersList();
  await loadUsers().catch(() => {});
}

// ===================== BOOT =====================
(async function boot() {
  await initLogin();
  await initAdmin();
  await initBooking();
})();
