import { SpeechClient, protos as speechProtos } from '@google-cloud/speech';
import { TextToSpeechClient, protos as ttsProtos } from '@google-cloud/text-to-speech';
import { config } from '../config';

/**
 * Voice Interface Layer: wraps Google Cloud Speech-to-Text and Text-to-Speech.
 * Both clients pick up credentials automatically from GOOGLE_APPLICATION_CREDENTIALS
 * (set in src/config.ts from either a file path or a base64-encoded env var).
 */

let speechClient: SpeechClient | null = null;
let ttsClient: TextToSpeechClient | null = null;

function getSpeechClient(): SpeechClient {
  if (!speechClient) {
    speechClient = new SpeechClient();
  }
  return speechClient;
}

function getTtsClient(): TextToSpeechClient {
  if (!ttsClient) {
    ttsClient = new TextToSpeechClient();
  }
  return ttsClient;
}

export interface SttOptions {
  encoding?: keyof typeof speechProtos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
  sampleRateHertz?: number;
  languageCode?: string;
}

/**
 * Transcribes an audio buffer (e.g. WAV/LINEAR16 or WEBM_OPUS) to text.
 * Falls back gracefully with a descriptive error if Google STT is unreachable
 * or misconfigured, so the caller can decide how to respond to the user.
 */
export async function speechToText(
  audioBuffer: Buffer,
  options: SttOptions = {}
): Promise<string> {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('speechToText: empty audio buffer received');
  }

  const client = getSpeechClient();

  const request: speechProtos.google.cloud.speech.v1.IRecognizeRequest = {
    config: {
      encoding: (options.encoding as any) || 'WEBM_OPUS',
      sampleRateHertz: options.sampleRateHertz || 48000,
      languageCode: options.languageCode || config.stt.languageCode,
      enableAutomaticPunctuation: true,
      model: 'phone_call',
      useEnhanced: true,
    },
    audio: {
      content: audioBuffer.toString('base64'),
    },
  };

  try {
    const [response] = await client.recognize(request);
    const transcript = (response.results || [])
      .map((result) => result.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim();
    return transcript;
  } catch (err: any) {
    // Retry once with LINEAR16/16kHz as a common fallback encoding for browser/telephony audio.
    try {
      const fallbackRequest: speechProtos.google.cloud.speech.v1.IRecognizeRequest = {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: options.languageCode || config.stt.languageCode,
          enableAutomaticPunctuation: true,
        },
        audio: { content: audioBuffer.toString('base64') },
      };
      const [fallbackResponse] = await client.recognize(fallbackRequest);
      return (fallbackResponse.results || [])
        .map((r) => r.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();
    } catch (fallbackErr: any) {
      throw new Error(
        `speechToText failed: ${err.message || err}. Fallback also failed: ${
          fallbackErr.message || fallbackErr
        }`
      );
    }
  }
}

export interface TtsOptions {
  voiceName?: string;
  languageCode?: string;
  speakingRate?: number;
  pitch?: number;
  audioEncoding?: keyof typeof ttsProtos.google.cloud.texttospeech.v1.AudioEncoding;
}

export interface TtsResult {
  audioBase64: string;
  mimeType: string;
}

/**
 * Converts text into natural-sounding speech audio using Google Cloud TTS.
 * Returns base64-encoded audio so it can be streamed directly to a browser
 * <audio> element or a telephony provider without touching disk.
 */
export async function textToSpeech(
  text: string,
  options: TtsOptions = {}
): Promise<TtsResult> {
  if (!text || !text.trim()) {
    throw new Error('textToSpeech: empty text received');
  }

  const client = getTtsClient();
  const audioEncoding = options.audioEncoding || 'MP3';

  const request: ttsProtos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input: { text },
    voice: {
      languageCode: options.languageCode || config.tts.languageCode,
      name: options.voiceName || config.tts.voiceName,
    },
    audioConfig: {
      audioEncoding: audioEncoding as any,
      speakingRate: options.speakingRate ?? 1.0,
      pitch: options.pitch ?? 0.0,
    },
  };

  try {
    const [response] = await client.synthesizeSpeech(request);
    const audioContent = response.audioContent;
    if (!audioContent) {
      throw new Error('No audio content returned from Google TTS');
    }
    const buffer = Buffer.isBuffer(audioContent)
      ? audioContent
      : Buffer.from(audioContent as Uint8Array);

    return {
      audioBase64: buffer.toString('base64'),
      mimeType: audioEncoding === 'MP3' ? 'audio/mpeg' : 'audio/wav',
    };
  } catch (err: any) {
    throw new Error(`textToSpeech failed: ${err.message || err}`);
  }
}
