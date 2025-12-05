// app.js
// ---------------------------------------------------------
// Modelagem no Firestore:
//
// /users/{userId}/clients/{clientId}
// /users/{userId}/clients/{clientId}/loans/{loanId}
// /users/{userId}/clients/{clientId}/loans/{loanId}/payments/{paymentId}
// ---------------------------------------------------------

let currentUser = null;

// Utilitário simples para formatar moeda brasileira
function formatCurrency(value) {
  const num = Number(value) || 0;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Utilitário para exibir mensagens
function showMessage(elementId, message, type = "error") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.classList.remove("success");
  if (type === "success") el.classList.add("success");
  el.style.display = message ? "block" : "none";
}

// Navegação entre seções
function setActiveSection(sectionId) {
  document.querySelectorAll(".section").forEach(sec => {
    sec.classList.toggle("active", sec.id === `section-${sectionId}`);
  });
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === sectionId);
  });
}

// ---------------------------------------------------------
// Inicialização baseada na página
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const pageId = document.body.id;

  if (pageId === "login-page") {
    initLoginPage();
  } else if (pageId === "app-page") {
    initAppPage();
  }
});

// ---------------------------------------------------------
// LOGIN PAGE
// ---------------------------------------------------------
function initLoginPage() {
  auth.onAuthStateChanged(user => {
    if (user) {
      window.location.href = "index.html";
    }
  });

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const resetForm = document.getElementById("reset-form");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      await auth.signInWithEmailAndPassword(email, password);
      showMessage("auth-messages", "Login realizado com sucesso.", "success");
      window.location.href = "index.html";
    } catch (err) {
      showMessage("auth-messages", "Erro ao entrar: " + err.message);
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    try {
      await auth.createUserWithEmailAndPassword(email, password);
      showMessage("auth-messages", "Conta criada com sucesso.", "success");
      window.location.href = "index.html";
    } catch (err) {
      showMessage("auth-messages", "Erro ao criar conta: " + err.message);
    }
  });

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("reset-email").value.trim();

    try {
      await auth.sendPasswordResetEmail(email);
      showMessage("auth-messages", "E-mail de redefinição enviado.", "success");
    } catch (err) {
      showMessage("auth-messages", "Erro ao enviar redefinição: " + err.message);
    }
  });
}

// ---------------------------------------------------------
// APP PAGE
// ---------------------------------------------------------

let clientsCache = [];
let loansCache = {};
let paymentsCache = {};

function initAppPage() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    currentUser = user;
    document.getElementById("current-user-email").textContent = user.email;

    // Navegação
    document.querySelectorAll(".nav-link").forEach(btn => {
      btn.addEventListener("click", () => {
        setActiveSection(btn.dataset.section);
      });
    });

    // Logout
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await auth.signOut();
      window.location.href = "login.html";
    });

    initClientesSection();
    initEmprestimosSection();
    initPagamentosSection();
    initRelatoriosSection();

    subscribeClients();
  });
}

// ---------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------
function getClientsCollection() {
  return db.collection("users").doc(currentUser.uid).collection("clients");
}

function subscribeClients() {
  getClientsCollection()
    .orderBy("name")
    .onSnapshot(snapshot => {
      clientsCache = [];
      snapshot.forEach(doc => clientsCache.push({ id: doc.id, ...doc.data() }));

      renderClientsTable();
      fillClientSelects();
      refreshAllDerivedData();
    });
}

function initClientesSection() {
  const form = document.getElementById("cliente-form");
  const resetBtn = document.getElementById("cliente-reset-btn");
  const filterInput = document.getElementById("filtro-clientes");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("cliente-id").value;

    const data = {
      name: document.getElementById("cliente-nome").value.trim(),
      doc: document.getElementById("cliente-doc").value.trim(),
      phone: document.getElementById("cliente-telefone").value.trim(),
      address: document.getElementById("cliente-endereco").value.trim(),
      notes: document.getElementById("cliente-observacoes").value.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (id) {
        await getClientsCollection().doc(id).update(data);
        showMessage("global-alert", "Cliente atualizado com sucesso.", "success");
      } else {
        await getClientsCollection().add(data);
        showMessage("global-alert", "Cliente cadastrado com sucesso.", "success");
      }
      form.reset();
      document.getElementById("cliente-id").value = "";
    } catch (err) {
      showMessage("global-alert", "Erro ao salvar cliente: " + err.message);
    }
  });

  resetBtn.addEventListener("click", () => {
    form.reset();
    document.getElementById("cliente-id").value = "";
  });

  filterInput.addEventListener("input", renderClientsTable);
}

function renderClientsTable() {
  const tbody = document.getElementById("clientes-tabela");
  const filter = document.getElementById("filtro-clientes").value.toLowerCase();

  tbody.innerHTML = "";

  const filtered = clientsCache.filter(c => c.name.toLowerCase().includes(filter));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">Nenhum cliente encontrado.</td></tr>`;
    return;
  }

  filtered.forEach(client => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${client.name}</td>
      <td>${client.phone || ""}</td>
      <td>
        <button class="btn small outline" data-action="edit" data-id="${client.id}">Editar</button>
        <button class="btn small secondary" data-action="detalhes" data-id="${client.id}">Ver empréstimos</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(btn => {
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    btn.addEventListener("click", () => {
      if (action === "edit") {
        const c = clientsCache.find(x => x.id === id);
        if (!c) return;

        document.getElementById("cliente-id").value = c.id;
        document.getElementById("cliente-nome").value = c.name;
        document.getElementById("cliente-doc").value = c.doc || "";
        document.getElementById("cliente-telefone").value = c.phone || "";
        document.getElementById("cliente-endereco").value = c.address || "";
        document.getElementById("cliente-observacoes").value = c.notes || "";
        setActiveSection("clientes");

      } else if (action === "detalhes") {
        document.getElementById("emprestimo-cliente-select").value = id;
        document.getElementById("pagamento-cliente-select").value = id;
        loadLoansForClient(id);
        setActiveSection("emprestimos");
      }
    });
  });
}

function fillClientSelects() {
  const selects = [
    document.getElementById("emprestimo-cliente-select"),
    document.getElementById("pagamento-cliente-select"),
    document.getElementById("relatorio-cliente-select")
  ];

  selects.forEach(sel => {
    if (!sel) return;

    sel.innerHTML = `<option value="">Selecione...</option>`;

    clientsCache.forEach(client => {
      sel.innerHTML += `<option value="${client.id}">${client.name}</option>`;
    });
  });
}

// ---------------------------------------------------------
// EMPRÉSTIMOS
// ---------------------------------------------------------
function getLoansCollection(clientId) {
  return getClientsCollection().doc(clientId).collection("loans");
}

function initEmprestimosSection() {
  const clienteSelect = document.getElementById("emprestimo-cliente-select");
  const form = document.getElementById("emprestimo-form");

  clienteSelect.addEventListener("change", () => {
    if (clienteSelect.value) loadLoansForClient(clienteSelect.value);
    else document.getElementById("emprestimos-tabela").innerHTML =
      `<tr><td colspan="5">Selecione um cliente para ver os empréstimos.</td></tr>`;
  });

  document.getElementById("emprestimo-calcular-btn")
    .addEventListener("click", calcularParcelas);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const clientId = clienteSelect.value;
    if (!clientId) return showMessage("global-alert", "Selecione um cliente.");

    const id = document.getElementById("emprestimo-id").value;
    const principal = Number(document.getElementById("emprestimo-principal").value);
    const startDate = document.getElementById("emprestimo-data").value;
    const jurosTipo = document.getElementById("emprestimo-tipo-juros").value;
    const jurosValor = Number(document.getElementById("emprestimo-juros").value);
    const dias = Number(document.getElementById("emprestimo-dias").value);
    const parcela = Number(document.getElementById("emprestimo-parcela").value);
    const status = document.getElementById("emprestimo-status").value;
    const obs = document.getElementById("emprestimo-observacoes").value.trim();

    if (!principal || !startDate || !jurosValor || !dias || !parcela)
      return showMessage("global-alert", "Preencha todos os campos.");

    let totalAmount = jurosTipo === "percentual"
      ? principal + (principal * (jurosValor / 100) * dias)
      : principal + (jurosValor * dias);

    const loanData = {
      principal,
      startDate,
      jurosTipo,
      jurosValor,
      days: dias,
      totalAmount,
      dailyInstallment: parcela,
      remainingBalance: totalAmount,
      totalPaid: 0,
      status,
      notes: obs,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (id) {
        const hasPayments = await loanHasPayments(clientId, id);

        if (hasPayments) {
          await getLoansCollection(clientId).doc(id).update({
            status,
            notes: obs
          });
          showMessage("global-alert", "Atualizado (somente status/observações).", "success");
        } else {
          await getLoansCollection(clientId).doc(id).set(loanData, { merge: true });
          showMessage("global-alert", "Empréstimo atualizado.", "success");
        }

      } else {
        await getLoansCollection(clientId).add(loanData);
        showMessage("global-alert", "Empréstimo criado com sucesso.", "success");
      }

      form.reset();
      document.getElementById("emprestimo-id").value = "";

    } catch (err) {
      showMessage("global-alert", "Erro: " + err.message);
    }
  });
}

async function loanHasPayments(clientId, loanId) {
  const snap = await getLoansCollection(clientId).doc(loanId)
    .collection("payments").limit(1).get();
  return !snap.empty;
}

function calcularParcelas() {
  const principal = Number(document.getElementById("emprestimo-principal").value);
  const jurosTipo = document.getElementById("emprestimo-tipo-juros").value;
  const juros = Number(document.getElementById("emprestimo-juros").value);
  const dias = Number(document.getElementById("emprestimo-dias").value);

  if (!principal || !juros || !dias)
    return showMessage("global-alert", "Preencha todos os campos.");

  const total = jurosTipo === "percentual"
    ? principal + (principal * (juros / 100) * dias)
    : principal + (juros * dias);

  const parcela = total / dias;

  document.getElementById("emprestimo-parcela").value = parcela.toFixed(2);
  showMessage("global-alert", "Valor final: " + formatCurrency(total), "success");
}

function loadLoansForClient(clientId) {
  getLoansCollection(clientId)
    .orderBy("startDate", "desc")
    .onSnapshot(snapshot => {
      loansCache[clientId] = [];
      snapshot.forEach(doc =>
        loansCache[clientId].push({ id: doc.id, ...doc.data() })
      );

      renderLoansTable(clientId);
      fillLoanSelectForPayments(clientId);
      refreshAllDerivedData();
    });
}

function renderLoansTable(clientId) {
  const tbody = document.getElementById("emprestimos-tabela");
  tbody.innerHTML = "";

  const loans = loansCache[clientId] || [];

  if (loans.length === 0)
    return tbody.innerHTML = `<tr><td colspan="5">Nenhum empréstimo encontrado.</td></tr>`;

  loans.forEach(loan => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${loan.startDate}</td>
      <td>${formatCurrency(loan.principal)}</td>
      <td>${formatCurrency(loan.remainingBalance || 0)}</td>
      <td>${loan.status}</td>
      <td>
        <button class="btn small outline" data-id="${loan.id}" data-client="${clientId}">Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(btn => {
    const loanId = btn.dataset.id;
    const cliId = btn.dataset.client;
    const loan = (loansCache[cliId] || []).find(l => l.id === loanId);

    btn.addEventListener("click", () => {
      if (!loan) return;

      document.getElementById("emprestimo-id").value = loan.id;
      document.getElementById("emprestimo-principal").value = loan.principal;
      document.getElementById("emprestimo-data").value = loan.startDate;
      document.getElementById("emprestimo-tipo-juros").value = loan.jurosTipo;
      document.getElementById("emprestimo-juros").value = loan.jurosValor;
      document.getElementById("emprestimo-dias").value = loan.days;
      document.getElementById("emprestimo-parcela").value = loan.dailyInstallment;
      document.getElementById("emprestimo-status").value = loan.status;
      document.getElementById("emprestimo-observacoes").value = loan.notes || "";
      document.getElementById("emprestimo-cliente-select").value = cliId;

      setActiveSection("emprestimos");
    });
  });
}

// ---------------------------------------------------------
// PAGAMENTOS
// ---------------------------------------------------------
function getPaymentsCollection(clientId, loanId) {
  return getLoansCollection(clientId).doc(loanId).collection("payments");
}

function initPagamentosSection() {
  const cliSelect = document.getElementById("pagamento-cliente-select");
  const loanSelect = document.getElementById("pagamento-emprestimo-select");
  const form = document.getElementById("pagamento-form");

  document.getElementById("pagamento-data").value =
    new Date().toISOString().slice(0, 10);

  cliSelect.addEventListener("change", () => fillLoanSelectForPayments(cliSelect.value));

  loanSelect.addEventListener("change", () => {
    if (cliSelect.value && loanSelect.value)
      loadPayments(cliSelect.value, loanSelect.value);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const clientId = cliSelect.value;
    const loanId = loanSelect.value;
    const data = document.getElementById("pagamento-data").value;
    const valor = Number(document.getElementById("pagamento-valor").value);
    const obs = document.getElementById("pagamento-observacoes").value.trim();

    if (!clientId || !loanId || !data || !valor)
      return showMessage("global-alert", "Preencha todos os campos.");

    try {
      const payment = {
        paymentDate: data,
        amount: valor,
        notes: obs,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      const loanRef = getLoansCollection(clientId).doc(loanId);

      await db.runTransaction(async tx => {
        const snap = await tx.get(loanRef);
        if (!snap.exists) throw new Error("Empréstimo não encontrado.");

        const loan = snap.data();

        const totalPaid = (loan.totalPaid || 0) + valor;
        const remaining = (loan.remainingBalance || loan.totalAmount) - valor;

        let status = "ativo";
        const today = new Date().toISOString().slice(0,10);
        const fim = computeLoanEndDate(loan.startDate, loan.days);

        if (remaining <= 0.01) status = "quitado";
        else if (today > fim) status = "atrasado";

        tx.set(getPaymentsCollection(clientId, loanId).doc(), payment);
        tx.update(loanRef, {
          totalPaid,
          remainingBalance: remaining,
          status
        });
      });

      showMessage("global-alert", "Pagamento registrado.", "success");
      form.reset();
      document.getElementById("pagamento-data").value =
        new Date().toISOString().slice(0, 10);

      loadPayments(clientId, loanId);
      refreshAllDerivedData();

    } catch (err) {
      showMessage("global-alert", "Erro: " + err.message);
    }
  });
}

function computeLoanEndDate(startDateStr, days) {
  const [y, m, d] = startDateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fillLoanSelectForPayments(clientId) {
  const sel = document.getElementById("pagamento-emprestimo-select");
  sel.innerHTML = `<option value="">Selecione...</option>`;

  if (!clientId) return;

  (loansCache[clientId] || []).forEach(loan => {
    sel.innerHTML += `
      <option value="${loan.id}">
        ${loan.startDate} - ${formatCurrency(loan.principal)} (${loan.status})
      </option>`;
  });
}

function loadPayments(clientId, loanId) {
  getPaymentsCollection(clientId, loanId)
    .orderBy("paymentDate", "asc")
    .onSnapshot(snapshot => {
      const key = clientId + "|" + loanId;
      paymentsCache[key] = [];
      snapshot.forEach(doc =>
        paymentsCache[key].push({ id: doc.id, ...doc.data() })
      );
      renderPaymentsTable(clientId, loanId);
      refreshAllDerivedData();
    });
}

function renderPaymentsTable(clientId, loanId) {
  const tbody = document.getElementById("pagamentos-tabela");
  const key = clientId + "|" + loanId;
  const list = paymentsCache[key] || [];

  tbody.innerHTML = "";

  if (list.length === 0)
    return tbody.innerHTML = `<tr><td colspan="3">Nenhum pagamento registrado.</td></tr>`;

  list.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.paymentDate}</td>
      <td>${formatCurrency(p.amount)}</td>
      <td>${p.notes || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------
// RELATÓRIOS
// ---------------------------------------------------------
function initRelatoriosSection() {
  document.getElementById("relatorio-periodo-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const ini = document.getElementById("relatorio-data-inicio").value;
      const fim = document.getElementById("relatorio-data-fim").value;

      if (!ini || !fim)
        return showMessage("global-alert", "Preencha o período.");

      gerarRelatorioPeriodo(ini, fim);
    });

  document.getElementById("relatorio-cliente-btn")
    .addEventListener("click", () => {
      const id = document.getElementById("relatorio-cliente-select").value;
      if (!id)
        return showMessage("global-alert", "Selecione um cliente.");

      gerarRelatorioCliente(id);
    });
}

async function gerarRelatorioPeriodo(ini, fim) {
  let emprestado = 0;
  let recebido = 0;

  const cliSnap = await getClientsCollection().get();
  for (const c of cliSnap.docs) {
    const loansSnap = await getLoansCollection(c.id).get();

    for (const loanDoc of loansSnap.docs) {
      const loan = loanDoc.data();

      if (loan.startDate >= ini && loan.startDate <= fim)
        emprestado += loan.principal || 0;

      const paySnap = await getPaymentsCollection(c.id, loanDoc.id)
        .where("paymentDate", ">=", ini)
        .where("paymentDate", "<=", fim)
        .get();

      paySnap.forEach(p => recebido += p.data().amount || 0);
    }
  }

  document.getElementById("rel-total-emprestado").textContent = formatCurrency(emprestado);
  document.getElementById("rel-total-recebido").textContent = formatCurrency(recebido);
  document.getElementById("rel-lucro").textContent = formatCurrency(recebido - emprestado);
}

async function gerarRelatorioCliente(id) {
  let emprestado = 0;
  let recebido = 0;
  let saldo = 0;

  const loansSnap = await getLoansCollection(id).get();
  for (const loanDoc of loansSnap.docs) {
    const loan = loanDoc.data();

    emprestado += loan.principal || 0;
    recebido += loan.totalPaid || 0;
    saldo += loan.remainingBalance || 0;
  }

  document.getElementById("rel-cli-total-emprestado").textContent = formatCurrency(emprestado);
  document.getElementById("rel-cli-total-recebido").textContent = formatCurrency(recebido);
  document.getElementById("rel-cli-saldo").textContent = formatCurrency(saldo);
}

// ---------------------------------------------------------
// DASHBOARD (versão simples)
// ---------------------------------------------------------
async function refreshAllDerivedData() {
  await refreshDashboard();
}

async function refreshDashboard() {
  const hoje = new Date().toISOString().slice(0, 10);

  let totalEmprestadoAtivos = 0;
  let totalReceberHoje = 0;
  let totalRecebidoHoje = 0;
  let countAtivo = 0;
  let countAtrasado = 0;
  let countQuitado = 0;

  const vencimentosHoje = [];
  const atrasados = [];

  const cliSnap = await getClientsCollection().get();
  for (const cliDoc of cliSnap.docs) {
    const cliId = cliDoc.id;
    const cli = cliDoc.data();

    const loansSnap = await getLoansCollection(cliId).get();
    for (const loanDoc of loansSnap.docs) {
      const loan = loanDoc.data();

      // Contagem de status
      if (loan.status === "ativo") countAtivo++;
      else if (loan.status === "atrasado") countAtrasado++;
      else if (loan.status === "quitado") countQuitado++;

      // Totais + vencimentos
      if (loan.status === "ativo") {
        totalEmprestadoAtivos += loan.principal || 0;

        const fim = computeLoanEndDate(loan.startDate, loan.days);

        if (hoje >= loan.startDate && hoje <= fim) {
          totalReceberHoje += loan.dailyInstallment || 0;
          vencimentosHoje.push({
            cliente: cli.name,
            valor: loan.dailyInstallment
          });
        }
      }

      // Atrasados
      if (loan.status === "atrasado" && loan.remainingBalance > 0) {
        atrasados.push({
          cliente: cli.name,
          saldo: loan.remainingBalance
        });
      }

      // Pagamentos de hoje
      const paySnap = await getPaymentsCollection(cliId, loanDoc.id)
        .where("paymentDate", "==", hoje).get();

      paySnap.forEach(p => {
        totalRecebidoHoje += p.data().amount || 0;
      });
    }
  }

  // Atualizar cards
  document.getElementById("dash-total-emprestado").textContent = formatCurrency(totalEmprestadoAtivos);
  document.getElementById("dash-total-receber-hoje").textContent = formatCurrency(totalReceberHoje);
  document.getElementById("dash-total-recebido-hoje").textContent = formatCurrency(totalRecebidoHoje);
  document.getElementById("dash-contagem-emprestimos").textContent =
    `${countAtivo} / ${countAtrasado} / ${countQuitado}`;

  // Listas
  const vencList = document.getElementById("vencimentos-list");
  vencList.innerHTML = "";

  if (vencimentosHoje.length === 0) {
    vencList.innerHTML = `<p class="empty">Nenhum vencimento hoje.</p>`;
  } else {
    vencimentosHoje.forEach(v => {
      vencList.innerHTML += `
        <div class="list-item">
          <strong>${v.cliente}</strong>
          <p>Parcela: ${formatCurrency(v.valor)}</p>
        </div>`;
    });
  }

  const atrList = document.getElementById("atrasados-list");
  atrList.innerHTML = "";

  if (atrasados.length === 0) {
    atrList.innerHTML = `<p class="empty">Nenhum empréstimo atrasado.</p>`;
  } else {
    atrasados.forEach(a => {
      atrList.innerHTML += `
        <div class="list-item">
          <strong>${a.cliente}</strong>
          <p>Saldo devedor: ${formatCurrency(a.saldo)}</p>
        </div>`;
    });
  }
}
