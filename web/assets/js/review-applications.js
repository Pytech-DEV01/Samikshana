(function () {
  const token = document.querySelector('meta[name="csrf-token"]').content;
  const list = document.getElementById("applicationList");
  const errorBox = document.getElementById("reviewError");
  const notice = document.getElementById("reviewNotice");
  const labels = {
    mp: "MP / MP office",
    contractor: "Contractor",
    district_authority: "District authority",
    state_authority: "State authority",
    nodal_officer: "Nodal officer",
    ministry: "MoSPI / Ministry"
  };

  function addDetail(container, label, value) {
    const detail = document.createElement("div");
    detail.className = "application-detail";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = value || "Not provided";
    detail.append(labelNode, valueNode);
    container.append(detail);
  }

  async function decide(application, status) {
    const note = status === "approved"
      ? ""
      : window.prompt("Enter the reason for rejecting this application:");
    if (note === null) return;
    if (status !== "approved" && !note.trim()) {
      errorBox.textContent = "A review note is required.";
      errorBox.hidden = false;
      return;
    }
    try {
      const response = await fetch(
        `/api/admin/applications/${encodeURIComponent(application.id)}/decision`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token
          },
          body: JSON.stringify({ status, note })
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Review decision failed.");
      notice.textContent = status === "approved"
        ? "Reviewed successfully."
        : result.message;
      notice.hidden = false;
      errorBox.hidden = true;
      await loadApplications();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  }

  function renderApplication(application) {
    const card = document.createElement("article");
    card.className = "application-card";
    const heading = document.createElement("h2");
    heading.textContent = application.full_name;
    const status = document.createElement("span");
    status.className = "application-status";
    status.textContent = application.status;
    const meta = document.createElement("p");
    meta.className = "application-meta";
    meta.textContent =
      `${labels[application.role] || application.role} · ${application.email} · ${application.phone} · Submitted ${new Date(application.created_at).toLocaleString()}`;
    const details = document.createElement("div");
    details.className = "application-details";
    const profileLabels = {
      constituency: "Constituency",
      state: "State / UT",
      house: "House",
      locations: "Covered locations",
      office_address: "Office address",
      department: "Department",
      designation: "Designation",
      district: "District",
      company_name: "Company / firm",
      business_registration: "Business registration"
    };
    Object.entries(profileLabels).forEach(([key, label]) => {
      const value = application.profile[key];
      if (value) addDetail(details, label, value);
    });
    const documents = document.createElement("div");
    documents.className = "application-documents";
    application.documents.forEach((applicationDocument) => {
      const preview = document.createElement("div");
      preview.className = "application-document-preview";
      if (applicationDocument.filename.match(/\.pdf$/i)) {
        const frame = document.createElement("iframe");
        frame.src = applicationDocument.url;
        frame.title = `Preview of ${applicationDocument.filename}`;
        frame.loading = "lazy";
        frame.referrerPolicy = "no-referrer";
        preview.append(frame);
      } else {
        const image = document.createElement("img");
        image.src = applicationDocument.url;
        image.alt = `Preview of ${applicationDocument.filename}`;
        image.loading = "lazy";
        preview.append(image);
      }
      const link = document.createElement("a");
      link.href = `${applicationDocument.url}?download=1`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `Download ${applicationDocument.filename}`;
      const item = document.createElement("section");
      item.className = "application-document";
      const caption = document.createElement("strong");
      caption.textContent = applicationDocument.filename;
      item.append(caption, preview, link);
      documents.append(item);
    });
    card.append(heading, status, meta, details, documents);
    if (application.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "application-actions";
      [
        ["approved", "Accept", ""],
        ["rejected", "Reject", "reject"]
      ].forEach(([decision, label, className]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.addEventListener("click", () => decide(application, decision));
        actions.append(button);
      });
      card.append(actions);
    } else if (application.review_note) {
      addDetail(details, "Review note", application.review_note);
    }
    return card;
  }

  async function loadApplications() {
    errorBox.hidden = true;
    list.replaceChildren();
    try {
      const response = await fetch(
        `/api/admin/applications?status=${encodeURIComponent(document.getElementById("statusFilter").value)}`,
        { credentials: "same-origin" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load applications.");
      if (!result.applications.length) {
        const empty = document.createElement("p");
        empty.className = "registration-notice";
        empty.textContent = "No account applications in this view.";
        list.append(empty);
        return;
      }
      list.append(...result.applications.map(renderApplication));
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  }

  document.getElementById("statusFilter").addEventListener("change", loadApplications);
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      if (!response.ok) throw new Error(`Sign out failed (${response.status}).`);
      window.location.assign("/");
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });

  loadApplications();
})();
