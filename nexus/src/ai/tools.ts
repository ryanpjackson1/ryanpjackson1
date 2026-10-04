import { MODULE_IDS } from "@/core/modules";
import { BRIDGE_VERBS } from "@/bridge/verbs";

/**
 * Tool declarations offered to the model. CLIENT tools are executed by the
 * browser (they move the interface); SERVER tools are executed in the
 * route and their result is fed straight back to the model.
 */
export const CLIENT_TOOLS = ["open_module", "close_module", "rotate_carousel", "switch_world", "transform_form", "desktop_action"] as const;
export const SERVER_TOOLS = ["get_ticker", "get_module_data"] as const;
export type ClientTool = (typeof CLIENT_TOOLS)[number];

export const FUNCTION_DECLARATIONS = [
  {
    name: "open_module",
    description: "Open (or, in human form, present beside the figure) one of the NEXUS modules.",
    parameters: { type: "OBJECT", properties: { module: { type: "STRING", enum: [...MODULE_IDS] } }, required: ["module"] },
  },
  { name: "close_module", description: "Close the open module / panel.", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "rotate_carousel",
    description: "Rotate the ring of cards. Not available in human form.",
    parameters: { type: "OBJECT", properties: { direction: { type: "STRING", enum: ["left", "right"] }, steps: { type: "INTEGER" } }, required: ["direction"] },
  },
  {
    name: "switch_world",
    description: "Change the environment.",
    parameters: { type: "OBJECT", properties: { world: { type: "STRING", enum: ["studio", "lab", "observatory", "industrial", "ocean", "fog"] } }, required: ["world"] },
  },
  {
    name: "transform_form",
    description: "Transform the whole interface into a digital human shape, or return to the spatial ring of cards. Use when the user asks for this in any phrasing.",
    parameters: { type: "OBJECT", properties: { to: { type: "STRING", enum: ["human", "spatial"] } }, required: ["to"] },
  },
  {
    name: "desktop_action",
    description:
      "Act on the user's Mac through the local desktop bridge (launch apps by name, open websites, media, volume, screenshot, clipboard, hide others, quit an app gracefully, lock, sleep display, Do Not Disturb, notes, reminders). There is no shutdown, restart or delete.",
    parameters: {
      type: "OBJECT",
      properties: {
        verb: { type: "STRING", enum: [...BRIDGE_VERBS] },
        app: { type: "STRING" }, url: { type: "STRING" }, display: { type: "STRING" },
        action: { type: "STRING", enum: ["play", "pause", "toggle", "next", "previous"] },
        level: { type: "NUMBER" }, delta: { type: "NUMBER" }, mute: { type: "BOOLEAN" },
        text: { type: "STRING" }, on: { type: "BOOLEAN" }, title: { type: "STRING" }, body: { type: "STRING" }, due: { type: "STRING" },
      },
      required: ["verb"],
    },
  },
  {
    name: "get_ticker",
    description: "Live price and recent performance for a stock ticker symbol (e.g. NVDA).",
    parameters: { type: "OBJECT", properties: { symbol: { type: "STRING" } }, required: ["symbol"] },
  },
  {
    name: "get_module_data",
    description: "Fetch the live data of a NEXUS module (news articles, calendar events, weather, sports scores, portfolio, instagram, projects, system).",
    parameters: { type: "OBJECT", properties: { module: { type: "STRING", enum: [...MODULE_IDS] } }, required: ["module"] },
  },
];

export const SYSTEM_PROMPT = `You are NEXUS, the intelligence of a spatial operating system. You speak aloud, so:
- Answer in short, natural spoken sentences. No markdown, no bullet lists, no emoji, no URLs read aloud.
- Lead with the answer. Two to four sentences unless the user asks for depth.
- You can see the interface state in CONTEXT. "This", "that", "here" refer to the open module or presented panel.
- Use tools to act: open modules, rotate, change worlds, transform form, and act on the user's Mac. Then say briefly what you did.
- For live numbers (stocks, news, schedule, scores, weather), call get_module_data or get_ticker rather than guessing.
- Never claim to have done something a tool did not confirm. If a tool returns an error, say what to do about it.
- Tone: calm, precise, warm, slightly understated. You are a synthetic intelligence, not a person.`;
