# Design Standard

- Default UI language is Russian.
- Language is bound to server node. Do not provide independent language switch.
- Business data is not translated automatically.
- Only system administrator may see or use server node switching.
- Server switching in prototype is interaction simulation only.
- Russian long labels must not overflow or render as mojibake.
- Use dense operational SaaS layout, not marketing pages.
- Output a single `prototype/index.html` with embedded CSS/JS and `data-testid` selectors.
