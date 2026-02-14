import type { Scorer, ScorerContext, ScorerResult } from "@syntharena/shared";

/**
 * Multi-turn conversation scorers.
 *
 * Evaluates agent performance across multi-step conversations,
 * not just single-shot tasks. Competitive with LangSmith's
 * thread-based evaluation and Insights Agent.
 *
 * Conversation data is expected in the output as an array of messages:
 * ```ts
 * type ConversationMessage = {
 *   role: "user" | "assistant" | "system" | "tool";
 *   content: string;
 *   metadata?: Record<string, unknown>;
 * };
 * ```
 */

interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata?: Record<string, unknown>;
}

/** Extract conversation messages from scorer output. */
function extractConversation(output: unknown): ConversationMessage[] {
  if (Array.isArray(output)) {
    return output.filter(
      (m): m is ConversationMessage =>
        typeof m === "object" && m !== null && "role" in m && "content" in m
    );
  }
  // If output is an object with a "messages" or "conversation" key
  if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;
    if (Array.isArray(obj["messages"])) return extractConversation(obj["messages"]);
    if (Array.isArray(obj["conversation"])) return extractConversation(obj["conversation"]);
  }
  return [];
}

// ─── Context Retention ────────────────────────────────────────────

/**
 * Checks that the agent retains context from earlier turns.
 *
 * Works by checking if key entities/facts mentioned by the user
 * in earlier turns are referenced or acknowledged in later responses.
 */
export function contextRetention(opts?: {
  /** Minimum fraction of user entities that must be retained (default: 0.5) */
  minRetention?: number;
}): Scorer {
  const minRetention = opts?.minRetention ?? 0.5;

  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const messages = extractConversation(ctx.output);
    if (messages.length < 4) {
      return { name: "context_retention", score: 1, passed: true, reason: "Too few turns to evaluate" };
    }

    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    if (userMessages.length === 0 || assistantMessages.length === 0) {
      return { name: "context_retention", score: 0, passed: false, reason: "No user/assistant messages" };
    }

    // Extract key entities from early user messages (first half)
    const earlyUserMsgs = userMessages.slice(0, Math.ceil(userMessages.length / 2));
    const entities = extractEntities(earlyUserMsgs.map((m) => m.content).join(" "));

    if (entities.length === 0) {
      return { name: "context_retention", score: 1, passed: true, reason: "No entities to track" };
    }

    // Check how many entities appear in later assistant responses
    const laterAssistantText = assistantMessages
      .slice(Math.floor(assistantMessages.length / 2))
      .map((m) => m.content)
      .join(" ")
      .toLowerCase();

    const retained = entities.filter((e) => laterAssistantText.includes(e.toLowerCase()));
    const retentionRate = retained.length / entities.length;

    return {
      name: "context_retention",
      score: retentionRate,
      passed: retentionRate >= minRetention,
      reason: retentionRate < minRetention
        ? `Only ${retained.length}/${entities.length} entities retained (${(retentionRate * 100).toFixed(0)}%)`
        : undefined,
      metadata: {
        totalEntities: entities.length,
        retainedEntities: retained.length,
        retentionRate,
        entities,
        retained,
      },
    };
  };
}

// ─── Conversation Coherence ──────────────────────────────────────

/**
 * Checks that assistant responses are coherent with the conversation flow.
 * Detects:
 * - Contradictions within the same conversation
 * - Repetitions (copy-paste responses)
 * - Non-sequiturs (responses unrelated to user's last message)
 */
export function conversationCoherence(): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const messages = extractConversation(ctx.output);
    const assistantMessages = messages.filter((m) => m.role === "assistant");

    if (assistantMessages.length < 2) {
      return { name: "conversation_coherence", score: 1, passed: true, reason: "Too few responses to evaluate" };
    }

    const issues: string[] = [];

    // Check for repetition (exact or near-duplicate responses)
    for (let i = 0; i < assistantMessages.length; i++) {
      for (let j = i + 1; j < assistantMessages.length; j++) {
        const similarity = stringSimilarity(assistantMessages[i]!.content, assistantMessages[j]!.content);
        if (similarity > 0.9) {
          issues.push(`Response ${i + 1} and ${j + 1} are near-identical (${(similarity * 100).toFixed(0)}%)`);
        }
      }
    }

    // Check for empty/trivial responses
    for (let i = 0; i < assistantMessages.length; i++) {
      if (assistantMessages[i]!.content.trim().length < 5) {
        issues.push(`Response ${i + 1} is trivially short`);
      }
    }

    // Check for response relevance to preceding user message
    for (let i = 0; i < messages.length; i++) {
      if (messages[i]!.role !== "assistant") continue;

      // Find the preceding user message
      let prevUser: ConversationMessage | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j]!.role === "user") {
          prevUser = messages[j]!;
          break;
        }
      }

      if (prevUser) {
        const relevance = topicOverlap(prevUser.content, messages[i]!.content);
        if (relevance < 0.1) {
          issues.push(`Response at turn ${i + 1} may be a non-sequitur (low topic overlap)`);
        }
      }
    }

    const maxIssues = assistantMessages.length * 2; // generous upper bound
    const score = Math.max(0, 1 - issues.length / maxIssues);

    return {
      name: "conversation_coherence",
      score,
      passed: issues.length === 0,
      reason: issues.length > 0 ? issues.join("; ") : undefined,
      metadata: { issueCount: issues.length, issues },
    };
  };
}

// ─── Turn Efficiency ────────────────────────────────────────────

/**
 * Checks that the agent completes the task in a reasonable number of turns.
 * Penalizes excessive back-and-forth that could be resolved in fewer steps.
 */
export function turnEfficiency(opts: {
  /** Maximum total turns before penalty. */
  maxTurns: number;
  /** Maximum assistant turns before penalty. */
  maxAssistantTurns?: number;
}): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const messages = extractConversation(ctx.output);
    const assistantTurns = messages.filter((m) => m.role === "assistant").length;
    const totalTurns = messages.length;
    const maxAssist = opts.maxAssistantTurns ?? opts.maxTurns;

    const withinTotal = totalTurns <= opts.maxTurns;
    const withinAssistant = assistantTurns <= maxAssist;
    const passed = withinTotal && withinAssistant;

    const totalScore = Math.min(1, opts.maxTurns / Math.max(totalTurns, 1));
    const assistScore = Math.min(1, maxAssist / Math.max(assistantTurns, 1));
    const score = Math.min(totalScore, assistScore);

    return {
      name: "turn_efficiency",
      score,
      passed,
      reason: !passed
        ? `${totalTurns} total turns (max: ${opts.maxTurns}), ${assistantTurns} assistant turns (max: ${maxAssist})`
        : undefined,
      metadata: { totalTurns, assistantTurns, maxTurns: opts.maxTurns, maxAssistantTurns: maxAssist },
    };
  };
}

// ─── Goal Completion ────────────────────────────────────────────

/**
 * Checks that the conversation reached a satisfactory conclusion.
 * Detects incomplete conversations where the user's goal wasn't met.
 */
export function goalCompletion(opts?: {
  /** Keywords that indicate successful completion. */
  completionSignals?: string[];
  /** Keywords that indicate failure or abandonment. */
  failureSignals?: string[];
}): Scorer {
  const completionSignals = opts?.completionSignals ?? [
    "done", "completed", "success", "thank", "thanks", "perfect",
    "great", "awesome", "that's all", "that works",
  ];
  const failureSignals = opts?.failureSignals ?? [
    "give up", "never mind", "forget it", "this isn't working",
    "cancel", "stop", "wrong", "not what I asked",
  ];

  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const messages = extractConversation(ctx.output);
    if (messages.length === 0) {
      return { name: "goal_completion", score: 0, passed: false, reason: "No conversation messages" };
    }

    // Check the last few messages for completion/failure signals
    const lastMessages = messages.slice(-3).map((m) => m.content.toLowerCase());
    const allText = lastMessages.join(" ");

    const hasCompletion = completionSignals.some((s) => allText.includes(s));
    const hasFailure = failureSignals.some((s) => allText.includes(s));

    let score: number;
    if (hasCompletion && !hasFailure) score = 1;
    else if (hasFailure) score = 0;
    else score = 0.5; // Ambiguous ending

    return {
      name: "goal_completion",
      score,
      passed: score >= 0.7,
      reason: hasFailure
        ? "Conversation ended with failure signals"
        : !hasCompletion
          ? "No clear completion signal found"
          : undefined,
      metadata: {
        hasCompletionSignal: hasCompletion,
        hasFailureSignal: hasFailure,
        lastTurnCount: lastMessages.length,
      },
    };
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Extract potential entities (proper nouns, numbers, quoted phrases) from text. */
function extractEntities(text: string): string[] {
  const entities = new Set<string>();

  // Quoted phrases
  const quoted = text.match(/"[^"]+"/g) ?? [];
  for (const q of quoted) entities.add(q.replace(/"/g, ""));

  // Numbers (dates, IDs, amounts)
  const numbers = text.match(/\b\d{2,}\b/g) ?? [];
  for (const n of numbers) entities.add(n);

  // Capitalized words (potential proper nouns) — skip sentence starters
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!.replace(/[.,;:!?]/g, "");
    if (word.length > 2 && /^[A-Z][a-z]/.test(word)) {
      entities.add(word);
    }
  }

  return Array.from(entities).slice(0, 20); // Cap at 20 entities
}

/** Simple string similarity (Jaccard on word sets). */
function stringSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/** Topic overlap between two text segments (word overlap ratio). */
function topicOverlap(a: string, b: string): number {
  const stopwords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "it", "its", "this", "that", "and", "or", "but", "not", "no", "if", "i", "you", "he", "she", "we", "they", "my", "your", "his", "her", "our"]);
  const wordsA = a.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w)));
  if (wordsA.length === 0) return 0;
  const overlap = wordsA.filter((w) => wordsB.has(w));
  return overlap.length / wordsA.length;
}
