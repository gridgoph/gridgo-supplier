import Constants from "expo-constants";
import { Platform } from "react-native";

import { orderReference } from "@/lib/orderReference";

/**
 * A problem report, as Operations reads it in the shop's chat.
 *
 * The support chat carries text and nothing else — no message kind, no
 * attachment — so a report is marked the only way a desk reading plain text
 * can see: its first line says "Problem report", which is also what the chat
 * history shows as the thread's preview. Everything a shop would otherwise be
 * asked for next (which job, which app build, which phone) is written in
 * underneath, so the first reply can be about the problem.
 *
 * No photo, on purpose: until the chat has a file purpose of its own and the
 * Operations desk can open one, a stored photo would be a reference nobody can
 * follow.
 */

/** Operations' chat caps a message at 4000; this leaves room for the context lines. */
export const PROBLEM_REPORT_MAX = 1500;

export const PROBLEM_REPORT_HEADING = "Problem report";

export type ProblemReportJob = {
  orderId: string;
  title?: string | null;
};

export type ProblemReportDevice = {
  /** "1.0.42", with "(development)" on a build that is not a release. */
  appVersion: string;
  /** "Android 15, Samsung SM-A155F" or "iOS 18.1". */
  device: string;
};

export type ProblemReportInput = {
  what: string;
  job?: ProblemReportJob | null;
  context: ProblemReportDevice;
};

/** The sentence the form shows under the field, or null when it can be sent. */
export function problemReportIssue(what: string): string | null {
  if (!what.trim()) return "Say what went wrong before you send it.";
  if (what.trim().length > PROBLEM_REPORT_MAX) {
    return `Keep it under ${PROBLEM_REPORT_MAX} characters. Operations can ask for more in the chat.`;
  }
  return null;
}

/** "Order 3FF0-128E-105A (ord_3ff0128e105a)": the reference a shop reads, and the id Operations opens. */
export function problemReportJobLine(job: ProblemReportJob): string {
  const reference = orderReference(job.orderId) ?? job.orderId;
  return reference === job.orderId ? `Order ${reference}` : `Order ${reference} (${job.orderId})`;
}

/** The message body posted to Operations. */
export function composeProblemReport({ what, job, context }: ProblemReportInput): string {
  const lines = [PROBLEM_REPORT_HEADING];
  if (job) {
    const title = job.title?.trim();
    if (title) lines.push(`Job: ${title}`);
    lines.push(problemReportJobLine(job));
  }
  lines.push("", what.replace(/\r\n/g, "\n").trim(), "");
  lines.push(`App: GRIDGO Supplier ${context.appVersion}`);
  lines.push(`Phone: ${context.device}`);
  return lines.join("\n");
}

type AndroidConstants = { Release?: string; Manufacturer?: string; Brand?: string; Model?: string };
type IosConstants = { systemName?: string; osVersion?: string };

/** The build and phone this report is sent from. */
export function readProblemReportDevice(): ProblemReportDevice {
  const version = Constants.expoConfig?.version?.trim() || "unknown version";
  const appVersion = __DEV__ ? `${version} (development)` : version;
  return { appVersion, device: describeDevice() };
}

function describeDevice(): string {
  if (Platform.OS === "android") {
    const c = (Platform.constants ?? {}) as AndroidConstants;
    const os = `Android ${c.Release ?? String(Platform.Version)}`;
    const maker = (c.Manufacturer || c.Brand || "").trim();
    const model = (c.Model || "").trim();
    const phone = [capitalise(maker), model].filter(Boolean).join(" ");
    return phone ? `${os}, ${phone}` : os;
  }
  if (Platform.OS === "ios") {
    const c = (Platform.constants ?? {}) as IosConstants;
    return `${c.systemName || "iOS"} ${c.osVersion ?? String(Platform.Version)}`.trim();
  }
  return "Web browser";
}

function capitalise(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
