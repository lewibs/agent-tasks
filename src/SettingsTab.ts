import AgentTasks from "main";
import { App, PluginSettingTab, Setting } from "obsidian";
import { SettingsManager } from "./SettingsManager";

export class SettingsTab extends PluginSettingTab {
	private plugin: AgentTasks;
	private settingsManager: SettingsManager;

	constructor(app: App, plugin: AgentTasks) {
		super(app, plugin);
		this.plugin = plugin;
		this.settingsManager = plugin.settingsManager;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "Tag any task with #agent and press the robot button — Claude Code completes it against your vault using your existing Claude login. Add MCP servers to Claude Code (email, calendars, APIs) and agents can use those too.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Claude Code path")
			.setDesc(
				"Path to the claude executable. Leave as 'claude' if it is on your PATH."
			)
			.addText((text) =>
				text
					.setPlaceholder("claude")
					.setValue(this.plugin.settings.claudePath)
					.onChange(async (value) => {
						this.plugin.settings.claudePath = value || "claude";
						await this.settingsManager.saveSettings(
							this.plugin.settings
						);
					})
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc(
				"Model for agent runs. Empty uses your Claude Code default."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("", "Default")
					.addOption("sonnet", "Sonnet")
					.addOption("opus", "Opus")
					.addOption("haiku", "Haiku")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.settingsManager.saveSettings(
							this.plugin.settings
						);
					})
			);

		new Setting(containerEl)
			.setName("Permissions")
			.setDesc(
				"'Accept edits' lets the agent edit files but blocks risky commands. 'Full autonomy' skips all permission prompts — more capable, use with care."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("acceptEdits", "Accept edits (safer)")
					.addOption("bypassPermissions", "Full autonomy")
					.setValue(this.plugin.settings.permissionMode)
					.onChange(async (value) => {
						this.plugin.settings.permissionMode =
							value === "bypassPermissions"
								? "bypassPermissions"
								: "acceptEdits";
						await this.settingsManager.saveSettings(
							this.plugin.settings
						);
					})
			);

		new Setting(containerEl)
			.setName("Task tag")
			.setDesc("Tasks containing this tag are picked up.")
			.addText((text) =>
				text
					.setPlaceholder("#agent")
					.setValue(this.plugin.settings.tag)
					.onChange(async (value) => {
						this.plugin.settings.tag = value || "#agent";
						await this.settingsManager.saveSettings(
							this.plugin.settings
						);
					})
			);

		new Setting(containerEl)
			.setName("Results folder")
			.setDesc(
				"Long results are written as notes here and linked under the task."
			)
			.addText((text) =>
				text
					.setPlaceholder("agent-outputs")
					.setValue(this.plugin.settings.resultFolder)
					.onChange(async (value) => {
						this.plugin.settings.resultFolder =
							value || "agent-outputs";
						await this.settingsManager.saveSettings(
							this.plugin.settings
						);
					})
			);
	}
}
