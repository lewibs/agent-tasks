import {
	FileSystemAdapter,
	Notice,
	Plugin,
	TFile,
	normalizePath,
} from "obsidian";
import { SettingsManager, AgentTasksSettings } from "src/SettingsManager";
import { SettingsTab } from "src/SettingsTab";
import { AgentTask, scanForTasks, replaceTaskLine } from "src/TaskScanner";
import { runAgent } from "src/AgentRunner";

const RESULT_INLINE_LIMIT = 500;

export default class AgentTasks extends Plugin {
	settings: AgentTasksSettings;
	settingsManager: SettingsManager;
	private running = false;
	private statusBar: HTMLElement;

	async onload() {
		this.settingsManager = new SettingsManager(this);
		this.settings = await this.settingsManager.loadSettings();

		this.addRibbonIcon("brain-circuit", "Run agent tasks", () => {
			void this.runAllTasks();
		});

		this.statusBar = this.addStatusBarItem();

		this.addSettingTab(new SettingsTab(this.app, this));

		this.addCommand({
			id: "run-agent-tasks",
			name: "Run agent tasks (whole vault)",
			callback: () => void this.runAllTasks(),
		});

		this.addCommand({
			id: "run-agent-tasks-current-note",
			name: "Run agent tasks in current note",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active note.");
					return;
				}
				void this.runAllTasks(file);
			},
		});

		this.addCommand({
			id: "reset-in-progress-tasks",
			name: "Reset stuck in-progress agent tasks",
			callback: () => void this.resetInProgress(),
		});
	}

	onunload() {}

	private vaultPath(): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		throw new Error("Agent Tasks requires a local vault (desktop).");
	}

	async runAllTasks(onlyFile?: TFile): Promise<void> {
		if (this.running) {
			new Notice("Agent tasks are already running.");
			return;
		}
		const tasks = await scanForTasks(
			this.app.vault,
			this.settings.tag,
			onlyFile
		);
		if (tasks.length === 0) {
			new Notice(`No open ${this.settings.tag} tasks found.`);
			return;
		}

		this.running = true;
		new Notice(`Running ${tasks.length} agent task(s)…`);
		let done = 0;
		let failed = 0;
		try {
			for (const task of tasks) {
				const label = `🤖 ${done + failed + 1}/${tasks.length}`;
				this.statusBar.setText(`${label}: ${task.text.slice(0, 40)}`);
				try {
					await this.runTask(task, label);
					done++;
				} catch (err) {
					failed++;
					console.error("Agent task failed:", err);
				}
			}
		} finally {
			this.running = false;
			this.statusBar.setText("");
			new Notice(
				`Agent tasks finished: ${done} done${
					failed ? `, ${failed} failed` : ""
				}.`
			);
		}
	}

	private async runTask(task: AgentTask, label: string): Promise<void> {
		const inProgressLine = task.line.replace("- [ ]", "- [/]");
		const marked = await replaceTaskLine(
			this.app.vault,
			task.file,
			task.line,
			[inProgressLine]
		);
		if (!marked) {
			// Line changed since scan — skip rather than guess
			return;
		}

		const noteContent = await this.app.vault.cachedRead(task.file);
		const prompt = this.buildPrompt(task, noteContent);

		try {
			const result = await runAgent(
				prompt,
				this.vaultPath(),
				this.settings,
				(message) =>
					this.statusBar.setText(
						`${label}: ${message.replace(/\s+/g, " ").slice(0, 60)}`
					)
			);
			if (!result.success) {
				throw new Error(result.text);
			}
			const doneLine = inProgressLine.replace("- [/]", "- [x]");
			const suffix = await this.buildResultSuffix(task, result.text);
			await replaceTaskLine(this.app.vault, task.file, inProgressLine, [
				doneLine + suffix,
			]);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await replaceTaskLine(this.app.vault, task.file, inProgressLine, [
				task.line,
				`${task.indent}\t- ⚠️ agent failed: ${oneLine(message).slice(0, 300)}`,
			]);
			throw err;
		}
	}

	private buildPrompt(task: AgentTask, noteContent: string): string {
		const context =
			noteContent.length > 6000
				? noteContent.slice(0, 6000) + "\n…(truncated)"
				: noteContent;
		return [
			`You are completing a task from the user's Obsidian vault. The current working directory is the vault root; the notes are markdown files you can read, create, and edit directly.`,
			``,
			`The task is from the note "${task.file.path}":`,
			``,
			`TASK: ${task.text}`,
			``,
			`For context, here is that note's current content:`,
			`---`,
			context,
			`---`,
			``,
			`Complete the task using any tools available to you. Rules:`,
			`- Do not edit the task's own checkbox line — the plugin manages its state.`,
			`- Do not put the "${this.settings.tag}" tag in any note you create or edit; it would be picked up as a new task.`,
			`- When creating notes, use vault-appropriate markdown and wiki-links.`,
			`- Your final message will be recorded under the task as the result. Make it a concise summary of what you did, mentioning any notes you created or edited by path.`,
		].join("\n");
	}

	// Builds the suffix appended to the completed task line: short results
	// inline (" — 🤖 …"), long results as a bare wiki-link to a summary note.
	private async buildResultSuffix(
		task: AgentTask,
		text: string
	): Promise<string> {
		const flat = oneLine(text);
		if (flat.length <= RESULT_INLINE_LIMIT) {
			return ` — 🤖 ${flat}`;
		}
		const folder = normalizePath(this.settings.resultFolder || "agent-summaries");
		if (!(await this.app.vault.adapter.exists(folder))) {
			await this.app.vault.adapter.mkdir(folder);
		}
		const slug = task.text
			.replace(/[\\/:*?"<>|#^[\]]/g, "")
			.trim()
			.slice(0, 60);
		let notePath = normalizePath(`${folder}/${slug}.md`);
		for (let n = 1; await this.app.vault.adapter.exists(notePath); n++) {
			notePath = normalizePath(`${folder}/${slug} ${n}.md`);
		}
		await this.app.vault.create(
			notePath,
			`Task: ${task.text}\nFrom: [[${task.file.path}]]\n\n---\n\n${text}\n`
		);
		return ` [[${notePath.replace(/\.md$/, "")}]]`;
	}

	private async resetInProgress(): Promise<void> {
		let count = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(file);
			if (!content.includes("- [/]") || !content.includes(this.settings.tag)) {
				continue;
			}
			await this.app.vault.process(file, (data) =>
				data
					.split("\n")
					.map((line) => {
						if (
							line.includes(this.settings.tag) &&
							line.trimStart().startsWith("- [/]")
						) {
							count++;
							return line.replace("- [/]", "- [ ]");
						}
						return line;
					})
					.join("\n")
			);
		}
		new Notice(`Reset ${count} in-progress agent task(s).`);
	}
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}
