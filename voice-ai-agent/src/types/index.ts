export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationSession {
  sessionId: string;
  callerPhone?: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  bookingState: Partial<BookingDetails>;
}

export interface BookingDetails {
  clientName: string;
  phoneNumber: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  serviceType: string;
}

export interface AvailabilitySlot {
  date: string;
  time: string;
  available: boolean;
}

export interface CheckAvailabilityArgs {
  date: string;
  time?: string;
}

export interface BookAppointmentArgs extends BookingDetails {}

export interface VoicePipelineResult {
  transcript: string;
  reply: string;
  audioBase64: string;
  audioMimeType: string;
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>;
}
