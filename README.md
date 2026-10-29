# copilot-mcp-agent

A Microsoft 365 Copilot declarative agent that calls the
[copilot-mcp-spike](../copilot-mcp-spike) MCP server. Copilot signs the user in with Entra ID (OAuth 2.0
authorization code + PKCE) and sends their access token to the server. The server then exposes the `whoami` and
`greet` tools.

The project was scaffolded with Microsoft 365 Agents Toolkit (`atk new -c declarative-agent-with-action-from-mcp`).
The OAuth auth config was then added by hand.

| Path | Purpose |
| --- | --- |
| `appPackage/manifest.json` | Microsoft 365 app manifest |
| `appPackage/declarativeAgent.json` | Agent definition, conversation starters, action |
| `appPackage/instruction.txt` | Agent instructions |
| `appPackage/ai-plugin.json` | `RemoteMCPServer` runtime: server URL, `OAuthPluginVault` auth, the server's tool definitions |
| `scripts/sync-tools.mjs` | Copies the spike's current tool list into `ai-plugin.json` |
| `m365agents.yml` | Provision: create app, register OAuth auth config, package, validate, sideload |
| `env/.env.dev` | Server URL and Entra IDs (committed) |
| `env/.env.dev.user` | Client secret (git-ignored) |
| `.vscode/mcp.json` | The local dev server, for testing tools from VS Code chat |

## Prerequisites

- VS Code with the [Microsoft 365 Agents Toolkit](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension)
  extension (6.12 or later for MCP actions)
- A Microsoft 365 account with a Copilot license, and permission to upload custom apps
- copilot-mcp-spike deployed to a public HTTPS URL with `AUTH_MODE=entra`, or run locally behind a dev tunnel.
  Copilot can't reach `localhost`.
- The Entra app registration from the spike's README, with the redirect URI
  `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`

## Configure

1. In `env/.env.dev`:
   - `MCP_SERVER_URL`: the server's MCP endpoint, for example `https://copilot-mcp-spike-xyz.azurewebsites.net/mcp`.
     For a dev tunnel, use `https://<tunnel>.devtunnels.ms/mcp` and set `PUBLIC_BASE_URL` on the server to the tunnel URL.
   - `ENTRA_TENANT_ID`: the directory (tenant) ID.
   - `ENTRA_CLIENT_ID`: the app registration's client ID. It must match the server's `ENTRA_CLIENT_ID`.
2. In `env/.env.dev.user`: `SECRET_ENTRA_CLIENT_SECRET`, the client secret
   (`az ad app credential reset --id <client-id> --display-name copilot --query password -o tsv`).

`m365agents.yml` builds the rest from these values:

| Auth config field | Value |
| --- | --- |
| Base URL | `MCP_SERVER_URL` |
| Authorization URL | `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize` |
| Token / refresh URL | `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token` |
| Scope | `api://<client-id>/access_as_user offline_access` |
| PKCE | On |
| Restrict usage by app | Any app. Binding the config to one app makes every tool call return 404. |
| Restrict usage by org | Any tenant, so a Cowork plugin can reuse the same config |

## Provision and test

1. Open this folder in VS Code and sign in to your Microsoft 365 account in the Agents Toolkit panel.
2. Run **Lifecycle → Provision**. This does the following:
   - Creates the Teams app (`TEAMS_APP_ID`).
   - Registers the OAuth auth config in the Microsoft Enterprise token store and writes its ID to `MCP_DA_AUTH_ID`.
     `ai-plugin.json` references it as `reference_id`.
   - Packages, validates and sideloads the agent.

   To use the CLI instead: `atk provision --env dev`.
3. Press **F5** (Preview in Copilot) or open Microsoft 365 Copilot and pick **Copilot MCP spikedev**.
4. Try "Who am I signed in as?". The first tool call shows a sign-in button. Once you've signed in, `whoami`
   returns your `oid`, `tid`, name and the client app ID. Check the server log for `mcp_request` and
   `auth_failed` lines.

Users can sign out under Copilot Chat settings → Agents.

### Changing the auth config

`oauth/register` only runs when `MCP_DA_AUTH_ID` is empty. To change the client ID, secret, scope or base URL
later, edit the registration in the [Teams Developer Portal](https://dev.teams.microsoft.com) (Tools → OAuth client
registration). You can also clear `MCP_DA_AUTH_ID` and provision again, which creates a new registration; delete the
old one in the portal.

## Keeping the tool list in sync

The server requires authentication, so the tool definitions are pinned in `ai-plugin.json`:
`mcp_tool_description.tools`, `functions` and `run_for_functions`. That way Copilot doesn't need an anonymous
`tools/list` call. When you add or change a tool in the spike, run this and then provision again:

```bash
node scripts/sync-tools.mjs              # default spike path is ../copilot-mcp-spike
```

The tools are inline, not in a separate `mcp-tools.json` referenced with `{ "file": ... }` as the Agents Toolkit
template does it. The toolkit's validator (CLI 1.1.12) rejects the file form, even in the unmodified template:
`mcp_tool_description must match exactly one schema in oneOf`. Inline tools pass, and they are equally valid
under the published plugin v2.4 schema.

Agents Toolkit's **Fetch action from MCP** command (in `.vscode/mcp.json`) can also pull tools through VS Code's MCP
client. It doesn't work against the Entra-protected server: VS Code sends the `resource` parameter, and Entra
rejects it with `AADSTS9010010`. See the spike's README for details. For that reason `.vscode/mcp.json` points at
the local dev server (`npm run dev` in the spike, `AUTH_MODE=dev`) and asks for a token from `npm run -s token`.
That entry is also handy for trying the tools from VS Code chat. If you run Fetch, check afterwards that
`spec.url` in `ai-plugin.json` is still `${{MCP_SERVER_URL}}`.

## Entra SSO instead of OAuth

To skip the sign-in prompt and the client secret, create an Entra SSO auth config in the Teams Developer Portal
and put its ID in `MCP_DA_AUTH_ID`. Because the ID is already set, the `oauth/register` step is skipped.
`ai-plugin.json` stays the same. Then do the extra Entra steps in the spike's README: add the generated
Application ID URI, add the `oAuthConsentRedirect` redirect URI, and pre-authorize
`ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`.
