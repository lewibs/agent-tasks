import { Plugin } from "obsidian";

export interface AgentTasksSettings {
	claudePath: string;
	model: string;
	permissionMode: "acceptEdits" | "bypassPermissions";
	tag: string;
	resultFolder: string;
}

export const DEFAULT_SETTINGS: AgentTasksSettings = {
	claudePath: "claude",
	model: "",
	permissionMode: "acceptEdits",
	tag: "#agent",
	resultFolder: "agent-outputs",
};

export class SettingsManager {
	private plugin: Plugin;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	async loadSettings(): Promise<AgentTasksSettings> {
		return Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.plugin.loadData()
		);
	}

	async saveSettings(settings: AgentTasksSettings): Promise<void> {
		await this.plugin.saveData(settings);
	}
}
