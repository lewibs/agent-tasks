// Runs one agent task by driving the user's installed Claude Code CLI in
// headless mode (`claude -p --output-format stream-json`). This is the same
// engine the Claude Agent SDK wraps: the agent gets Claude Code's full
// toolset (read/write/edit/bash/grep/web) plus whatever MCP servers the
// user has configured in Claude Code — so capabilities like sending email
// arrive by adding an MCP server, with no plugin changes.
import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";
import { AgentTasksSettings } from "./SettingsManager";

export interface AgentResult {
	success: boolean;
	text: string;
	costUsd?: number;
	numTurns?: number;
}

export type AgentStatusCallback = (message: string) => void;

function buildEnv(claudePath: string): NodeJS.ProcessEnv {
	// Obsidian (snap/flatpak/desktop launchers) can have a sparse PATH and,
	// in some sandboxes, a redirected HOME. Claude Code needs the real HOME
	// to find its auth (~/.claude) and a PATH that includes its own dir.
	const home = os.userInfo().homedir;
	const extraPaths = [
		path.dirname(claudePath),
		path.join(home, ".local", "bin"),
		"/usr/local/bin",
		"/usr/bin",
	];
	const currentPath = process.env.PATH || "";
	return {
		...process.env,
		HOME: home,
		PATH: `${currentPath}:${extraPaths.join(":")}`,
	};
}

export function runAgent(
	prompt: string,
	cwd: string,
	settings: AgentTasksSettings,
	onStatus?: AgentStatusCallback
): Promise<AgentResult> {
	return new Promise((resolve, reject) => {
		const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
		if (settings.model) {
			args.push("--model", settings.model);
		}
		if (settings.permissionMode === "bypassPermissions") {
			args.push("--dangerously-skip-permissions");
		} else {
			args.push("--permission-mode", "acceptEdits");
		}

		const child = spawn(settings.claudePath, args, {
			cwd,
			env: buildEnv(settings.claudePath),
			stdio: ["ignore", "pipe", "pipe"],
		});

		let buffer = "";
		let stderr = "";
		let result: AgentResult | null = null;

		child.stdout.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();
			let newlineIdx;
			while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
				const line = buffer.slice(0, newlineIdx).trim();
				buffer = buffer.slice(newlineIdx + 1);
				if (!line) {
					continue;
				}
				try {
					const event = JSON.parse(line);
					handleEvent(event);
				} catch {
					// non-JSON line (warnings etc.) — ignore
				}
			}
		});

		const handleEvent = (event: {
			type?: string;
			subtype?: string;
			result?: string;
			is_error?: boolean;
			total_cost_usd?: number;
			num_turns?: number;
			message?: {
				content?: Array<{ type: string; text?: string; name?: string }>;
			};
		}) => {
			if (event.type === "assistant" && event.message?.content) {
				for (const block of event.message.content) {
					if (block.type === "text" && block.text) {
						onStatus?.(block.text.slice(0, 120));
					} else if (block.type === "tool_use" && block.name) {
						onStatus?.(`using ${block.name}…`);
					}
				}
			} else if (event.type === "result") {
				result = {
					success: !event.is_error && event.subtype === "success",
					text: event.result || event.subtype || "(no output)",
					costUsd: event.total_cost_usd,
					numTurns: event.num_turns,
				};
			}
		};

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on("error", (err) => {
			reject(
				new Error(
					`Could not start Claude Code (${settings.claudePath}): ${err.message}`
				)
			);
		});

		child.on("close", (code) => {
			if (result) {
				resolve(result);
			} else if (code !== 0) {
				reject(
					new Error(
						`Claude Code exited with code ${code}: ${stderr.slice(0, 400)}`
					)
				);
			} else {
				reject(new Error("Claude Code produced no result event"));
			}
		});
	});
}
