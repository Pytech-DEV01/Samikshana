(function () {
  const form = document.getElementById("registrationForm");
  const roleSelect = document.getElementById("role");
  const errorBox = document.getElementById("registrationError");
  const notice = document.getElementById("registrationNotice");
  const submitButton = document.getElementById("registrationSubmit");
  const password = document.getElementById("password");
  const passwordConfirmation = document.getElementById("passwordConfirmation");
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  const requiredFields = {
    mp: ["constituency", "state", "house", "locations"],
    contractor: ["company_name", "business_registration"],
    state_authority: ["stateAuthorityState", "stateAuthorityDepartment", "stateAuthorityDesignation"],
    district_authority: ["district", "districtState", "districtDepartment", "districtDesignation"],
    nodal_officer: ["department", "designation"],
    ministry: ["department", "designation"]
  };
  function updateRoleFields() {
    const selected = roleSelect.value;
    document.querySelectorAll("[data-role-fields]").forEach((group) => {
      const roles = group.dataset.roleFields.split(" ");
      const visible = roles.includes(selected);
      group.hidden = !visible;
      group.querySelectorAll("input, select, textarea").forEach((field) => {
        field.disabled = !visible;
        field.required =
          visible && (requiredFields[selected] || []).includes(field.id);
      });
    });
  }

  roleSelect.addEventListener("change", updateRoleFields);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    if (!form.reportValidity()) return;
    if (password.value !== passwordConfirmation.value) {
      errorBox.textContent = "The passwords do not match.";
      errorBox.hidden = false;
      passwordConfirmation.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.querySelector(".submit-label").textContent = "Creating account…";
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": csrfToken },
        body: new FormData(form)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "The account could not be created.");
      }

      form.hidden = true;
      notice.classList.add("is-success");
      notice.textContent = result.message;
      const footerLink = document.createElement("a");
      footerLink.href = "/";
      footerLink.textContent = "Go to sign in";
      document.querySelector(".registration-footer").replaceChildren(footerLink);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      submitButton.disabled = false;
      submitButton.querySelector(".submit-label").textContent =
        "Create account";
    }
  });

  updateRoleFields();
})();
