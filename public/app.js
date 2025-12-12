const KEYS = { session: "barb_session_v3" };
const $ = (id) => document.getElementById(id);

function setSession(data){ localStorage.setItem(KEYS.session, JSON.stringify(data)); }
function getSession(){ try { return JSON.parse(localStorage.getItem(KEYS.session)); } catch { return null; } }
function clearSession(){ localStorage.removeItem(KEYS.session); }

function setMsg(el, msg, ok=false){
  if(!el) return;
  el.textContent = msg || "";
  el.className = "msg " + (ok ? "ok" : "err");
}

async function api(url, opts={}){
  const s = getSession();
  const headers = Object.assign({ "Content-Type":"application/json" }, opts.headers||{});
  if(s?.token) headers.Authorization = `Bearer ${s.token}`;
  const res = await fetch(url, { ...opts, headers });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if(!res.ok) throw new Error(body?.error || body?.message || (typeof body==="string"?body:"Erro"));
  return body;
}

/* ===================== INDEX (LOGIN + BOOKING) ===================== */
async function initIndex(){
  const viewLogin = $("viewLogin");
  const viewBooking = $("viewBooking");
  if(!viewLogin || !viewBooking) return;

  const badgeUser = $("badgeUser");
  const btnGoAdmin = $("btnGoAdmin");
  const btnLogoutClient = $("btnLogoutClient");

  const btnLogin = $("btnLogin");
  const loginEmail = $("loginEmail");
  const loginPass = $("loginPass");
  const loginMsg = $("loginMsg");

  const selBarber = $("selBarber");
  const selType = $("selType");
  const selDate = $("selDate");
  const selService = $("selService"); // <<< NOVO
  const btnLoadSlots = $("btnLoadSlots");
  const slotsWrap = $("slotsWrap");

  function showLogin(){
    viewLogin.classList.remove("hidden");
    viewBooking.classList.add("hidden");
    btnGoAdmin?.classList.add("hidden");
    btnLogoutClient?.classList.add("hidden");
    if(badgeUser) badgeUser.textContent="";
  }
  function showBooking(){
    viewLogin.classList.add("hidden");
    viewBooking.classList.remove("hidden");
    btnLogoutClient?.classList.remove("hidden");

    const s = getSession();
    if(badgeUser) badgeUser.textContent = `${s?.user?.name || "Usuário"} • ${s?.user?.role || ""}`;
    if(s?.user?.role === "admin") btnGoAdmin?.classList.remove("hidden");
    else btnGoAdmin?.classList.add("hidden");
  }

  async function loadBarbers(){
    const rows = await api("/api/barbers");
    selBarber.innerHTML = `<option value="">Selecione...</option>` +
      rows.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
  }

  async function loadServices(){
    const rows = await api("/api/services");
    if(!selService) return;
    selService.innerHTML =
      `<option value="">Selecione...</option>` +
      rows.map(s => `<option value="${s.id}">${s.name} • ${s.duration_minutes} min</option>`).join("");
  }

  async function loadSlots(){
    slotsWrap.innerHTML = "";
    const barber_id = selBarber.value;
    const date = selDate.value;
    if(!barber_id || !date){
      slotsWrap.innerHTML = `<div class="muted">Selecione barbeiro e data.</div>`;
      return;
    }
    const rows = await api(`/api/slots?barber_id=${encodeURIComponent(barber_id)}&date=${encodeURIComponent(date)}`);
    if(!rows.length){
      slotsWrap.innerHTML = `<div class="muted">Nenhum horário livre nesse dia.</div>`;
      return;
    }
    slotsWrap.innerHTML = rows.map(r => `
      <div class="slot">
        <div><b>${r.time}</b></div>
        <button class="btn btn-sm" data-id="${r.id}">Marcar</button>
      </div>
    `).join("");

    slotsWrap.querySelectorAll("button[data-id]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        try{
          const slot_id = Number(btn.dataset.id);
          const type = String(selType.value||"AVULSO").toUpperCase();
          const service_id = Number(selService?.value);

          if(!service_id) {
            alert("Selecione o serviço (ex: Barba 30min, Cabelo 30min etc.)");
            return;
          }

          await api("/api/book",{
            method:"POST",
            body:JSON.stringify({slot_id,type,service_id})
          });

          alert("Agendado com sucesso!");
          await loadSlots();
        }catch(e){
          alert(e.message || "Erro ao agendar");
        }
      });
    });
  }

  const sess = getSession();
  if(sess?.token){
    showBooking();
    try{
      await loadBarbers();
      await loadServices();
    }catch{}
  }else{
    showLogin();
  }

  btnLogoutClient?.addEventListener("click", ()=>{
    clearSession();
    showLogin();
  });

  btnLogin?.addEventListener("click", async ()=>{
    setMsg(loginMsg,"");
    try{
      const email = (loginEmail.value||"").trim().toLowerCase();
      const password = loginPass.value||"";
      if(!email || !password) throw new Error("Preencha email e senha.");

      const data = await api("/api/login",{method:"POST", body:JSON.stringify({email,password})});
      setSession({token:data.token, user:data.user});

      showBooking();
      await loadBarbers();
      await loadServices();
    }catch(e){
      setMsg(loginMsg, e.message || "Erro no login");
    }
  });

  btnLoadSlots?.addEventListener("click", ()=> loadSlots().catch(e=>alert(e.message)));
}

/* ===================== ADMIN ===================== */
async function initAdmin(){
  if(!location.pathname.includes("admin.html")) return;

  const sess = getSession();
  if(!sess?.token){ location.href = "/"; return; }
  if(sess.user?.role !== "admin"){ location.href = "/"; return; }

  $("userBadge").textContent = `${sess.user?.name || "Admin"} • admin`;

  $("btnLogout")?.addEventListener("click", ()=>{
    clearSession();
    location.href = "/";
  });

  // Tabs
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".tabPane").forEach(p=>p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.remove("hidden");
    });
  });

  // Create user
  $("btnCreateUser").addEventListener("click", async ()=>{
    setMsg($("adminMsg1"),"");
    try{
      const name = $("uName").value.trim();
      const phone = $("uPhone").value.trim();
      const email = $("uEmail").value.trim().toLowerCase();
      const password = $("uPass").value;
      const role = $("uRole").value;

      await api("/api/admin/users",{method:"POST", body:JSON.stringify({name,phone,email,password,role})});
      setMsg($("adminMsg1"),"Usuário criado com sucesso!",true);
      $("uName").value=""; $("uPhone").value=""; $("uEmail").value=""; $("uPass").value="";
    }catch(e){
      setMsg($("adminMsg1"), e.message || "Erro ao criar usuário");
    }
  });

  // Users list
  async function loadUsers(){
    const rows = await api("/api/admin/users");
    const wrap = $("usersWrap");
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Nome</th><th>Email</th><th>Tipo</th><th>Ativo</th><th>Criado</th></tr></thead>
        <tbody>
          ${rows.map(u=>`
            <tr>
              <td>${u.name||"-"}</td>
              <td>${u.email||"-"}</td>
              <td>${u.role||"-"}</td>
              <td>${u.active ? "Sim":"Não"}</td>
              <td>${u.created_at||"-"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
  }
  $("btnLoadUsers").addEventListener("click", async ()=>{
    setMsg($("adminMsgUsers"),"");
    try{ await loadUsers(); setMsg($("adminMsgUsers"),"Lista atualizada.",true); }
    catch(e){ setMsg($("adminMsgUsers"), e.message || "Erro"); }
  });

  // Barbers list + select
  async function loadBarbersAll(){
    const list = await api("/api/admin/barbers");
    const wrap = $("barbersWrap");
    wrap.innerHTML = list.length ? "" : `<div class="muted">Nenhum barbeiro cadastrado.</div>`;

    list.forEach(b=>{
      const row = document.createElement("div");
      row.className="listItem";
      row.innerHTML = `
        <div><b>${b.name}</b><div class="muted" style="font-size:12px">ID: ${b.id}</div></div>
        <div class="row"><button class="btn btn-secondary btn-sm">Gerenciar agenda</button></div>
      `;
      row.querySelector("button").addEventListener("click", ()=>{
        document.querySelector('[data-tab="tabAgenda"]').click();
        $("admSelBarber").value = String(b.id);
      });
      wrap.appendChild(row);
    });

    const sel = $("admSelBarber");
    sel.innerHTML = `<option value="">Selecione...</option>` +
      list.filter(x=>x.active===1 || x.active===true)
          .map(x=>`<option value="${x.id}">${x.name}</option>`).join("");
  }

  $("btnCreateBarber").addEventListener("click", async ()=>{
    setMsg($("adminMsg2"),"");
    try{
      const name = $("bName").value.trim();
      await api("/api/admin/barbers",{method:"POST", body:JSON.stringify({name})});
      $("bName").value="";
      setMsg($("adminMsg2"),"Barbeiro criado!",true);
      await loadBarbersAll();
    }catch(e){
      setMsg($("adminMsg2"), e.message || "Erro ao criar barbeiro");
    }
  });

  $("btnLoadBarbers").addEventListener("click", async ()=>{
    setMsg($("adminMsg2"),"");
    try{ await loadBarbersAll(); setMsg($("adminMsg2"),"Lista atualizada.",true); }
    catch(e){ setMsg($("adminMsg2"), e.message || "Erro"); }
  });

  // Agenda
  async function loadAgenda(){
    setMsg($("adminMsg3"),"");
    const wrap = $("adminSlotsWrap");
    wrap.innerHTML="";
    try{
      const barber_id = Number($("admSelBarber").value);
      const date = $("admDate").value;
      if(!barber_id || !date) throw new Error("Selecione barbeiro e data.");
      const rows = await api(`/api/admin/slots?barber_id=${barber_id}&date=${encodeURIComponent(date)}`);
      if(!rows.length){
        wrap.innerHTML = `<div class="muted">Nenhum horário cadastrado nesse dia.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r=>{
        const tag = r.status==="FREE" ? "LIVRE" : r.status==="BLOCKED" ? "BLOQUEADO" : "MARCADO";
        const client = r.client_name ? ` • ${r.client_name}` : "";
        const type = r.type ? ` • ${r.type}` : "";
        const service = r.service_name ? ` • Serviço: ${r.service_name} (${r.service_minutes}min)` : "";
        return `<div class="slot"><div><b>${r.time}</b> <span class="muted">(${tag}${client}${type}${service})</span></div></div>`;
      }).join("");
    }catch(e){
      setMsg($("adminMsg3"), e.message || "Erro ao carregar");
    }
  }

  $("btnCreateSlot").addEventListener("click", async ()=>{
    setMsg($("adminMsg3"),"");
    try{
      const barber_id = Number($("admSelBarber").value);
      const date = $("admDate").value;
      const time = $("admTime").value.trim();
      await api("/api/admin/slots/free",{method:"POST", body:JSON.stringify({barber_id,date,time})});
      setMsg($("adminMsg3"),"Horário LIVRE criado!",true);
      await loadAgenda();
    }catch(e){ setMsg($("adminMsg3"), e.message || "Erro"); }
  });

  $("btnBlockSlot").addEventListener("click", async ()=>{
    setMsg($("adminMsg3"),"");
    try{
      const barber_id = Number($("admSelBarber").value);
      const date = $("admDate").value;
      const time = $("admTime").value.trim();
      await api("/api/admin/slots/block",{method:"POST", body:JSON.stringify({barber_id,date,time})});
      setMsg($("adminMsg3"),"Horário BLOQUEADO!",true);
      await loadAgenda();
    }catch(e){ setMsg($("adminMsg3"), e.message || "Erro"); }
  });

  $("btnLoadAdminSlots").addEventListener("click", loadAgenda);

  // Inicial
  await loadBarbersAll().catch(()=>{});
}

/* BOOT */
(async function(){
  await initIndex();
  await initAdmin();
})();
