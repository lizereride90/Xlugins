import { registerCommand } from "@revenge-mod/api/commands";
import { storage } from "@revenge-mod/plugin";

const PLUGIN_NAME = "MuteCommand";

export default {
    onLoad() {
        this.patches = [];

        // Register the /mute slash command
        const unregister = registerCommand({
            name: "mute",
            displayName: "mute",
            description: "Mute a user for a specified duration",
            displayDescription: "Mute a user for a specified duration",
            type: 1, // CHAT_INPUT
            inputType: 1, // BUILT_IN_TEXT
            options: [
                {
                    name: "user",
                    displayName: "user",
                    description: "The user to mute",
                    displayDescription: "The user to mute",
                    type: 6, // USER
                    required: true,
                },
                {
                    name: "duration",
                    displayName: "duration",
                    description: "Duration in minutes",
                    displayDescription: "Duration in minutes",
                    type: 4, // INTEGER
                    required: true,
                },
                {
                    name: "reason",
                    displayName: "reason",
                    description: "Reason for the mute",
                    displayDescription: "Reason for the mute",
                    type: 3, // STRING
                    required: false,
                },
            ],
            execute: async (args, ctx) => {
                try {
                    const userOption = args.find((a) => a.name === "user");
                    const durationOption = args.find((a) => a.name === "duration");
                    const reasonOption = args.find((a) => a.name === "reason");

                    const userId = userOption?.value;
                    const duration = parseInt(durationOption?.value);
                    const reason = reasonOption?.value || "No reason provided";

                    if (!userId || isNaN(duration) || duration <= 0) {
                        return {
                            content: "❌ Invalid arguments. Please provide a valid user and duration (in minutes).",
                        };
                    }

                    const guildId = ctx.guild?.id || ctx.channel?.guild_id;

                    if (!guildId) {
                        return {
                            content: "❌ This command can only be used in a server.",
                        };
                    }

                    // Calculate timeout duration in ISO 8601
                    const timeoutUntil = new Date(
                        Date.now() + duration * 60 * 1000
                    ).toISOString();

                    // Use Discord API to timeout (mute) the user
                    const { getToken } =
                        revenge.modules.findByProps("getToken");
                    const token = getToken();

                    const response = await fetch(
                        `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
                        {
                            method: "PATCH",
                            headers: {
                                Authorization: token,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                communication_disabled_until: timeoutUntil,
                            }),
                        }
                    );

                    if (response.ok) {
                        const durationText =
                            duration >= 60
                                ? `${Math.floor(duration / 60)}h ${duration % 60}m`
                                : `${duration}m`;

                        return {
                            content: `✅ Successfully muted <@${userId}> for **${durationText}**.\n📝 Reason: ${reason}`,
                        };
                    } else {
                        const error = await response.json();
                        return {
                            content: `❌ Failed to mute user: ${error.message || "Unknown error"}. Make sure you have the **Moderate Members** permission.`,
                        };
                    }
                } catch (err) {
                    return {
                        content: `❌ An error occurred: ${err.message}`,
                    };
                }
            },
        });

        this.patches.push(unregister);
    },

    onUnload() {
        // Clean up all registered commands
        this.patches.forEach((unpatch) => unpatch());
        this.patches = [];
    },

    settings: null,
};
