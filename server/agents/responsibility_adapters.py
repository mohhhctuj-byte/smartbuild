"""Responsibility-specific, scope-safe adapters for canonical Python agents.

Every exported adapter is intentionally named after one canonical responsibility.
They share only file/evidence primitives; selection, outcome, and artifact intent remain
specific to the agent that calls them.
"""
from __future__ import annotations

from html import escape
import json
import re
from pathlib import Path

from .agent_specs import BuildContext, TaskDefinition, TaskStatus
from .base import AgentExecution, SpecialistAgent
from .builder_brain import build_builder_brain_contract
from .execution_support import agent_evidence, blocked, read_project_file, request_profile, request_title, requested_reading_club_book_title, requested_tool_lending_additions, scoped_project_identity_marker, write_project_file


def _e(agent: SpecialistAgent, c: BuildContext, t: TaskDefinition, role: str, *findings: str) -> AgentExecution:
    return agent_evidence(agent, c, t, responsibility=role, findings=tuple(findings) or ("Scoped inspection completed.",))


def user_clarifier(agent, c, t):
    unclear = len(c.request.strip()) < 12 or c.request.strip().lower() in {"build", "make", "create", "help"}
    return blocked(agent, c, t, "requirement clarification", "IMPORTANT_REQUIREMENT_MISSING") if unclear else _e(agent, c, t, "requirement clarification", "Request contains a concrete outcome.")

def api_key_request(agent, c, t): return blocked(agent, c, t, "provider configuration review", "REQUIRED_SECRET_NOT_CONFIGURED")
def intent_verifier(agent, c, t):
    contract = build_builder_brain_contract(c)
    artifact_path = f"agent-artifacts/builder-brain/{t.task_id.replace(':', '_')}.json"
    artifact = write_project_file(
        c,
        t,
        artifact_path,
        json.dumps(contract.as_artifact(c), ensure_ascii=False, sort_keys=True, separators=(",", ":")),
    )
    if contract.capability_status != "bounded-writer-supported":
        return agent_evidence(
            agent,
            c,
            t,
            responsibility="intent and constraint parsing",
            findings=("Recorded a bounded implementation plan; no matching runtime writer is selected.",),
            changed_files=(artifact,),
            status=TaskStatus.BLOCKED,
            blocked_reason="UNSUPPORTED_IMPLEMENTATION_CAPABILITY",
        )
    return agent_evidence(
        agent,
        c,
        t,
        responsibility="intent and constraint parsing",
        findings=(
            f"Classified the request as {contract.product_type} via {contract.route}.",
            f"Capability status: {contract.capability_status}.",
            "Recorded bounded acceptance criteria and approval policy without retaining raw request text.",
        ),
        changed_files=(artifact,),
    )
def live_feedback_collector(agent, c, t): return _e(agent, c, t, "review-gate recording", "No irreversible action was performed.")

def functional_component_engineer(agent, c, t):
    title = request_title(c)
    html_title = escape(title, quote=True)
    scope_marker = scoped_project_identity_marker(c)
    profile = request_profile(c)
    additional_files = []
    if profile.key == "reading-club":
        content = """<section id="content" class="club-dashboard" aria-label="Reading club workspace">
  <section class="club-summary" id="club-summary" aria-label="Club overview"></section>
  <div class="club-layout">
    <section id="primary-section" class="request-card bookshelf-panel" aria-labelledby="bookshelf-title">
      <div class="section-heading"><div><p class="card-kicker">Shared reading list</p><h2 id="bookshelf-title">This month's bookshelf</h2></div><label class="book-search-label" for="book-search">Find a book</label></div>
      <input id="book-search" class="book-search" type="search" placeholder="Search titles or authors" autocomplete="off" aria-controls="book-list">
      <div id="book-list" class="book-grid" aria-live="polite"></div>
    </section>
    <section id="meeting-panel" class="request-card meeting-panel" aria-label="Next club meetup"></section>
    <section id="members-panel" class="request-card members-panel" aria-label="Club members"></section>
  </div>
  <p id="club-status" class="club-status" role="status" aria-live="polite">Your reading updates stay in this browser session.</p>
</section>"""
        scripts = '<script type="module" src="app.js"></script>'
        app_content = "\n".join((
            "import { BOOKS, CLUB_SIZE, MEMBERS, NEXT_MEETING } from './src/data/club-data.mjs';",
            "import { createClubState } from './src/state/club-state.mjs';",
            "import { renderDashboard } from './src/pages/dashboard.mjs';",
            "document.documentElement.dataset.buildProfile = 'reading-club';",
            "const content = document.querySelector('#content');",
            "if (content) content.dataset.ready = 'true';",
            "const state = createClubState();",
            "if (content) renderDashboard(content, { books: BOOKS, members: MEMBERS, memberCount: CLUB_SIZE, meeting: NEXT_MEETING, state });",
            "",
        ))
        additional_files = [
            ("src/data/club-data.mjs", """export const CLUB_SIZE = 24;
export const BOOKS = [
  { id: "quiet-atlas", title: "The Quiet Atlas", author: "Mina Rowe", genre: "Contemporary fiction", chaptersRead: 4, chaptersTotal: 12, note: "A small-town mapmaker finds a new route through an old friendship." },
  { id: "orchard-dusk", title: "The Orchard at Dusk", author: "Ilan Mercer", genre: "Literary fiction", chaptersRead: 7, chaptersTotal: 10, note: "Three siblings return to the orchard that shaped their childhood." },
  { id: "blue-harbor", title: "Letters from Blue Harbor", author: "Sam Vale", genre: "Short stories", chaptersRead: 2, chaptersTotal: 8, note: "A collection about the notes people leave for one another." },
];
export const MEMBERS = Array.from({ length: CLUB_SIZE }, (_, index) => ({
  id: `member-${index + 1}`,
  label: `Member ${String(index + 1).padStart(2, "0")}`,
}));
export const NEXT_MEETING = {
  title: "Sunday chapter circle",
  time: "Sunday · 4:00 PM",
  format: "Online · club room",
  reading: "The Quiet Atlas · chapters 5–6",
  attending: 18,
};
"""),
            ("src/state/club-state.mjs", """export function createClubState() {
  const finishedBookIds = new Set();
  let attending = false;
  return {
    isFinished(bookId) {
      return finishedBookIds.has(bookId);
    },
    toggleFinished(bookId) {
      if (finishedBookIds.has(bookId)) finishedBookIds.delete(bookId);
      else finishedBookIds.add(bookId);
      return finishedBookIds.has(bookId);
    },
    hasRsvp() {
      return attending;
    },
    toggleRsvp() {
      attending = !attending;
      return attending;
    },
    finishedCount() {
      return finishedBookIds.size;
    },
  };
}
"""),
            ("src/utils/create-element.mjs", """export function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
"""),
            ("src/components/book-card.mjs", """import { createElement } from "../utils/create-element.mjs";

export function createBookCard(book, state, onChange) {
  const card = createElement("article", "book-card");
  const genre = createElement("p", "book-genre", book.genre);
  const title = createElement("h3", "book-title", book.title);
  const author = createElement("p", "book-author", `by ${book.author}`);
  const note = createElement("p", "book-note", book.note);
  const progress = createElement("p", "book-progress", `${book.chaptersRead} of ${book.chaptersTotal} chapters read`);
  const action = createElement("button", "book-action", "");
  action.type = "button";
  action.setAttribute("aria-pressed", String(state.isFinished(book.id)));
  action.textContent = state.isFinished(book.id) ? "Finished" : "Mark finished";
  action.addEventListener("click", () => {
    state.toggleFinished(book.id);
    onChange();
  });
  card.append(genre, title, author, note, progress, action);
  return card;
}
"""),
            ("src/components/book-shelf.mjs", """import { createElement } from "../utils/create-element.mjs";
import { createBookCard } from "./book-card.mjs";

export function renderBookShelf(container, books, state, query, onChange) {
  const term = query.trim().toLocaleLowerCase();
  const matches = books.filter(book => `${book.title} ${book.author} ${book.genre}`.toLocaleLowerCase().includes(term));
  const grid = createElement("div", "book-grid");
  for (const book of matches) grid.append(createBookCard(book, state, onChange));
  container.replaceChildren(grid);
  if (matches.length === 0) container.append(createElement("p", "empty-state", "No books match that search. Try another title or author."));
}
"""),
            ("src/components/meeting-panel.mjs", """import { createElement } from "../utils/create-element.mjs";

export function renderMeetingPanel(container, meeting, state, onChange) {
  const heading = createElement("div", "section-heading");
  heading.append(createElement("p", "card-kicker", "Save the date"), createElement("h2", "", meeting.title));
  const details = createElement("ul", "meeting-details");
  for (const detail of [meeting.time, meeting.format, meeting.reading]) details.append(createElement("li", "", detail));
  const action = createElement("button", "primary-action rsvp-action", state.hasRsvp() ? "You're on the list" : "Count me in");
  action.type = "button";
  action.setAttribute("aria-pressed", String(state.hasRsvp()));
  action.addEventListener("click", () => {
    state.toggleRsvp();
    onChange();
  });
  const status = createElement("p", "meeting-status", `${meeting.attending + Number(state.hasRsvp())} members planning to join`);
  container.replaceChildren(heading, details, action, status);
}
"""),
            ("src/components/member-roster.mjs", """import { createElement } from "../utils/create-element.mjs";

export function renderMemberRoster(container, members, memberCount) {
  const heading = createElement("div", "section-heading");
  heading.append(createElement("p", "card-kicker", "A small circle"), createElement("h2", "", `${memberCount} members`));
  const note = createElement("p", "roster-note", "Sample roster labels are ready to replace with your club's own member names.");
  const list = createElement("ul", "member-list");
  for (const member of members) {
    const item = createElement("li", "member-chip");
    item.append(createElement("span", "member-avatar", member.label.slice(-2)), createElement("span", "member-name", member.label));
    list.append(item);
  }
  container.replaceChildren(heading, note, list);
}
"""),
            ("src/components/club-summary.mjs", """import { createElement } from "../utils/create-element.mjs";

export function renderClubSummary(container, memberCount, books, state, meeting) {
  const metrics = [
    [String(memberCount), "club members"],
    [String(books.length), "shared book picks"],
    [String(state.finishedCount()), "books finished by you"],
    [meeting.time.split("·")[0].trim(), "next meetup"],
  ];
  const cards = metrics.map(([value, label]) => {
    const card = createElement("article", "summary-card");
    card.append(createElement("strong", "summary-value", value), createElement("span", "summary-label", label));
    return card;
  });
  container.replaceChildren(...cards);
}
"""),
            ("src/pages/dashboard.mjs", """import { createElement } from "../utils/create-element.mjs";
import { renderBookShelf } from "../components/book-shelf.mjs";
import { renderMeetingPanel } from "../components/meeting-panel.mjs";
import { renderMemberRoster } from "../components/member-roster.mjs";
import { renderClubSummary } from "../components/club-summary.mjs";

export function renderDashboard(root, data) {
  const shelf = root.querySelector("#book-list");
  const search = root.querySelector("#book-search");
  const refresh = () => {
    renderClubSummary(root.querySelector("#club-summary"), data.memberCount, data.books, data.state, data.meeting);
    renderBookShelf(shelf, data.books, data.state, search.value, refresh);
    renderMeetingPanel(root.querySelector("#meeting-panel"), data.meeting, data.state, refresh);
    renderMemberRoster(root.querySelector("#members-panel"), data.members, data.memberCount);
  };
  search.addEventListener("input", () => renderBookShelf(shelf, data.books, data.state, search.value, refresh));
  refresh();
}
"""),
            ("tests/club-state.test.mjs", """import assert from "node:assert/strict";
import test from "node:test";
import { BOOKS, CLUB_SIZE, MEMBERS } from "../src/data/club-data.mjs";
import { createClubState } from "../src/state/club-state.mjs";

test("the sample roster contains exactly 24 distinct members", () => {
  assert.equal(CLUB_SIZE, 24);
  assert.equal(MEMBERS.length, 24);
  assert.equal(new Set(MEMBERS.map(member => member.id)).size, 24);
});

test("reading completion and meetup RSVP toggle independently", () => {
  const state = createClubState();
  assert.equal(state.isFinished(BOOKS[0].id), false);
  assert.equal(state.toggleFinished(BOOKS[0].id), true);
  assert.equal(state.finishedCount(), 1);
  assert.equal(state.hasRsvp(), false);
  assert.equal(state.toggleRsvp(), true);
  assert.equal(state.isFinished(BOOKS[0].id), true);
});
"""),
            ("README.md", """# Reading Club

A static, browser-only workspace for a 24-member reading club. The book search, reading completion toggles, and meetup RSVP are local preview interactions; no accounts, invitations, or external messages are created.

Run the dependency-free checks with `node --test tests/club-state.test.mjs`.
"""),
        ]
        replacement_title = requested_reading_club_book_title(c)
        if replacement_title:
            additional_files = [
                (file_path, content.replace("The Quiet Atlas", replacement_title) if file_path == "src/data/club-data.mjs" else content)
                for file_path, content in additional_files
            ]
    elif profile.key == "tool-lending":
        existing_tools_source_path = Path(c.workspace_root) / "src" / "data" / "tools.mjs"
        existing_tool_additions: list[dict[str, str | bool]] = []
        if existing_tools_source_path.is_file():
            existing_tools_source = read_project_file(c, t, "src/data/tools.mjs")
            existing_addition_matches = list(re.finditer(r"\{[^{}]*\"id\"\s*:\s*\"requested-[^{}]*\}", existing_tools_source))
            if existing_tools_source.count('"id": "requested-') != len(existing_addition_matches):
                raise ValueError("EXISTING_TOOL_ADDITION_INVALID")
            for match in existing_addition_matches:
                addition = json.loads(match.group(0))
                if not isinstance(addition, dict) or not isinstance(addition.get("id"), str) or not addition["id"].startswith("requested-"):
                    raise ValueError("EXISTING_TOOL_ADDITION_INVALID")
                existing_tool_additions.append(addition)
        requested_tools = requested_tool_lending_additions(c)
        additions_by_id = {str(tool["id"]): tool for tool in existing_tool_additions}
        additions_by_id.update({str(tool["id"]): tool for tool in requested_tools})
        tool_additions = list(additions_by_id.values())
        content = """<section id="content" class="profile-grid tool-lending-grid" aria-label="Neighborhood tool library">
  <article id="primary-section" class="request-card primary-card tool-library-panel">
    <p class="card-kicker">Community tool library</p>
    <h2>Find the right tool for the job</h2>
    <p>Browse fictional neighborhood listings, check availability, and send a local loan request.</p>
    <div class="tool-controls">
      <label for="tool-search">Search tools<input id="tool-search" type="search" autocomplete="off" placeholder="Try drill or garden"></label>
      <label for="tool-category">Category<select id="tool-category"><option value="all">All categories</option><option value="garden">Garden</option><option value="power">Power tools</option><option value="repair">Repair</option></select></label>
      <label for="tool-availability">Availability<select id="tool-availability"><option value="all">Any availability</option><option value="available">Available now</option><option value="unavailable">Not available</option></select></label>
    </div>
    <p id="tool-result-count" class="tool-result-count" role="status" aria-live="polite"></p>
    <div id="tool-list" class="tool-grid" aria-label="Tool listings"></div>
    <p id="tool-empty-state" class="tool-empty-state" hidden>No tools match those filters. Try a different search.</p>
  </article>
  <aside class="request-card tool-request-panel" aria-labelledby="loan-title">
    <p class="card-kicker">Kept local</p>
    <h2 id="loan-title">Your loan requests</h2>
    <p>Requests are saved only in this page preview. A neighbor has not been contacted and pickup is not confirmed.</p>
    <ul id="loan-list" class="loan-list" aria-live="polite"><li>No requests yet.</li></ul>
    <p id="loan-status" class="tool-status" role="status" aria-live="polite">Choose an available tool to prepare a request.</p>
  </aside>
</section>"""
        scripts = '<script type="module" src="app.js"></script>'
        app_content = "\n".join((
            "import { TOOLS } from './src/data/tools.mjs';",
            "import { createToolLibraryState } from './src/state/tool-library.mjs';",
            "import { renderToolLibrary } from './src/pages/tool-library.mjs';",
            "document.documentElement.dataset.buildProfile = 'tool-lending';",
            "const content = document.querySelector('#content');",
            "if (content) content.dataset.ready = 'true';",
            "if (content) renderToolLibrary(content, { tools: TOOLS, state: createToolLibraryState(TOOLS) });",
            "",
        ))
        tools_source = """export const TOOLS = [
  { id: "drill-01", name: "Cordless drill", category: "power", categoryLabel: "Power tools", description: "A compact drill for shelves and small home projects.", owner: "Maple Street Tool Shelf", pickup: "Maple Street porch box", available: true },
  { id: "pruner-02", name: "Garden pruners", category: "garden", categoryLabel: "Garden", description: "Clean bypass pruners for seasonal trimming.", owner: "North Garden Neighbors", pickup: "North Garden gate", available: true },
  { id: "level-03", name: "Spirit level", category: "repair", categoryLabel: "Repair", description: "A 60 cm level for hanging frames and aligning shelves.", owner: "Cedar Block Workshop", pickup: "Cedar Block entry shelf", available: true },
  { id: "sander-04", name: "Orbital sander", category: "power", categoryLabel: "Power tools", description: "A palm sander for small furniture refreshes.", owner: "Juniper Lane Makers", pickup: "Juniper Lane shared shed", available: false },
  { id: "spade-05", name: "Border spade", category: "garden", categoryLabel: "Garden", description: "A sturdy spade for planting and edging beds.", owner: "North Garden Neighbors", pickup: "North Garden gate", available: true },
  { id: "wrench-06", name: "Adjustable wrench set", category: "repair", categoryLabel: "Repair", description: "Three everyday sizes for light household repairs.", owner: "Cedar Block Workshop", pickup: "Cedar Block entry shelf", available: true },
  { id: "saw-07", name: "Hand saw", category: "repair", categoryLabel: "Repair", description: "A versatile saw for small timber and garden projects.", owner: "Maple Street Tool Shelf", pickup: "Maple Street porch box", available: false },
  { id: "hose-08", name: "Garden hose", category: "garden", categoryLabel: "Garden", description: "A flexible 15 metre hose with adjustable spray nozzle.", owner: "Willow Courtyard", pickup: "Willow Courtyard shed", available: true },
];
"""
        if tool_additions:
            serialized_tools = "".join(f"  {json.dumps(tool, ensure_ascii=False)},\n" for tool in tool_additions)
            tools_source = tools_source.replace("];\n", f"{serialized_tools}];\n", 1)
        tool_test_additions = ""
        if tool_additions:
            tool_test_additions = "".join(
                f"""
test("requested {tool["name"]} addition is searchable and available", () => {{
  const state = createToolLibraryState(TOOLS);
  state.setSearch({json.dumps(str(tool["name"]).lower())});
  state.setAvailability("available");
  assert.deepEqual(state.visibleTools().map(item => item.id), [{json.dumps(tool["id"])}]);
}});
"""
                for tool in tool_additions
            )
        additional_files = [
            ("src/data/tools.mjs", tools_source),
            ("src/state/tool-library.mjs", """export function createToolLibraryState(tools) {
  const knownTools = new Map(tools.map(tool => [tool.id, tool]));
  const requested = new Set();
  let search = "";
  let category = "all";
  let availability = "all";
  return {
    setSearch(value) { search = String(value || "").trim().toLowerCase(); },
    setCategory(value) { category = value || "all"; },
    setAvailability(value) { availability = value || "all"; },
    visibleTools() {
      return tools.filter(tool =>
        (!search || `${tool.name} ${tool.description} ${tool.owner}`.toLowerCase().includes(search)) &&
        (category === "all" || tool.category === category) &&
        (availability === "all" || (availability === "available") === tool.available)
      );
    },
    requestLoan(toolId) {
      const tool = knownTools.get(toolId);
      if (!tool || !tool.available || requested.has(toolId)) return false;
      requested.add(toolId);
      return true;
    },
    requestedTools() { return [...requested].map(id => knownTools.get(id)); },
    isRequested(toolId) { return requested.has(toolId); },
  };
}
"""),
            ("src/components/tool-card.mjs", """export function createToolCard(tool, { requested, onRequest }) {
  const card = document.createElement("article");
  card.className = "tool-card";
  const category = document.createElement("p");
  category.className = "tool-category";
  category.textContent = tool.categoryLabel;
  const title = document.createElement("h3");
  title.textContent = tool.name;
  const description = document.createElement("p");
  description.textContent = tool.description;
  const details = document.createElement("dl");
  details.className = "tool-details";
  for (const [label, value] of [["Listed by", tool.owner], ["Pickup area", tool.pickup]]) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    details.append(term, detail);
  }
  const availability = document.createElement("p");
  availability.className = `tool-availability ${tool.available ? "is-available" : "is-unavailable"}`;
  availability.textContent = tool.available ? "Available to request" : "Currently on loan";
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = !tool.available || requested;
  button.textContent = requested ? "Request prepared" : tool.available ? "Request a loan" : "Not available";
  button.addEventListener("click", () => onRequest(tool));
  card.append(category, title, description, details, availability, button);
  return card;
}
"""),
            ("src/pages/tool-library.mjs", """import { createToolCard } from "../components/tool-card.mjs";

export function renderToolLibrary(root, { tools, state }) {
  const list = root.querySelector("#tool-list");
  const search = root.querySelector("#tool-search");
  const category = root.querySelector("#tool-category");
  const availability = root.querySelector("#tool-availability");
  const count = root.querySelector("#tool-result-count");
  const empty = root.querySelector("#tool-empty-state");
  const requests = root.querySelector("#loan-list");
  const status = root.querySelector("#loan-status");
  if (!list || !search || !category || !availability || !count || !empty || !requests || !status) return;
  const render = () => {
    const visible = state.visibleTools();
    list.replaceChildren(...visible.map(tool => createToolCard(tool, {
      requested: state.isRequested(tool.id),
      onRequest: selected => {
        if (!state.requestLoan(selected.id)) return;
        status.textContent = `Request prepared for ${selected.name}. It stays in this preview; contact and pickup are not confirmed.`;
        render();
      },
    })));
    count.textContent = `${visible.length} ${visible.length === 1 ? "tool" : "tools"} found`;
    empty.hidden = visible.length > 0;
    const requested = state.requestedTools();
    requests.replaceChildren(...(requested.length
      ? requested.map(tool => {
          const item = document.createElement("li");
          item.textContent = `${tool.name} · request prepared locally`;
          return item;
        })
      : [Object.assign(document.createElement("li"), { textContent: "No requests yet." })]));
  };
  search.addEventListener("input", () => { state.setSearch(search.value); render(); });
  category.addEventListener("change", () => { state.setCategory(category.value); render(); });
  availability.addEventListener("change", () => { state.setAvailability(availability.value); render(); });
  render();
}
"""),
            ("tests/tool-library.test.mjs", """import assert from "node:assert/strict";
import test from "node:test";
import { TOOLS } from "../src/data/tools.mjs";
import { createToolLibraryState } from "../src/state/tool-library.mjs";

test("availability and category filters narrow the fictional listings", () => {
  const state = createToolLibraryState(TOOLS);
  state.setAvailability("available");
  state.setCategory("garden");
  assert.deepEqual(state.visibleTools().map(tool => tool.id), ["pruner-02", "spade-05", "hose-08"]);
});

test("search covers tool names, descriptions, and listing owners", () => {
  const state = createToolLibraryState(TOOLS);
  state.setSearch("cedar block");
  assert.deepEqual(state.visibleTools().map(tool => tool.id), ["level-03", "wrench-06"]);
});

test("loan requests are local, available-only, and cannot be duplicated", () => {
  const state = createToolLibraryState(TOOLS);
  assert.equal(state.requestLoan("drill-01"), true);
  assert.equal(state.requestLoan("drill-01"), false);
  assert.equal(state.requestLoan("sander-04"), false);
  assert.equal(state.requestLoan("unknown-tool"), false);
  assert.deepEqual(state.requestedTools().map(tool => tool.id), ["drill-01"]);
});
""" + tool_test_additions),
            ("README.md", """# Borrow Better, Together

A responsive, browser-only neighborhood tool library with fictional listings, search and availability filters, and local loan-request preparation. Requests are not sent to neighbors, and pickup is never claimed as confirmed.

Run the dependency-free state checks with `node --test tests/tool-library.test.mjs`.
"""),
        ]
    elif profile.key == "cafe":
        content = """<section id="content" class="cafe-content" aria-label="Café menu and visit information">
  <section class="audience-grid" id="audience-groups" aria-label="Who Cedar & Steam serves">
    <article><span>01</span><h2>Walk-in guests</h2><p>Find a seat, see what's fresh, and enjoy a neighborhood coffee break.</p></article>
    <article><span>02</span><h2>Takeout customers</h2><p>Build a pickup order from the sample menu and review it before confirming.</p></article>
    <article><span>03</span><h2>Café staff</h2><p>Use the menu and order summary as a clear front-counter reference.</p></article>
  </section>
  <div class="cafe-workspace">
    <section class="request-card cafe-menu-panel" id="primary-section" aria-labelledby="menu-title">
      <div class="section-heading"><div><p class="card-kicker">Sample menu · prices in USD</p><h2 id="menu-title">Made for the moment</h2></div></div>
      <p class="menu-note">Menu items and prices are sample content to review before launch.</p>
      <div id="menu-items" class="cafe-menu-grid" aria-live="polite"></div>
    </section>
    <aside class="request-card cafe-order-panel" aria-labelledby="order-title">
      <p class="card-kicker">Pickup order</p><h2 id="order-title">Your order</h2>
      <div id="order-summary" aria-live="polite"></div>
      <div class="order-total"><span>Subtotal</span><strong id="order-subtotal">$0.00</strong></div>
      <button id="place-order" class="primary-action" type="button" disabled>Place pickup order</button>
      <p id="order-status" class="form-status" role="status" aria-live="polite">Choose an item to start a local pickup order.</p>
      <p class="order-disclosure">This preview keeps orders in this browser only. No payment or external order is sent.</p>
    </aside>
  </div>
  <section class="request-card cafe-visit-panel" id="visit-details" aria-labelledby="visit-title">
    <div><p class="card-kicker">Come by</p><h2 id="visit-title">A neighborhood stop</h2><p>Sample location: 125 Market Street, Your City. Replace this with the café's real address before launch.</p></div>
    <div><h3>Opening hours</h3><ul><li>Monday–Friday · 7:00 AM–5:00 PM</li><li>Saturday–Sunday · 8:00 AM–4:00 PM</li></ul></div>
  </section>
</section>"""
        scripts = '<script type="module" src="app.js"></script>'
        app_content = "\n".join((
        "import { renderCafePage } from './src/pages/cafe-page.mjs';",
        "document.documentElement.dataset.buildProfile = 'cafe';",
        "const content = document.querySelector('#content');",
        "if (content) { content.dataset.ready = 'true'; renderCafePage(content); }",
        "",
        ))
        additional_files = [
        ("src/data/cafe-menu.mjs", """export const MENU_ITEMS = [
  { id: "flat-white", name: "Honey Oat Flat White", category: "Coffee", description: "Double espresso, oat milk, and a little local honey.", price: 5.5 },
  { id: "cold-brew", name: "Slow Steep Cold Brew", category: "Coffee", description: "A smooth 18-hour steep served over ice.", price: 4.75 },
  { id: "pistachio-roll", name: "Pistachio Morning Roll", category: "Bakery", description: "Flaky pastry with toasted pistachio and citrus glaze.", price: 4.25 },
  { id: "tomato-toast", name: "Market Tomato Toast", category: "Kitchen", description: "Sourdough, whipped ricotta, herbs, and seasonal tomatoes.", price: 9.5 },
];
"""),
        ("src/state/order-state.mjs", """export function createOrderState(menuItems) {
  const availableItems = new Map(menuItems.map(item => [item.id, item]));
  const quantities = new Map();
  return {
    add(itemId) {
      if (!availableItems.has(itemId)) return false;
      quantities.set(itemId, (quantities.get(itemId) || 0) + 1);
      return true;
    },
    change(itemId, amount) {
      if (!availableItems.has(itemId) || !Number.isInteger(amount)) return false;
      const next = (quantities.get(itemId) || 0) + amount;
      if (next <= 0) quantities.delete(itemId);
      else quantities.set(itemId, next);
      return true;
    },
    lines() {
      return [...quantities].map(([id, quantity]) => ({ item: availableItems.get(id), quantity }));
    },
    count() {
      return [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0);
    },
    subtotal() {
      const total = this.lines().reduce((sum, line) => sum + line.item.price * line.quantity, 0);
      return Math.round((total + Number.EPSILON) * 100) / 100;
    },
    placeOrder() {
      if (quantities.size === 0) return null;
      return { items: this.lines(), subtotal: this.subtotal(), status: "local-preview" };
    },
  };
}
"""),
        ("src/components/menu-item.mjs", """export function createMenuItem(item) {
  const card = document.createElement("article");
  card.className = "cafe-menu-item";
  const category = document.createElement("p");
  category.className = "menu-category";
  category.textContent = item.category;
  const heading = document.createElement("h3");
  heading.textContent = item.name;
  const description = document.createElement("p");
  description.textContent = item.description;
  const footer = document.createElement("div");
  footer.className = "menu-item-footer";
  const price = document.createElement("strong");
  price.textContent = `$${item.price.toFixed(2)}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "menu-add-button";
  button.dataset.menuAction = "add";
  button.dataset.itemId = item.id;
  button.textContent = "Add to order";
  footer.append(price, button);
  card.append(category, heading, description, footer);
  return card;
}
"""),
        ("src/components/order-line.mjs", """export function createOrderLine(line) {
  const row = document.createElement("div");
  row.className = "order-line";
  const details = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = line.item.name;
  const amount = document.createElement("span");
  amount.textContent = `$${(line.item.price * line.quantity).toFixed(2)}`;
  details.append(name, amount);
  const controls = document.createElement("div");
  controls.className = "quantity-controls";
  for (const [action, label, text] of [["decrease", "Remove one", "−"], ["increase", "Add one", "+"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.orderAction = action;
    button.dataset.itemId = line.item.id;
    button.setAttribute("aria-label", `${label} ${line.item.name}`);
    button.textContent = text;
    controls.append(button);
  }
  const quantity = document.createElement("span");
  quantity.setAttribute("aria-label", "Quantity");
  quantity.textContent = String(line.quantity);
  controls.insertBefore(quantity, controls.lastChild);
  row.append(details, controls);
  return row;
}
"""),
        ("src/pages/cafe-page.mjs", """import { MENU_ITEMS } from "../data/cafe-menu.mjs";
import { createMenuItem } from "../components/menu-item.mjs";
import { createOrderLine } from "../components/order-line.mjs";
import { createOrderState } from "../state/order-state.mjs";

export function renderCafePage(root) {
  const menu = root.querySelector("#menu-items");
  const summary = root.querySelector("#order-summary");
  const subtotal = root.querySelector("#order-subtotal");
  const placeOrder = root.querySelector("#place-order");
  const status = root.querySelector("#order-status");
  if (!menu || !summary || !subtotal || !placeOrder || !status) return;
  const order = createOrderState(MENU_ITEMS);
  const renderOrder = () => {
    summary.replaceChildren(...order.lines().map(createOrderLine));
    subtotal.textContent = `$${order.subtotal().toFixed(2)}`;
    placeOrder.disabled = order.count() === 0;
  };
  menu.replaceChildren(...MENU_ITEMS.map(createMenuItem));
  menu.addEventListener("click", event => {
    const button = event.target.closest("[data-menu-action='add']");
    if (!button || !order.add(button.dataset.itemId)) return;
    status.textContent = "Added to your pickup order.";
    renderOrder();
  });
  summary.addEventListener("click", event => {
    const button = event.target.closest("[data-order-action]");
    if (!button) return;
    order.change(button.dataset.itemId, button.dataset.orderAction === "increase" ? 1 : -1);
    status.textContent = order.count() ? "Your pickup order was updated." : "Choose an item to start a local pickup order.";
    renderOrder();
  });
  placeOrder.addEventListener("click", () => {
    const placedOrder = order.placeOrder();
    status.textContent = placedOrder
      ? `Pickup order noted in this browser: ${placedOrder.items.length} menu item type${placedOrder.items.length === 1 ? "" : "s"}, subtotal $${placedOrder.subtotal.toFixed(2)}. No payment or external order was sent.`
      : "Choose at least one menu item before placing an order.";
  });
  renderOrder();
}
"""),
        ("tests/order-state.test.mjs", """import assert from "node:assert/strict";
import test from "node:test";
import { MENU_ITEMS } from "../src/data/cafe-menu.mjs";
import { createOrderState } from "../src/state/order-state.mjs";

test("pickup order tracks quantities, subtotal, and a local confirmation", () => {
  const order = createOrderState(MENU_ITEMS);
  assert.equal(order.placeOrder(), null);
  assert.equal(order.add("flat-white"), true);
  assert.equal(order.add("flat-white"), true);
  assert.equal(order.add("pistachio-roll"), true);
  assert.equal(order.count(), 3);
  assert.equal(order.subtotal(), 15.25);
  assert.equal(order.change("flat-white", -1), true);
  assert.equal(order.count(), 2);
  assert.equal(order.subtotal(), 9.75);
  assert.equal(order.placeOrder().status, "local-preview");
});

test("unknown menu items cannot be added to an order", () => {
  const order = createOrderState(MENU_ITEMS);
  assert.equal(order.add("unlisted-item"), false);
  assert.equal(order.count(), 0);
});
"""),
        ("README.md", """# Cedar & Steam Café Preview

A responsive, browser-only café site for walk-in guests, takeout customers, and café staff. The sample menu and pickup order are local preview data; the example address and hours must be replaced with the café's real details before launch. Orders are not sent and payments are not processed.

Run the dependency-free order-state checks with `node --test tests/order-state.test.mjs`.
"""),
        ]
    elif profile.key == "contact":
        content = "<section id=\"content\" class=\"profile-grid\" aria-label=\"Contact page content\"><article id=\"primary-section\" class=\"request-card primary-card\"><p class=\"card-kicker\">Contact</p><h2>Share your details</h2><p>Required fields are checked only in this browser. No message is sent from this page.</p><form id=\"contact-form\" class=\"contact-form\" novalidate><label for=\"contact-name\">Name</label><input id=\"contact-name\" name=\"name\" autocomplete=\"name\" required aria-describedby=\"contact-form-status\"><label for=\"contact-email\">Email</label><input id=\"contact-email\" name=\"email\" type=\"email\" autocomplete=\"email\" required aria-describedby=\"contact-form-status\"><label for=\"contact-message\">Message</label><textarea id=\"contact-message\" name=\"message\" rows=\"5\" required aria-describedby=\"contact-form-status\"></textarea><button class=\"primary-action\" type=\"submit\">Check form</button><p id=\"contact-form-status\" class=\"form-status\" role=\"status\" aria-live=\"polite\"></p></form></article><article class=\"request-card secondary-card\"><h2>What happens next</h2><p>Message delivery is not configured. This local form does not contact a server or external service.</p></article></section>"
        scripts = "<script src=\"form-validation.js\"></script><script src=\"app.js\"></script>"
        app_content = "\n".join((
            "document.documentElement.dataset.buildProfile = 'contact';",
            "const content = document.querySelector('#content');",
            "if (content) content.dataset.ready = 'true';",
            "const form = document.querySelector('#contact-form');",
            "const status = document.querySelector('#contact-form-status');",
            "if (form && status) form.addEventListener('submit', event => {",
            "  event.preventDefault();",
            "  const validator = window.SmartBuildFormValidation;",
            "  const name = form.elements.namedItem('name');",
            "  const email = form.elements.namedItem('email');",
            "  const message = form.elements.namedItem('message');",
            "  const valid = Boolean(validator && validator.required(name?.value) && validator.email(email?.value) && validator.required(message?.value));",
            "  [name, email, message].forEach(field => field?.setAttribute('aria-invalid', String(!valid)));",
            "  status.textContent = valid ? 'Form checks passed. Message delivery is not configured.' : 'Add a name, a valid email, and a message before continuing.';",
            "});",
            "",
        ))
    elif profile.key == "storefront":
        content = "<section id=\"content\" class=\"profile-grid storefront-grid\" aria-label=\"Storefront content\"><article id=\"primary-section\" class=\"request-card primary-card\"><p class=\"card-kicker\">Storefront collection</p><h2>Explore the collection</h2><p>Products are presented locally for review. Checkout and payment processing are not configured.</p><div class=\"item-list\"><article class=\"item-card\"><h3>Featured item</h3><p>Use this card to review the product presentation and content hierarchy.</p><button class=\"primary-action\" type=\"button\" data-local-action=\"Saved the featured item for this browser session\">Save item</button></article><article class=\"item-card\"><h3>Collection note</h3><p>Inventory, prices, and delivery availability are not connected to a provider.</p></article></div></article><article class=\"request-card secondary-card\"><h2>Commerce boundary</h2><p id=\"local-status\" role=\"status\" aria-live=\"polite\">Checkout remains unavailable until a real commerce integration is configured.</p></article></section>"
        scripts = "<script src=\"app.js\"></script>"
        app_content = "\n".join((
            "document.documentElement.dataset.buildProfile = 'storefront';",
            "const content = document.querySelector('#content');",
            "if (content) content.dataset.ready = 'true';",
            "const status = document.querySelector('#local-status');",
            "document.querySelectorAll('[data-local-action]').forEach(button => button.addEventListener('click', () => { if (status) status.textContent = `${button.dataset.localAction}. Checkout is not configured.`; }));",
            "",
        ))
    elif profile.key == "dashboard":
        content = "<section id=\"content\" class=\"profile-grid dashboard-grid\" aria-label=\"Dashboard content\"><article id=\"primary-section\" class=\"request-card primary-card\"><p class=\"card-kicker\">Workspace overview</p><h2>Review the current workspace state</h2><p>This dashboard is a local interface structure. It does not report live metrics, accounts, or provider data.</p><div class=\"metric-grid\"><section class=\"metric-card\"><h3>Data sources</h3><p>Not connected</p></section><section class=\"metric-card\"><h3>Activity feed</h3><p>Not configured</p></section><section class=\"metric-card\"><h3>Automation</h3><p>Not enabled</p></section></div></article><article class=\"request-card secondary-card\"><h2>Local review</h2><p id=\"local-status\" role=\"status\" aria-live=\"polite\">No live analytics are shown.</p><button class=\"primary-action\" type=\"button\" data-local-action=\"Marked the local review as checked\">Mark reviewed</button></article></section>"
        scripts = "<script src=\"app.js\"></script>"
        app_content = "\n".join((
            "document.documentElement.dataset.buildProfile = 'dashboard';",
            "const content = document.querySelector('#content');",
            "if (content) content.dataset.ready = 'true';",
            "const status = document.querySelector('#local-status');",
            "document.querySelectorAll('[data-local-action]').forEach(button => button.addEventListener('click', () => { if (status) status.textContent = `${button.dataset.localAction}. No provider data was requested.`; }));",
            "",
        ))
    elif profile.key == "product":
        content = "<section id=\"content\" class=\"profile-grid product-grid\" aria-label=\"Product page content\"><article id=\"primary-section\" class=\"request-card primary-card\"><p class=\"card-kicker\">Product brief</p><h2>Understand the product before activation</h2><p>This page turns a product request into a focused, reviewable interface without claiming deployment, customer access, or integration success.</p><ul class=\"feature-list\"><li>Clear product purpose and primary workflow</li><li>Bounded interface scope for the current Build Run</li><li>Explicit integration and delivery boundaries</li></ul></article><article class=\"request-card secondary-card\"><h2>Readiness check</h2><p id=\"local-status\" role=\"status\" aria-live=\"polite\">No external service has been connected.</p><button class=\"primary-action\" type=\"button\" data-local-action=\"Recorded a local readiness review\">Review scope</button></article></section>"
        scripts = "<script src=\"app.js\"></script>"
        app_content = "\n".join((
            "document.documentElement.dataset.buildProfile = 'product';",
            "const content = document.querySelector('#content');",
            "if (content) content.dataset.ready = 'true';",
            "const status = document.querySelector('#local-status');",
            "document.querySelectorAll('[data-local-action]').forEach(button => button.addEventListener('click', () => { if (status) status.textContent = `${button.dataset.localAction}. No deployment was performed.`; }));",
            "",
        ))
    else:
        content = f"<section id=\"content\" class=\"profile-grid\" aria-label=\"Request-specific content\"><article id=\"primary-section\" class=\"request-card primary-card\"><p class=\"card-kicker\">{escape(profile.key)}</p><h2>{escape(profile.primary_section_title)}</h2><p>{escape(profile.primary_section_copy)}</p></article><article class=\"request-card secondary-card\"><h2>{escape(profile.secondary_section_title)}</h2><p>{escape(profile.secondary_section_copy)}</p></article></section>"
        scripts = "<script src=\"app.js\"></script>"
        app_content = f"document.documentElement.dataset.buildProfile = '{profile.key}';\nconst content = document.querySelector('#content');\nif (content) content.dataset.ready = 'true';\n"
    index = write_project_file(c, t, "index.html", f"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"smartbuild-project-identity\" content=\"{html_title}\"><meta name=\"smartbuild-build-scope\" content=\"{scope_marker}\"><title>{html_title}</title><link rel=\"icon\" href=\"data:,\"><link rel=\"stylesheet\" href=\"styles.css\"></head><body data-site-profile=\"{profile.key}\" data-product-category=\"{profile.product_category}\"><main class=\"site-shell\"><header class=\"hero\"><p class=\"eyebrow\">{escape(profile.eyebrow)}</p><h1 id=\"project-identity\" data-smartbuild-project-identity=\"visible\" data-smartbuild-build-scope=\"{scope_marker}\">{html_title}</h1><p id=\"project-summary\">{escape(profile.summary)}</p><a class=\"primary-action\" href=\"#primary-section\">{escape(profile.primary_action)}</a></header>{content}</main>{scripts}</body></html>\n")
    app = write_project_file(c, t, "app.js", app_content)
    additional_paths = [write_project_file(c, t, relative_path, file_content) for relative_path, file_content in additional_files]
    return agent_evidence(agent, c, t, responsibility="functional interface implementation", findings=(f"Created a visible {profile.key} page structure with scoped source files.",), changed_files=(index, app, *additional_paths))

def dynamic_data_connector(agent, c, t): return blocked(agent, c, t, "data integration", "DATA_PROVIDER_NOT_CONFIGURED")
def form_validation_master(agent, c, t):
    script = write_project_file(c, t, "form-validation.js", "window.SmartBuildFormValidation = Object.freeze({\n  required(value) { return String(value || '').trim().length > 0; },\n  email(value) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(value || '').trim()); },\n});\n")
    return agent_evidence(agent, c, t, responsibility="accessible local form validation", findings=("Added bounded client-side required-field and email validation without external submission.",), changed_files=(script,))
def interactive_animation_specialist(agent, c, t): return _e(agent, c, t, "interaction-motion review", "Motion remains opt-in and reduced-motion compatible.")
def no_fake_assurer(agent, c, t):
    """Inspect only source and agent_005 evidence available at this execution point.

    This is deliberately not a final release gate: the CSS writer and downstream
    reviewers may still run after it. It confirms a minimum durable implementation
    and rejects a small, explicit set of unsupported completion/network claims.
    """
    source_paths = ("index.html", "app.js")
    try:
        index, app = (read_project_file(c, t, path) for path in source_paths)
        evidence_path = f"evidence/agent-executions/{c.run_id}_agent_005.json"
        execution_evidence = json.loads(read_project_file(c, t, evidence_path))
    except (RuntimeError, json.JSONDecodeError, TypeError, ValueError):
        return blocked(agent, c, t, "anti-fabrication source inspection", "SCOPED_SOURCE_NOT_AVAILABLE")

    if (
        execution_evidence.get("agentId") != "agent_005"
        or execution_evidence.get("runId") != c.run_id
        or execution_evidence.get("projectId") != c.project_id
        or execution_evidence.get("conversationId") != c.conversation_id
        or execution_evidence.get("status") != TaskStatus.SUCCEEDED.value
        or not {"index.html", "app.js"}.issubset(set(execution_evidence.get("changedFiles", ())))
    ):
        return blocked(agent, c, t, "anti-fabrication source inspection", "AGENT_TASK_BLOCKED")

    required_source_markers = (
        '<meta name="smartbuild-build-scope"',
        'id="project-identity"',
        'data-smartbuild-project-identity="visible"',
    )
    forbidden_claim_markers = (
        "smartbuild verified starter",
        "all integrations are configured",
        "message sent successfully",
        "payment processed",
        "booking confirmed",
    )
    normalized_source = f"{index}\n{app}".casefold()
    if not all(marker in index for marker in required_source_markers) or "dataset.buildprofile" not in normalized_source:
        return blocked(agent, c, t, "anti-fabrication source inspection", "AGENT_TASK_BLOCKED")
    if any(marker in normalized_source for marker in forbidden_claim_markers):
        return blocked(agent, c, t, "anti-fabrication source inspection", "AGENT_TASK_BLOCKED")
    if "fetch(" in normalized_source or "xmlhttprequest" in normalized_source:
        return blocked(agent, c, t, "anti-fabrication source inspection", "AGENT_TASK_BLOCKED")

    return _e(
        agent,
        c,
        t,
        "anti-fabrication source inspection",
        "Verified required scoped source markers.",
        "Verified matching functional-agent execution evidence.",
        "No unsupported completion or direct-network claim was found in inspected source.",
    )
def google_design_trends_searcher(agent, c, t): return blocked(agent, c, t, "external design research", "EXTERNAL_RESEARCH_NOT_APPROVED")
def asset_icon_finder(agent, c, t): return blocked(agent, c, t, "licensed asset discovery", "EXTERNAL_ASSET_SOURCE_NOT_APPROVED")
def competitor_ui_scraper(agent, c, t): return blocked(agent, c, t, "authorized competitor analysis", "EXTERNAL_TARGET_NOT_APPROVED")
def color_palette_scout(agent, c, t): return _e(agent, c, t, "accessible palette analysis", "Contrast review recorded without external assets.")
def browser_automation_agent(agent, c, t): return blocked(agent, c, t, "preview browser check", "PREVIEW_URL_NOT_AVAILABLE")
def auto_google_operator(agent, c, t): return blocked(agent, c, t, "documentation search", "EXTERNAL_RESEARCH_NOT_APPROVED")
def gui_mouse_navigator(agent, c, t): return blocked(agent, c, t, "desktop automation", "WEB_ONLY_ARCHITECTURE")
def dom_inspector_scraper(agent, c, t): return blocked(agent, c, t, "DOM inspection", "PREVIEW_URL_NOT_AVAILABLE")
def system_environment_installer(agent, c, t): return blocked(agent, c, t, "environment installation", "INSTALLATION_NOT_APPROVED")
def terminal_tester(agent, c, t): return _e(agent, c, t, "bounded health-test plan", "No unbounded terminal command was run.")
def e2e_user_simulator(agent, c, t): return blocked(agent, c, t, "end-to-end journey simulation", "PREVIEW_URL_NOT_AVAILABLE")
def microservices_architect(agent, c, t): return _e(agent, c, t, "service-boundary analysis", "Architecture proposal remains scoped to current request.")
def db_schema_specialist(agent, c, t): return _e(agent, c, t, "schema contract design", "No database migration was applied from an agent task.")
def api_designer(agent, c, t): return _e(agent, c, t, "API contract design", "Endpoint contract requires server implementation approval.")
def security_architect(agent, c, t): return _e(agent, c, t, "security boundary review", "Secrets remain server-side and excluded from evidence.")
def performance_architect(agent, c, t): return _e(agent, c, t, "performance constraint review", "No unsupported scale claim was made.")
def cloud_infra_specialist(agent, c, t): return blocked(agent, c, t, "cloud deployment architecture", "DEPLOYMENT_CHANGE_NOT_APPROVED")
def event_driven_specialist(agent, c, t): return _e(agent, c, t, "event-flow design", "No background loop was created.")
def legacy_refactoring_agent(agent, c, t): return _e(agent, c, t, "behavior-preserving refactor review", "Historical workspace data remains untouched.")
def _review_source_files(c: BuildContext, t: TaskDefinition) -> tuple[str, str] | None:
    try:
        return read_project_file(c, t, "index.html"), read_project_file(c, t, "styles.css")
    except RuntimeError:
        return None


def accessibility_expert(agent, c, t):
    source_files = _review_source_files(c, t)
    if source_files is None:
        return blocked(agent, c, t, "accessibility source inspection", "SCOPED_SOURCE_NOT_AVAILABLE")
    index, _styles = source_files
    checks = (
        ("document language", "<html lang=" in index),
        ("viewport declaration", 'name="viewport"' in index),
        ("main landmark", "<main" in index),
        ("primary heading", "<h1" in index),
        ("named primary action", 'class="primary-action"' in index and ">" in index),
    )
    if not all(passed for _label, passed in checks):
        return blocked(agent, c, t, "accessibility source inspection", "ACCESSIBILITY_SOURCE_CHECK_FAILED")
    return _e(agent, c, t, "accessibility source inspection", *(f"Verified {label}." for label, _passed in checks))
def _requested_design_theme(request: str) -> str:
    normalized = request.casefold().replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي")
    palettes = {
        "blue": ("#2563eb", "#dbeafe"),
        "ازرق": ("#2563eb", "#dbeafe"),
        "green": ("#16815d", "#d1fae5"),
        "اخضر": ("#16815d", "#d1fae5"),
        "purple": ("#7c3aed", "#ede9fe"),
        "بنفسجي": ("#7c3aed", "#ede9fe"),
        "orange": ("#c2410c", "#ffedd5"),
        "برتقالي": ("#c2410c", "#ffedd5"),
        "red": ("#dc2626", "#fee2e2"),
        "احمر": ("#dc2626", "#fee2e2"),
    }
    selected_palette = next((
        value for name, value in palettes.items()
        if (re.search(r"\b" + re.escape(name) + r"\b", normalized) if name.isascii() else name in normalized)
    ), None)
    visual_request = any(
        term in normalized
        for term in ("color", "colour", "theme", "background", "palette", "لون", "الوان", "خلفيه", "ثيم", "خليه", "خليها")
    ) or bool(re.search(r"\b(?:make|turn|switch|change|set)\b.{0,32}\b(?:blue|green|purple|orange|red|light|dark)\b", normalized))
    if not visual_request:
        return ""

    accent, tint = selected_palette or ("#2563eb", "#dbeafe")
    is_dark = any(term in normalized for term in ("dark", "داكن", "غامق", "اسود"))
    is_light = any(term in normalized for term in ("light", "فاتح", "ابيض"))
    if is_dark:
        page, surface, text, muted, border = "#10131b", "#191f2b", "#eff3fa", "#bac4d2", "#31394a"
    else:
        page, surface, text, muted, border = "#f6f7fb", "#ffffff", "#172033", "#475569", "#d9e0ec"
    if is_dark and selected_palette is None:
        accent, tint = "#91a9ff", "#252d43"
    elif is_light and selected_palette is None:
        accent, tint = "#2563eb", "#dbeafe"
    return "\n".join((
        ":root{--smartbuild-page:" + page + ";--smartbuild-surface:" + surface + ";--smartbuild-text:" + text + ";--smartbuild-muted:" + muted + ";--smartbuild-accent:" + accent + ";--smartbuild-tint:" + tint + ";--smartbuild-border:" + border + ";}",
        "body{background:var(--smartbuild-page)!important;color:var(--smartbuild-text)!important}",
        ".hero,.request-card,.item-card,.metric-card,.tool-card,.book-card,.summary-card,.audience-grid article,.cafe-menu-item,.order-line{background:var(--smartbuild-surface)!important;border-color:var(--smartbuild-border)!important;color:var(--smartbuild-text)!important}",
        ".hero h1,.request-card h2,.request-card h3,.item-card h3,.metric-card h3,.tool-card h3,.book-title,.audience-grid h2,.hero p,.request-card p,.item-card p,.metric-card p,.tool-card p,.book-note,.book-author,.book-progress,.meeting-status,.feature-list,.menu-note,.order-disclosure{color:var(--smartbuild-text)!important}",
        ".eyebrow,.card-kicker,.tool-category,.tool-result-count,.tool-status,.form-status,.summary-value,.book-genre{color:var(--smartbuild-accent)!important}",
        ".primary-action,.tool-card button,.menu-add-button,.quantity-controls button,.book-action,.rsvp-action{background:var(--smartbuild-accent)!important;color:#fff!important}",
        ".tool-controls input,.tool-controls select,.contact-form input,.contact-form textarea,.book-search{background:var(--smartbuild-surface)!important;border-color:var(--smartbuild-border)!important;color:var(--smartbuild-text)!important}",
    ))


def animation_css_master(agent, c, t):
    profile = request_profile(c)
    theme = {
        "portfolio": ("#07111d", "#15365e", "#31527b", "#86d1ff", "#10243a", "1.5rem", "#163e62"),
        "tool-lending": ("#0c1714", "#24624a", "#365c4b", "#b8e0a4", "#17251f", "1rem", "#294736"),
        "restaurant": ("#1a0e0a", "#7c3e1d", "#8a512b", "#ffd49b", "#33170e", ".7rem", "#5b2917"),
        "cafe": ("#17150f", "#526245", "#8a7755", "#e2bc76", "#242117", "1rem", "#343b2a"),
        "storefront": ("#102017", "#1f6246", "#4c8a68", "#b9f0c8", "#173928", "1rem", "#21553b"),
        "dashboard": ("#10131d", "#363b74", "#6269a8", "#d3d4ff", "#1b2040", ".55rem", "#272e5c"),
        "product": ("#171125", "#633f8a", "#9b74c5", "#e2cfff", "#2a1c40", "1.25rem", "#43275f"),
        "contact": ("#071b20", "#176675", "#388b96", "#c0f3f0", "#10333a", ".9rem", "#164851"),
        "wellness": ("#f3efe6", "#b9c9b0", "#667b68", "#d98f62", "#fffaf1", "1.1rem", "#dce8d4"),
        "reading-club": ("#101914", "#24473b", "#446957", "#bcddaa", "#18271f", "1.25rem", "#264434"),
    }.get(profile.key, ("#07111d", "#15365e", "#31527b", "#86d1ff", "#10243a", "1.5rem", "#163e62"))
    background, glow, border, accent, card, radius, feature = theme
    generated_css = "\n".join((
        ":root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#eaf2ff;background:" + background + ";}",
        "*{box-sizing:border-box}",
        "body{margin:0;min-width:320px;background:radial-gradient(circle at top right," + glow + ",transparent 46%)," + background + ";}",
        ".site-shell{width:min(72rem,100%);margin:0 auto;padding:clamp(1.25rem,5vw,4.5rem)}",
        ".hero{padding:clamp(1.5rem,5vw,4rem);border:1px solid " + border + ";border-radius:" + radius + ";background:color-mix(in srgb," + background + " 80%,#fff 6%);box-shadow:0 1.5rem 5rem rgba(0,0,0,.25)}",
        ".eyebrow,.card-kicker{margin:0;color:" + accent + ";font-size:.78rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}",
        ".hero h1{max-width:16ch;margin:.6rem 0;font-size:clamp(2.25rem,7vw,5.5rem);line-height:.98}",
        ".hero p,.request-card p{max-width:50rem;color:#cbd8e8;font-size:1.1rem;line-height:1.6}",
        ".primary-action{display:inline-flex;margin-top:1rem;padding:.8rem 1rem;border-radius:999px;background:" + accent + ";color:" + background + ";font-weight:800;text-decoration:none}",
        ".profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.25rem;margin:1.25rem 0}",
        ".request-card{padding:1.5rem;border:1px solid " + border + ";border-radius:" + radius + ";background:" + card + "}",
        ".request-card h2{margin:.45rem 0}",
        ".item-list,.metric-grid{display:grid;gap:.8rem;margin-top:1.2rem}.item-list{grid-template-columns:repeat(2,minmax(0,1fr))}.item-card,.metric-card{padding:1rem;border:1px solid " + border + ";border-radius:calc(" + radius + " * .8);background:color-mix(in srgb," + background + " 68%,#fff 6%)}.item-card h3,.metric-card h3{margin:.1rem 0 .45rem}.item-card p,.metric-card p,.feature-list{color:#cbd8e8;line-height:1.55}.feature-list{padding-left:1.2rem}.feature-list li+li{margin-top:.5rem}",
        ".primary-card{grid-row:span 2;background:linear-gradient(145deg," + feature + "," + card + ")}",
        "body[data-site-profile=restaurant] .profile-grid{grid-template-columns:.85fr 1.15fr}",
        "body[data-site-profile=restaurant] .primary-card{grid-row:auto}",
        "body[data-site-profile=portfolio] .hero{min-height:22rem;display:grid;align-content:center}",
        "body[data-site-profile=storefront] .profile-grid{grid-template-columns:1.25fr .75fr}",
        "body[data-site-profile=dashboard] .hero{border-radius:.55rem}",
        "body[data-site-profile=contact] .profile-grid{grid-template-columns:1.2fr .8fr}",
        ".tool-lending-grid{grid-template-columns:minmax(0,1.55fr) minmax(17rem,.65fr)}.tool-controls{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:.75rem;margin:1.2rem 0}.tool-controls label{display:grid;gap:.4rem;color:#eaf2ff;font-size:.88rem;font-weight:700}.tool-controls input,.tool-controls select{width:100%;min-width:0;padding:.7rem;border:1px solid " + border + ";border-radius:.65rem;background:" + background + ";color:#eaf2ff;font:inherit}.tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.tool-card{display:grid;align-content:start;gap:.45rem;padding:1rem;border:1px solid " + border + ";border-radius:" + radius + ";background:color-mix(in srgb," + background + " 68%,#fff 6%)}.tool-card h3{margin:.1rem 0}.tool-card p{margin:.2rem 0;color:#cbd8e8;font-size:.95rem;line-height:1.5}.tool-category{color:" + accent + "!important;font-size:.75rem!important;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.tool-details{display:grid;grid-template-columns:auto 1fr;gap:.35rem .7rem;margin:.5rem 0;font-size:.84rem}.tool-details dt{color:#9fb2a8}.tool-details dd{margin:0;color:#eaf2ff}.tool-availability{font-weight:750}.tool-availability.is-available{color:" + accent + "!important}.tool-availability.is-unavailable{color:#f4b6a8!important}.tool-card button{justify-self:start;border:1px solid " + border + ";border-radius:999px;background:" + feature + ";color:#f5fff2;padding:.65rem .8rem;font:inherit;font-weight:750;cursor:pointer}.tool-card button:disabled{cursor:not-allowed;opacity:.58}.tool-result-count,.tool-status{color:" + accent + "!important;font-size:.92rem!important;font-weight:700}.tool-empty-state{padding:1rem;border:1px dashed " + border + ";border-radius:" + radius + ";color:#d6e3da}.loan-list{display:grid;gap:.6rem;padding-left:1.2rem;color:#eaf2ff;line-height:1.45}",
        ".contact-form{display:grid;gap:.65rem;margin-top:1.25rem}.contact-form label{font-weight:700}.contact-form input,.contact-form textarea{width:100%;padding:.75rem;border:1px solid " + border + ";border-radius:.55rem;background:" + background + ";color:#eaf2ff;font:inherit}.contact-form textarea{resize:vertical}.contact-form [aria-invalid=true]{border-color:#ff9d93}.form-status{min-height:1.5rem;margin:.4rem 0 0;color:" + accent + ";font-weight:650}",
        ".audience-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem;margin:1.1rem 0}.audience-grid article{padding:1rem;border:1px solid " + border + ";border-radius:" + radius + ";background:" + card + "}.audience-grid article>span,.menu-category{color:" + accent + ";font-size:.75rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.audience-grid h2{margin:.5rem 0;font-size:1.1rem}.audience-grid p,.menu-note,.order-disclosure{color:#cbd8e8;line-height:1.5}.cafe-workspace{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(17rem,.7fr);gap:1rem}.cafe-menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.cafe-menu-item,.order-line{padding:1rem;border:1px solid " + border + ";border-radius:" + radius + ";background:color-mix(in srgb," + background + " 68%,#fff 6%)}.cafe-menu-item h3{margin:.35rem 0}.cafe-menu-item>p:not(.menu-category){color:#cbd8e8;line-height:1.5}.menu-item-footer,.order-total,.order-line,.quantity-controls{display:flex;align-items:center;justify-content:space-between;gap:.7rem}.menu-item-footer{margin-top:1rem}.menu-add-button,.quantity-controls button{border:1px solid " + border + ";border-radius:999px;background:" + feature + ";color:#f7f1df;padding:.55rem .75rem;font:inherit;font-weight:750;cursor:pointer}.cafe-order-panel{align-self:start}.order-line{margin:.55rem 0}.order-line>div:first-child{display:grid;gap:.25rem}.order-line span{color:#cbd8e8}.order-total{margin-top:1rem;padding-top:.9rem;border-top:1px solid " + border + ";font-size:1.05rem}.cafe-visit-panel{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1rem}.cafe-visit-panel h2,.cafe-visit-panel h3{margin:.45rem 0}.cafe-visit-panel p,.cafe-visit-panel li{color:#cbd8e8;line-height:1.6}.cafe-visit-panel ul{padding-left:1.2rem}",
        ".club-dashboard{margin:1.25rem 0}.club-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin-bottom:1.25rem}.summary-card,.book-card{padding:1.1rem;border:1px solid " + border + ";border-radius:" + radius + ";background:" + card + "}.summary-value,.summary-label{display:block}.summary-value{font-size:1.5rem;font-weight:800;color:" + accent + "}.summary-label,.book-author,.book-progress,.roster-note,.meeting-status{color:#cbd8e8}.summary-label{margin-top:.3rem;font-size:.86rem}.club-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(16rem,.8fr);gap:1.1rem}.bookshelf-panel{grid-row:span 2}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem}.section-heading h2{margin:.35rem 0}.book-search-label{font-size:.85rem;font-weight:700}.book-search{width:100%;margin:.8rem 0 1rem;padding:.8rem 1rem;border:1px solid " + border + ";border-radius:.7rem;background:" + background + ";color:#eaf2ff;font:inherit}.book-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.book-genre{margin:0;color:" + accent + ";font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.book-title{margin:.55rem 0 .2rem;font-size:1.2rem}.book-author{margin:.2rem 0}.book-note{min-height:3.5rem;color:#cbd8e8;line-height:1.5}.book-progress{font-size:.85rem}.book-action,.rsvp-action{padding:.72rem .9rem;border:0;border-radius:999px;background:" + accent + ";color:" + background + ";font:inherit;font-weight:800;cursor:pointer}.book-action[aria-pressed=true]{background:transparent;color:" + accent + ";box-shadow:inset 0 0 0 1px " + border + "}.meeting-details{display:grid;gap:.75rem;padding:0;list-style:none;color:#dce8df}.meeting-details li{padding:.7rem;border-radius:.7rem;background:color-mix(in srgb," + background + " 60%,#fff 5%)}.meeting-status,.club-status{font-size:.9rem}.member-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem;padding:0;list-style:none}.member-chip{display:flex;align-items:center;gap:.55rem;min-width:0}.member-avatar{display:grid;width:2rem;height:2rem;flex:0 0 auto;place-items:center;border-radius:50%;background:" + feature + ";color:" + accent + ";font-size:.72rem;font-weight:800}.member-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.88rem}.empty-state{padding:1rem;color:#cbd8e8}",
        "@media (max-width:640px){.site-shell{padding:1rem}.hero{border-radius:1rem}.profile-grid{grid-template-columns:1fr!important}.primary-card{grid-row:auto}.item-list{grid-template-columns:1fr}}",
        "@media (max-width:760px){.club-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.club-layout{grid-template-columns:1fr}.bookshelf-panel{grid-row:auto}.book-grid{grid-template-columns:1fr}.section-heading{align-items:flex-start;flex-direction:column}}",
        "@media (max-width:760px){.audience-grid,.cafe-workspace,.cafe-visit-panel,.tool-lending-grid,.tool-controls,.tool-grid{grid-template-columns:1fr}.cafe-menu-grid{grid-template-columns:1fr}}",
        "@media (prefers-reduced-motion:no-preference){.hero,.request-card{animation:enter .32s cubic-bezier(.23,1,.32,1) both}@keyframes enter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}}",
        "",
    ))
    stylesheet_path = Path(c.workspace_root) / "styles.css"
    css_content = read_project_file(c, t, "styles.css") if stylesheet_path.is_file() else generated_css
    finish_marker = "/* SmartBuild responsive and accessibility finish */"
    if finish_marker not in css_content:
        css_content = "\n".join((
            css_content.rstrip(),
            finish_marker,
            "*,*::before,*::after{box-sizing:border-box}",
            "img,svg,video,canvas{max-width:100%;height:auto}",
            "button,input,select,textarea{max-width:100%;font:inherit}",
            ":focus-visible{outline:3px solid currentColor;outline-offset:3px}",
            "html[dir=rtl] body{text-align:right}",
            "html[dir=rtl] .feature-list,html[dir=rtl] .loan-list,html[dir=rtl] .audience-grid ul{padding-right:1.2rem;padding-left:0}",
            "@media (max-width:760px){.site-shell{width:100%}.profile-grid,.tool-lending-grid,.club-layout,.cafe-workspace,.cafe-visit-panel{grid-template-columns:minmax(0,1fr)}.tool-controls,.tool-grid,.cafe-menu-grid,.audience-grid{grid-template-columns:minmax(0,1fr)}.club-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}",
            "@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}",
            "",
        ))
    theme_override = _requested_design_theme(c.request)
    if theme_override:
        theme_marker = "/* SmartBuild requested theme */"
        if theme_marker in css_content:
            css_content = css_content.split(theme_marker, 1)[0].rstrip()
        css_content = css_content.rstrip() + "\n" + theme_marker + "\n" + theme_override + "\n"
    css = write_project_file(c, t, "styles.css", css_content)
    finding = f"Preserved and refined the existing stylesheet for the {profile.key} project." if stylesheet_path.is_file() else f"Created scoped {profile.key} stylesheet."
    if theme_override:
        finding += " Applied the requested color or theme direction."
    return agent_evidence(agent, c, t, responsibility="responsive CSS implementation", findings=(finding,), changed_files=(css,))
def state_management_agent(agent, c, t): return _e(agent, c, t, "state-flow design", "State remains local until a request requires persistence.")
def seo_specialist(agent, c, t): return _e(agent, c, t, "metadata inspection", "Document title is scoped to parsed project metadata.")
def responsive_designer(agent, c, t):
    source_files = _review_source_files(c, t)
    if source_files is None:
        return blocked(agent, c, t, "responsive source inspection", "SCOPED_SOURCE_NOT_AVAILABLE")
    index, styles = source_files
    checks = (
        ("viewport declaration", 'name="viewport"' in index),
        ("mobile media query", "@media (max-width:" in styles),
        ("small-screen minimum width", "min-width:320px" in styles),
        ("adaptive grid layout", ".profile-grid{display:grid" in styles),
    )
    if not all(passed for _label, passed in checks):
        return blocked(agent, c, t, "responsive source inspection", "RESPONSIVE_SOURCE_CHECK_FAILED")
    return _e(agent, c, t, "responsive source inspection", *(f"Verified {label}." for label, _passed in checks))
def internationalization_agent(agent, c, t): return _e(agent, c, t, "locale architecture review", "Translation content requires explicit locale requirements.")
def component_library_manager(agent, c, t): return _e(agent, c, t, "component reuse review", "No unrequested component library was installed.")
def web_vitals_agent(agent, c, t): return _e(agent, c, t, "web-vitals inspection", "Measurement requires a live preview and is not fabricated.")
def auth_permissions_agent(agent, c, t): return _e(agent, c, t, "auth and authorization review", "No user identity or session value was written to artifacts.")
def payment_gateway_agent(agent, c, t): return blocked(agent, c, t, "payment provider integration", "PAYMENT_PROVIDER_NOT_CONFIGURED")
def query_optimizer(agent, c, t): return _e(agent, c, t, "query-shape review", "No database query was optimized without a scoped schema.")
def websockets_agent(agent, c, t): return blocked(agent, c, t, "real-time integration", "REALTIME_PROVIDER_NOT_CONFIGURED")
def caching_specialist(agent, c, t): return _e(agent, c, t, "cache-policy review", "No shared cache was enabled without invalidation rules.")
def background_jobs_agent(agent, c, t): return blocked(agent, c, t, "background job design", "SCHEDULED_EXECUTION_NOT_APPROVED")
def email_notification_specialist(agent, c, t): return blocked(agent, c, t, "email delivery integration", "EMAIL_PROVIDER_NOT_CONFIGURED")
def third_party_integrator(agent, c, t): return blocked(agent, c, t, "third-party integration", "EXTERNAL_PROVIDER_NOT_CONFIGURED")
def unit_test_specialist(agent, c, t): return _e(agent, c, t, "unit-test plan", "Test evidence must execute against scoped source before verification.")
def e2e_test_agent(agent, c, t): return blocked(agent, c, t, "browser test implementation", "PREVIEW_URL_NOT_AVAILABLE")
def penetration_tester(agent, c, t): return blocked(agent, c, t, "authorized security testing", "SECURITY_TEST_SCOPE_NOT_APPROVED")
def load_tester(agent, c, t): return blocked(agent, c, t, "bounded load testing", "LOAD_TEST_SCOPE_NOT_APPROVED")
def edge_case_finder(agent, c, t): return _e(agent, c, t, "edge-case review", "Validation boundaries were documented as evidence.")
def code_smells_inspector(agent, c, t): return _e(agent, c, t, "maintainability inspection", "No code quality claim was inferred from a plan event.")
def api_regression_tester(agent, c, t): return blocked(agent, c, t, "API regression check", "API_PREVIEW_NOT_AVAILABLE")
def mutation_tester(agent, c, t): return blocked(agent, c, t, "mutation-testing plan", "MUTATION_TOOL_NOT_CONFIGURED")
def docker_master(agent, c, t): return blocked(agent, c, t, "container configuration", "CONTAINER_DEPLOYMENT_NOT_APPROVED")
def ci_cd_pipeline_agent(agent, c, t): return blocked(agent, c, t, "CI pipeline configuration", "CI_PROVIDER_NOT_CONFIGURED")
def infrastructure_as_code_agent(agent, c, t): return blocked(agent, c, t, "infrastructure code", "INFRASTRUCTURE_PROVIDER_NOT_CONFIGURED")
def monitoring_agent(agent, c, t): return blocked(agent, c, t, "monitoring integration", "MONITORING_PROVIDER_NOT_CONFIGURED")
def kubernetes_agent(agent, c, t): return blocked(agent, c, t, "Kubernetes configuration", "KUBERNETES_TARGET_NOT_CONFIGURED")
def dns_ssl_agent(agent, c, t): return blocked(agent, c, t, "DNS and TLS configuration", "DOMAIN_PROVIDER_NOT_CONFIGURED")
def vector_database_agent(agent, c, t): return blocked(agent, c, t, "vector-store integration", "VECTOR_PROVIDER_NOT_CONFIGURED")
def etl_pipeline_agent(agent, c, t): return blocked(agent, c, t, "ETL pipeline design", "DATA_SOURCE_NOT_CONFIGURED")
def search_index_agent(agent, c, t): return blocked(agent, c, t, "search-index integration", "SEARCH_PROVIDER_NOT_CONFIGURED")
def model_fine_tuner(agent, c, t): return blocked(agent, c, t, "model fine-tuning preparation", "MODEL_TRAINING_NOT_CONFIGURED")
def analytics_specialist(agent, c, t): return blocked(agent, c, t, "analytics integration", "ANALYTICS_NOT_APPROVED")
def scraper_agent(agent, c, t): return blocked(agent, c, t, "authorized data collection", "SCRAPE_TARGET_NOT_APPROVED")
def tech_spec_writer(agent, c, t):
    readme = write_project_file(c, t, "README.md", f"# {request_title(c)}\n\nThis request-scoped workspace was authored by selected agents.\n")
    return agent_evidence(agent, c, t, responsibility="technical documentation", findings=("Created request-scoped README.",), changed_files=(readme,))
def cost_token_optimizer(agent, c, t): return _e(agent, c, t, "cost-bound review", "No provider usage estimate was fabricated.")
def privacy_inspector(agent, c, t): return _e(agent, c, t, "privacy inspection", "Evidence contains no request secrets or session values.")
def dependency_auditor(agent, c, t): return _e(agent, c, t, "dependency-risk review", "No dependency was installed by this inspection.")
def changelog_agent(agent, c, t): return _e(agent, c, t, "release-note preparation", "Release notes await verified changed-file evidence.")
def prompt_engineer(agent, c, t): return _e(agent, c, t, "prompt-evaluation review", "Prompt content was not copied into generated HTML.")
