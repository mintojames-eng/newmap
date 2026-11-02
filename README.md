# MapFlow — Focused Destination & Route Assistant

> **This project is a focused UX improvement prototype for a selected OpenStreetMap workflow. It does not attempt to reproduce the complete OpenStreetMap platform.**

---

## 1. Project Title

**MapFlow — Focused Destination & Route Assistant**

## 2. Benchmark

[OpenStreetMap](https://www.openstreetmap.org)

## 3. Target Users

- University students
- First-time map users
- Users who need to find a specific destination and obtain directions

## 4. Selected Workflow

```
Search Destination → Identify Correct Destination → Select Destination → Get Directions → View Route
```

**Example task:** "Find Christ University and obtain directions to the destination."

## 5. Benchmark Observations

Based on visual inspection of the OpenStreetMap interface:

**Observation 1:** Searching for a destination can return multiple similarly named or related places (e.g., "Christ University", "Christ University Bus Stop", "Christ University Library"). All results appear with equal visual weight and long comma-separated addresses. This requires the user to distinguish the intended destination from other results.

**Observation 2:** The next action toward route planning is represented through a compact icon-based control rather than a clear text-labelled action such as "Get Directions". The purpose of this control may not be immediately apparent to first-time users.

> **Note:** These are benchmark interface observations. No user-study statistics are claimed.

## 6. Problem Definition

Users searching for a specific destination may need to distinguish the intended location from several similarly named search results containing lengthy information. After identifying the destination, the next action toward route planning may not be immediately explicit because of compact/icon-based controls. This can potentially increase the effort required to identify the correct destination and proceed to route planning.

## 7. Evidence

Screenshots of the OpenStreetMap benchmark were captured during the analysis phase, showing:
- Search results with equal visual weight
- Raw entity metadata (Way ID, Tags, Nodes) displayed after clicking a result
- Icon-only controls for directions

## 8. Proposed Solution

Improve the workflow by:
1. **Prioritizing search results** — The intended destination appears as "Best Match" above related places
2. **Adding explicit selection** — Clear "Select" button on each result card
3. **Destination confirmation** — Confirmation panel with category, address, and clear CTAs
4. **Text-labelled CTA** — Explicit "Get Directions" button replaces icon-only control
5. **Validated route form** — From/To fields with inline validation and travel mode selector
6. **Route summary** — Clear display of distance, time, and mode

## 9. Functional Improvements

| # | Improvement | Benchmark Problem Addressed |
|---|-------------|----------------------------|
| 1 | Live search filtering from JSON data | Reduces effort to find destination among many results |
| 2 | Primary result visually prioritized | Helps user identify the intended destination immediately |
| 3 | "Select Destination" button | Makes selection explicit rather than implicit |
| 4 | Destination confirmation card | Provides clear feedback that the correct place was selected |
| 5 | "Get Directions" text-labelled CTA | Eliminates guesswork about the next action |
| 6 | Validated route form with inline errors | Prevents incomplete submissions |
| 7 | Travel mode selector with dynamic updates | Makes route options interactive |
| 8 | Route summary with mock data | Provides clear route information |

## 10. JavaScript Events

| Event | Element | Purpose |
|-------|---------|---------|
| `input` | Search field | Dynamically filters destination data from JSON as the user types |
| `click` | Select / Get Directions / Change / Reset buttons | Manages workflow state transitions and UI updates |
| `submit` | Route form | Validates from-location, destination, and travel mode with inline errors |
| `change` | Travel mode buttons | Updates route estimates (distance/time) when mode changes |

## 11. Fetch API + JSON Handling

- Destination data is stored in `data/places.json` (not hardcoded in JS)
- Loaded via `fetch("data/places.json")` on page load
- Parsed using `response.json()`
- Filtered using `Array.filter()`, sorted by relevance
- **Loading state:** "Loading destinations..." spinner shown during fetch
- **Error handling:** Error message with "Retry" button on fetch failure
- **Empty state:** "No destinations found" shown when search has no matches

## 12. Validation

The route form validates:
- **From location** — Must not be empty
- **Destination** — Must be selected before planning
- **Travel mode** — Must be selected (Walking / Driving / Cycling)

Inline error messages appear next to the invalid field (not browser `alert()`).

## 13. Error Handling

- Fetch failure: Visible error card with "Retry" button
- Missing form fields: Inline `⚠` error messages
- Toast notifications for errors: "Please fill in all required fields"

## 14. Loading State

A spinner with "Loading destinations..." text is displayed while fetching JSON. It is removed once data loads successfully.

## 15. Empty State

If a search query matches no destinations (e.g., "XYZ University"), a clear empty state message is shown: "No destinations found. Try another search term."

## 16. Responsive Design

| Breakpoint | Layout |
|------------|--------|
| Desktop (lg+) | Side-by-side: sidebar panel + map |
| Tablet (md) | Adaptive layout |
| Mobile (<md) | Stacked vertically, full-width controls |

Built with Tailwind CSS responsive utilities (`sm:`, `md:`, `lg:`).

Semantic HTML: `header`, `main`, `aside`, `section`, `form`, `label`, `input`, `button`, `footer`.

## 17. Testing Methodology

**Self-observation task walkthrough** (individual project — no participants invented).

**Task:** "Find Christ University and obtain a route."

**Metrics recorded:**

| Metric | Benchmark (OSM) | Improved (MapFlow) |
|--------|-----------------|-------------------|
| Task completion time | [enter actual value] | [enter actual value] |
| Number of interactions | [enter actual value] | [enter actual value] |
| Task completed | [Yes/No] | [Yes/No] |
| Errors encountered | [enter actual value] | [enter actual value] |
| Observed difficulty | [describe] | [describe] |

> Values should be filled with actual measurements, not invented data.

## 18. Before / After Comparison

| Step | Benchmark (OpenStreetMap) | Improved (MapFlow) |
|------|--------------------------|-------------------|
| 1 | Type destination in search bar | Type destination → live filtered results from JSON |
| 2 | Multiple results with equal visual weight | Primary destination visually prioritized |
| 3 | User must distinguish the intended destination | Clear "Select" button on each result |
| 4 | Clicking a result shows raw entity metadata | Destination confirmation card |
| 5 | Route action via compact icon-only button | Explicit "Get Directions" text-labelled CTA |
| 6 | User must infer how to proceed | Validated route form → travel mode → route summary |

## 19. Limitations

- This is a **prototype**. It does not implement a complete routing engine.
- Route values (distance, time) use **mock/illustrative data**.
- Map tiles are from OpenStreetMap; the route line is simulated.
- Destination data is a small sample dataset, not a comprehensive database.
- Evaluation is based on **self-observation/task walkthrough** rather than a large user study.
- Findings should **not be generalised** to all OpenStreetMap users.

## 20. Technology Stack

- **HTML5** — Semantic structure
- **Tailwind CSS** — Via CDN (academic prototype setup)
- **Vanilla JavaScript** — No frameworks
- **Leaflet.js** — Lightweight map with OSM tiles
- **Fetch API** — JSON data loading
- **Google Fonts (Inter)** — Typography

## Project Structure

```
mapflow/
├── index.html          # Main application page
├── README.md           # Project documentation
├── data/
│   └── places.json     # Destination data (loaded via Fetch API)
└── src/
    ├── style.css       # Custom CSS (toast, spinner, cards)
    └── script.js       # Application JavaScript
```

## Deployment

This is a static HTML/CSS/JS project. To run locally:

```bash
# Option 1: Using http-server
npx http-server ./ -p 8080

# Option 2: Using Python
python -m http.server 8080

# Option 3: Using VS Code Live Server extension
```

Then open `http://localhost:8080` in a browser.

The project is suitable for **GitHub Pages** deployment (static files only).
