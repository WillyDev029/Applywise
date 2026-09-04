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
const forgotPassword = document.querySelector("#forgotPassword");
const profileModal = document.querySelector("#profileModal");
const profileForm = document.querySelector("#profileForm");
const changePasswordButton = document.querySelector("#changePasswordButton");
const profilePasswordMessage = document.querySelector("#profilePasswordMessage");
let currentUser = null;
let editingApplicationId = null;

function getUserName(user) {
  return user?.fullName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Job seeker";
}

function getInitials(name) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function updateProfile(user) {
  const name = getUserName(user);
  const title = user?.jobTitle || user?.user_metadata?.job_title || "Job seeker";
  document.querySelector("#profileName").textContent = name;
  document.querySelector("#profileRole").textContent = title;
  document.querySelector(".profile-chip .avatar").textContent = getInitials(name);
  document.querySelector("#profileAvatar").textContent = getInitials(name);
}

function openProfileEditor() {
  const profile = currentUser || {};
  profileForm.elements.fullName.value = getUserName(profile);
  profileForm.elements.jobTitle.value = profile.jobTitle || profile.user_metadata?.job_title || "";
  profileForm.elements.location.value = profile.location || profile.user_metadata?.location || "";
  profileForm.elements.bio.value = profile.bio || profile.user_metadata?.bio || "";
  profileModal.showModal();
}

async function saveProfile(event) {
  event.preventDefault();
  const data = new FormData(profileForm);
  const profile = { fullName: data.get("fullName").trim(), jobTitle: data.get("jobTitle").trim(), location: data.get("location").trim(), bio: data.get("bio").trim() };
  if (cloudEnabled && currentUser) {
    const { data: updatedUser, error } = await supabaseClient.auth.updateUser({ data: { full_name: profile.fullName, job_title: profile.jobTitle, location: profile.location, bio: profile.bio } });
    if (error) {
      window.alert(error.message);
      return;
    }
    currentUser = updatedUser.user;
  } else if (currentUser) {
    const users = JSON.parse(localStorage.getItem("applywise-users") || "{}");
    const storedUser = typeof users[currentUser.email] === "string" ? { password: users[currentUser.email] } : users[currentUser.email] || {};
    users[currentUser.email] = { ...storedUser, ...profile };
    localStorage.setItem("applywise-users", JSON.stringify(users));
    currentUser = { ...currentUser, ...profile };
  }
  updateProfile(currentUser);
  profileModal.close();
}

async function changePassword() {
  const currentPassword = document.querySelector("#currentPassword").value;
  const newPassword = document.querySelector("#newPassword").value;
  if (newPassword.length < 6) {
    profilePasswordMessage.textContent = "New password must be at least 6 characters.";
    return;
  }
  if (cloudEnabled && currentUser) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      profilePasswordMessage.textContent = error.message;
      return;
    }
  } else if (currentUser) {
    const users = JSON.parse(localStorage.getItem("applywise-users") || "{}");
    const storedUser = typeof users[currentUser.email] === "string" ? { password: users[currentUser.email] } : users[currentUser.email];
    if (!storedUser || storedUser.password !== currentPassword) {
      profilePasswordMessage.textContent = "Current password is incorrect.";
      return;
    }
    users[currentUser.email] = { ...storedUser, password: newPassword };
    localStorage.setItem("applywise-users", JSON.stringify(users));
  }
  document.querySelector("#currentPassword").value = "";
  document.querySelector("#newPassword").value = "";
  profilePasswordMessage.textContent = "Password updated successfully.";
}

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

function loadLocalApplications(email, isNewAccount = false) {
  const saved = localStorage.getItem(`applywise-applications-${email}`);
  state.applications = saved ? JSON.parse(saved) : isNewAccount ? [] : starterApplications.map((application) => ({ ...application }));
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

document.querySelector("#profileAvatar").addEventListener("click", openProfileEditor);
document.querySelector(".profile-close").addEventListener("click", () => profileModal.close());
document.querySelector(".profile-cancel").addEventListener("click", () => profileModal.close());
profileForm.addEventListener("submit", saveProfile);
changePasswordButton.addEventListener("click", changePassword);

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
  const passwordField = document.querySelector("#passwordField");
  let mode = "signin";

  function setCloudMode(nextMode) {
    mode = nextMode;
    document.querySelector("#fullNameField").hidden = mode !== "signup";
    document.querySelector("#fullNameField input").required = mode === "signup";
    passwordField.hidden = mode === "reset";
    passwordField.querySelector("input").required = mode !== "reset";
    authTitle.textContent = mode === "signup" ? "Create your account." : mode === "reset" ? "Reset your password." : mode === "reset-confirm" ? "Choose a new password." : "Welcome back.";
    authCopy.textContent = mode === "signup" ? "Create an account to access your applications anywhere." : mode === "reset" ? "Enter your email and we will send you a password reset link." : mode === "reset-confirm" ? "Choose a new password for your account." : "Sign in to keep your applications synced across your devices.";
    authSubmit.textContent = mode === "signup" ? "Sign up" : mode === "reset" ? "Send reset link" : mode === "reset-confirm" ? "Save new password" : "Sign in";
    authSwitch.textContent = mode === "signin" ? "Need an account? Sign up" : "Back to sign in";
    forgotPassword.hidden = mode !== "signin";
    authMessage.textContent = "";
  }

  authSwitch.addEventListener("click", () => setCloudMode(mode === "signin" ? "signup" : "signin"));
  forgotPassword.addEventListener("click", () => setCloudMode("reset"));

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const credentials = new FormData(authForm);
    if (mode === "reset-confirm") {
      if (credentials.get("password").length < 6) {
        authMessage.textContent = "Password must be at least 6 characters.";
        return;
      }
      const { error } = await supabaseClient.auth.updateUser({ password: credentials.get("password") });
      if (error) {
        authMessage.textContent = error.message;
        return;
      }
      await supabaseClient.auth.signOut();
      setCloudMode("signin");
      authMessage.textContent = "Password updated. You can now sign in.";
      return;
    }
    if (mode === "reset") {
      const redirectTo = window.location.href.split("#")[0];
      const { error } = await supabaseClient.auth.resetPasswordForEmail(credentials.get("email"), { redirectTo });
      authMessage.textContent = error ? error.message : "Check your email for a password reset link.";
      return;
    }
    const method = mode === "signin" ? supabaseClient.auth.signInWithPassword.bind(supabaseClient.auth) : supabaseClient.auth.signUp.bind(supabaseClient.auth);
    const authDetails = { email: credentials.get("email"), password: credentials.get("password") };
    if (mode === "signup") authDetails.options = { data: { full_name: credentials.get("fullName") } };
    const { error } = await method(authDetails);
    authMessage.textContent = error ? error.message : mode === "signup" ? "Check your email to confirm your account." : "";
  });
  setCloudMode("signin");

  document.querySelector("#signOutButton").addEventListener("click", () => supabaseClient.auth.signOut());
  document.querySelector("#signOutButton").hidden = false;
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    updateProfile(currentUser);
    const isRecovery = _event === "PASSWORD_RECOVERY" || window.location.hash.includes("type=recovery");
    if (isRecovery) setCloudMode("reset-confirm");
    authScreen.hidden = Boolean(currentUser) && !isRecovery;
    document.querySelector("#appShell").hidden = !currentUser || isRecovery;
    if (currentUser) {
      try { await loadApplications(); } catch (error) { window.alert(error.message); }
    }
  });
  supabaseClient.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user || null;
    updateProfile(currentUser);
    const isRecovery = window.location.hash.includes("type=recovery");
    if (isRecovery) setCloudMode("reset-confirm");
    authScreen.hidden = Boolean(currentUser) && !isRecovery;
    document.querySelector("#appShell").hidden = !currentUser || isRecovery;
    if (currentUser) loadApplications().catch((error) => window.alert(error.message));
  });
}

function setupLocalAuthentication() {
  const authTitle = document.querySelector("#authTitle");
  const authCopy = document.querySelector("#authCopy");
  const authSubmit = document.querySelector("#authSubmit");
  const authSwitch = document.querySelector("#authSwitch");
  const forgotPassword = document.querySelector("#forgotPassword");
  const passwordField = document.querySelector("#passwordField");
  const fullNameField = document.querySelector("#fullNameField");
  const appShell = document.querySelector("#appShell");
  const users = JSON.parse(localStorage.getItem("applywise-users") || "{}");
  let mode = "signin";

  function setMode(nextMode) {
    mode = nextMode;
    fullNameField.hidden = mode !== "signup";
    fullNameField.querySelector("input").required = mode === "signup";
    passwordField.hidden = mode === "reset";
    passwordField.querySelector("input").required = mode !== "reset";
    authTitle.textContent = mode === "signin" ? "Welcome back." : mode === "reset" ? "Reset your password." : mode === "reset-confirm" ? "Choose a new password." : "Create your account.";
    authCopy.textContent = mode === "signin" ? "Sign in to keep your applications available on this device." : mode === "reset" ? "Enter your email to reset your local password." : mode === "reset-confirm" ? "Choose a new password for this local account." : "Create a local account to start tracking applications.";
    authSubmit.textContent = mode === "signin" ? "Sign in" : mode === "reset" ? "Find account" : mode === "reset-confirm" ? "Save new password" : "Sign up";
    authSwitch.textContent = mode === "signin" ? "Need an account? Sign up" : "Back to sign in";
    forgotPassword.hidden = mode !== "signin";
    authMessage.textContent = "";
  }

  authSwitch.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));
  forgotPassword.addEventListener("click", () => setMode("reset"));
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const credentials = new FormData(authForm);
    const fullName = credentials.get("fullName").trim();
    const email = credentials.get("email").toLowerCase().trim();
    const password = credentials.get("password");
    if (mode === "reset") {
      const storedUser = users[email];
      if (!storedUser) {
        authMessage.textContent = "No local account was found for this email.";
        return;
      }
      setMode("reset-confirm");
      authMessage.textContent = "Enter your new password to reset this local account.";
      return;
    }
    if (mode === "reset-confirm") {
      if (password.length < 6) {
        authMessage.textContent = "Password must be at least 6 characters.";
        return;
      }
      const storedUser = typeof users[email] === "string" ? { password: users[email], fullName: email.split("@")[0] } : users[email];
      users[email] = { ...storedUser, password };
      localStorage.setItem("applywise-users", JSON.stringify(users));
      authMessage.textContent = "Password updated. You can now sign in.";
      setMode("signin");
      authForm.reset();
      return;
    }
    if (password.length < 6) {
      authMessage.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (mode === "signup" && users[email]) {
      authMessage.textContent = "An account with this email already exists.";
      return;
    }
    const storedUser = typeof users[email] === "string" ? { password: users[email], fullName: email.split("@")[0] } : users[email];
    if (mode === "signin" && (!storedUser || storedUser.password !== password)) {
      authMessage.textContent = "Email or password is incorrect.";
      return;
    }
    if (mode === "signup") {
      users[email] = { password, fullName };
      localStorage.setItem("applywise-users", JSON.stringify(users));
    }
    const isNewAccount = mode === "signup";
    currentUser = { email, ...(mode === "signup" ? { fullName } : storedUser) };
    updateProfile(currentUser);
    loadLocalApplications(email, isNewAccount);
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
