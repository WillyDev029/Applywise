const starterApplications = [
  { id: 1, company: "Northstar Labs", role: "Product Designer", status: "Interview", date: "2026-08-29", nextStep: "Portfolio review · Sep 06" },
  { id: 2, company: "Lumen & Co.", role: "Senior UX Designer", status: "Applied", date: "2026-08-26", nextStep: "Follow up next week" },
  { id: 3, company: "Fieldwork", role: "Design Lead", status: "Offer", date: "2026-08-21", nextStep: "Review offer · Sep 05" },
  { id: 4, company: "Marble Studio", role: "Product Designer", status: "Applied", date: "2026-08-18", nextStep: "Awaiting response" },
  { id: 5, company: "Tandem Health", role: "UX Researcher", status: "Rejected", date: "2026-08-12", nextStep: "Keep the search going" }
];

const cloudConfig = window.APPLYWISE_SUPABASE || {};
const cloudEnabled = Boolean(window.supabase && cloudConfig.url && cloudConfig.anonKey && !cloudConfig.url.startsWith("YOUR_"));
const supabaseClient = cloudEnabled ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey) : null;

const state = {
  applications: [],
  filter: "all",
  search: "",
  sort: "recent"
};

const rows = document.querySelector("#applicationRows");
const emptyState = document.querySelector("#emptyState");
const modal = document.querySelector("#applicationModal");
const form = document.querySelector("#applicationForm");
const authScreen = document.querySelector("#authScreen");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
let currentUser = null;
let editingApplicationId = null;

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function initials(company) {
  return company.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function saveApplications() {
  const storageKey = currentUser ? `applywise-applications-${currentUser.email}` : "applywise-applications";
  localStorage.setItem(storageKey, JSON.stringify(state.applications));
}

function loadLocalApplications(email) {
  const saved = localStorage.getItem(`applywise-applications-${email}`);
  state.applications = saved ? JSON.parse(saved) : starterApplications.map((application) => ({ ...application }));
  saveApplications();
}

async function loadApplications() {
  if (!cloudEnabled || !currentUser) {
    render();
    return;
  }
  const { data, error } = await supabaseClient.from("applications").select("*").order("date", { ascending: false });
  if (error) throw error;
  state.applications = (data || []).map((application) => ({ ...application, nextStep: application.next_step || "" }));
  render();
}

function resetApplicationForm() {
  editingApplicationId = null;
  form.reset();
  document.querySelector(".modal-heading h2").textContent = "Add application";
  document.querySelector(".modal-heading .eyebrow").textContent = "New opportunity";
  document.querySelector(".modal-actions .primary-button").textContent = "Save application";
}

function getVisibleApplications() {
  const searchTerm = state.search.toLowerCase().trim();
  const visible = state.applications.filter((application) => {
    const matchesFilter = state.filter === "all" || application.status === state.filter;
    const matchesSearch = !searchTerm || `${application.company} ${application.role}`.toLowerCase().includes(searchTerm);
    return matchesFilter && matchesSearch;
  });

  return visible.sort((first, second) => {
    if (state.sort === "company") return first.company.localeCompare(second.company);
    if (state.sort === "status") return first.status.localeCompare(second.status);
    return new Date(second.date) - new Date(first.date);
  });
}

function statusClass(status) {
  return status.toLowerCase();
}

function renderRows() {
  const visible = getVisibleApplications();
  rows.innerHTML = visible.map((application) => `
    <tr>
      <td><div class="role-cell"><span class="company-logo">${initials(application.company)}</span><span class="role-name"><strong>${application.role}</strong><span>${application.company}</span></span></div></td>
      <td><span class="status-pill ${statusClass(application.status)}">${application.status}</span></td>
      <td class="date-cell">${formatDate(application.date)}</td>
      <td class="next-step">${application.nextStep || "No next step added"}</td>
      <td class="actions-cell"><button class="row-menu" aria-expanded="false" aria-label="Actions for ${application.role} at ${application.company}">•••</button><div class="row-actions"><button data-edit="${application.id}">Edit</button><button data-delete="${application.id}">Delete</button></div></td>
    </tr>`).join("");
  emptyState.hidden = visible.length > 0;
  document.querySelector("#visibleCount").textContent = visible.length;
}

function renderStats() {
  const total = state.applications.length;
  const inProgress = state.applications.filter((application) => ["Applied", "Interview"].includes(application.status)).length;
  const interviews = state.applications.filter((application) => application.status === "Interview").length;
  const offers = state.applications.filter((application) => application.status === "Offer").length;
  document.querySelector("#totalCount").textContent = total;
  document.querySelector("#progressCount").textContent = inProgress;
  document.querySelector("#interviewCount").textContent = interviews;
  document.querySelector("#offerCount").textContent = offers;
  document.querySelector("#navCount").textContent = total;
  document.querySelector("#allFilterCount").textContent = total;
  document.querySelector("#progressBar").style.width = `${total ? (inProgress / total) * 100 : 0}%`;
  document.querySelector("#interviewBar").style.width = `${total ? (interviews / total) * 100 : 0}%`;
  document.querySelector("#offerBar").style.width = `${total ? (offers / total) * 100 : 0}%`;
}

function render() {
  renderStats();
  renderRows();
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".filter-button.active").classList.remove("active");
    button.classList.add("active");
    state.filter = button.dataset.filter.toLowerCase() === "all" ? "all" : button.dataset.filter;
    renderRows();
  });
});

document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderRows();
});

document.querySelector("#sortSelect").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderRows();
});

function openApplicationModal(application = null) {
  form.reset();
  editingApplicationId = application ? application.id : null;
  document.querySelector(".modal-heading h2").textContent = application ? "Edit application" : "Add application";
  document.querySelector(".modal-heading .eyebrow").textContent = application ? "Update opportunity" : "New opportunity";
  document.querySelector(".modal-actions .primary-button").textContent = application ? "Save changes" : "Save application";
  if (application) {
    form.elements.company.value = application.company;
    form.elements.role.value = application.role;
    form.elements.status.value = application.status;
    form.elements.date.value = application.date;
    form.elements.nextStep.value = application.nextStep || "";
  } else {
    form.elements.date.value = new Date().toISOString().slice(0, 10);
  }
  modal.showModal();
}

function cancelApplicationForm() {
  modal.close();
  resetApplicationForm();
}

document.querySelector("#openModal").addEventListener("click", () => openApplicationModal());
document.querySelector("#emptyAddButton").addEventListener("click", () => openApplicationModal());
document.querySelector(".close-button").addEventListener("click", cancelApplicationForm);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    cancelApplicationForm();
    return;
  }
  const data = new FormData(form);
  const updatedApplication = { company: data.get("company"), role: data.get("role"), status: data.get("status"), date: data.get("date"), nextStep: data.get("nextStep") };
  if (cloudEnabled && currentUser) {
    const cloudApplication = { company: updatedApplication.company, role: updatedApplication.role, status: updatedApplication.status, date: updatedApplication.date, next_step: updatedApplication.nextStep };
    const result = editingApplicationId
      ? await supabaseClient.from("applications").update(cloudApplication).eq("id", editingApplicationId).eq("user_id", currentUser.id).select().single()
      : await supabaseClient.from("applications").insert({ ...cloudApplication, user_id: currentUser.id }).select().single();
    if (result.error) {
      window.alert(result.error.message);
      return;
    }
    if (editingApplicationId) {
      state.applications = state.applications.map((application) => application.id === editingApplicationId ? { ...result.data, nextStep: result.data.next_step || "" } : application);
    } else {
      state.applications.push({ ...result.data, nextStep: result.data.next_step || "" });
    }
  } else {
    if (editingApplicationId) {
      state.applications = state.applications.map((application) => application.id === editingApplicationId ? { ...application, ...updatedApplication } : application);
    } else {
      state.applications.push({ id: Date.now(), ...updatedApplication });
    }
    saveApplications();
  }
  render();
  modal.close();
  resetApplicationForm();
});

rows.addEventListener("click", (event) => {
  const menuButton = event.target.closest(".row-menu");
  if (menuButton) {
    const menu = menuButton.nextElementSibling;
    document.querySelectorAll(".row-actions.open").forEach((openMenu) => {
      if (openMenu !== menu) openMenu.classList.remove("open");
    });
    menu.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", menu.classList.contains("open"));
    return;
  }
  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const application = state.applications.find((item) => item.id === Number(editButton.dataset.edit));
    if (application) openApplicationModal(application);
    return;
  }
  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;
  const applicationId = Number(deleteButton.dataset.delete);
  if (cloudEnabled && currentUser) {
    supabaseClient.from("applications").delete().eq("id", applicationId).eq("user_id", currentUser.id).then(({ error }) => {
      if (error) window.alert(error.message);
    });
  }
  state.applications = state.applications.filter((application) => application.id !== applicationId);
  if (!cloudEnabled) saveApplications();
  render();
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".actions-cell")) return;
  document.querySelectorAll(".row-actions.open").forEach((menu) => menu.classList.remove("open"));
  document.querySelectorAll(".row-menu[aria-expanded='true']").forEach((button) => button.setAttribute("aria-expanded", "false"));
});

function setupAuthentication() {
  if (!cloudEnabled) {
    authScreen.hidden = false;
    document.querySelector("#appShell").hidden = true;
    document.querySelector("#signOutButton").hidden = true;
    setupLocalAuthentication();
    return;
  }

  const authTitle = document.querySelector("#authTitle");
  const authCopy = document.querySelector("#authCopy");
  const authSubmit = document.querySelector("#authSubmit");
  const authSwitch = document.querySelector("#authSwitch");
  let mode = "signin";

  authSwitch.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    authTitle.textContent = mode === "signin" ? "Welcome back." : "Create your account.";
    authCopy.textContent = mode === "signin" ? "Sign in to keep your applications synced across your devices." : "Create an account to access your applications anywhere.";
    authSubmit.textContent = mode === "signin" ? "Sign in" : "Sign up";
    authSwitch.textContent = mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in";
    authMessage.textContent = "";
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const credentials = new FormData(authForm);
    const method = mode === "signin" ? supabaseClient.auth.signInWithPassword.bind(supabaseClient.auth) : supabaseClient.auth.signUp.bind(supabaseClient.auth);
    const { error } = await method({ email: credentials.get("email"), password: credentials.get("password") });
    authMessage.textContent = error ? error.message : mode === "signup" ? "Check your email to confirm your account." : "";
  });

  document.querySelector("#signOutButton").addEventListener("click", () => supabaseClient.auth.signOut());
  document.querySelector("#signOutButton").hidden = false;
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    authScreen.hidden = Boolean(currentUser);
    document.querySelector("#appShell").hidden = !currentUser;
    if (currentUser) {
      try { await loadApplications(); } catch (error) { window.alert(error.message); }
    }
  });
  supabaseClient.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user || null;
    authScreen.hidden = Boolean(currentUser);
    document.querySelector("#appShell").hidden = !currentUser;
    if (currentUser) loadApplications().catch((error) => window.alert(error.message));
  });
}

function setupLocalAuthentication() {
  const authTitle = document.querySelector("#authTitle");
  const authCopy = document.querySelector("#authCopy");
  const authSubmit = document.querySelector("#authSubmit");
  const authSwitch = document.querySelector("#authSwitch");
  const appShell = document.querySelector("#appShell");
  const users = JSON.parse(localStorage.getItem("applywise-users") || "{}");
  let mode = "signin";

  function setMode(nextMode) {
    mode = nextMode;
    authTitle.textContent = mode === "signin" ? "Welcome back." : "Create your account.";
    authCopy.textContent = mode === "signin" ? "Sign in to keep your applications available on this device." : "Create a local account to start tracking applications.";
    authSubmit.textContent = mode === "signin" ? "Sign in" : "Sign up";
    authSwitch.textContent = mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in";
    authMessage.textContent = "";
  }

  authSwitch.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const credentials = new FormData(authForm);
    const email = credentials.get("email").toLowerCase().trim();
    const password = credentials.get("password");
    if (password.length < 6) {
      authMessage.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (mode === "signup" && users[email]) {
      authMessage.textContent = "An account with this email already exists.";
      return;
    }
    if (mode === "signin" && (!users[email] || users[email] !== password)) {
      authMessage.textContent = "Email or password is incorrect.";
      return;
    }
    if (mode === "signup") {
      users[email] = password;
      localStorage.setItem("applywise-users", JSON.stringify(users));
    }
    currentUser = { email };
    loadLocalApplications(email);
    authForm.reset();
    authScreen.hidden = true;
    appShell.hidden = false;
    document.querySelector("#signOutButton").hidden = false;
    render();
  });

  document.querySelector("#signOutButton").addEventListener("click", () => {
    currentUser = null;
    state.applications = [];
    authScreen.hidden = false;
    appShell.hidden = true;
    document.querySelector("#signOutButton").hidden = true;
    setMode("signin");
  });
  setMode("signin");
}

setupAuthentication();
