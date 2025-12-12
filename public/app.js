<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Admin - Barbearia</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="container">
    <header class="top">
      <h1>Admin</h1>
      <div id="userBadge" class="badge"></div>

      <div class="row">
        <a class="btn btn-ghost" href="/">Ir para Agendamento</a>
        <button id="btnLogout" class="btn btn-ghost">Sair</button>
      </div>
    </header>

    <!-- Abas -->
    <div class="tabs">
      <button class="tab active" data-tab="tabAgenda">Agenda</button>
      <button class="tab" data-tab="tabClientes">Clientes</button>
      <button class="tab" data-tab="tabBarbeiros">Barbeiros</button>
    </div>

    <!-- ===================== AGENDA ===================== -->
    <section id="tabAgenda" class="card tabPane">
      <h2>Agenda do Barbeiro (Criar / Bloquear / Ver)</h2>

      <div class="grid">
        <label>Barbeiro
          <select id="admSelBarber"></select>
        </label>
        <label>Data
          <input id="admDate" type="date" />
        </label>
        <label>Hora (HH:MM)
          <input id="admTime" placeholder="14:00" />
        </label>
      </div>

      <div class="row">
        <button id="btnCreateSlot" class="btn">Criar horário LIVRE</button>
        <button id="btnLoadAdminSlots" class="btn btn-secondary">Carregar agenda do dia</button>
      </div>

      <div id="adminSlotsWrap" class="slots"></div>
      <div id="adminMsg3" class="msg"></div>
    </section>

    <!-- ===================== CLIENTES ===================== -->
    <section id="tabClientes" class="card tabPane hidden">
      <h2>Clientes cadastrados</h2>
      <button id="btnLoadUsers" class="btn btn-secondary">Atualizar lista</button>
      <div id="usersWrap" class="table"></div>
      <div id="adminMsgUsers" class="msg"></div>
    </section>

    <!-- ===================== BARBEIROS ===================== -->
    <section id="tabBarbeiros" class="card tabPane hidden">
      <h2>Barbeiros cadastrados</h2>

      <div class="row">
        <input id="bName" placeholder="Nome do barbeiro" />
        <button id="btnCreateBarber" class="btn">Criar</button>
        <button id="btnLoadBarbers" class="btn btn-secondary">Atualizar lista</button>
      </div>

      <div id="barbersWrap" class="list"></div>
      <div id="adminMsg2" class="msg"></div>

      <p class="hint">
        Dica: clique em <b>Gerenciar agenda</b> para abrir a agenda daquele barbeiro na aba “Agenda”.
      </p>
    </section>

    <!-- ===================== CRIAR USUÁRIO (fica embaixo, sempre visível) ===================== -->
    <section class="card">
      <h2>Criar Usuário</h2>
      <div class="grid">
        <label>Nome <input id="uName" /></label>
        <label>Telefone <input id="uPhone" /></label>
        <label>Email <input id="uEmail" type="email" /></label>
        <label>Senha <input id="uPass" type="password" /></label>
        <label>Tipo
          <select id="uRole">
            <option value="client">cliente</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>
      <button id="btnCreateUser" class="btn">Criar usuário</button>
      <div id="adminMsg1" class="msg"></div>
    </section>

  </div>

  <script src="app.js"></script>
</body>
</html>
