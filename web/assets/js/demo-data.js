(function (global) {
  const MP_DESHMUKH = {
    name: "Shri Ramesh Deshmukh",
    constituency: "Pune (Maharashtra)"
  };

  const MP_RAO = {
    name: "Smt. Kavita Rao",
    constituency: "Pune (Maharashtra)"
  };

  const CONTRACTORS = {
    "C-1042": {
      id: "C-1042",
      name: "Buildwell Constructions",
      contact: "site.engineer@buildwell.in",
      phone: "+91 98220 41188",
      class: "Class-I (Roads & Civil)",
      since: 2016
    },
    "C-2087": {
      id: "C-2087",
      name: "Sahyadri Buildcon",
      contact: "accounts@sahyadribuildcon.in",
      phone: "+91 99702 55140",
      class: "Class-II (Buildings)",
      since: 2019
    },
    "C-3390": {
      id: "C-3390",
      name: "Sunrise Infra Projects",
      contact: "ops@sunriseinfra.in",
      phone: "+91 91580 77213",
      class: "Class-I (Water & Energy)",
      since: 2014
    }
  };

  const PROJECTS = [
    {
      id: "MPL-2026-041",
      name: "CC road — Shivaji Nagar to Bus Depot",
      category: "Roads",
      description:
        "1.2 km cement concrete road with storm-water drains, pedestrian crossings and street lighting on the depot approach.",
      mp: MP_DESHMUKH,
      authority: "Pune Zilla Parishad",
      workOrder: "WO/2026/MPLADS/041",
      location: { area: "Shivaji Nagar", ward: "Ward 12", city: "Pune", lat: 18.5204, lng: 73.8567 },
      sanctioned: 4850000,
      spent: 3120000,
      progress: 64,
      status: "In progress",
      contractorId: "C-1042",
      start: "2026-05-12",
      due: "2027-03-30",
      risk: 0.82,
      reasons: [
        "Expenditure is 22% above the peer benchmark for similar stretches",
        "Billing runs 18 percentage points ahead of physical progress"
      ]
    },
    {
      id: "MPL-2026-042",
      name: "Zilla Parishad school — 4 new classrooms",
      category: "Education",
      description:
        "Four additional classrooms with ramps, toilets and a drinking-water point for the Zilla Parishad primary school.",
      mp: MP_RAO,
      authority: "Pune Zilla Parishad",
      workOrder: "WO/2026/MPLADS/042",
      location: { area: "Kothrud", ward: "Ward 8", city: "Pune", lat: 18.5074, lng: 73.8077 },
      sanctioned: 6200000,
      spent: 2480000,
      progress: 38,
      status: "In progress",
      contractorId: "C-2087",
      start: "2026-07-01",
      due: "2026-12-15",
      risk: 0.18,
      reasons: []
    },
    {
      id: "MPL-2026-043",
      name: "Primary health centre — diagnostic equipment",
      category: "Health",
      description:
        "Fit-out and diagnostic equipment for the ward primary health centre, including a lab room and cold-chain storage.",
      mp: MP_DESHMUKH,
      authority: "Pune Municipal Corporation",
      workOrder: "WO/2026/MPLADS/043",
      location: { area: "Ramnagar", ward: "Ward 4", city: "Pune", lat: 18.5362, lng: 73.8735 },
      sanctioned: 2850000,
      spent: 1200000,
      progress: 41,
      status: "In progress",
      contractorId: "C-1042",
      start: "2026-06-18",
      due: "2026-11-30",
      risk: 0.44,
      reasons: ["Procurement split across three tenders of similar value"]
    },
    {
      id: "MPL-2026-044",
      name: "Solar street lights — 120 units",
      category: "Energy",
      description:
        "120 solar street lights across unlit internal lanes of Sawant Vasti, with a five-year maintenance commitment.",
      mp: MP_RAO,
      authority: "Pune Municipal Corporation",
      workOrder: "WO/2026/MPLADS/044",
      location: { area: "Sawant Vasti", ward: "Ward 15", city: "Pune", lat: 18.4912, lng: 73.8290 },
      sanctioned: 3600000,
      spent: 3240000,
      progress: 92,
      status: "In progress",
      contractorId: "C-3390",
      start: "2026-08-05",
      due: "2027-01-20",
      risk: 0.12,
      reasons: []
    },
    {
      id: "MPL-2026-045",
      name: "Drainage line — Gandhi Chowk",
      category: "Sanitation",
      description:
        "640 m underground drainage line with two manhole chambers to end monsoon waterlogging at Gandhi Chowk.",
      mp: MP_DESHMUKH,
      authority: "Pune Municipal Corporation",
      workOrder: "WO/2026/MPLADS/045",
      location: { area: "Gandhi Chowk", ward: "Ward 6", city: "Pune", lat: 18.5156, lng: 73.8601 },
      sanctioned: 4100000,
      spent: 1060000,
      progress: 28,
      status: "Under review",
      contractorId: "C-1042",
      start: "2026-04-22",
      due: "2026-12-31",
      risk: 0.67,
      reasons: [
        "Two work orders within 400 m carry near-identical estimates",
        "Possible related-party link between contractor and ward official"
      ]
    },
    {
      id: "MPL-2026-046",
      name: "Anganwadi centre — Kothrud",
      category: "Women & Child",
      description:
        "New anganwadi centre with a kitchen, activity hall and shaded play area serving 60 children.",
      mp: MP_RAO,
      authority: "Pune Zilla Parishad",
      workOrder: "WO/2025/MPLADS/046",
      location: { area: "Kothrud", ward: "Ward 8", city: "Pune", lat: 18.5089, lng: 73.8121 },
      sanctioned: 2200000,
      spent: 2200000,
      progress: 100,
      status: "Completed",
      contractorId: "C-2087",
      start: "2025-11-10",
      due: "2026-08-20",
      risk: 0.21,
      reasons: []
    },
    {
      id: "MPL-2026-047",
      name: "Community hall — Ramnagar",
      category: "Infrastructure",
      description:
        "Community hall for 200 people with accessible entry, parking and a stage for ward-level public meetings.",
      mp: MP_DESHMUKH,
      authority: "Pune Municipal Corporation",
      workOrder: "WO/2026/MPLADS/047",
      location: { area: "Ramnagar", ward: "Ward 4", city: "Pune", lat: 18.5330, lng: 73.8702 },
      sanctioned: 5500000,
      spent: 1880000,
      progress: 34,
      status: "In progress",
      contractorId: "C-3390",
      start: "2026-09-10",
      due: "2027-02-28",
      risk: 0.31,
      reasons: []
    },
    {
      id: "MPL-2026-048",
      name: "Borewell & overhead tank — Sawant Vasti",
      category: "Water",
      description:
        "Borewell with a 90,000-litre overhead tank and distribution lines for 340 households.",
      mp: MP_RAO,
      authority: "Pune Zilla Parishad",
      workOrder: "WO/2026/MPLADS/048",
      location: { area: "Sawant Vasti", ward: "Ward 15", city: "Pune", lat: 18.4934, lng: 73.8318 },
      sanctioned: 1850000,
      spent: 980000,
      progress: 55,
      status: "In progress",
      contractorId: "C-1042",
      start: "2026-03-15",
      due: "2026-11-15",
      risk: 0.55,
      reasons: ["Water quality test pending for six weeks"]
    },
    {
      id: "MPL-2026-049",
      name: "Library upgrade — Municipal school",
      category: "Education",
      description:
        "Library upgrade with 4,000 books, reading furniture, digital kiosk and reading room lighting.",
      mp: MP_DESHMUKH,
      authority: "Pune Municipal Corporation",
      workOrder: "WO/2026/MPLADS/049",
      location: { area: "Shivaji Nagar", ward: "Ward 12", city: "Pune", lat: 18.5221, lng: 73.8543 },
      sanctioned: 1500000,
      spent: 460000,
      progress: 30,
      status: "In progress",
      contractorId: "C-2087",
      start: "2026-10-01",
      due: "2027-04-30",
      risk: 0.09,
      reasons: []
    },
    {
      id: "MPL-2026-050",
      name: "Check dam repair — Mula river",
      category: "Water",
      description:
        "Structural repair and de-silting of the check dam to restore storage for downstream farm wells.",
      mp: MP_RAO,
      authority: "Pune Zilla Parishad",
      workOrder: "WO/2026/MPLADS/050",
      location: { area: "Mula river bank", ward: "Ward 2", city: "Pune", lat: 18.5410, lng: 73.7990 },
      sanctioned: 7400000,
      spent: 1900000,
      progress: 22,
      status: "Under review",
      contractorId: "C-3390",
      start: "2026-02-10",
      due: "2026-12-20",
      risk: 0.73,
      reasons: [
        "Cost estimate is 31% above the district benchmark",
        "Contractor already carries two overdue works"
      ]
    }
  ];

  const MATERIALS = [
    "Cement (OPC 53)",
    "Sand",
    "Aggregate 20 mm",
    "Aggregate 40 mm",
    "Steel rebar (TMT)",
    "Bitumen",
    "Bricks",
    "PVC pipe",
    "GI pipe",
    "Solar LED unit",
    "Paint",
    "Earthwork / filler",
    "Other"
  ];

  const UNITS = ["bags", "m³", "kg", "tonnes", "nos", "metres", "litres", "sq m"];

  const NOTICES = [
    {
      date: "22 Oct 2026",
      tag: "Inspection",
      title: "Ward 12 road inspection open to citizens on 28 Oct",
      body:
        "Residents may observe the joint inspection of the Shivaji Nagar CC road. Assemble at the site office at 9:30 AM."
    },
    {
      date: "18 Oct 2026",
      tag: "Consultation",
      title: "Public consultation for the 2027-28 work plan",
      body:
        "Share your ward priorities at the community hall, Ramnagar, on 2 November at 11:00 AM."
    },
    {
      date: "12 Oct 2026",
      tag: "Report",
      title: "Quarter 2 expenditure report published",
      body:
        "Ward-wise utilisation for April–September 2026 is now available in the public works section."
    },
    {
      date: "04 Oct 2026",
      tag: "Completion",
      title: "Anganwadi centre, Kothrud handed over",
      body:
        "The completed anganwadi centre has been handed over to the ward office and is open from 6 October."
    }
  ];

  function demoPhoto(label, tint) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${tint}"/><stop offset="1" stop-color="#0a1b2b"/></linearGradient></defs>` +
      `<rect width="640" height="420" fill="url(#g)"/>` +
      `<path d="M0 330 L120 250 L230 300 L340 215 L470 285 L640 205 L640 420 L0 420 Z" fill="rgba(255,255,255,.14)"/>` +
      `<path d="M0 370 L160 320 L300 355 L470 300 L640 345 L640 420 L0 420 Z" fill="rgba(255,255,255,.12)"/>` +
      `<circle cx="540" cy="80" r="34" fill="rgba(255,255,255,.2)"/>` +
      `<text x="32" y="392" font-family="Inter, Arial, sans-serif" font-size="20" fill="rgba(255,255,255,.85)">${label}</text>` +
      `</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  const SEED_UPDATES = [
    {
      id: "u-1001",
      projectId: "MPL-2026-041",
      date: "2026-09-28",
      progress: 52,
      timeValue: 6,
      timeUnit: "weeks",
      materials: [
        { name: "Cement (OPC 53)", qty: 420, unit: "bags" },
        { name: "Aggregate 20 mm", qty: 18, unit: "m³" }
      ],
      note: "Sub-base laid and the box culvert cast on stretch 2. Kerb work starts next week.",
      photos: [
        {
          name: "stretch2-subbase.jpg",
          dataUrl: demoPhoto("Demo site photo · stretch 2 sub-base", "#8a5a24"),
          lat: 18.5211,
          lng: 73.8574,
          accuracy: 12,
          source: "device"
        }
      ],
      submittedBy: "Buildwell Constructions",
      submittedAt: "2026-09-28T10:14:00"
    },
    {
      id: "u-1002",
      projectId: "MPL-2026-043",
      date: "2026-10-14",
      progress: 41,
      timeValue: 4,
      timeUnit: "days",
      materials: [{ name: "PVC pipe", qty: 90, unit: "metres" }],
      note: "Lab room partitioning done. Equipment delivery expected 30 October.",
      photos: [],
      submittedBy: "Buildwell Constructions",
      submittedAt: "2026-10-14T16:02:00"
    },
    {
      id: "u-1003",
      projectId: "MPL-2026-045",
      date: "2026-10-18",
      progress: 28,
      timeValue: 9,
      timeUnit: "days",
      materials: [
        { name: "PVC pipe", qty: 160, unit: "metres" },
        { name: "Earthwork / filler", qty: 22, unit: "m³" }
      ],
      note: "Trenching completed on 260 m of the 640 m alignment. Work paused during heavy rain.",
      photos: [
        {
          name: "trenching-gandhi-chowk.jpg",
          dataUrl: demoPhoto("Demo site photo · trenching at Gandhi Chowk", "#2f5f7a"),
          lat: 18.5159,
          lng: 73.8608,
          accuracy: 18,
          source: "device"
        }
      ],
      submittedBy: "Buildwell Constructions",
      submittedAt: "2026-10-18T11:40:00"
    }
  ];

  global.SahayogData = {
    PROJECTS,
    CONTRACTORS,
    MATERIALS,
    UNITS,
    NOTICES,
    SEED_UPDATES,
    demoPhoto
  };
})(window);
