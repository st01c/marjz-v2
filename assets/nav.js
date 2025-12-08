const NAV_ITEMS = [
  { key: "about", href: "about.html", label: "About" },
  { key: "research", href: "research.html", label: "Research" },
  {
    key: "practice",
    href: "practice.html",
    label: "Practice",
    tooltip: "Projects, exhibitions, and curatorial work",
  },
  { key: "curatorial", href: "curatorial.html", label: "Curatorial" },
  { key: "teaching", href: "teaching.html", label: "Teaching" },
  { key: "cycling", href: "cycling.html", label: "Cycling" },
  { key: "browse", href: "browse.html", label: "Browse" },
  { key: "contact", href: "contact.html", label: "Contact", primary: true },
];

const SITE_NAME = "Martin Zeilinger";
const SITE_HREF = "index.html";

function detectActiveKey() {
  const fromBody = document.body?.dataset?.section;
  if (fromBody) return fromBody;

  const path = window.location.pathname.split("/").pop() || "index.html";
  const name = path.toLowerCase();
  if (name.includes("about")) return "about";
  if (name.includes("research")) return "research";
  if (name.includes("practice")) return "practice";
  if (name.includes("teaching")) return "teaching";
  if (name.includes("browse")) return "browse";
  if (name.includes("cycling")) return "cycling";
  if (name.includes("curatorial")) return "curatorial";
  if (name.includes("contact")) return "contact";
  return null;
}

function setSiteName() {
  const nameEl = document.querySelector(".nav-name");
  if (!nameEl) return;
  nameEl.textContent = SITE_NAME;
  nameEl.href = SITE_HREF;
}

function injectNav() {
  const container = document.querySelector("[data-nav-inject]");
  if (!container) return;

  const activeKey = detectActiveKey();
  container.innerHTML = "";
  container.className = "nav-links";
  container.setAttribute("aria-label", "Main navigation");

  NAV_ITEMS.forEach((item, idx) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    link.className = "nav-link";
    if (item.primary) {
      link.classList.add("nav-link--primary");
    }
    if (item.tooltip) {
      link.classList.add("nav-link--tooltip");
      link.dataset.tooltip = item.tooltip;
    }
    if (item.key === activeKey) {
      link.classList.add("nav-link--active");
    }
    container.appendChild(link);
    if (idx < NAV_ITEMS.length - 1) {
      const sep = document.createElement("span");
      sep.textContent = " / ";
      sep.className = "nav-separator";
      container.appendChild(sep);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setSiteName();
  injectNav();
});
