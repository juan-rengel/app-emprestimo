// app.js
// ---------------------------------------------------------
// Modelagem no Firestore:
//
// /users/{userId}/clients/{clientId}
// /users/{userId}/clients/{clientId}/loans/{loanId}
// /users/{userId}/clients/{clientId}/loans/{loanId}/payments/{paymentId}
//
// Cada loan guarda campos agregados: principal, totalAmount, dailyInstallment,
// remainingBalance, totalPaid, startDate, days, status.
// Payments são registros individuais de pagamentos diários.
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
  // Se já estiver logado, vai para o app
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
      showMessage("auth-messages", "Conta criada com sucesso. Você já está logado.", "success");
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

// Variáveis globais de cache
let clientsCache = []; // {id, ...data}
let loansCache = {};   // { clientId: [{id, ...data}] }
let paymentsCache = {}; // { loanKey: [{id, ...data}] }  loanKey = clientId + '|' + loanId

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

    // Inicializar funcionalidades
    initClientesSection();
    initEmprestimosSection();
    initPagamentosSection();
    initRelatoriosSection();

    // Carregar dados iniciais
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
  // Observa em tempo real os clientes
  getClientsCollection()
    .orderBy("name")
    .onSnapshot(snapshot => {
      clientsCache = [];
      snapshot.forEach(doc => {
        clientsCache.push({ id: doc.id, ...doc.data() });
      });
      renderClientsTable();
      fillClientSelects();
      refreshAllDerivedData();
    }, err => {
      showMessage("global-alert", "Erro ao carregar clientes: " + err.message);
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

  filterInput.addEventListener("input", () => {
    renderClientsTable();
  });
}

function renderClientsTable() {
  const tbody = document.getElementById("clientes-tabela");
  const filter = document.getElementById("filtro-clientes").value.toLowerCase();

  tbody.innerHTML = "";

  const filtered = clientsCache.filter(c => c.name.toLowerCase().includes(filter));

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">Nenhum cliente encontrado.</td></tr>';
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

  // Ações
  tbody.querySelectorAll("button").forEach(btn => {
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    btn.addEventListener("click", () => {
      if (action === "edit") {
        const client = clientsCache.find(c => c.id === id);
        if (!client) return;
        document.getElementById("cliente-id").value = client.id;
        document.getElementById("cliente-nome").value = client.name;
        document.getElementById("cliente-doc").value = client.doc || "";
        document.getElementById("cliente-telefone").value = client.phone || "";
        document.getElementById("cliente-endereco").value = client.address || "";
        document.getElementById("cliente-observacoes").value = client.notes || "";
        setActiveSection("clientes");
      } else if (action === "detalhes") {
        // Seleciona o cliente nos selects de empréstimos/pagamentos
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
    sel.innerHTML = "";
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "Selecione...";
    sel.appendChild(optEmpty);
    clientsCache.forEach(client => {
      const opt = document.createElement("option");
      opt.value = client.id;
      opt.textContent = client.name;
      sel.appendChild(opt);
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
  const calcularBtn = document.getElementById("emprestimo-calcular-btn");

  clienteSelect.addEventListener("change", () => {
    const clientId = clienteSelect.value;
    if (clientId) {
      loadLoansForClient(clientId);
    } else {
      document.getElementById("emprestimos-tabela").innerHTML =
        '<tr><td colspan="5">Selecione um cliente para ver os empréstimos.</td></tr>';
    }
  });

  calcularBtn.addEventListener("click", () => {
    calcularParcelas();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const clientId = clienteSelect.value;
    if (!clientId) {
      showMessage("global-alert", "Selecione um cliente antes de cadastrar o empréstimo.");
      return;
    }

    const id = document.getElementById("emprestimo-id").value;
    const principal = Number(document.getElementById("emprestimo-principal").value);
    const startDate = document.getElementById("emprestimo-data").value;
    const jurosTipo = document.getElementById("emprestimo-tipo-juros").value;
    const jurosValor = Number(document.getElementById("emprestimo-juros").value);
    const dias = Number(document.getElementById("emprestimo-dias").value);
    const parcela = Number(document.getElementById("emprestimo-parcela").value);
    const status = document.getElementById("emprestimo-status").value;
    const observacoes = document.getElementById("emprestimo-observacoes").value.trim();

    if (!principal || !startDate || !jurosValor || !dias || !parcela) {
      showMessage("global-alert", "Preencha e calcule corretamente os campos do empréstimo.");
      return;
    }

    // Regras de negócio:
    // valor_final = principal + (principal * taxa_diaria * dias) para juros percentual
    // ou valor_final = principal + (valor_fixo_diario * dias) para juros fixo.
    let totalAmount = 0;
    if (jurosTipo === "percentual") {
      const taxaDiaria = jurosValor / 100;
      totalAmount = principal + (principal * taxaDiaria * dias);
    } else {
      totalAmount = principal + (jurosValor * dias);
    }

    const loanData = {
      principal,
      startDate, // armazenado como string "YYYY-MM-DD"
      jurosTipo,
      jurosValor,
      days: dias,
      totalAmount,
      dailyInstallment: parcela,
      remainingBalance: totalAmount, // no início, saldo = total
      totalPaid: 0,
      status,
      notes: observacoes,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (id) {
        // Regra: bloquear alterações críticas se já houver pagamentos
        const hasPayments = await loanHasPayments(clientId, id);
        if (hasPayments) {
          // Permitir apenas atualização de status e observações, por segurança.
          await getLoansCollection(clientId).doc(id).update({
            status: loanData.status,
            notes: loanData.notes
          });
          showMessage("global-alert", "Empréstimo atualizado (apenas status/observações).", "success");
        } else {
          await getLoansCollection(clientId).doc(id).set(loanData, { merge: true });
          showMessage("global-alert", "Empréstimo atualizado com sucesso.", "success");
        }
      } else {
        await getLoansCollection(clientId).add(loanData);
        showMessage("global-alert", "Empréstimo criado com sucesso.", "success");
      }
      form.reset();
      document.getElementById("emprestimo-id").value = "";
    } catch (err) {
      showMessage("global-alert", "Erro ao salvar empréstimo: " + err.message);
    }
  });
}

async function loanHasPayments(clientId, loanId) {
  const paymentsRef = getLoansCollection(clientId).doc(loanId).collection("payments");
  const snap = await paymentsRef.limit(1).get();
  return !snap.empty;
}

function calcularParcelas() {
  const principal = Number(document.getElementById("emprestimo-principal").value);
  const jurosTipo = document.getElementById("emprestimo-tipo-juros").value;
  const jurosValor = Number(document.getElementById("emprestimo-juros").value);
  const dias = Number(document.getElementById("emprestimo-dias").value);

  if (!principal || !jurosValor || !dias) {
    showMessage("global-alert", "Informe principal, juros e dias para calcular as parcelas.");
    return;
  }

  let totalAmount = 0;
  if (jurosTipo === "percentual") {
    const taxaDiaria = jurosValor / 100;
    totalAmount = principal + (principal * taxaDiaria * dias);
  } else {
    totalAmount = principal + (jurosValor * dias);
  }

  const diaria = totalAmount / dias;
  document.getElementById("emprestimo-parcela").value = diaria.toFixed(2);
  showMessage("global-alert", "Cálculo realizado. Valor final: " + formatCurrency(totalAmount), "success");
}

function loadLoansForClient(clientId) {
  if (!clientId) return;
  getLoansCollection(clientId)
    .orderBy("startDate", "desc")
    .onSnapshot(snapshot => {
      loansCache[clientId] = [];
      snapshot.forEach(doc => {
        loansCache[clientId].push({ id: doc.id, ...doc.data() });
      });
      renderLoansTable(clientId);
      // Atualiza select de empréstimos em Pagamentos
      fillLoanSelectForPayments(clientId);
      refreshAllDerivedData();
    }, err => {
      showMessage("global-alert", "Erro ao carregar empréstimos: " + err.message);
    });
}

function renderLoansTable(clientId) {
  const tbody = document.getElementById("emprestimos-tabela");
  tbody.innerHTML = "";

  const loans = loansCache[clientId] || [];
  if (loans.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum empréstimo para este cliente.</td></tr>';
    return;
  }

  loans.forEach(loan => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${loan.startDate || ""}</td>
      <td>${formatCurrency(loan.principal)}</td>
      <td>${formatCurrency(loan.remainingBalance || 0)}</td>
      <td>${loan.status}</td>
      <td>
        <button class="btn small outline" data-id="${loan.id}" data-client="${clientId}" data-action="edit">Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const loanId = btn.dataset.id;
      const cliId = btn.dataset.client;
      const loan = (loansCache[cliId] || []).find(l => l.id === loanId);
      if (!loan) return;

      // Preenche formulário para edição
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
  const clienteSelect = document.getElementById("pagamento-cliente-select");
  const emprestimoSelect = document.getElementById("pagamento-emprestimo-select");
  const form = document.getElementById("pagamento-form");

  // Default data de pagamento = hoje
  const hoje = new Date().toISOString().slice(0,10);
  document.getElementById("pagamento-data").value = hoje;

  clienteSelect.addEventListener("change", () => {
    const clientId = clienteSelect.value;
    fillLoanSelectForPayments(clientId);
  });

  emprestimoSelect.addEventListener("change", () => {
    const clientId = clienteSelect.value;
    const loanId = emprestimoSelect.value;
    if (clientId && loanId) {
      loadPayments(clientId, loanId);
    } else {
      document.getElementById("pagamentos-tabela").innerHTML =
        '<tr><td colspan="3">Selecione um empréstimo para ver o histórico.</td></tr>';
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const clientId = clienteSelect.value;
    const loanId = emprestimoSelect.value;
    const data = document.getElementById("pagamento-data").value;
    const valor = Number(document.getElementById("pagamento-valor").value);
    const obs = document.getElementById("pagamento-observacoes").value.trim();

    if (!clientId || !loanId || !data || !valor) {
      showMessage("global-alert", "Preencha cliente, empréstimo, data e valor.");
      return;
    }

    try {
      const paymentData = {
        paymentDate: data,
        amount: valor,
        notes: obs,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      const loanRef = getLoansCollection(clientId).doc(loanId);

      await db.runTransaction(async (tx) => {
        const loanSnap = await tx.get(loanRef);
        if (!loanSnap.exists) throw new Error("Empréstimo não encontrado.");
        const loan = loanSnap.data();

        const newTotalPaid = (loan.totalPaid || 0) + valor;
        const newRemaining = (loan.remainingBalance || loan.totalAmount || 0) - valor;

        // Cálculo aproximado de status:
        // - Quitado: saldo <= 0
        // - Atrasado: hoje > data de término e saldo > 0
        // - Ativo: caso contrário
        let newStatus = "ativo";
        const todayStr = new Date().toISOString().slice(0,10);
        const endDateStr = computeLoanEndDate(loan.startDate, loan.days);
        if (newRemaining <= 0.01) {
          newStatus = "quitado";
        } else if (todayStr > endDateStr) {
          newStatus = "atrasado";
        }

        tx.set(getPaymentsCollection(clientId, loanId).doc(), paymentData);
        tx.update(loanRef, {
          totalPaid: newTotalPaid,
          remainingBalance: newRemaining,
          status: newStatus
        });
      });

      showMessage("global-alert", "Pagamento registrado com sucesso.", "success");
      form.reset();
      document.getElementById("pagamento-data").value = new Date().toISOString().slice(0,10);
      // Recarrega pagamentos e dashboards
      loadPayments(clientId, loanId);
      refreshAllDerivedData();
    } catch (err) {
      showMessage("global-alert", "Erro ao registrar pagamento: " + err.message);
    }
  });
}

function computeLoanEndDate(startDateStr, days) {
  if (!startDateStr || !days) return startDateStr;
  const [y, m, d] = startDateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fillLoanSelectForPayments(clientId) {
  const emprestimoSelect = document.getElementById("pagamento-emprestimo-select");
  emprestimoSelect.innerHTML = "";
  const optEmpty = document.createElement("option");
  optEmpty.value = "";
  optEmpty.textContent = "Selecione...";
  emprestimoSelect.appendChild(optEmpty);

  if (!clientId) return;

  const loans = loansCache[clientId] || [];
  loans.forEach(loan => {
    const opt = document.createElement("option");
    opt.value = loan.id;
    opt.textContent = `${loan.startDate} - ${formatCurrency(loan.principal)} (${loan.status})`;
    emprestimoSelect.appendChild(opt);
  });
}

function loadPayments(clientId, loanId) {
  if (!clientId || !loanId) return;
  getPaymentsCollection(clientId, loanId)
    .orderBy("paymentDate", "asc")
    .onSnapshot(snapshot => {
      const key = clientId + "|" + loanId;
      paymentsCache[key] = [];
      snapshot.forEach(doc => {
        paymentsCache[key].push({ id: doc.id, ...doc.data() });
      });
      renderPaymentsTable(clientId, loanId);
      refreshAllDerivedData();
    }, err => {
      showMessage("global-alert", "Erro ao carregar pagamentos: " + err.message);
    });
}

function renderPaymentsTable(clientId, loanId) {
  const tbody = document.getElementById("pagamentos-tabela");
  tbody.innerHTML = "";

  const key = clientId + "|" + loanId;
  const payments = paymentsCache[key] || [];

  if (payments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">Nenhum pagamento registrado.</td></tr>';
    return;
  }

  payments.forEach(p => {
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
  const periodoForm = document.getElementById("relatorio-periodo-form");
  const cliBtn = document.getElementById("relatorio-cliente-btn");

  periodoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dIni = document.getElementById("relatorio-data-inicio").value;
    const dFim = document.getElementById("relatorio-data-fim").value;
    if (!dIni || !dFim) {
      showMessage("global-alert", "Informe o período para o relatório.");
      return;
    }
    await gerarRelatorioPeriodo(dIni, dFim);
  });

  cliBtn.addEventListener("click", async () => {
    const cliId = document.getElementById("relatorio-cliente-select").value;
    if (!cliId) {
      showMessage("global-alert", "Selecione um cliente para o relatório.");
      return;
    }
    await gerarRelatorioCliente(cliId);
  });
}

// Relatório por período
async function gerarRelatorioPeriodo(dataInicio, dataFim) {
  // Estratégia simples:
  // - Total emprestado no período: soma do principal de empréstimos com startDate no intervalo.
  // - Total recebido: soma dos pagamentos com paymentDate no intervalo.
  // - Lucro aproximado = Total recebido - Total emprestado no período.
  let totalEmprestado = 0;
  let totalRecebido = 0;

  const clientsSnap = await getClientsCollection().get();
  for (const cliDoc of clientsSnap.docs) {
    const cliId = cliDoc.id;
    const loansSnap = await getLoansCollection(cliId).get();
    for (const loanDoc of loansSnap.docs) {
      const loan = loanDoc.data();
      if (loan.startDate >= dataInicio && loan.startDate <= dataFim) {
        totalEmprestado += loan.principal || 0;
      }
      const paymentsSnap = await getPaymentsCollection(cliId, loanDoc.id)
        .where("paymentDate", ">=", dataInicio)
        .where("paymentDate", "<=", dataFim)
        .get();
      paymentsSnap.forEach(p => {
        totalRecebido += p.data().amount || 0;
      });
    }
  }

  const lucro = totalRecebido - totalEmprestado;

  document.getElementById("rel-total-emprestado").textContent = formatCurrency(totalEmprestado);
  document.getElementById("rel-total-recebido").textContent = formatCurrency(totalRecebido);
  document.getElementById("rel-lucro").textContent = formatCurrency(lucro);
}

// Relatório por cliente
async function gerarRelatorioCliente(cliId) {
  let totalEmprestado = 0;
  let totalRecebido = 0;
  let saldoAtual = 0;

  const loansSnap = await getLoansCollection(cliId).get();
  for (const loanDoc of loansSnap.docs) {
    const loan = loanDoc.data();
    totalEmprestado += loan.principal || 0;
    totalRecebido += loan.totalPaid || 0;
    saldoAtual += loan.remainingBalance || 0;
  }

  document.getElementById("rel-cli-total-emprestado").textContent = formatCurrency(totalEmprestado);
  document.getElementById("rel-cli-total-recebido").textContent = formatCurrency(totalRecebido);
  document.getElementById("rel-cli-saldo").textContent = formatCurrency(saldoAtual);
}

// ---------------------------------------------------------
// DASHBOARD & ATUALIZAÇÕES DERIVADAS
// ---------------------------------------------------------

async function refreshAllDerivedData() {
  await refreshDashboard();
  // Relatórios são gerados sob demanda, não aqui.
}
// ---------------------------------------------------------
// DASHBOARD & ATUALIZAÇÕES DERIVADAS
// ---------------------------------------------------------
async function refreshDashboard() {
  const todayStr = new Date().toISOString().slice(0,10);
  let totalEmprestadoAtivos = 0;
  let totalReceberHoje = 0;
  let totalRecebidoHoje = 0;
  let countAtivo = 0;
  let countAtrasado = 0;
  let countQuitado = 0;

  const vencimentosHoje = [];
  const atrasados = [];

  const clientsSnap = await getClientsCollection().get();
  for (const cliDoc of clientsSnap.docs) {
    const cliId = cliDoc.id;
    const cliData = cliDoc.data();
    const loansSnap = await getLoansCollection(cliId).get();

    for (const loanDoc of loansSnap.docs) {
      const loan = loanDoc.data();

      // Contagem por status
      if (loan.status === "ativo") countAtivo++;
      else if (loan.status === "atrasado") countAtrasado++;
      else if (loan.status === "quitado") countQuitado++;

      if (loan.status === "ativo") {
        totalEmprestadoAtivos += loan.principal || 0;

        const endDate = computeLoanEndDate(loan.startDate, loan.days);

        if (todayStr >= loan.startDate && todayStr <= endDate) {
          totalReceberHoje += loan.dailyInstallment || 0;

          // AQUI FOI CORRIGIDO → ANTES salvava o ID, agora salva dados úteis
          vencimentosHoje.push({
            cliente: cliData.name,
            descricao: `Início: ${loan.startDate} | Total: ${formatCurrency(loan.totalAmount)}`,
            valor: loan.dailyInstallment || 0
          });
        }
      }

      // Empréstimos atrasados
      if (loan.status === "atrasado" && (loan.remainingBalance || 0) > 0) {
        atrasados.push({
          cliente: cliData.name,
          saldo: loan.remainingBalance || 0,
          inicio: loan.startDate
        });
      }

      // Pagamentos de hoje
      const paymentsSnap = await getPaymentsCollection(cliId, loanDoc.id)
        .where("paymentDate", "==", todayStr)
        .get();

      paymentsSnap.forEach(p => {
        totalRecebidoHoje += p.data().amount || 0;
      });
    }
  }

  // Atualiza cards
  document.getElementById("dash-total-emprestado").textContent = formatCurrency(totalEmprestadoAtivos);
  document.getElementById("dash-total-receber-hoje").textContent = formatCurrency(totalReceberHoje);
  document.getElementById("dash-total-recebido-hoje").textContent = formatCurrency(totalRecebidoHoje);
  document.getElementById("dash-contagem-emprestimos").textContent =
    `${countAtivo} / ${countAtrasado} / ${countQuitado}`;

  // Tabela "Vencimentos de hoje"
 // ----- VENCIMENTOS HOJE -----
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
      </div>
    `;
  });
}

// ----- ATRASADOS -----
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
      </div>
    `;
  });
}

}
