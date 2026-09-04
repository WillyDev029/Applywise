'use strict';

const starterApplications = [
  { id: 1, company: "Northstar Labs", role: "Product Designer", status: "Interview", date: "2026-08-29", nextStep: "Portfolio review · Sep 06", salary: "", jobUrl: "", interviewDate: "", notes: "" },
  { id: 2, company: "Lumen & Co.", role: "Senior UX Designer", status: "Applied", date: "2026-08-26", nextStep: "Follow up next week", salary: "", jobUrl: "", interviewDate: "", notes: "" },
  { id: 3, company: "Fieldwork", role: "Design Lead", status: "Offer", date: "2026-08-21", nextStep: "Review offer · Sep 05", salary: "", jobUrl: "", interviewDate: "", notes: "" },
  { id: 4, company: "Marble Studio", role: "Product Designer", status: "Applied", date: "2026-08-18", nextStep: "Awaiting response", salary: "", jobUrl: "", interviewDate: "", notes: "" },
  { id: 5, company: "Tandem Health", role: "UX Researcher", status: "Rejected", date: "2026-08-12", nextStep: "Keep the search going", salary: "", jobUrl: "", interviewDate: "", notes: "" }
];

const cloudConfig = window.APPLYWISE_SUPABASE || {};
const cloudEnabled = Boolean(window.supabase && cloudConfig.url && cloudConfig.anonKey && !cloudConfig.url.startsWith("YOUR_"));
const supabaseClient = cloudEnabled ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey) : null;

const state = {
  applications: [],
  filter: "all",
  search: "",
  sort: "recent",
  view: "list"
};

const rows = document.querySelector("#applicationRows");
const grid = document.querySelector("#applicationGrid");
const emptyState = document.querySelector("#emptyState");
const modal = document.querySelector("#applicationModal");
const form = document.querySelector("#applicationForm");
const authScreen = document.querySelector("#authScreen");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const forgotPassword = document.querySelector("#forgotPassword");
const profileModal = document.querySelector("#profileModal");
const profileForm = document.querySelector("#profileForm");
const changePasswordButton = document.querySelector("#changePasswordButton");
const profilePasswordMessage = document.querySelector("#profilePasswordMessage");
let currentUser = null;
let editingApplicationId = null;

/* ---------------------------------------------------------
   Small utilities
--------------------------------------------------------- */
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "\x26") return "\x26amp;";
    if (ch === "\x3C") return "\x26lt;";
    if (ch === "\x3E") return "\x26gt;";
    if (ch === "\x22") return "\x26quot;";
    return "\x26#39;";
  });
}

function getUserName(user) {
  return user?.fullName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Job seeker";
}

function getInitials(name) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function refreshTodayHeading() {
  const heading = document.querySelector("#todayHeading");
  if (!heading) return;
  const text = new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    .format(new Date());
  heading.textContent = text.charAt(0).toUpperCase() + text.slice(1);
}

function updateProfile(user) {
  const name = getUserName(user);
  const title = user?.jobTitle || user?.user_metadata?.job_title || "Job seeker";
  document.querySelector("#profileName").textContent = name;
  document.querySelector("#profileRole").textContent = title;
  document.querySelector(".profile-chip .avatar").textContent = getInitials(name);
  document.querySelector("#profileAvatar").textContent = getInitials(name);
}

/* ---------------------------------------------------------
   Password security (local mode)
   Passwords are never stored in plaintext: each account gets
   a random 16-byte salt and the password is hashed with
   SHA-256 via the Web Crypto API. Legacy plaintext records
   are transparently upgraded on the next successful sign-in.
--------------------------------------------------------- */
const MIN_PASSWORD_LENGTH = 8;

function passwordProblem(password) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain both letters and numbers.";
  }
  return null;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, saltHex) {
  const data = new TextEncoder().encode(`${saltHex}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function makePasswordRecord(password) {
  const salt = randomSalt();
  return { salt, hash: await hashPassword(password, salt) };
}

async function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const candidate = await hashPassword(password, record.salt);
  if (candidate.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}

/* ---------------------------------------------------------
   Local (per-account) storage helpers
   Always read fresh from localStorage so mutations made by
   other call sites (profile, password, reset) are respected.
--------------------------------------------------------- */
function loadLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem("applywise-users") || "{}");
  } catch {
    return {};
  }
}

function saveLocalUsers(users) {
  localStorage.setItem("applywise-users", JSON.stringify(users));
}

function normalizeStoredUser(storedUser, email) {
  if (typeof storedUser === "string") {
    // Legacy plaintext record: kept compatible until next sign-in migrates it.
    return { legacyPassword: storedUser, fullName: email.split("@")[0] };
  }
  return storedUser || {};
}

function getLocalUser(email) {
  const users = loadLocalUsers();
  return normalizeStoredUser(users[email], email);
}

function setLocalUser(email, fields) {
  const users = loadLocalUsers();
  users[email] = { ...normalizeStoredUser(users[email], email), ...fields };
  saveLocalUsers(users);
}

/* ---------------------------------------------------------
   Application CRUD + localStorage
--------------------------------------------------------- */
function saveApplications() {
  const storageKey = currentUser ? `applywise-applications-${currentUser.email}` : "applywise-applications";
  localStorage.setItem(storageKey, JSON.stringify(state.applications));
}

function loadLocalApplications(email, isNewAccount = false) {
  const saved = localStorage.getItem(`applywise-applications-${email}`);
  state.applications = saved ? JSON.parse(saved) : isNewAccount ? [] : starterApplications.map((application) => ({ ...application }));
  saveApplications();
}

function cloudToLocal(application) {
  return {
    id: application.id,
    company: application.company,
    role: application.role,
    status: application.status,
    date: application.date,
    nextStep: application.next_step || "",
    salary: application.salary || "",
    jobUrl: application.job_url || "",
    interviewDate: application.interview_date || "",
    notes: application.notes || ""
  };
}

function localToCloud(application) {
  return {
    company: application.company,
    role: application.role,
    status: application.status,
    date: application.date,
    next_step: application.nextStep || "",
    salary: application.salary || "",
    job_url: application.jobUrl || "",
    interview_date: application.interviewDate || null,
    notes: application.notes || ""
  };
}

async function loadApplications() {
  if (!cloudEnabled || !currentUser) {
    render();
    return;
  }
  const { data, error } = await supabaseClient.from("applications").select("*").order("date", { ascending: false });
  if (error) throw error;
  state.applications = (data || []).map(cloudToLocal);
  render();
}

/* ---------------------------------------------------------
   Date / formatting helpers
--------------------------------------------------------- */
function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function initials(company) {
  return company.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function getVisibleApplications() {
  const searchTerm = state.search.toLowerCase().trim();
  const visible = state.applications.filter((application) => {
    const matchesFilter = state.filter === "all" || application.status === state.filter;
    const haystack = `${application.company} ${application.role} ${application.notes || ""}`.toLowerCase();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    return matchesFilter && matchesSearch;
  });

  return visible.sort((first, second) => {
    if (state.sort === "company") return first.company.localeCompare(second.company);
    if (state.sort === "status") return first.status.localeCompare(second.status);
    return new Date(second.date) - new Date(first.date);
  });
}

function statusClass(status) {
  return String(status).toLowerCase();
}

function rowActionsMarkup(application) {
  const id = escapeHTML(application.id);
  return `
    <button class="row-menu" aria-expanded="false" aria-label="Actions for ${escapeHTML(application.role)} at ${escapeHTML(application.company)}">•••</button>
    <div class="row-actions">
      <button data-edit="${id}">Edit</button>
      <button data-delete="${id}">Delete</button>
    </div>`;
}

function renderRows() {
  const visible = getVisibleApplications();
  const visibleCount = document.querySelector("#visibleCount");

  if (rows) {
    rows.innerHTML = visible.map((application) => {
      const extras = [];
      if (application.salary) extras.push(`<span class="extra-chip" title="Salary">${escapeHTML(application.salary)}</span>`);
      if (application.interviewDate) extras.push(`<span class="extra-chip warm" title="Interview date">Interview · ${escapeHTML(formatDate(application.interviewDate))}</span>`);
      const url = application.jobUrl
        ? ` <a class="job-link" href="${escapeHTML(application.jobUrl)}" target="_blank" rel="noreferrer" aria-label="Open job posting for ${escapeHTML(application.role)}">↗</a>`
        : "";
      return `
      <tr>
        <td><div class="role-cell"><span class="company-logo">${escapeHTML(initials(application.company))}</span><span class="role-name"><strong>${escapeHTML(application.role)}${url}</strong><span>${escapeHTML(application.company)}</span></span></div></td>
        <td><span class="status-pill ${escapeHTML(statusClass(application.status))}">${escapeHTML(application.status)}</span></td>
        <td class="date-cell">${escapeHTML(formatDate(application.date))}</td>
        <td class="next-step">${escapeHTML(application.nextStep) || "No next step added"}${extras.length ? `<div class="extra-row">${extras.join("")}</div>` : ""}</td>
        <td class="actions-cell">${rowActionsMarkup(application)}</td>
      </tr>`;
    }).join("");
  }

  if (grid) {
    grid.innerHTML = visible.map((application) => {
      const url = application.jobUrl
        ? ` <a class="job-link" href="${escapeHTML(application.jobUrl)}" target="_blank" rel="noreferrer" aria-label="Open job posting">↗</a>`
        : "";
      return `
      <article class="app-card">
        <div class="app-card-head">
          <span class="company-logo">${escapeHTML(initials(application.company))}</span>
          <span class="role-name"><strong>${escapeHTML(application.role)}${url}</strong><span>${escapeHTML(application.company)}</span></span>
        </div>
        <div>
          <span class="status-pill ${escapeHTML(statusClass(application.status))}">${escapeHTML(application.status)}</span>
        </div>
        <div class="app-card-meta">
          <div><span>Date applied</span><span>${escapeHTML(formatDate(application.date))}</span></div>
          ${application.salary ? `<div><span>Salary</span><span>${escapeHTML(application.salary)}</span></div>` : ""}
          ${application.interviewDate ? `<div><span>Interview</span><span>${escapeHTML(formatDate(application.interviewDate))}</span></div>` : ""}
          <div><span>Next step</span><span class="next-step">${escapeHTML(application.nextStep) || "No next step added"}</span></div>
        </div>
        ${application.notes ? `<p class="app-card-notes">${escapeHTML(application.notes)}</p>` : ""}
        <div class="actions-cell">${rowActionsMarkup(application)}</div>
      </article>`;
    }).join("");
  }

  emptyState.hidden = visible.length > 0;
  visibleCount.textContent = visible.length;
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

/* ---------------------------------------------------------
   List / grid view toggle
--------------------------------------------------------- */
function setView(view) {
  state.view = view === "grid" ? "grid" : "list";
  const listButton = document.querySelector("#listViewButton");
  const gridButton = document.querySelector("#gridViewButton");
  if (listButton) listButton.classList.toggle("active", state.view === "list");
  if (gridButton) gridButton.classList.toggle("active", state.view === "grid");
  if (listButton) listButton.setAttribute("aria-pressed", state.view === "list");
  if (gridButton) gridButton.setAttribute("aria-pressed", state.view === "grid");
  if (rows) rows.closest("table")?.setAttribute("hidden", state.view !== "list");
  if (grid) grid.hidden = state.view !== "grid";
  renderRows();
}

function wireViewToggle() {
  const listButton = document.querySelector("#listViewButton");
  const gridButton = document.querySelector("#gridViewButton");
  listButton?.addEventListener("click", () => setView("list"));
  gridButton?.addEventListener("click", () => setView("grid"));
}

/* ---------------------------------------------------------
   Filtering / searching / sorting
--------------------------------------------------------- */
document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    const active = document.querySelector(".filter-button.active");
    if (active) active.classList.remove("active");
    button.classList.add("active");
    state.filter = button.dataset.filter.toLowerCase() === "all" ? "all" : button.dataset.filter;
    renderRows();
  });
});

document.querySelector("#searchInput")?.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderRows();
});

document.querySelector("#sortSelect")?.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderRows();
});

/* ---------------------------------------------------------
   Export / import
--------------------------------------------------------- */
function exportApplications() {
  const payload = {
    app: "applywise",
    version: 1,
    exportedAt: new Date().toISOString(),
    applications: state.applications
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `applywise-applications-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeImportedApplication(raw) {
  if (!raw || typeof raw !== "object") return null;
  const company = String(raw.company || "").trim();
  const role = String(raw.role || "").trim();
  const date = String(raw.date || "").trim();
  if (!company || !role || !date) return null;
  const status = ["Applied", "Interview", "Offer", "Rejected"].includes(raw.status) ? raw.status : "Applied";
  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    company,
    role,
    status,
    date,
    nextStep: String(raw.nextStep || raw.next_step || "").trim(),
    salary: String(raw.salary || "").trim(),
    jobUrl: String(raw.jobUrl || raw.job_url || "").trim(),
    interviewDate: String(raw.interviewDate || raw.interview_date || "").trim(),
    notes: String(raw.notes || "").trim()
  };
}

function importApplications(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.applications) ? parsed.applications : null;
      if (!list) throw new Error("File does not contain an applications list.");
      const imported = list.map(normalizeImportedApplication).filter(Boolean);
      if (!imported.length) throw new Error("No valid applications were found in the file.");

      if (cloudEnabled && currentUser) {
        const cloudRows = imported.map((application) => ({ ...localToCloud(application), user_id: currentUser.id }));
        const { error } = await supabaseClient.from("applications").insert(cloudRows);
        if (error) throw new Error(error.message);
        await loadApplications();
      } else {
        state.applications = state.applications.concat(imported);
        saveApplications();
        render();
      }
      window.alert(`Imported ${imported.length} application${imported.length === 1 ? "" : "s"}.`);
    } catch (error) {
      window.alert(`Import failed: ${error.message}`);
    }
  };
  reader.onerror = () => window.alert("Import failed: the file could not be read.");
  reader.readAsText(file);
}

document.querySelector("#exportButton")?.addEventListener("click", exportApplications);
document.querySelector("#importButton")?.addEventListener("click", () => document.querySelector("#importFile").click());
document.querySelector("#importFile")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importApplications(file);
  event.target.value = "";
});

/* ---------------------------------------------------------
   Application modal (add / edit / cancel)
--------------------------------------------------------- */
function resetApplicationForm() {
  editingApplicationId = null;
  form.reset();
  document.querySelector(".modal-heading h2").textContent = "Add application";
  document.querySelector(".modal-heading .eyebrow").textContent = "New opportunity";
  document.querySelector(".modal-actions .primary-button").textContent = "Save application";
}

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
    form.elements.salary.value = application.salary || "";
    form.elements.jobUrl.value = application.jobUrl || "";
    form.elements.interviewDate.value = application.interviewDate || "";
    form.elements.nextStep.value = application.nextStep || "";
    form.elements.notes.value = application.notes || "";
  } else {
    form.elements.date.value = new Date().toISOString().slice(0, 10);
  }
  modal.showModal();
}

function cancelApplicationForm() {
  modal.close();
  resetApplicationForm();
}

function closeApplicationModal() {
  modal.close();
  resetApplicationForm();
}

document.querySelector("#openModal").addEventListener("click", () => openApplicationModal());
document.querySelector("#emptyAddButton").addEventListener("click", () => openApplicationModal());
document.querySelector(".close-button")?.addEventListener("click", cancelApplicationForm);
document.querySelector("#cancelApplication")?.addEventListener("click", cancelApplicationForm);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const updatedApplication = {
    company: data.get("company"),
    role: data.get("role"),
    status: data.get("status"),
    date: data.get("date"),
    salary: (data.get("salary") || "").trim(),
    jobUrl: (data.get("jobUrl") || "").trim(),
    interviewDate: data.get("interviewDate") || "",
    nextStep: (data.get("nextStep") || "").trim(),
    notes: (data.get("notes") || "").trim()
  };

  if (cloudEnabled && currentUser) {
    const cloudApplication = localToCloud(updatedApplication);
    const result = editingApplicationId
      ? await supabaseClient.from("applications").update(cloudApplication).eq("id", editingApplicationId).eq("user_id", currentUser.id).select().single()
      : await supabaseClient.from("applications").insert({ ...cloudApplication, user_id: currentUser.id }).select().single();
    if (result.error) {
      window.alert(result.error.message);
      return;
    }
    if (editingApplicationId) {
      state.applications = state.applications.map((application) => application.id === editingApplicationId ? cloudToLocal(result.data) : application);
    } else {
      state.applications.push(cloudToLocal(result.data));
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
  closeApplicationModal();
});

/* ---------------------------------------------------------
   Row/card action menus (edit / delete)
--------------------------------------------------------- */
document.addEventListener("click", (event) => {
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

/* Clicking anywhere outside closes every open action menu. */
document.addEventListener("click", (event) => {
  if (event.target.closest(".row-menu") || event.target.closest(".row-actions")) return;
  document.querySelectorAll(".row-actions.open").forEach((menu) => menu.classList.remove("open"));
  document.querySelectorAll(".row-menu[aria-expanded='true']").forEach((button) => button.setAttribute("aria-expanded", "false"));
});

/* ---------------------------------------------------------
   Profile
--------------------------------------------------------- */
function openProfileEditor() {
  const profile = currentUser || {};
  profileForm.elements.fullName.value = getUserName(profile);
  profileForm.elements.jobTitle.value = profile.jobTitle || profile.user_metadata?.job_title || "";
  profileForm.elements.location.value = profile.location || profile.user_metadata?.location || "";
  profileForm.elements.bio.value = profile.bio || profile.user_metadata?.bio || "";
  profilePasswordMessage.textContent = "";
  document.querySelector("#currentPassword").value = "";
  document.querySelector("#newPassword").value = "";
  profileModal.showModal();
}

async function saveProfile(event) {
  event.preventDefault();
  const data = new FormData(profileForm);
  const profile = {
    fullName: data.get("fullName").trim(),
    jobTitle: data.get("jobTitle").trim(),
    location: data.get("location").trim(),
    bio: data.get("bio").trim()
  };

  if (cloudEnabled && currentUser) {
    const { data: updatedUser, error } = await supabaseClient.auth.updateUser({
      data: { full_name: profile.fullName, job_title: profile.jobTitle, location: profile.location, bio: profile.bio }
    });
    if (error) {
      window.alert(error.message);
      return;
    }
    currentUser = updatedUser.user;
  } else if (currentUser) {
    setLocalUser(currentUser.email, profile);
    currentUser = { ...getLocalUser(currentUser.email), email: currentUser.email };
  }
  updateProfile(currentUser);
  profileModal.close();
}

async function changePassword() {
  const currentPassword = document.querySelector("#currentPassword").value;
  const newPassword = document.querySelector("#newPassword").value;

  if (!newPassword) {
    profilePasswordMessage.textContent = "Enter a new password.";
    return;
  }
  const problem = passwordProblem(newPassword);
  if (problem) {
    profilePasswordMessage.textContent = problem;
    return;
  }
  if (!currentPassword) {
    profilePasswordMessage.textContent = "Enter your current password.";
    return;
  }

  if (cloudEnabled && currentUser) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      profilePasswordMessage.textContent = error.message;
      return;
    }
  } else if (currentUser) {
    const storedUser = getLocalUser(currentUser.email);
    const matches = storedUser.hash
      ? await verifyPassword(currentPassword, storedUser)
      : storedUser.legacyPassword === currentPassword;
    if (!matches) {
      profilePasswordMessage.textContent = "Current password is incorrect.";
      return;
    }
    setLocalUser(currentUser.email, await makePasswordRecord(newPassword));
  }

  document.querySelector("#currentPassword").value = "";
  document.querySelector("#newPassword").value = "";
  profilePasswordMessage.textContent = "Password updated successfully.";
}

document.querySelector("#profileAvatar").addEventListener("click", openProfileEditor);
document.querySelector(".profile-close")?.addEventListener("click", () => profileModal.close());
document.querySelector(".profile-cancel")?.addEventListener("click", () => profileModal.close());
profileForm?.addEventListener("submit", saveProfile);
changePasswordButton?.addEventListener("click", changePassword);

/* ---------------------------------------------------------
   Authentication
--------------------------------------------------------- */
function showApp(user, isRecovery = false) {
  currentUser = user || null;
  updateProfile(currentUser);
  authScreen.hidden = Boolean(currentUser) && !isRecovery;
  document.querySelector("#appShell").hidden = !currentUser || isRecovery;
  document.querySelector("#signOutButton").hidden = !currentUser || isRecovery;
}

function setupAuthentication() {
  refreshTodayHeading();
  wireViewToggle();

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
  const fullNameField = document.querySelector("#fullNameField");
  const passwordField = document.querySelector("#passwordField");
  let mode = "signin";

  function setMode(nextMode, { clearMessage = true } = {}) {
    mode = nextMode;
    fullNameField.hidden = mode !== "signup";
    fullNameField.querySelector("input").required = mode === "signup";
    passwordField.hidden = mode === "reset";
    passwordField.querySelector("input").required = mode !== "reset";
    authTitle.textContent = mode === "signup" ? "Create your account."
      : mode === "reset" ? "Reset your password."
      : mode === "reset-confirm" ? "Choose a new password." : "Welcome back.";
    authCopy.textContent = mode === "signup" ? "Create an account to access your applications anywhere."
      : mode === "reset" ? "Enter your email and we will send you a password reset link."
      : mode === "reset-confirm" ? "Choose a new password for your account."
      : "Sign in to keep your applications synced across your devices.";
    authSubmit.textContent = mode === "signup" ? "Sign up"
      : mode === "reset" ? "Send reset link"
      : mode === "reset-confirm" ? "Save new password" : "Sign in";
    authSwitch.textContent = mode === "signin" ? "Need an account? Sign up" : "Back to sign in";
    forgotPassword.hidden = mode !== "signin";
    if (clearMessage) authMessage.textContent = "";
  }

  authSwitch.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));
  forgotPassword.addEventListener("click", () => setMode("reset"));

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const credentials = new FormData(authForm);

    if (mode === "reset-confirm") {
      const problem = passwordProblem(credentials.get("password"));
      if (problem) {
        authMessage.textContent = problem;
        return;
      }
      const { error } = await supabaseClient.auth.updateUser({ password: credentials.get("password") });
      if (error) {
        authMessage.textContent = error.message;
        return;
      }
      await supabaseClient.auth.signOut();
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setMode("signin");
      authMessage.textContent = "Password updated. You can now sign in.";
      return;
    }

    if (mode === "reset") {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.hash = "";
      const { error } = await supabaseClient.auth.resetPasswordForEmail(credentials.get("email"), {
        redirectTo: redirectUrl.href
      });
      authMessage.textContent = error ? error.message : "Check your email for a password reset link.";
      return;
    }

    if (mode === "signup") {
      const problem = passwordProblem(credentials.get("password"));
      if (problem) {
        authMessage.textContent = problem;
        return;
      }
    }

    const method = mode === "signin"
      ? supabaseClient.auth.signInWithPassword.bind(supabaseClient.auth)
      : supabaseClient.auth.signUp.bind(supabaseClient.auth);
    const authDetails = { email: credentials.get("email"), password: credentials.get("password") };
    if (mode === "signup") authDetails.options = { data: { full_name: credentials.get("fullName") } };
    const { error } = await method(authDetails);
    authMessage.textContent = error ? error.message : mode === "signup" ? "Check your email to confirm your account." : "";
  });

  setMode("signin");

  document.querySelector("#signOutButton").addEventListener("click", async () => {
    currentUser = null;
    state.applications = [];
    await supabaseClient.auth.signOut();
    render();
  });

  const isRecoveryUrl = () => window.location.hash.includes("type=recovery");

  if (isRecoveryUrl()) setMode("reset-confirm");

  supabaseClient.auth.getSession().then(({ data }) => {
    const sessionUser = data.session?.user || null;
    const recovery = sessionUser && isRecoveryUrl();
    if (recovery) {
      setMode("reset-confirm");
      showApp(null, true);
    } else {
      showApp(sessionUser, false);
      if (sessionUser) loadApplications().catch((error) => window.alert(error.message));
    }
  });

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    const sessionUser = session?.user || null;
    const recovery = event === "PASSWORD_RECOVERY" || (sessionUser && isRecoveryUrl());
    if (event === "SIGNED_OUT") {
      authMessage.textContent = "";
      setMode("signin");
      showApp(null, false);
      render();
      return;
    }
    if (recovery) {
      currentUser = null;
      authScreen.hidden = false;
      document.querySelector("#appShell").hidden = true;
      document.querySelector("#signOutButton").hidden = true;
      setMode("reset-confirm");
      return;
    }
    if (sessionUser) {
      showApp(sessionUser, false);
      try { await loadApplications(); } catch (error) { window.alert(error.message); }
    }
  });
}

function setupLocalAuthentication() {
  const authTitle = document.querySelector("#authTitle");
  const authCopy = document.querySelector("#authCopy");
  const authSubmit = document.querySelector("#authSubmit");
  const authSwitch = document.querySelector("#authSwitch");
  const fullNameField = document.querySelector("#fullNameField");
  const passwordField = document.querySelector("#passwordField");
  const appShell = document.querySelector("#appShell");
  let mode = "signin";

  function setMode(nextMode, { clearMessage = true } = {}) {
    mode = nextMode;
    fullNameField.hidden = mode !== "signup";
    fullNameField.querySelector("input").required = mode === "signup";
    passwordField.hidden = mode === "reset";
    passwordField.querySelector("input").required = mode !== "reset";
    authTitle.textContent = mode === "signin" ? "Welcome back."
      : mode === "reset" ? "Reset your password."
      : mode === "reset-confirm" ? "Choose a new password." : "Create your account.";
    authCopy.textContent = mode === "signin" ? "Sign in to keep your applications available on this device."
      : mode === "reset" ? "Enter your email to reset your local password."
      : mode === "reset-confirm" ? "Choose a new password for this local account."
      : "Create a local account to start tracking applications.";
    authSubmit.textContent = mode === "signin" ? "Sign in"
      : mode === "reset" ? "Find account"
      : mode === "reset-confirm" ? "Save new password" : "Sign up";
    authSwitch.textContent = mode === "signin" ? "Need an account? Sign up" : "Back to sign in";
    forgotPassword.hidden = mode !== "signin";
    if (clearMessage) authMessage.textContent = "";
  }

  authSwitch.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));
  forgotPassword.addEventListener("click", () => setMode("reset"));

  function enterApp(user, isNewAccount) {
    currentUser = user;
    updateProfile(currentUser);
    loadLocalApplications(user.email, isNewAccount);
    authForm.reset();
    authScreen.hidden = true;
    appShell.hidden = false;
    document.querySelector("#signOutButton").hidden = false;
    render();
  }

  function exitToAuth(message) {
    currentUser = null;
    state.applications = [];
    setMode("signin");
    authMessage.textContent = message || "";
    authScreen.hidden = false;
    appShell.hidden = true;
    document.querySelector("#signOutButton").hidden = true;
    authForm.reset();
    render();
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const credentials = new FormData(authForm);
    const fullName = (credentials.get("fullName") || "").trim();
    const email = String(credentials.get("email") || "").toLowerCase().trim();
    const password = credentials.get("password") || "";

    const users = loadLocalUsers();
    const storedUser = normalizeStoredUser(users[email], email);

    if (mode === "reset") {
      if (!storedUser.hash && !storedUser.legacyPassword) {
        authMessage.textContent = "No local account was found for this email.";
        return;
      }
      setMode("reset-confirm");
      authMessage.textContent = "Enter your new password to reset this local account.";
      return;
    }

    if (mode === "reset-confirm") {
      const problem = passwordProblem(password);
      if (problem) {
        authMessage.textContent = problem;
        return;
      }
      users[email] = { ...storedUser, ...(await makePasswordRecord(password)) };
      delete users[email].legacyPassword;
      delete users[email].password;
      saveLocalUsers(users);
      setMode("signin");
      authMessage.textContent = "Password updated. You can now sign in.";
      authForm.reset();
      return;
    }

    const problem = passwordProblem(password);
    if (problem) {
      authMessage.textContent = problem;
      return;
    }

    if (mode === "signup" && users[email]) {
      authMessage.textContent = "An account with this email already exists.";
      return;
    }

    if (mode === "signin") {
      const hasHash = Boolean(storedUser.hash);
      const hasLegacy = Boolean(storedUser.legacyPassword);
      const matches = hasHash
        ? await verifyPassword(password, storedUser)
        : hasLegacy && storedUser.legacyPassword === password;
      if (!matches) {
        authMessage.textContent = "Email or password is incorrect.";
        return;
      }
      // Upgrade legacy plaintext records to salted hashes transparently.
      if (!hasHash) {
        users[email] = { ...storedUser, ...(await makePasswordRecord(password)) };
        delete users[email].legacyPassword;
        delete users[email].password;
        saveLocalUsers(users);
      }
    }

    if (mode === "signup") {
      users[email] = { fullName, ...(await makePasswordRecord(password)) };
      saveLocalUsers(users);
    }

    const userRecord = mode === "signup"
      ? { email, fullName, jobTitle: "", location: "", bio: "" }
      : { email, ...getLocalUser(email) };

    enterApp(userRecord, mode === "signup");
  });

  document.querySelector("#signOutButton").addEventListener("click", () => exitToAuth());
  setMode("signin");
}

setupAuthentication();