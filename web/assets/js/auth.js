(function (global) {
  const ROLES = {
    citizen: {
      key: "citizen",
      label: "Citizen",
      access: "View only",
      accessCopy:
        "Citizens can explore public works, progress and sanctioned funds. Audit scores, personal data and editing tools stay restricted.",
      description: "Explore public works, progress and funds in your constituency."
    },
    mp: {
      key: "mp",
      label: "MP / Authority",
      access: "Full control",
      accessCopy:
        "Full oversight: inspect every work, review anomaly flags, and take administrative action across the constituency.",
      description: "Oversee every project, review risk flags and take action."
    },
    contractor: {
      key: "contractor",
      label: "Contractor",
      access: "Assigned works",
      accessCopy:
        "You can view and update only works assigned to your firm. Constituency-wide data is not available.",
      description: "Update progress for the works assigned to your firm."
    }
  };

  function getSession() {
    const session = global.SahayogSession;
    return session && ROLES[session.role] ? session : null;
  }

  function requireSession() {
    const session = getSession();
    if (!session) {
      global.location.replace("/");
      return null;
    }
    return session;
  }

  async function clearSession() {
    const response = await global.fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (!response.ok) {
      throw new Error(`Sign out failed (${response.status}).`);
    }
  }

  global.SahayogAuth = {
    ROLES,
    getSession,
    requireSession,
    clearSession
  };
})(window);
