# VyBit

Change designs, draw mockups, and provide suggestions in your browser and send them to your favorite coding agent (Claude, Cursor, Copilot, etc) to be implemented. VyBit works with React apps built with Tailwind v3 or v4.

<img width="1546" height="860" alt="image" src="https://github.com/user-attachments/assets/de3450be-abcf-4612-93a5-ae2dd324d583" />

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
