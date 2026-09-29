// Simulated incoming reports for the wireframe. Everything here is fake and is shown with a
// "sample" badge. The scenario walks one problem from watch to urgent, with unrelated noise.
import type { Source } from "./types";

export interface SampleTemplate {
  source: Source;
  author: string;
  title: string;
  problem: string;
  dup: string;
}

export const SCENARIO: SampleTemplate[] = [
  {
    source: "github",
    author: "sample-ana",
    title: "Telegram bot stopped replying after update to v9.9.1",
    problem: "Since updating to v9.9.1 the Telegram adapter receives messages but the gateway never sends a reply.",
    dup: "telegram gateway replies stopped 9.9.1 update",
  },
  {
    source: "discord",
    author: "sample-kit",
    title: "#support: how do I set a custom skills directory?",
    problem: "User asks how to point Hermes at a skills directory outside the profile.",
    dup: "custom skills directory path profile config",
  },
  {
    source: "github",
    author: "sample-bo",
    title: "No replies on Telegram since 9.9.1",
    problem: "After upgrading to 9.9.1 the gateway logs incoming Telegram messages but no replies are delivered.",
    dup: "telegram gateway replies stopped 9.9.1 delivery",
  },
  {
    source: "github",
    author: "sample-lee",
    title: "Feature: per-profile default model in the TUI",
    problem: "Request to let each profile pin its own default model in the TUI.",
    dup: "tui profile default model pin",
  },
  {
    source: "github",
    author: "sample-cy",
    title: "Gateway silently drops Telegram replies (9.9.1)",
    problem: "On 9.9.1 Telegram replies are dropped without an error; rolling back to the previous version fixes it.",
    dup: "telegram gateway replies stopped 9.9.1 dropped",
  },
  {
    source: "discord",
    author: "sample-dee",
    title: "#support: bot reads my messages but never answers",
    problem: "Support thread: after updating to 9.9.1 the Telegram bot shows typing but never replies.",
    dup: "telegram gateway replies stopped 9.9.1 typing",
  },
  {
    source: "discord",
    author: "sample-eli",
    title: "#support: cron job ran twice overnight",
    problem: "User reports one cron job firing twice around a DST change.",
    dup: "cron job duplicate run dst",
  },
  {
    source: "github",
    author: "sample-fay",
    title: "Telegram replies still missing after restart on 9.9.1",
    problem: "Restarting the gateway on 9.9.1 does not bring Telegram replies back.",
    dup: "telegram gateway replies stopped 9.9.1 restart",
  },
];
