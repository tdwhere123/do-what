# UI Interaction Matrix

Source of truth: `UI/UI-DESIGN-SPEC.md`

This matrix freezes the closure-time interaction contract for `Active / Workbench`, `Empty`, and `Settings`.

## Layers

| Layer | Meaning in v0.1 |
| --- | --- |
| `A` | Must be real and usable on the main path |
| `B` | Local UI interaction is allowed even if it does not commit durable state |
| `C` | Placeholder is allowed, but it must be labeled honestly |
| `D` | Pure presentation only; must not carry business semantics |

## Active / Workbench

| Interaction | Layer | v0.1 target behavior | Forbidden behavior |
| --- | --- | --- | --- |
| Sidebar `+` / add workspace | `A` | Open the real directory picker, call `workspace.open`, refresh snapshot, and sync the selected workspace | Fake workspace creation, duplicate synthetic workspace rows, or no-op buttons |
| Sidebar workspace item | `A` | Switch current workspace and sync selected run from Core snapshot | Local-only highlight that does not update the current workspace context |
| Sidebar run item | `A` | Switch the active run and keep timeline / inspector aligned | Showing one run as active while timeline or inspector still points at another run |
| Sidebar `New Run` | `A` | Open the modal only in a real workspace context | Allowing an orphan run without a workspace |
| Create Run submit | `A` | Validate workspace context before submit and fail honestly if missing | Silent fallback to a fabricated workspace id |
| Timeline composer send | `A` | Send only when an active run exists; otherwise stay disabled or explain why | Sending against no run or a stale run id |
| Soul inline trigger | `B` | Open and close the local popover stably | Turning decorative Soul affordances into fake writes |
| Soul promote / ignore actions | `C` | Show honest placeholder copy until the real write path exists | Pretending memory was persisted when it was not |
| Right-rail view toggles | `B` | Local view switching is stable and scoped to the current run | Using toggles to imply non-existent sync or persistence |
| Decorative SVGs / badges | `D` | Remain visual only | Encoding state or commands into decorative elements |

## Empty

| Interaction | Layer | v0.1 target behavior | Forbidden behavior |
| --- | --- | --- | --- |
| Empty primary CTA `Open Workspace` | `A` | First action on the page; runs the real workspace-open path | Primary CTA that creates a run before a workspace exists |
| Empty secondary CTA `Browse History` | `C` | Stay disabled or explicitly marked `v0.2` | Navigating into a fake history surface |
| Sidebar status block | `A` | Show shared Core / Engine / Soul module state from the same snapshot contract | Reintroducing local health guesses that diverge from Core |
| Sidebar `New Run` without workspace | `A` | Block submit path and tell the user to open a workspace first | Creating a run from empty state with no workspace |
| Empty-state copy | `B` | Explain the workspace-first path clearly | Suggesting that the app is ready to run without a workspace |

## Settings

| Interaction | Layer | v0.1 target behavior | Forbidden behavior |
| --- | --- | --- | --- |
| Settings entry / back navigation | `A` | Open the dedicated settings frame and return cleanly to the workbench | Reusing the workbench right rail as if settings were an inline panel |
| Engines tab status | `A` | Read shared module status and allow manual refresh from Core | Divergent engine wording or local health reconstruction |
| Tab switching | `B` | Stable local tab selection inside the independent settings frame | Cross-wiring tabs to unrelated workbench layout state |
| Lease interruption notice | `B` | Preserve interrupted draft context before locking fields | Silently overwriting dirty form input |
| Environment repair/install controls | `C` | Honest placeholder or read-only status until real flows exist | Buttons that imply install or repair succeeded when nothing happened |
| Appearance persistence | `C` | Session-level shell only until durable persistence exists | Claiming theme persistence across restart when none exists |
| Intro badges, helper copy, decorative rows | `D` | Visual framing only | Treating design flourishes as functional controls |

## Closure Use

- `C012` must harden every `C` item into disabled, labeled, or explicitly deferred UI.
- `C013` sign-off must verify that every `A` item is real, every `B` item is stable, and no `D` item carries business meaning.
