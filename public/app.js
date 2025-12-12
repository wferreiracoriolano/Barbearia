// ===== Util =====
const $ = (id) => document.getElementById(id);

function setMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : "err");
}

function getToken() {
  return localStorage.getItem("bb_token");
}
function setSession(token, user) {
  localStorage.setItem("bb_token", token);
  localStorage.setItem("bb_user", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("bb_token");
  localStorage.removeItem("bb_user");
}
function getUser() {
  try { return JSON.parse(localStorage.getItem("bb_user") || "null"); }
  catch { return null; }
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = options.headers || {};
  headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro na API");
  return data;
}

function isAdminPage() {
  return location.pathname.endsWith("/admin.html");
}

function formatBadge() {
  const badge = $("userBadge");
  const user = getUser();
  if (!badge) return;
  if (!user) { badge.classList.add("hidden"); return; }
  badge.classList.remove("hidden");
  badge.textContent = `${user.name} • ${user.role}`;
}

// ===== LOGIN PAGE (index) =====
async function initIndex() {
  const secLogin = $("secLogin");
  const secClient = $("secClient");
  const btnLogin = $("btnLogin");
  const btnLogout = $("btnLogout");
  const loginMsg = $("loginMsg");
  const clientMsg = $("clientMsg");

  formatBadge();

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      clearSession();
      location.href = "/";
    });
  }

  // Se já logado
  const token = getToken();
  const user = getUser();
  if (token && user) {
    if (btnLogout) btnLogout.classList.remove("hidden");
    if (user.role === "admin") {
      // admin pode usar a página normal também, mas melhor ir pro painel
      // location.href = "/admin.html";
      secLogin.classList.add("hidden");
      secClient.classList.remove("hidden");
      await loadBarbers();
      return;
    } else {
      secLogin.classList.add("hidden");
      secClient.classList.remove("hidden");
      await loadBarbers();
      return;
    }
  }

  // Login
  btnLogin?.addEventListener("click", async () => {
    setMsg(loginMsg, "");
    try {
      const email = $("loginEmail").value.trim();
      const password = $("loginPass").value;

      const r = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      setSession(r.token, r.user);
      formatBadge();

      if (r.user.role === "admin") {
        location.href = "/admin.html";
        return;
      }

      secLogin.classList.add("hidden");
      secClient.classList.remove("hidden");
      if (btnLogout) btnLogout.classList.remove("hidden");

      await loadBarbers();
      setMsg(clientMsg, "Logado! Agora escolha barbeiro e data.", true);
    } catch (e) {
      setMsg(loginMsg, e.message || "Falha no login");
    }
  });

  // Cliente: carregar slots
  $("btnLoadSlots")?.addEventListener("click", async () => {
    setMsg(clientMsg, "");
    try {
      const barberId = Number($("selBarber").value);
      const date = $("selDate").value;
      const type = document.querySelector("input[name='apptType']:checked")?.value || "AVULSO";

      if (!barberId) return setMsg(clientMsg, "Selecione um barbeiro.");
      if (!date) return setMsg(clientMsg, "Selecione uma data.");

      const slots = await api(`/api/slots?barber_id=${barberId}&date=${encodeURIComponent(date)}`);
      renderClientSlots(slots, type);
      if (slots.length === 0) setMsg(clientMsg, "Sem horários livres nesse dia.", false);
      else setMsg(clientMsg, "Selecione um horário para confirmar.", true);
    } catch (e) {
      setMsg(clientMsg, e.message || "Erro ao carregar horários");
    }
  });

  async function loadBarbers() {
    const sel = $("selBarber");
    const list = await api("/api/barbers");
    sel.innerHTML = "";
    list.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      sel.appendChild(opt);
    });
  }

  function renderClientSlots(slots, type) {
    const wrap = $("slotsWrap");
    wrap.innerHTML = "";

    slots.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "slot";
      btn.textContent = `${s.time}`;
      btn.addEventListener("click", async () => {
        setMsg(clientMsg, "");
        try {
          await api("/api/book", {
            method: "POST",
            body: JSON.stringify({ slot_id: s.id, appointment_type: type })
          });
          setMsg(clientMsg, "Agendamento confirmado ✅", true);
          // recarrega lista
          $("btnLoadSlots").click();
        } catch (e) {
          setMsg(clientMsg, e.message || "Erro ao marcar");
        }
      });
      wrap.appendChild(btn);
    });
  }
}

// ===== ADMIN PAGE (admin.html) =====
async function initAdmin() {
  const user = getUser();
  const token = getToken();

  if (!token || !user) {
    location.href = "/";
    return;
  }
  if (user.role !== "admin") {
    location.href = "/";
    return;
  }

  formatBadge();

  $("btnLogout")?.addEventListener("click", () => {
    clearSession();
    location.href = "/";
  });

  const msg1 = $("adminMsg1");
  const msg2 = $("adminMsg2");
  const msg3 = $("adminMsg3");
  const msg4 = $("adminMsg4");

  async function loadAdminBarbers() {
    const list = await api("/api/admin/barbers");
    const sel = $("admSelBarber");
    sel.innerHTML = "";
    list.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      sel.appendChild(opt);
    });
  }

  await loadAdminBarbers();

  // Criar usuário
  $("btnCreateUser")?.addEventListener("click", async () => {
    setMsg(msg1, "");
    try {
      const payload = {
        name: $("uName").value.trim(),
        phone: $("uPhone").value.trim(),
        email: $("uEmail").value.trim(),
        password: $("uPass").value,
        role: $("uRole").value
      };
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
      setMsg(msg1, "Usuário criado ✅", true);
      $("uName").value = "";
      $("uPhone").value = "";
      $("uEmail").value = "";
      $("uPass").value = "";
    } catch (e) {
      setMsg(msg1, e.message || "Erro ao criar usuário");
    }
  });

  // Criar barbeiro
  $("btnCreateBarber")?.addEventListener("click", async () => {
    setMsg(msg2, "");
    try {
      const name = $("bName").value.trim();
      if (!name) return setMsg(msg2, "Informe o nome.");
      await api("/api/admin/barbers", { method: "POST", body: JSON.stringify({ name }) });
      setMsg(msg2, "Barbeiro criado ✅", true);
      $("bName").value = "";
      await loadAdminBarbers();
    } catch (e) {
      setMsg(msg2, e.message || "Erro ao criar barbeiro");
    }
  });

  // Criar horário livre
  $("btnCreateSlot")?.addEventListener("click", async () => {
    setMsg(msg3, "");
    try {
      const barber_id = Number($("admSelBarber").value);
      const date = $("admDate").value;
      const time = $("admTime").value.trim();
      if (!barber_id || !date || !time) return setMsg(msg3, "Preencha barbeiro, data e hora.");

      await api("/api/admin/slots", { method: "POST", body: JSON.stringify({ barber_id, date, time }) });
      setMsg(msg3, "Horário LIVRE criado ✅", true);
      $("admTime").value = "";
      await loadAdminSlots();
    } catch (e) {
      setMsg(msg3, e.message || "Erro ao criar horário");
    }
  });

  // Carregar agenda do dia (admin)
  $("btnLoadAdminSlots")?.addEventListener("click", async () => {
    setMsg(msg3, "");
    try {
      await loadAdminSlots();
      setMsg(msg3, "Agenda carregada.", true);
    } catch (e) {
      setMsg(msg3, e.message || "Erro ao carregar agenda");
    }
  });

  async function loadAdminSlots() {
    const barber_id = Number($("admSelBarber").value);
    const date = $("admDate").value;
    if (!barber_id || !date) {
      $("adminSlotsWrap").innerHTML = "";
      return;
    }

    const rows = await api(`/api/admin/slots?barber_id=${barber_id}&date=${encodeURIComponent(date)}`);
    renderAdminSlots(rows);
  }

  function renderAdminSlots(rows) {
    const wrap = $("adminSlotsWrap");
    wrap.innerHTML = "";

    rows.forEach((r) => {
      const box = document.createElement("div");
      box.className = "slotRow";

      const left = document.createElement("div");
      left.innerHTML = `
        <b>${r.time}</b>
        <span class="pill ${r.status}">${r.status}</span>
        ${r.client_name ? `<span class="muted"> • ${r.client_name}</span>` : ""}
        ${r.appointment_type ? `<span class="muted"> • ${r.appointment_type}</span>` : ""}
      `;

      const actions = document.createElement("div");

      // Bloquear se não estiver BOOKED
      if (r.status !== "BOOKED") {
        const btn = document.createElement("button");
        btn.className = "btn btn-danger btn-sm";
        btn.textContent = "Bloquear";
        btn.addEventListener("click", async () => {
          setMsg(msg3, "");
          try {
            await api(`/api/admin/slots/${r.id}/block`, { method: "POST" });
            setMsg(msg3, "Bloqueado ✅", true);
            await loadAdminSlots();
          } catch (e) {
            setMsg(msg3, e.message || "Erro ao bloquear");
          }
        });
        actions.appendChild(btn);
      }

      box.appendChild(left);
      box.appendChild(actions);
      wrap.appendChild(box);
    });

    if (rows.length === 0) {
      wrap.innerHTML = `<div class="muted">Sem registros para esse dia.</div>`;
    }
  }

  // Agendamentos marcados
  $("btnLoadBookings")?.addEventListener("click", async () => {
    setMsg(msg4, "");
    try {
      const rows = await api("/api/admin/bookings");
      renderBookings(rows);
      setMsg(msg4, "Lista atualizada.", true);
    } catch (e) {
      setMsg(msg4, e.message || "Erro ao carregar agendamentos");
    }
  });

  function renderBookings(rows) {
    const wrap = $("bookingsWrap");
    if (!rows.length) {
      wrap.innerHTML = `<div class="muted">Nenhum agendamento marcado.</div>`;
      return;
    }

    const html = `
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Hora</th>
            <th>Barbeiro</th>
            <th>Cliente</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.date}</td>
              <td>${r.time}</td>
              <td>${r.barber_name}</td>
              <td>${r.client_name || "-"} (${r.client_email || "-"})</td>
              <td>${r.appointment_type || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    wrap.innerHTML = html;
  }
}

// ===== Boot =====
(async function boot() {
  // Se estiver na página admin.html
  if (isAdminPage()) {
    await initAdmin();
  } else {
    await initIndex();
  }
})();

