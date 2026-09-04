const starterApplications = [
  { id: 1, company: "Northstar Labs", role: "Product Designer", status: "Interview", date: "2026-08-29", nextStep: "Portfolio review · Sep 06" },
  { id: 2, company: "Lumen & Co.", role: "Senior UX Designer", status: "Applied", date: "2026-08-26", nextStep: "Follow up next week" },
  { id: 3, company: "Fieldwork", role: "Design Lead", status: "Offer", date: "2026-08-21", nextStep: "Review offer · Sep 05" },
  { id: 4, company: "Marble Studio", role: "Product Designer", status: "Applied", date: "2026-08-18", nextStep: "Awaiting response" },
  { id: 5, company: "Tandem Health", role: "UX Researcher", status: "Rejected", date: "2026-08-12", nextStep: "Keep the search going" }
];

const state = {
  applications: JSON.parse(localStorage.getItem("applywise-applications") || "null") || starterApplications,
  filter: "all",
  search: "",
  sort: "recent"
};

const rows = document.querySelector("#applicationRows");
const emptyState = document.querySelector("#emptyState");
const modal = document.querySelector("#applicationModal");
const form = document.querySelector("#applicationForm");
let editingApplicationId = null;

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function initials(company) {
  return company.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function saveApplications() {
  localStorage.setItem("applywise-applications", JSON.stringify(state.applications));
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

document.querySelector("#openModal").addEventListener("click", () => openApplicationModal());
document.querySelector("#emptyAddButton").addEventListener("click", () => openApplicationModal());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const updatedApplication = { company: data.get("company"), role: data.get("role"), status: data.get("status"), date: data.get("date"), nextStep: data.get("nextStep") };
  if (editingApplicationId) {
    state.applications = state.applications.map((application) => application.id === editingApplicationId ? { ...application, ...updatedApplication } : application);
  } else {
    state.applications.push({ id: Date.now(), ...updatedApplication });
  }
  saveApplications();
  render();
  modal.close();
  editingApplicationId = null;
  document.querySelector(".modal-heading h2").textContent = "Add application";
  document.querySelector(".modal-heading .eyebrow").textContent = "New opportunity";
  document.querySelector(".modal-actions .primary-button").textContent = "Save application";
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
  state.applications = state.applications.filter((application) => application.id !== Number(deleteButton.dataset.delete));
  saveApplications();
  render();
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".actions-cell")) return;
  document.querySelectorAll(".row-actions.open").forEach((menu) => menu.classList.remove("open"));
  document.querySelectorAll(".row-menu[aria-expanded='true']").forEach((button) => button.setAttribute("aria-expanded", "false"));
});

render();
