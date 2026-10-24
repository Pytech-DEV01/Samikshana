(function () {
  const roles = SahayogAuth.ROLES;
  const roleButtons = Array.from(document.querySelectorAll(".role"));
  const accessText = document.getElementById("accessText");
  const loginButton = document.getElementById("oauthLoginBtn");
  const authMessage = document.getElementById("authMessage");
  let selectedRole = "citizen";

  function selectRole(key, focusButton) {
    const role = roles[key] || roles.citizen;
    selectedRole = role.key;

    roleButtons.forEach((button) => {
      const isSelected = button.dataset.role === role.key;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-checked", String(isSelected));
      button.tabIndex = isSelected ? 0 : -1;
      if (isSelected && focusButton) button.focus();
    });

    accessText.textContent = role.accessCopy;
  }

  roleButtons.forEach((button) => {
    button.addEventListener("click", () => selectRole(button.dataset.role));
  });

  document.querySelector(".roles").addEventListener("keydown", (event) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const current = roleButtons.findIndex(
      (button) => button.dataset.role === selectedRole
    );
    const next = (current + direction + roleButtons.length) % roleButtons.length;
    selectRole(roleButtons[next].dataset.role, true);
  });

  loginButton.addEventListener("click", () => {
    loginButton.disabled = true;
    loginButton.querySelector(".submit-label").textContent =
      "Connecting securely…";
    window.location.assign(
      `/auth/login?role=${encodeURIComponent(selectedRole)}`
    );
  });

  document.querySelectorAll(".demo-link").forEach((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });

  const error = new URLSearchParams(window.location.search).get("auth_error");
  if (error === "role") {
    authMessage.textContent =
      "Your identity-provider account is not assigned to that access level. Ask your administrator to grant the required role.";
    authMessage.classList.add("is-error");
  } else if (error === "provider") {
    authMessage.textContent =
      "Sign-in could not be completed. Check that the identity provider is available and try again.";
    authMessage.classList.add("is-error");
  }

  selectRole("citizen");
})();
