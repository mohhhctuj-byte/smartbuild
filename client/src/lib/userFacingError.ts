const INTERNAL_ERROR_CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/;

export function userFacingError(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";

  if (!message.trim()) return fallback;
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return "تعذر الاتصال بخادم SmartBuild. تأكد أن الخادم يعمل، ثم أعد تحميل الصفحة. جرّب http://localhost:3000 أو http://localhost:3002.";
  }
  if (/ANTHROPIC_API_KEY_NOT_CONFIGURED/.test(message)) {
    return "Claude مش قادر يرد لأن مفتاح Anthropic (ANTHROPIC_API_KEY) مش مُعدّ على الخادم. المحادثة محفوظة؛ يلزم إعداد مفتاح Anthropic صالح لتشغيل Claude.";
  }
  if (/ANTHROPIC_RATE_LIMITED|Anthropic (?:stream|structured request) failed with status 429/i.test(message)) {
    return "Claude hit an Anthropic API usage limit. Wait for it to reset, or switch to SM+3.1 Pro and resend. Your conversation is saved.";
  }
  if (/ANTHROPIC_BILLING_REQUIRED|Anthropic (?:stream|structured request) failed with status 402/i.test(message)) {
    return "Claude is unavailable because of an Anthropic billing or spend limit. Check your Anthropic Console, or switch to SM+3.1 Pro. Your conversation is saved.";
  }
  if (/ANTHROPIC_TEMPORARILY_UNAVAILABLE|ANTHROPIC_STREAM_OVERLOADED_ERROR|Anthropic (?:stream|structured request) failed with status 529/i.test(message)) {
    return "Claude is temporarily unavailable. Wait and retry, or switch to SM+3.1 Pro. Your conversation is saved.";
  }
  if (/GEMINI_STRUCTURED_HTTP_429|Gemini (?:stream|structured request) failed with status 429/i.test(message)) {
    return "SM+3.1 Pro reached the Gemini API usage or rate limit. Check your Gemini API quota or wait before retrying. Previously saved project files are preserved.";
  }
  if (/GEMINI_STRUCTURED_HTTP_(?:401|403)|Gemini (?:stream|structured request) failed with status (?:401|403)/i.test(message)) {
    return "Gemini rejected the server API key or its permissions. Check the server's Gemini API configuration before retrying. Previously saved project files are preserved.";
  }
  if (/GEMINI_STRUCTURED_HTTP_404/i.test(message)) {
    return "Gemini could not find an available configured model. Check the server's Gemini model configuration before retrying.";
  }
  if (/configured AI provider returned an empty response|Gemini stream returned no text|empty stream/i.test(message)) {
    return "The AI service did not return a reply. Your message is saved; try again. If this keeps happening, check the provider's model configuration.";
  }
  if (/I could not reach the AI service just now/i.test(message)) {
    return "The AI service could not complete this reply. Your message is saved; please try again.";
  }
  if (/AGENT_OUTPUT_CONTINUATION_TIMED_OUT|AGENT_PROVIDER_REQUEST_TIMEOUT/i.test(message)) {
    return "The build generation step reached its time limit and was stopped without claiming success. Files from completed earlier tasks are preserved; retry with a smaller request.";
  }
  if (/AGENT_PROVIDER_CONNECTION_FAILED/i.test(message)) {
    return "SmartBuild lost its connection to the Gemini API. No unverified result was marked complete; check the server connection and retry.";
  }
  if (INTERNAL_ERROR_CODE.test(message)) {
    return "تعذر إكمال الطلب بسبب مشكلة داخلية. يمكنك إعادة المحاولة، وسيظل التقدم المحفوظ كما هو.";
  }
  return message;
}
