import Anthropic from "@anthropic-ai/sdk";

/**
 * LLM-powered user simulator for conversational agent testing.
 *
 * Simulates realistic human behavior during multi-turn interactions:
 * - Patient on a reactivation call (healthcare)
 * - Government contracting officer responding to questions
 * - End user interacting with a chatbot
 *
 * Each persona has configurable traits that affect behavior.
 */

export interface UserPersona {
  name: string;
  description: string;
  traits: PersonaTraits;
  background: string;
  objectives: string[];
  constraints: string[];
}

export interface PersonaTraits {
  cooperativeness: number; // 0-1: how willing to provide info
  patience: number; // 0-1: how many turns before frustration
  techSavviness: number; // 0-1: understanding of technical concepts
  verbosity: number; // 0-1: how detailed responses are
  emotionalState: "neutral" | "happy" | "frustrated" | "anxious" | "hostile";
}

export interface SimulatorConfig {
  persona: UserPersona;
  maxTurns: number;
  apiKey?: string;
  model?: string;
}

export interface ConversationTurn {
  role: "agent" | "user";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class UserSimulator {
  private config: SimulatorConfig;
  private history: ConversationTurn[] = [];
  private client: Anthropic;
  private model: string;

  constructor(config: SimulatorConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? "claude-sonnet-4-20250514";
  }

  /**
   * Generate a user response to an agent message.
   */
  async respond(agentMessage: string): Promise<ConversationTurn> {
    // Record agent turn
    this.history.push({
      role: "agent",
      content: agentMessage,
      timestamp: Date.now(),
    });

    // Check if we've exceeded max turns
    const userTurns = this.history.filter((t) => t.role === "user").length;
    if (userTurns >= this.config.maxTurns) {
      const endTurn: ConversationTurn = {
        role: "user",
        content: this.generateEndConversation(),
        timestamp: Date.now(),
        metadata: { reason: "max_turns_exceeded" },
      };
      this.history.push(endTurn);
      return endTurn;
    }

    const systemPrompt = this.buildSystemPrompt();
    const messages = this.history.map((t) => ({
      role: t.role === "agent" ? "user" as const : "assistant" as const,
      content: t.content,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const content = textBlock?.type === "text" ? textBlock.text : "I'm sorry, I need to go.";

    const turn: ConversationTurn = {
      role: "user",
      content,
      timestamp: Date.now(),
      metadata: {
        turnNumber: userTurns + 1,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      },
    };

    this.history.push(turn);
    return turn;
  }

  getHistory(): ConversationTurn[] {
    return [...this.history];
  }

  reset(): void {
    this.history = [];
  }

  private buildSystemPrompt(): string {
    const { persona } = this.config;
    const { traits } = persona;

    return `You are simulating a person in a conversation. Stay in character at all times.

CHARACTER:
Name: ${persona.name}
Description: ${persona.description}
Background: ${persona.background}

PERSONALITY TRAITS:
- Cooperativeness: ${traits.cooperativeness < 0.3 ? "Low - reluctant to share info, needs convincing" : traits.cooperativeness < 0.7 ? "Medium - willing but needs rapport" : "High - open and forthcoming"}
- Patience: ${traits.patience < 0.3 ? "Low - gets frustrated quickly, may hang up" : traits.patience < 0.7 ? "Medium - tolerant but has limits" : "High - very patient and understanding"}
- Tech savviness: ${traits.techSavviness < 0.3 ? "Low - needs simple explanations" : traits.techSavviness < 0.7 ? "Medium - understands basics" : "High - technically proficient"}
- Verbosity: ${traits.verbosity < 0.3 ? "Brief - short answers, few words" : traits.verbosity < 0.7 ? "Normal - conversational" : "Verbose - detailed, talkative"}
- Current mood: ${traits.emotionalState}

YOUR OBJECTIVES (what you want from this interaction):
${persona.objectives.map((o) => `- ${o}`).join("\n")}

CONSTRAINTS (what you will NOT do):
${persona.constraints.map((c) => `- ${c}`).join("\n")}

RULES:
- Respond naturally as this person would
- Show realistic human behavior (pauses, questions, hesitation)
- If asked for information you wouldn't know, say so
- Your mood may shift based on how the conversation goes
- Keep responses concise (1-3 sentences) unless your verbosity is high
- If the agent is rude or pushy, react accordingly`;
  }

  private generateEndConversation(): string {
    const endings = [
      "I'm sorry, I really need to go now.",
      "I appreciate your time, but I have to wrap up.",
      "Can we continue this another time? I need to go.",
      "Thank you, but I need to end this conversation.",
    ];
    return endings[Math.floor(Math.random() * endings.length)]!;
  }
}

// ─── Pre-built Personas ──────────────────────────────────────────────

export const DENTAL_PATIENT_LAPSED: UserPersona = {
  name: "Sarah Mitchell",
  description: "A 42-year-old accountant who hasn't been to the dentist in 18 months",
  traits: {
    cooperativeness: 0.5,
    patience: 0.6,
    techSavviness: 0.7,
    verbosity: 0.4,
    emotionalState: "neutral",
  },
  background: "Busy professional, let dental visits slip due to work schedule. Has PPO insurance. No major dental issues but knows she should go.",
  objectives: [
    "Find a convenient appointment time that works with your schedule",
    "Verify your insurance is still accepted",
    "Ask about the cost of a cleaning and exam",
  ],
  constraints: [
    "Won't schedule anything during work hours (9am-5pm weekdays)",
    "Won't provide your SSN or full insurance ID over the phone",
    "Will get frustrated if pressured too aggressively",
  ],
};

export const DENTAL_PATIENT_ANXIOUS: UserPersona = {
  name: "James Rivera",
  description: "A 35-year-old teacher with dental anxiety who hasn't visited in 3 years",
  traits: {
    cooperativeness: 0.3,
    patience: 0.4,
    techSavviness: 0.5,
    verbosity: 0.3,
    emotionalState: "anxious",
  },
  background: "Had a painful experience at a dentist as a child. Knows he needs to go but keeps putting it off. Has some tooth sensitivity.",
  objectives: [
    "Get reassurance about pain management options",
    "Ask about sedation dentistry availability",
    "Maybe schedule if you feel comfortable enough",
  ],
  constraints: [
    "Won't commit to an appointment without hearing about anxiety management",
    "Will shut down if the caller dismisses your fears",
    "Need to hear about the specific dentist's approach to anxious patients",
  ],
};

export const GOV_CONTRACTING_OFFICER: UserPersona = {
  name: "Patricia Williams",
  description: "GS-14 Contracting Officer at the Department of Health and Human Services",
  traits: {
    cooperativeness: 0.6,
    patience: 0.7,
    techSavviness: 0.8,
    verbosity: 0.6,
    emotionalState: "neutral",
  },
  background: "20 years in federal contracting. Handles IT services acquisitions. Strict about FAR compliance.",
  objectives: [
    "Evaluate whether the vendor meets technical requirements",
    "Verify small business certifications",
    "Assess past performance references",
  ],
  constraints: [
    "Cannot share non-public procurement information",
    "Must follow FAR procedures strictly",
    "Cannot give preferential treatment or hints about evaluation criteria",
  ],
};
