export type ApiSecretRequirement = {
  provider: string;
  name: string;
  question: string;
};

const integrations: Array<{ provider: string; name: string; patterns: RegExp[] }> = [
  { provider: "Stripe", name: "STRIPE_SECRET_KEY", patterns: [/\bstripe\s+(?:checkout|payment|payments|api|integration)\b/i, /\b(?:use|connect|integrate)\s+stripe\b/i, /\b(?:real|live)\s+payment processing\b/i, /\baccept (?:real )?payments\b/i, /\bprocess (?:real )?payments\b/i, /دفع إلكتروني|قبول المدفوعات/i] },
  { provider: "Email provider", name: "EMAIL_PROVIDER_API_KEY", patterns: [/\bsend (?:an? )?email\b/i, /\bemail delivery\b/i, /\bemail notifications?\b/i, /\bsmtp\b/i, /إرسال (?:بريد إلكتروني|إيميل)/i] },
  { provider: "OpenAI", name: "OPENAI_API_KEY", patterns: [/\bopenai.{0,24}\bapi\b/i, /\bapi.{0,24}\bopenai\b/i, /\b(?:use|connect|integrate|call)\s+(?:the\s+)?openai\b/i] },
  { provider: "Anthropic", name: "ANTHROPIC_API_KEY", patterns: [/\banthropic.{0,24}\bapi\b/i, /\bapi.{0,24}\banthropic\b/i, /\b(?:use|connect|integrate|call)\s+(?:the\s+)?anthropic\b/i, /\bbyok\b/i] },
  { provider: "Google Maps", name: "GOOGLE_MAPS_API_KEY", patterns: [/\bgoogle maps? api\b/i, /\bmaps api\b/i, /واجهة برمجة خرائط جوجل/i] },
];

export function apiSecretRequirementForBuild(request: string): ApiSecretRequirement | null {
  const explicitlyMocked = /\b(?:mock|demo|fake|simulated|no external service|without an api)\b|بيانات تجريبية|بدون خدمات خارجية/i.test(request)
    && !/\b(?:live|real|production)\b|حقيقي|فعلي/i.test(request);
  if (explicitlyMocked) return null;
  const integration = integrations.find(item => item.patterns.some(pattern => pattern.test(request)));
  if (!integration) return null;
  const isArabic = /[\u0600-\u06FF]/.test(request);
  return {
    provider: integration.provider,
    name: integration.name,
    question: isArabic
      ? `طلبك يحتاج خدمة ${integration.provider}. مفتاح الخدمة يُحفظ مشفّرًا في Settings → Secrets، وليس في المحادثة. احفظه من الحقل الآمن أدناه. الحفظ وحده لا يفعّل الخدمة؛ يلزم وجود تكامل مُنفّذ ومُتحقَّق منه قبل تشغيلها.`
      : `Your request needs ${integration.provider}. Its key is encrypted in Settings → Secrets, not sent as a chat message. Enter it in the secure field below. Saving alone does not activate the service; a verified provider integration is required before it can run.`,
  };
}
