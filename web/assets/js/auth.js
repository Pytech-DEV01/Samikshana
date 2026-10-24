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
    authority: {
      key: "authority",
      label: "MP / State / Nodal / District Authority",
      access: "Official access",
      accessCopy:
        "Sign in with your approved official account. Your assigned MP, State, Nodal, or District permissions determine the data and actions available.",
      description: "Access your assigned official MPLADS workspace."
    },
    contractor: {
      key: "contractor",
      label: "Contractor",
      access: "Assigned works",
      accessCopy:
        "You can view and update only works assigned to your firm. Constituency-wide data is not available.",
      description: "Update progress for the works assigned to your firm."
    },
    district_authority: {
      key: "district_authority",
      label: "District Authority",
      shortName: "District Authority",
      access: "District scope",
      accessCopy:
        "View programme records within the district assigned to your approved account.",
      description: "Review MPLADS records for your assigned district."
    },
    state_authority: {
      key: "state_authority",
      label: "State Authority",
      shortName: "State Authority",
      access: "State scope",
      accessCopy:
        "View and manage programme information within the state assigned to your approved account.",
      description: "Review MPLADS records for your assigned state."
    },
    nodal_officer: {
      key: "nodal_officer",
      label: "Nodal Officer",
      shortName: "Nodal Officer",
      access: "National scope",
      accessCopy:
        "Coordinate and review programme information within your approved national role.",
      description: "Coordinate MPLADS programme reporting."
    },
    ministry: {
      key: "ministry",
      label: "MoSPI / Ministry",
      shortName: "MoSPI / Ministry",
      access: "National scope",
      accessCopy:
        "Review national programme information under your approved ministry account.",
      description: "Review national MPLADS programme information."
    },
    application_reviewer: {
      key: "application_reviewer",
      label: "Account Reviewer",
      shortName: "Account Reviewer",
      access: "Application review",
      accessCopy: "Review account applications and supporting documents.",
      description: "Review Sahayog account applications."
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
