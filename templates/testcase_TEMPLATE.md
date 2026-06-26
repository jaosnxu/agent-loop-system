# Test Case: TESTCASE_ID

- Case ID: TESTCASE_ID
- Priority: P1
- Test Path: prototype/index.html

## Steps

1. Open the prototype page.
2. Click a navigation or action button.
3. Input sample text into a form field.
4. Verify visible state changes.

## Expected Result

- Page is rendered.
- Button click changes visible content.
- Form input is accepted.
- Expected Russian status text is visible.

## Required Cross-Border Language Cases

- Default language: first open shows Russian UI, with no Chinese UI residue in navigation, buttons, empty states, validation messages, or status text.
- Server switch flow: system administrator switches from Russia node to China node in settings; UI changes to Chinese and selected node state stays consistent.
- Permission check: normal employee and external collaborator accounts cannot see or trigger server switching.
- Russian layout: long Russian labels, table headers, status text, and validation messages wrap normally, do not overflow, and show no mojibake.
- Business data: user-entered task titles, contract names, comments, document names, and knowledge source names are not auto-translated during node switching.
