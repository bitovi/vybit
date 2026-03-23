# VyBit

Change designs, draw mockups, and provide suggestions __in your browser__ and send them to your favorite coding agent (Claude, Cursor, Copilot, etc) to be implemented. VyBit works with React apps built with Tailwind v3 or v4. 

<img width="1453" height="903" alt="Cursor_and_Carton_Case_Management" src="https://github.com/user-attachments/assets/59b8e280-a827-4fa0-95e3-6c350afacbc9" />

`VyBit` changes how you can design and build an app or website. Instead of building your design system and page designs in Sketch or Figma and then implementing it in code, you:

| Step No | Task | How |
|----------|----------|----------|
| 1    | Vibe code your design system    | `Claude, build a button, card and badge. Add storybook.`    |
| 2    | __Use VyBit to fine-tune your design system in Storybook__ - Adjust colors, spacing, shadows, layout and more | <img  alt="image" src="https://github.com/user-attachments/assets/79ca04be-db8f-458f-8632-87cc040875db" />    |
| 3a   | __Use VyBit to design features__ - drop customized design system components into your pages | <img width="1481" height="922" alt="image" src="https://github.com/user-attachments/assets/415acdb7-102a-4c31-910b-10536c59ee4a" /> |
| 3b  | __Use VyBit to design features__ -  sketch a feature with the design canvas | <img width="1482" height="924" alt="image" src="https://github.com/user-attachments/assets/924e9733-baf6-4492-b9da-05fd27c2df93" /> | 
| 4 | Add text or voice messages for extra context | <img width="376" height="261" alt="image" src="https://github.com/user-attachments/assets/546ea987-a0ad-4809-85c6-52fb91fb987e" /> | 

Plus, VyBit always knows what page, components, and elements you're editing, making it easier for agents to know exactly what you want!


## Installation

To use VyBit:

1. Add its MCP tools to your agent
2. Start the MCP connection
3. Have your app or website load the VyBit Editor script

### Add MCP tools to your agent 

VyBit uses MCP to tell your agent to implement the changes you commit. 

Add VyBit to your Agent's MCP configuration. Below we've listed what these configurations might look like for different agents.  The most important things to know are:

- VyBit is a Node project. So you will need [NodeJS](https://nodejs.org/en) `>= 18`.
- VyBit runs using STDIO (not HTTP), so you will often need some sort of `command` or `stdio` configuration.
- VyBit needs to run where your React app's `package.json` is. 

__Copilot__ in `.vscode/mcp.json`

```json
{
	"servers": {
		"vybit": {
			"type": "stdio",
			"command": "npx",
			"args": ["@bitovi/vybit"],
			"cwd": "${workspaceFolder}/packages/client"
		}
	},
	"inputs": []
}
```

__Claude Code__ in `.mcp.json`

```json
{
  "mcpServers": {
    "vybit": {
      "command": "npx",
      "args": ["@bitovi/vybit"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

#### Running inside Docker

If your app runs in a Docker container, run VyBit **inside the container** instead of on the host. This is necessary because VyBit needs access to your project's `node_modules` to resolve Tailwind — which only exist inside the container, not on the host.

Replace the `npx` command with `docker exec`. For example, Claude Code in `.mcp.json`:

```json
{
  "mcpServers": {
    "vybit": {
      "command": "docker",
      "args": ["exec", "-i", "<your-container-name>", "npx", "@bitovi/vybit"]
    }
  }
}
```

You can find your container name by running `docker ps`.

You also need to expose port `3333` so the browser can load the editor overlay script. Add it to your `docker-compose.yml` (or override file):

```yaml
ports:
  - "3000:3000"
  - "3333:3333"
```

Then restart your containers for the port mapping to take effect.

### Start the MCP connection

Different agents connect to an MCP service in different ways:

__Copilot__

Click start

<img width="586" height="341" alt="image" src="https://github.com/user-attachments/assets/1658c2e6-f9f0-4749-8f26-f3c4bc02100b" />


### Add the Editor script

The Editor script adds the VyBit editor panel. The script needs to be added to any pages you want to edit.

The best way to add the editor script is to have your agent do it! Paste the following into your agent:

```markdown
I would like to use [VyBit](https://github.com/bitovi/vybit) on every page of this application.
Please make sure we can load the overlay script at `http://localhost:3333/overlay.js` in a non-blocking way.
Here's some suggested code to add in the `<head>` of every page in development mode:

\```html
<script>
if (location.hostname === 'localhost') {
   const s = document.createElement('script');
   s.src = 'http://localhost:3333/overlay.js';
   document.head.appendChild(s);
}
</script>
\```
```

## Use

To start a session, you need to:

1. Tell your agent to start pulling changes and implementing features
2. Use the Editor to make changes
3. Commit those changes to send them to the agent

### Telling your agent to start making features

In your agent, run the following prompt:

```
Please implement the next change and continue implementing changes with VyBit.
```

This will have your agent start a loop where it waits for changes, implements them, and then waits for new ones.

### Use the Editor to make changes

You should see an editor icon like this:

<img width="78" height="61" alt="image" src="https://github.com/user-attachments/assets/973e707b-d143-44a5-b062-0e607e3e950f" />

Click it. It will open the Editor Panel.

### Using the Editor to make changes

More on this later.  But in short, click an element, then you can adjust the desig of it, or insert a panel to draw out changes.  You can also add contextual messages.  These are all draft changes until you commit.

### Commiting changes

Once you have the changes you want to make, you can click the drafts button. This will show you a list of changes.  Click `Commit All` to send them to the agent to be implemented:

<img width="386" height="157" alt="image" src="https://github.com/user-attachments/assets/7795205b-6e70-43db-bf61-2beec2840231" />






## Storybook Integrations

VyBit offers two separate Storybook integrations. Each requires its own setup. Both work with **Storybook 8** and **Storybook 10**.

### 1. Drag Components from Storybook into Your Page

The VyBit editor's **Components** tab lists your Storybook stories so you can drag them directly onto your page. VyBit's MCP server auto-detects your running Storybook by scanning ports 6006–6010. No extra installation is needed — just make sure Storybook is running before starting VyBit.

To use a different port or URL, set the `STORYBOOK_URL` environment variable:

```bash
STORYBOOK_URL=http://localhost:7000 npx @bitovi/vybit
```

### 2. Use the VyBit Panel Inside Storybook

You can embed the VyBit editor panel as a tab directly inside your Storybook UI. The addon auto-detects whether you're running Storybook 8 or 10 and loads the correct entry points.

Because VyBit is typically run via `npx` in the MCP config (not installed locally), you need to add it as a dev dependency so Storybook can resolve the addon.

Install it in the same package where Storybook is a dependency (this may be a subdirectory in a monorepo):

```bash
npm install --save-dev @bitovi/vybit
```

Then register the addon in `.storybook/main.ts`:

```ts
export default {
  addons: ['@bitovi/vybit/storybook-addon'],
};
```

The VyBit editor panel will now appear as a "Vybit" tab inside your Storybook.

## MCP Tools

There are other MCP tools you can use if you don't want to work in the implement loop:

| Tool | Description |
|------|-------------|
| `implement_next_change` | **Start here.** Waits for the next committed change, returns implementation instructions, and requires the agent to apply it, mark it done, then call this tool again in an endless loop. |
| `get_next_change` | Returns the next committed change as raw patch data (no workflow instructions). Use this for custom agent workflows. |
| `mark_change_implemented` | Marks one or more changes as implemented by ID. Returns a directive to call `implement_next_change` again. |
| `list_changes` | Lists all changes grouped by status (`staged`, `committed`, `implementing`, `implemented`). |
| `discard_all_changes` | Clears the entire change queue. |

## Port Configuration

Use the `PORT` environment variable to change the server port (default: `3333`):

```bash
PORT=4000 npx @bitovi/vybit
```

## Contributing

Issues and PRs welcome at [github.com/bitovi/vybit](https://github.com/bitovi/vybit).

## License

MIT © [Bitovi](https://www.bitovi.com)
