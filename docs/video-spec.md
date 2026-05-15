# Palmetto ZBB Suite 2.0 — Video Tutorial Spec
**SC General Assembly · FY 2025–2026**

---

## Overview

| Field | Detail |
|---|---|
| **Target runtime** | 7–9 minutes (full walkthrough) or 3 × 2–3 min chapters (modular) |
| **Format** | Screen recording with voiceover; no webcam required |
| **Audience** | Legislative staff, fiscal analysts, policy team members new to the tool |
| **Tone** | Professional but plain-spoken — government employee, not tech tutorial |
| **Case study** | Department of Administration throughout |

---

## Recommended Production Tools

### Option A — Descript *(recommended for first video)*
**descript.com** · ~$24/mo

Record your screen while reading the script. Descript transcribes everything automatically. Edit the video by editing the text — delete a sentence in the transcript and the video clip is cut. Removes filler words ("um," "uh") automatically. Best option if you want polished output without video editing experience.

### Option B — Loom *(fastest to publish)*
**loom.com** · Free tier available

One click to record, one link to share. No editing needed. Ideal for a rough-cut first version or internal team training. Lower production quality but zero friction.

### Option C — Camtasia *(most professional)*
**techsmith.com/camtasia** · ~$300 one-time

Gold standard for software tutorial videos. Supports callout annotations (arrows, highlight boxes, zoom-in effects), chapter markers, and a built-in asset library. Use this if the video will be publicly distributed or used repeatedly over multiple sessions.

### Option D — Synthesia *(AI presenter, no recording)*
**synthesia.io** · ~$30/mo

You write the script; an AI avatar presents it. No screen recording skill needed — you provide the script and slide content. Good for a formal, presenter-led version without being on camera. Best combined with screen capture clips inserted as B-roll.

### Recommendation
Start with **Descript** for a polished first draft you can edit quickly, then graduate to **Camtasia** if this becomes a recurring training asset.

---

## Chapter Structure

The tutorial is designed to work as one continuous video or three standalone chapters.

| Chapter | Title | Runtime | Covers |
|---|---|---|---|
| Intro | What is Palmetto ZBB Suite? | ~1 min | App purpose, ZBB concept, data source |
| 1 | Finding Your Agency | ~2 min | Overview tab, treemap, Agency Explorer |
| 2 | Running a ZBB Exercise | ~3 min | ZBB Sandbox, Reset to Zero, priorities, scenarios |
| 3 | Researching Provisos | ~1.5 min | Navigator, plain-English questions, citations |
| Outro | Next Steps | ~30 sec | Help modal, keyboard shortcuts, team workflow |

---

## Full Scene-by-Scene Script

---

### INTRO — What Is Palmetto ZBB Suite? (~60 seconds)

**[SCREEN: App homepage / Overview tab loaded]**

> "This is the Palmetto ZBB Suite — a tool built specifically for South Carolina's General Assembly to conduct zero-based budget reviews of the state's $39.2 billion annual budget."

> "In a traditional budget process, last year's numbers are the starting point. Zero-based budgeting flips that. Every dollar has to be justified from scratch. Is this program still needed? At what level? For what purpose?"

> "The Suite covers all 115 state agencies — every line item sourced directly from H.4025, the FY 2025–2026 Appropriations Act. Nothing is estimated. Every number carries a source citation."

> "We're going to walk through it using the Department of Administration as our example. Let's start."

**[ACTION: Cursor moves to the nav tabs at the top]**

---

### CHAPTER 1 — Finding Your Agency (~2 minutes)

#### Scene 1.1 — The Navigation Bar

**[SCREEN: Top nav bar highlighted / zoomed]**

> "The navigation bar runs across the top. Five tabs: Overview, Agency Explorer, ZBB Sandbox, Scenarios, and Navigator. We'll use all five."

> "On the right you'll see the green Data Integrity Badge. That confirms all 2,511 line items — totaling $39.16 billion — are reconciled against the enrolled bill. Click it any time to see the full reconciliation report by agency."

**[ACTION: Click the green badge — show reconciliation modal briefly — close it]**

---

#### Scene 1.2 — The Overview Treemap

**[SCREEN: Overview tab / full treemap visible]**

> "The Overview tab gives you the full budget at a glance. This treemap shows all 115 agencies sized by their total appropriation — bigger box means more money."

> "Color tells you about General Fund dependency. Darker boxes are more reliant on state tax revenue — the General Fund. Lighter boxes lean on federal funding or self-generated fees."

**[ACTION: Hover over several agency boxes to show tooltips with amounts]**

> "Toggle between Total Funds and General Fund Only using these buttons up here."

**[ACTION: Click the GF Only toggle — treemap redraws]**

> "Notice how some agencies shrink dramatically. That tells you they're heavily federally funded — and it means cutting them has a different cost calculus than cutting a GF-heavy agency."

**[ACTION: Toggle back to Total Funds]**

---

#### Scene 1.3 — Jumping to an Agency

**[SCREEN: Treemap — cursor moving toward DOA box]**

> "We're starting with the Department of Administration. I'll click its box in the treemap."

**[ACTION: Click the DOA box — app navigates to Agency Explorer]**

> "The app jumps directly to that agency in the Agency Explorer. Let's take a look."

---

#### Scene 1.4 — Agency Explorer

**[SCREEN: Agency Explorer — DOA loaded in right panel]**

> "This is Agency Explorer. The left panel lists all 115 agencies — searchable. The right panel shows everything for the selected agency: every line item, every fund type, every dollar."

**[ACTION: Point to left panel, then right panel]**

> "Each row in the line items table shows the program name, the fund type — General Fund, Federal, or Other — and the exact dollar amount from H.4025."

**[ACTION: Hover over a row — show citation badge]**

> "That green badge next to each figure means it's sourced verbatim from the bill. Not estimated. Not calculated. Extracted directly from the enrolled Act."

**[ACTION: Click a row to expand the proviso]**

> "Click any row and the proviso from Part IB appears. This is the legal language governing how that money can be spent. Read these before you start cutting — provisos can restrict transfers, mandate reporting, or protect specific programs."

**[ACTION: Show the filter controls]**

> "Filter by fund type to isolate General Fund lines. Sort by amount to put the biggest dollars first. When you're ready for your analysis, mark the agency as In Review using this status control."

**[ACTION: Click status badge — show dropdown — select In Review]**

---

### CHAPTER 2 — Running a ZBB Exercise (~3 minutes)

#### Scene 2.1 — Loading the Sandbox

**[SCREEN: Agency Explorer — "Open in Sandbox" button visible]**

> "Now for the core exercise. Click Open in Sandbox to take Department of Administration into the ZBB Sandbox."

**[ACTION: Click "Open in Sandbox" button — Sandbox tab loads with DOA]**

**[SCREEN: ZBB Sandbox — DOA loaded, original amounts showing]**

> "The Sandbox loads the agency with all original H.4025 appropriations showing. Nothing has been changed yet."

---

#### Scene 2.2 — Reset to Zero

**[SCREEN: Sandbox — cursor moving to Reset to Zero button]**

> "Here's the ZBB moment. Click Reset to Zero."

**[ACTION: Click Reset to Zero — all values go to $0 — bottom bar updates to $0]**

> "Every line item is now zeroed. The bottom bar shows zero dollars justified. This is your blank sheet."

> "And if you immediately regret it — Control-Z undoes it. Control-Z always works in the Sandbox."

**[ACTION: Show Ctrl+Z — values restore — Ctrl+Y to redo — values zero again]**

---

#### Scene 2.3 — Rebuilding Line by Line

**[SCREEN: Sandbox — focus on first row]**

> "Now we rebuild. For each line item, you make three decisions: Should it be funded at all? At what amount? And at what priority tier?"

**[ACTION: Click the priority selector on a row — show dropdown: Mandated / High / Medium / Low]**

> "Priority tiers: Mandated means legally required — state or federal law. High is critical to the agency's core mission. Medium is important but could be deferred. Low is beneficial but not essential."

**[ACTION: Set a row to Mandated, enter the original amount, then click the justification field and type a short justification]**

> "Write a justification for each funded line. Be specific — cite the legal authority, the number of people served, the consequence of not funding it. This text goes directly into your exported decision package."

**[ACTION: Set another row to Low, leave it at $0]**

> "Lines you don't fund stay at zero. No justification needed."

---

#### Scene 2.4 — Bulk Operations

**[SCREEN: Sandbox — show checkboxes on left of rows]**

> "Use checkboxes to select multiple rows and apply bulk operations — set a tier across all selected lines, apply a percentage reduction, or zero them out at once. Useful when you have 20 Personal Service lines you want to treat the same way."

**[ACTION: Check 3 rows — show bulk toolbar appear — click Set Priority — pick Medium]**

---

#### Scene 2.5 — Saving a Scenario

**[SCREEN: Sandbox — Save Scenario button visible]**

> "When you're happy with a build, save it as a named scenario. Something descriptive — 'DOA Mandated Only' or 'DOA Five Percent GF Reduction.'"

**[ACTION: Click Save Scenario — dialog appears — type a name — click Save]**

> "You can save multiple scenarios and compare them side by side. Let's do that now."

---

#### Scene 2.6 — Scenarios Tab

**[SCREEN: Scenarios tab — two scenario cards visible]**

> "The Scenarios tab. Load two or three saved scenarios and the tool compares them line by line. Cuts are red. Increases are green."

**[ACTION: Select two scenarios — show the comparison table]**

> "More importantly — federal match warnings. Any General Fund cut that puts federal matching funds at risk is flagged automatically. The tool shows you the GF cut and the federal dollars at risk. That's the real cost of a reduction."

**[ACTION: Point to a FED MATCH warning if visible]**

> "The waterfall chart at the top shows the cumulative savings as you move from Low priority cuts through Medium and High. This is your committee framing: 'We can save this much with low service impact. Here's what it costs to go further.'"

**[ACTION: Point to the export button]**

> "Export a committee packet — one formatted page per agency — ready for distribution. Or use Presentation Mode for the committee room by adding question-mark-present-equals-true to the URL."

---

### CHAPTER 3 — Researching Provisos (~1.5 minutes)

#### Scene 3.1 — Navigator

**[SCREEN: Navigator tab — empty question bar]**

> "The Navigator tab lets you search the full Part IB proviso text in plain English. No Boolean operators. No section numbers. Just ask a question."

**[ACTION: Click the question bar — type "What provisos govern the Department of Administration?"]**

> "The AI searches every proviso and returns a precise, cited answer."

**[ACTION: Hit Enter — answer appears with proviso citations]**

> "Notice the citations. Every answer includes the specific proviso number and the verbatim text. The AI never generates a number — if the answer isn't in the bill, it says so."

**[ACTION: Try a second question — "Which agencies have federal match requirements?"]**

> "Try cross-agency questions too. This is powerful when you're looking for patterns — which agencies have similar provisos, where the federal match risks are concentrated, what the budget says about a specific program area."

> "Your question history stays in the left panel. Click any past question to reload the answer."

---

### OUTRO — Next Steps (~30 seconds)

**[SCREEN: App overview — full nav bar visible]**

> "That's the full Palmetto ZBB Suite workflow: Overview to find your agency, Explorer to understand it, Sandbox to build from zero, Scenarios to compare and present, Navigator to research the legal constraints."

> "A few quick tips before you go."

**[ACTION: Press ? key — Help modal opens]**

> "Press question mark anywhere in the app to open the built-in user guide — it's always available."

> "The Data Integrity Badge in the top right is always live. Green means every figure you're looking at is reconciled against the enrolled bill."

> "And if you're reviewing multiple agencies as a team — use the In Review, Justified, and Flagged statuses to coordinate. The Overview tab shows real-time progress across all 115 agencies."

> "Good luck."

---

## Production Notes

### Screen Recording Setup
- **Resolution:** 1920×1080 minimum. If recording on a smaller screen, zoom the browser to 90%.
- **Browser:** Chrome or Edge, full-screen, no browser extensions visible.
- **App state before recording:** Log in, load the app, make sure DOA is visible in the treemap. Pre-save two scenarios so the Scenarios tab has content ready.
- **Cursor:** Use a large cursor or cursor-highlight tool (Camtasia has this built in; for Descript/Loom install "Cursor Pro" or similar).

### Callout Annotations (Camtasia / Descript)
Add these annotations at the following moments:
| Moment | Annotation |
|---|---|
| Data Integrity Badge first appears | Arrow + label: "Live reconciliation — click to verify" |
| Reset to Zero clicked | Zoom in 150% + label: "ZBB starts here" |
| Priority tier dropdown opens | Label each tier with a one-line definition |
| FED MATCH warning appears | Red highlight box + label: "This is the real cost of the cut" |
| ? key pressed | Label: "Always available — press ? anywhere" |

### Chapters / Timestamps (for YouTube or LMS)
If publishing to YouTube or a learning management system, use these timestamps:
```
0:00  Introduction — What is Palmetto ZBB Suite?
1:05  Chapter 1 — Finding Your Agency
3:05  Chapter 2 — Running a ZBB Exercise
6:10  Chapter 3 — Researching Provisos
7:45  Next Steps & Tips
```

### Thumbnail
Dark navy background. Gold text: **"Palmetto ZBB Suite"**. Subtext: *"Zero-Based Budget Review — Step by Step."* SC state seal or palmetto tree icon optional.

### Accessibility
- Add closed captions (Descript and YouTube both auto-generate; review before publishing).
- Keep cursor movement slow and deliberate — rapid mouse movement is hard to follow.
- Pause 1–2 seconds after each click before narrating the result.

---

## Modular Version Option

If a 7–9 minute video is too long for your audience, produce three standalone videos:

| Video | Title | Runtime | Covers |
|---|---|---|---|
| 1 | Reading the Budget — Overview & Explorer | ~2.5 min | Scenes 1.1–1.4 |
| 2 | Running a ZBB Exercise | ~3.5 min | Scenes 2.1–2.6 |
| 3 | Researching Provisos with Navigator | ~2 min | Scene 3.1 + Outro |

Each can stand alone or be watched in sequence.
