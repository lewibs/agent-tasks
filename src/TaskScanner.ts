import { TFile, Vault } from "obsidian";

export interface AgentTask {
	file: TFile;
	lineNumber: number; // 0-indexed
	line: string; // full original line
	indent: string;
	text: string; // task text without checkbox/tag
}

// Matches an open task: "- [ ] some text #agent more text"
function taskRegex(tag: string): RegExp {
	const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^([ \\t]*)- \\[ \\] (.*${escaped}.*)$`);
}

export async function scanForTasks(
	vault: Vault,
	tag: string
): Promise<AgentTask[]> {
	const regex = taskRegex(tag);
	const tasks: AgentTask[] = [];

	for (const file of vault.getMarkdownFiles()) {
		const content = await vault.cachedRead(file);
		if (!content.includes(tag)) {
			continue;
		}
		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(regex);
			if (match) {
				tasks.push({
					file,
					lineNumber: i,
					line: lines[i],
					indent: match[1],
					text: match[2].replace(tag, "").trim(),
				});
			}
		}
	}
	return tasks;
}

// Replaces one exact line in a file, verifying it hasn't changed since scan.
// Returns false when the expected line was not found (file edited meanwhile).
export async function replaceTaskLine(
	vault: Vault,
	file: TFile,
	expectedLine: string,
	newLines: string[]
): Promise<boolean> {
	let replaced = false;
	await vault.process(file, (content) => {
		const lines = content.split("\n");
		const idx = lines.indexOf(expectedLine);
		if (idx === -1) {
			return content;
		}
		lines.splice(idx, 1, ...newLines);
		replaced = true;
		return lines.join("\n");
	});
	return replaced;
}
