function enforceExternalLinks(root = document) {
  const origin = window.location.origin;
  const anchors = root.querySelectorAll ? root.querySelectorAll("a[href]") : [];

  anchors.forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;

    const lower = href.toLowerCase();
    if (
      lower.startsWith("#") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:")
    ) {
      return;
    }

    // Relative links are internal.
    if (
      lower.startsWith("/") ||
      lower.startsWith("./") ||
      lower.startsWith("../")
    ) {
      return;
    }

    try {
      const url = new URL(href, origin);
      if (url.origin === origin) return;

      a.target = "_blank";
      const existingRel = (a.getAttribute("rel") || "")
        .split(/\s+/)
        .filter(Boolean);
      if (!existingRel.includes("noopener")) existingRel.push("noopener");
      a.setAttribute("rel", existingRel.join(" "));
    } catch (e) {
      // Ignore malformed URLs.
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  enforceExternalLinks(document);

  if (window.MutationObserver) {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.tagName === "A") {
            enforceExternalLinks({ querySelectorAll: () => [node] });
          } else {
            enforceExternalLinks(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
});
