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

  // Handle E-Book email registration form (Netlify Forms)
  const ebookForm = document.getElementById("ebookForm");
  if (ebookForm) {
    ebookForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const formData = new FormData(ebookForm);
      const submitBtn = ebookForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(formData).toString()
      })
        .then((response) => {
          if (response.ok) {
            document.getElementById("ebookSuccess").style.display = "block";
            ebookForm.style.display = "none";
          } else {
            throw new Error("Form submission failed");
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          alert("Something went wrong. Please try again.");
        });
    });
  }
})();
