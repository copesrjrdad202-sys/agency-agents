import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { checkAvailability, bookAppointment } from './calendar';
import { BusinessRecord, getDefaultBusinessConfig } from './businessStore';
import {
  ConversationSession,
  ConversationMessage,
} from '../types';
import { appendMessage } from './session';

/**
 * Intelligence Layer: Claude-powered conversation agent specialized for
 * appointment scheduling, lead qualification, and objection handling for
 * local home-service businesses (HVAC, plumbing, electrical, etc.).
 */

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
    }
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

function buildSystemPrompt(business: BusinessRecord): string {
  if (business.systemPromptOverride) {
    return business.systemPromptOverride;
  }

  return `You are Ava, the friendly and highly capable AI phone receptionist for ${business.name}, a ${business.businessType} company serving ${business.serviceArea}. Business hours: ${business.hours}.

Your job on every call:
1. Greet the caller warmly and find out what they need (repair, maintenance, installation, quote, emergency).
2. Qualify the lead: ask for their name, callback phone number, address/area, and a brief description of the issue.
3. Handle common objections calmly and briefly (price concerns, "just looking," competitor comparisons) by highlighting reliability, licensed/insured technicians, and same-week availability — without being pushy.
4. When the caller wants to schedule, use the check_availability tool to find a real open slot before promising a time. Never invent availability.
5. Once the caller confirms a specific date and time, use the book_appointment tool to lock it in. Confirm all details back to the caller in one short summary sentence before booking.
6. If it's a genuine emergency (gas smell, active flooding, no heat in freezing weather), tell the caller to stay safe and that you are escalating immediately, and still capture their name and number.
7. Keep every response short (1-3 sentences) and conversational — this is a live phone call, not a chat window. Avoid long lists or markdown formatting since your text will be spoken aloud.
8. Never make up availability, prices, or technician names. If you don't know something, say a team member will follow up.

Always speak naturally, like a helpful human receptionist, and keep the caller moving toward either a booked appointment or a clear next step.`;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'check_availability',
    description:
      'Check open appointment slots on a given date (and optionally a specific time) before promising a booking to the caller.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date to check, in YYYY-MM-DD format.',
        },
        time: {
          type: 'string',
          description:
            'Optional specific time to check, e.g. "14:00" or "2pm". If omitted, returns all open slots for the day.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description:
      'Book a confirmed appointment slot for the caller. Only call this after the caller has explicitly agreed to a specific date and time that was verified as available.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: "Caller's full name." },
        phone_number: { type: 'string', description: 'Best callback phone number.' },
        date: { type: 'string', description: 'Appointment date, YYYY-MM-DD.' },
        time: { type: 'string', description: 'Appointment time, e.g. "14:00" or "2pm".' },
        service_type: {
          type: 'string',
          description: 'Short description of the service needed, e.g. "AC repair", "drain cleaning".',
        },
      },
      required: ['client_name', 'phone_number', 'date', 'time', 'service_type'],
    },
  },
];

async function executeTool(
  name: string,
  input: any,
  business: BusinessRecord
): Promise<unknown> {
  switch (name) {
    case 'check_availability': {
      const slots = await checkAvailability(input.date, input.time, business);
      return { slots };
    }
    case 'book_appointment': {
      const result = await bookAppointment(
        {
          clientName: input.client_name,
          phoneNumber: input.phone_number,
          date: input.date,
          time: input.time,
          serviceType: input.service_type,
        },
        business
      );

      if (config.automationWebhookUrl) {
        fireAutomationWebhook(result).catch(() => {
          /* best-effort; booking already succeeded */
        });
      }

      return result;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function fireAutomationWebhook(payload: unknown): Promise<void> {
  try {
    await fetch(config.automationWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'appointment.booked', payload }),
    });
  } catch {
    // Swallow: automation webhook is a best-effort side channel.
  }
}

export interface LlmTurnResult {
  reply: string;
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>;
}

/**
 * Runs one conversational turn: sends the session history + new user message
 * to Claude, executes any tool calls (calendar check/booking), and loops until
 * Claude produces a final natural-language reply.
 */
export async function runConversationTurn(
  session: ConversationSession,
  userText: string,
  business: BusinessRecord = getDefaultBusinessConfig()
): Promise<LlmTurnResult> {
  const client = getClient();

  const userMessage: ConversationMessage = {
    role: 'user',
    content: userText,
    timestamp: Date.now(),
  };
  appendMessage(session.sessionId, userMessage);

  const anthropicMessages: Anthropic.MessageParam[] = session.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: Array<{ name: string; input: unknown; result: unknown }> = [];
  let finalText = '';
  const MAX_TOOL_ITERATIONS = 4;

  let currentMessages = anthropicMessages;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: config.claudeModel,
      max_tokens: 512,
      system: buildSystemPrompt(business),
      tools,
      messages: currentMessages,
    });

    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    finalText = textBlocks.map((b) => b.text).join(' ').trim();

    if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      break;
    }

    // Execute each requested tool and feed results back to Claude.
    const toolResultContent: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      let result: unknown;
      try {
        result = await executeTool(toolUse.name, toolUse.input, business);
      } catch (err: any) {
        result = { error: err.message || String(err) };
      }
      toolCalls.push({ name: toolUse.name, input: toolUse.input, result });
      toolResultContent.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResultContent },
    ];
  }

  if (!finalText) {
    finalText =
      "Sorry, could you say that one more time? I want to make sure I get your appointment details right.";
  }

  appendMessage(session.sessionId, {
    role: 'assistant',
    content: finalText,
    timestamp: Date.now(),
  });

  return { reply: finalText, toolCalls };
}
