(() => {
  // Set footer year
  const yearEl = document.getElementById("y");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Handle "Open" button for calculator selector
  const goButton = document.getElementById("go");
  const toolSelect = document.getElementById("tool");

  if (goButton && toolSelect) {
    goButton.addEventListener("click", () => {
      const target = toolSelect.value;
      if (target) {
        window.location.href = target;
      }
    });
  }
})();
