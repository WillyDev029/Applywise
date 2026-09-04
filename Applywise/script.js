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
      <td><button class="row-menu" data-delete="${application.id}" aria-label="Delete ${application.role} at ${application.company}">•••</button></td>
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

document.querySelector("#openModal").addEventListener("click", () => {
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  modal.showModal();
});
document.querySelector("#emptyAddButton").addEventListener("click", () => document.querySelector("#openModal").click());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  state.applications.push({ id: Date.now(), company: data.get("company"), role: data.get("role"), status: data.get("status"), date: data.get("date"), nextStep: data.get("nextStep") });
  saveApplications();
  render();
  modal.close();
});

rows.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;
  state.applications = state.applications.filter((application) => application.id !== Number(deleteButton.dataset.delete));
  saveApplications();
  render();
});

render();
