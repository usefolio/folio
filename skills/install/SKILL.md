---
name: install
description: "Installs the Folio desktop app and connects it as an MCP server. Use this skill whenever a user wants to install Folio, set up Folio, download Folio, connect Folio to Claude Code, add the Folio MCP server, or troubleshoot Folio connection issues. Also trigger on phrases like 'get Folio running', 'set up the MCP bridge', 'Folio not connecting', 'connect Folio', 'install Folio MCP', or any request involving Folio setup, download, or MCP configuration."
---

# Folio Install & MCP Setup

Walk the user through installing the Folio desktop app and connecting it as an MCP server to Claude Code. Detect their environment, download the right binary, and verify the connection.

## Step 1: Detect platform and architecture

Run these commands to determine which binary the user needs:

```bash
uname -s   # Darwin = macOS, Linux = Linux
uname -m   # arm64 = Apple Silicon, x86_64 = Intel
```

Folio currently ships macOS builds only. Map the results:

| `uname -s` | `uname -m` | Binary |
|-------------|------------|--------|
| Darwin | arm64 | `Folio_<version>_aarch64.dmg` |
| Darwin | x86_64 | `Folio_<version>_x64.dmg` |
| Linux | * | Not yet available -- let the user know and point them to https://github.com/usefolio/folio/releases for future releases |

## Step 2: Download the latest release

The releases page is: https://github.com/usefolio/folio/releases/latest

Fetch the latest release tag and asset URLs:

```bash
curl -sL https://api.github.com/repos/usefolio/folio/releases/latest \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
print(f\"Version: {r['tag_name']}\")
for a in r['assets']:
    print(f\"  {a['name']}: {a['browser_download_url']}\")
"
```

Then download the correct DMG for the user's architecture. For example on Apple Silicon:

```bash
cd ~/Downloads
curl -LO <aarch64_dmg_url>
```

## Step 3: Install the app

```bash
# Mount the DMG
hdiutil attach ~/Downloads/Folio_<version>_aarch64.dmg

# Copy to Applications
cp -R "/Volumes/Folio/Folio.app" /Applications/

# Unmount
hdiutil detach "/Volumes/Folio"
```

On first launch, macOS may block the app because it's unsigned. The user needs to:
1. Open **System Settings > Privacy & Security**
2. Scroll to the "Folio was blocked" message and click **Open Anyway**
3. Or right-click the app in Applications and choose **Open**

## Step 4: Launch Folio and wait for the MCP bridge

```bash
open /Applications/Folio.app
```

The app starts an HTTP MCP bridge on `127.0.0.1:8765` by default. Wait a few seconds for startup, then verify:

```bash
curl -sS http://127.0.0.1:8765/health
```

Expected response: `{"status":"ok"}`

If the health check fails:
- The app may still be starting up -- wait 5-10 seconds and retry
- Check if the port is in use: `lsof -nP -iTCP:8765 -sTCP:LISTEN`
- Override the port with the `FOLIO_MCP_PORT` environment variable before launching

## Step 5: Add Folio as an MCP server in Claude Code

For access across all projects (recommended):

```bash
claude mcp add --scope user --transport http folio http://127.0.0.1:8765/mcp
```

For the current project only:

```bash
claude mcp add --scope local --transport http folio http://127.0.0.1:8765/mcp
```

Verify it was added:

```bash
claude mcp list
```

## Step 6: Verify end-to-end

Test that Claude Code can reach the Folio MCP tools:

```bash
curl -sS -X POST http://127.0.0.1:8765/mcp \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

This should return a JSON response listing the available Folio tools (`project_metadata`, `sampler`, `configure_document_classification_enrichment`, etc.).

Once this works, the user can start a new Claude Code conversation and Folio's tools will be available.

## Troubleshooting

**"Failed to connect" in Claude Code:**
- Confirm Folio is running and the bridge is listening: `lsof -nP -iTCP:8765 -sTCP:LISTEN`
- Confirm the MCP endpoint path is `/mcp` (not just the root URL)
- If using `--scope local`, make sure Claude Code is running in the same project directory
- Try removing and re-adding: `claude mcp remove folio && claude mcp add --scope user --transport http folio http://127.0.0.1:8765/mcp`

**`ui_not_ready` error:**
- The Folio frontend hasn't finished mounting yet. Wait a few seconds and retry.
- If it persists, restart the Folio app.

**`frontend_response_timeout` error:**
- The Folio UI didn't respond within 20 seconds. Check that the app is healthy and not stuck on a loading screen. Restart if needed.

**Custom port:**
- Set `FOLIO_MCP_PORT=<port>` before launching Folio
- Update the MCP server URL accordingly: `http://127.0.0.1:<port>/mcp`

## Notes

- The MCP bridge runs on localhost only and does not require authentication. Do not expose port 8765 publicly.
- Folio uses your own API keys for AI providers (OpenAI, Anthropic, Google Gemini). You'll configure these inside the Folio app after first launch.
