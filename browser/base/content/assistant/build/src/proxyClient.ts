import { postSigned } from "./awsSignedFetch";
import SupabaseAuth from "./services/supabase";

export type WireMsg = { role: "user" | "model"; content: string };

const supabaseAuth = SupabaseAuth.getInstance();

async function checkAuthentication(): Promise<boolean> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (!isAuthenticated) {
    throw new Error("Authentication required: Please sign in to use the AI assistant");
  }
  return true;
}

async function getLLMConfig() {
  if (typeof (window as any).loadLLMConfig === 'function') {
    return await (window as any).loadLLMConfig();
  }
  return null;
}

async function callOpenAI(messages: any[], systemPrompt?: string, jsonMode: boolean = false): Promise<any> {
  const config = await getLLMConfig();
  if (!config || !config.apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const formattedMessages = [];
  if (systemPrompt) {
    formattedMessages.push({ role: "system", content: systemPrompt });
  }
  
  for (const msg of messages) {
    formattedMessages.push({
      role: msg.role === "model" ? "assistant" : msg.role,
      content: msg.content
    });
  }

  const model = config.model || "gpt-4o-mini";
  
  const requestBody: any = {
    model: model,
    messages: formattedMessages,
  };

  if (jsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  console.log(`[BYOK] Using OpenAI model: ${model}`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content
  };
}

async function callAnthropic(messages: any[], systemPrompt?: string, jsonMode: boolean = false): Promise<any> {
  const config = await getLLMConfig();
  if (!config || !config.apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const formattedMessages = [];
  for (const msg of messages) {
    formattedMessages.push({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content
    });
  }

  const model = config.model || "claude-sonnet-4-5";
  
  const requestBody: any = {
    model: model,
    max_tokens: 4096,
    messages: formattedMessages,
  };

  if (systemPrompt) {
    if (jsonMode) {
      requestBody.system = systemPrompt + "\n\nYou must respond with valid JSON only. Do not use markdown code blocks or any other formatting. Output raw JSON directly.";
    } else {
      requestBody.system = systemPrompt;
    }
  } else if (jsonMode) {
    requestBody.system = "You must respond with valid JSON only. Do not use markdown code blocks or any other formatting. Output raw JSON directly.";
  }

  console.log(`[BYOK] Using Anthropic model: ${model}`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text
  };
}

async function callWithBYOK(system: string, messages: WireMsg[], jsonMode: boolean = false): Promise<any> {
  const config = await getLLMConfig();
  
  if (config?.provider === "openai") {
    return await callOpenAI(messages, system, jsonMode);
  } else if (config?.provider === "anthropic") {
    return await callAnthropic(messages, system, jsonMode);
  }
  
  throw new Error("Unknown LLM provider: " + config?.provider);
}

export async function routeRemote(system: string, messages: WireMsg[], options: string[]) {
  await checkAuthentication();
  
  const config = await getLLMConfig();
  if (config && config.enabled && config.apiKey) {
    console.log("[BYOK] Using user's own API key for routing");
    const result = await callWithBYOK(system, messages, true);
    try {
      return JSON.parse(result.content);
    } catch (e) {
      console.error("Failed to parse JSON from LLM:", result.content);
      return { next: "chat", args: {} };
    }
  }
  
  return postSigned("route", { system, messages, options });
}

export async function chatRemote(system: string, messages: WireMsg[]) {
  await checkAuthentication();
  
  const config = await getLLMConfig();
  if (config && config.enabled && config.apiKey) {
    console.log("[BYOK] Using user's own API key for chat");
    return await callWithBYOK(system, messages, false);
  }
  
  return postSigned("chat", { system, messages });
}

export async function transcribeAudio(audioBlob: Blob): Promise<{ transcript: string }> {
  await checkAuthentication();
  
  // Convert blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  
  // Call lambda with op: "transcribe"
  const result = await postSigned("transcribe", { audio: base64Audio, mimeType: audioBlob.type });
  
  // Backend returns { transcript: "..." }
  return result;
}

export async function textToSpeech(text: string): Promise<Blob> {
  await checkAuthentication();
  
  const result = await postSigned("tts", { text });
  
  // The lambda should return base64 encoded audio
  const audioData = atob(result.audio);
  const arrayBuffer = new Uint8Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    arrayBuffer[i] = audioData.charCodeAt(i);
  }
  
  return new Blob([arrayBuffer], { type: result.mimeType || 'audio/mpeg' });
}
