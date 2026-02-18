import {
  PromptOptions,
  TextGenerationPromptOptions,
  SingleTagPromptOptions,
  MultiTagPromptOptions,
  JsonOutputPromptOptions,
  LLMModel,
  LLMModelEnum,
} from "@/types/types";
// Logger removed due to issues with due to issues with convex deployment
// import { Logger } from "./Logger";

// const logger = new Logger({
//   service: "src/utils/convexByteUtils.ts",
// });

// Type for JSON-serializable values to replace any types in functions below
type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonSerializable[]
  | { [key: string]: JsonSerializable };

/**
 * Converts a string to a Uint8Array for Convex bytes storage
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts a Uint8Array to a string
 */
export function bytesToString(bytes: Uint8Array | ArrayBuffer): string {
  const uint8Array =
    bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return new TextDecoder().decode(uint8Array);
}

/**
 * Converts a JavaScript object to a Uint8Array for Convex bytes storage
 */
export function objectToBytes<T extends JsonSerializable>(obj: T): Uint8Array {
  const jsonString = JSON.stringify(obj);
  return stringToBytes(jsonString);
}

/**
 * Converts a Uint8Array back to a JavaScript object
 */
export function bytesToObject<T = JsonSerializable>(
  bytes: Uint8Array | ArrayBuffer,
): T {
  const jsonString = bytesToString(bytes);
  return JSON.parse(jsonString) as T;
}

/**
 * Simple XOR encryption for strings, returns a Uint8Array for Convex bytes storage
 */
export function encryptString(text: string, key: Uint8Array): Uint8Array {
  const data = stringToBytes(text);
  const encrypted = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i++) {
    encrypted[i] = data[i] ^ key[i % key.length];
  }

  return encrypted;
}

/**
 * Decrypts a Uint8Array (from Convex bytes storage) back to a string
 */
export function decryptBytes(
  encrypted: Uint8Array | ArrayBuffer,
  key: Uint8Array,
): string {
  const encryptedArray =
    encrypted instanceof ArrayBuffer ? new Uint8Array(encrypted) : encrypted;
  const decrypted = new Uint8Array(encryptedArray.length);

  for (let i = 0; i < encryptedArray.length; i++) {
    decrypted[i] = encryptedArray[i] ^ key[i % key.length];
  }

  return bytesToString(decrypted);
}

export function base64ToUtf8String(b64: string): string {
  try {
    const binaryString = atob(b64); // Decodes base64 to a "binary string"
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes); // Decodes Uint8Array to UTF-8 string
  } catch (e) {
    const error = e as Error;
    console.error("Failed to decode base64 string with atob/TextDecoder:", {
      error: error.message,
    });
    throw new Error(`Invalid base64 string: ${error.message}`);
  }
}

/**
 * Decodes prompt from byte string
 */
export function decodePromptBackend(
  b64: string | undefined | null,
): PromptOptions {
  const defaultOptions: TextGenerationPromptOptions = {
    promptType: "noSchema",
    userPrompt: "",
    model: LLMModelEnum.GPT4O,
    promptInputColumns: [],
    ask: false,
  };

  if (!b64) {
    return defaultOptions;
  }

  try {
    const json = base64ToUtf8String(b64);
    const parsed = JSON.parse(json) as Partial<PromptOptions>;

    const promptType = parsed.promptType;

    const baseOptions = {
      model: (parsed.model as LLMModel) || LLMModelEnum.GPT4O,
      userPrompt: parsed.userPrompt || "",
      promptInputColumns: parsed.promptInputColumns || [],
      ask: parsed.ask,
    };

    if (promptType === "noSchema") {
      const finalOptions: TextGenerationPromptOptions = {
        ...baseOptions,
        promptType: "noSchema",
        ask: parsed.ask ?? false,
      };
      return finalOptions;
    }

    if (promptType === "schema") {
      const schemaType = parsed.schemaType;
      switch (schemaType) {
        case "singleTag":
          return {
            ...baseOptions,
            promptType: "schema",
            schemaType: "singleTag",
            responseOptions: parsed.responseOptions || [],
          } as SingleTagPromptOptions;

        case "multiTag":
          return {
            ...baseOptions,
            promptType: "schema",
            schemaType: "multiTag",
            responseOptions: parsed.responseOptions || [],
          } as MultiTagPromptOptions;

        case "freeForm":
          if (!parsed.responseSchema) {
            throw new Error(
              "The 'freeForm' schemaType requires a 'responseSchema' property.",
            );
          }
          return {
            ...baseOptions,
            promptType: "schema",
            schemaType: "freeForm",
            responseSchema: parsed.responseSchema,
          } as JsonOutputPromptOptions;

        default:
          throw new Error(
            `Invalid or missing 'schemaType' for 'schema' promptType. Received: ${schemaType}`,
          );
      }
    }
    throw new Error(`Invalid or missing 'promptType'. Received: ${promptType}`);
  } catch (e) {
    const error = e as Error;
    console.error(
      `decodePromptBackend failed: ${error.message}. Input b64 (first 50 chars): ${b64.substring(0, 50)}...`,
    );
    return defaultOptions;
  }
}
