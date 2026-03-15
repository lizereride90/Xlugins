import { registerCommand } from "@revenge-mod/api/commands";

// Discord timeouts must be between 1 minute and 28 days (max 2419200 seconds)
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

let unregister;

const parseDuration = (raw) => {
  if (raw == null) return { ok: false, message: "No duration provided." };

  const text = String(raw).trim().toLowerCase();
  const match = text.match(/^(\d+)([mhd]?)$/);
  if (!match) return { ok: false, message: "Use numbers with optional m/h/d (e.g. 30, 30m, 2h, 1d)." };

  const value = parseInt(match[1], 10);
  const unit = match[2] || "m"; // default minutes

  const multiplier = unit === "d" ? 24 * 60 : unit === "h" ? 60 : 1;
  const minutes = value * multiplier;
  const ms = minutes * 60 * 1000;

  if (ms < MIN_TIMEOUT_MS) return { ok: false, message: "Duration must be at least 1 minute." };
  if (ms > MAX_TIMEOUT_MS) return { ok: false, message: "Discord limits timeouts to 28 days." };

  return { ok: true, ms, minutes };
};

const formatDuration = (minutes) => {
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const remH = Math.floor((minutes % 1440) / 60);
    const remM = minutes % 60;
    return [
      days ? `${days}d` : "",
      remH ? `${remH}h` : "",
      remM && !days ? `${remM}m` : remM && days ? `${remM}m` : ""
    ].filter(Boolean).join(" ") || "0m";
  }
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`.trim();
  return `${minutes}m`;
};

export default {
  onLoad() {
    unregister = registerCommand({
      name: "mute",
      displayName: "mute",
      description: "Timeout a member with duration parsing and better errors",
      displayDescription: "Timeout a member with duration parsing and better errors",
      type: 1,
      inputType: 1,
      options: [
        {
          name: "user",
          displayName: "user",
          description: "User to mute",
          displayDescription: "User to mute",
          type: 6,
          required: true
        },
        {
          name: "duration",
          displayName: "duration",
          description: "Duration (e.g. 30m, 2h, 1d)",
          displayDescription: "Duration (e.g. 30m, 2h, 1d)",
          type: 3,
          required: true
        },
        {
          name: "reason",
          displayName: "reason",
          description: "Why you are muting",
          displayDescription: "Why you are muting",
          type: 3,
          required: false
        }
      ],
      execute: async (args, ctx) => {
        try {
          const userId = args.find(a => a.name === "user")?.value;
          const durationRaw = args.find(a => a.name === "duration")?.value;
          const reason = (args.find(a => a.name === "reason")?.value || "No reason provided").trim();

          const parsed = parseDuration(durationRaw);
          if (!parsed.ok) return { content: `❌ ${parsed.message}` };

          const guildId = ctx.guild?.id || ctx.channel?.guild_id;
          if (!guildId) return { content: "❌ This command can only be used in a server." };

          const timeoutUntil = new Date(Date.now() + parsed.ms).toISOString();

          const token = revenge.modules.findByProps("getToken")?.getToken?.();
          if (!token) return { content: "❌ Could not get user token." };

          const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
            method: "PATCH",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
              "X-Audit-Log-Reason": encodeURIComponent(reason).slice(0, 512)
            },
            body: JSON.stringify({ communication_disabled_until: timeoutUntil })
          });

          if (response.ok) {
            return {
              content: `✅ Muted <@${userId}> for **${formatDuration(parsed.minutes)}**.\n📝 Reason: ${reason}`
            };
          }

          if (response.status === 429) {
            const retry = response.headers.get("retry-after") || "a bit";
            return { content: `⏳ Rate limited. Try again after ${retry} seconds.` };
          }

          const error = await response.json().catch(() => ({}));
          const msg = error.message || `HTTP ${response.status}`;

          if (response.status === 403) {
            return { content: `🚫 Failed: ${msg}. You likely need the Moderate Members permission and a role above the target.` };
          }

          if (response.status === 404) {
            return { content: "❌ Could not find that member in this guild." };
          }

          return { content: `❌ Failed to mute user: ${msg}.` };
        } catch (err) {
          return { content: `❌ An error occurred: ${err.message}` };
        }
      }
    });
  },

  onUnload() {
    unregister?.();
  }
};
