export const SPEECH_LANGUAGES = [
  { value: "auto", label: "Auto detect" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "ar-EG", label: "Arabic (Egypt)" },
  { value: "ar-SA", label: "Arabic (Modern Standard)" },
  { value: "it-IT", label: "Italian" },
  { value: "fr-FR", label: "French" },
  { value: "es-ES", label: "Spanish" },
] as const;

export type SpeechLanguage = typeof SPEECH_LANGUAGES[number]["value"];

const ITALIAN_LETTER_NAMES: Record<string, string> = {
  A: "a",
  B: "bi",
  C: "ci",
  D: "di",
  E: "e",
  F: "effe",
  G: "gi",
  H: "acca",
  I: "i",
  J: "i lunga",
  K: "kappa",
  L: "elle",
  M: "emme",
  N: "enne",
  O: "o",
  P: "pi",
  Q: "cu",
  R: "erre",
  S: "esse",
  T: "ti",
  U: "u",
  V: "vu",
  W: "doppia vu",
  X: "ics",
  Y: "ipsilon",
  Z: "zeta",
};

export function italianLetterName(letter: string) {
  return /^[a-z]$/i.test(letter) ? ITALIAN_LETTER_NAMES[letter.toUpperCase()] ?? null : null;
}

export function speechLanguageForText(text: string, preferredLanguage: SpeechLanguage, contextText = text) {
  if (preferredLanguage !== "auto") return preferredLanguage;
  if (/[\u0600-\u06ff]/.test(text)) return "ar-EG";
  if (/\b(?:italian|italiano|le vocali|consonanti|alfabeto|pronuncia|ciao|grazie)\b/i.test(contextText)) return "it-IT";
  return "en-US";
}

export function findSpeechVoice(voices: SpeechSynthesisVoice[], language: string, allowLanguageFallback = false) {
  const normalizedLanguage = language.toLowerCase();
  return voices.find(voice => voice.lang.toLowerCase() === normalizedLanguage)
    || (allowLanguageFallback
      ? voices.find(voice => voice.lang.toLowerCase().startsWith(`${normalizedLanguage.split("-")[0]}-`))
      : undefined);
}

export function speechTextFromMarkdown(markdown: string) {
  return markdown
    .replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
