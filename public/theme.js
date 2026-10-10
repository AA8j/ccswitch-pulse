(() => {
  const key = "ccswitch-pulse-theme";
  const media = window.matchMedia("(prefers-color-scheme: light)");
  let saved;
  try {
    saved = localStorage.getItem(key);
  } catch {
    // Theme selection still works when storage is disabled.
  }

  function apply(theme, persist = false) {
    if (theme !== "light" && theme !== "dark") return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#f3f7f8" : "#0b1019");
    if (persist) {
      saved = theme;
      try {
        localStorage.setItem(key, theme);
      } catch {
        // Keep the selection for this page even when storage is disabled.
      }
    }
    window.dispatchEvent(
      new CustomEvent("pulse-theme-change", { detail: theme }),
    );
  }

  window.pulseTheme = {
    apply,
    get: () => document.documentElement.dataset.theme,
  };
  apply(
    saved === "light" || saved === "dark"
      ? saved
      : media.matches
        ? "light"
        : "dark",
  );
  media.addEventListener("change", (event) => {
    if (saved !== "light" && saved !== "dark")
      apply(event.matches ? "light" : "dark");
  });
})();
