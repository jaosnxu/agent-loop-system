# Design Standard

## Scope

Rules for high-fidelity interactive prototypes.

## Language

- Default UI language is Russian.
- Labels, buttons, navigation, empty states, validation messages, and status text must be Russian.
- Cross-border business prototypes must bind language to the selected server node: Russia node uses Russian UI, China node uses Chinese UI.
- Do not provide an independent language switch. Server switching is the only simulated trigger for UI language change.
- Business data is not translated automatically. Contract titles, task names, comments, uploaded document names, and knowledge source titles must stay as entered.
- Only the system administrator role may see or use server node switching controls. Normal employees and external collaborators must not see this control.
- Prototype server switching is interaction simulation only. It must not be described as real multi-node deployment or real data isolation.
- Russian text must support long labels without overflow, mojibake, or clipped controls. Use wrapping, shorter operational labels, icons, tooltips, or detail text when labels exceed compact space.

## Layout

- Use a dense operational SaaS layout.
- Prefer top navigation plus left or tabbed module controls.
- Avoid marketing hero sections.
- Use stable dimensions for toolbars, forms, tables, cards, and buttons.

## Visual Style

- Use restrained colors with clear contrast.
- Border radius must be 8px or less.
- Buttons must have clear states.
- Inputs must have labels.

## Interaction

- Prototype must support button clicks, form input, tab/page changes, and visible state changes.
- Data may be static mock data.
- No backend dependency is allowed.

## Output

- Produce a single `prototype/index.html` file with embedded CSS and JS.
- Include semantic selectors for testing: `data-testid`.
