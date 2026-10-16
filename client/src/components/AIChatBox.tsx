import { isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Check, ChevronDown, Circle, CircleDot, CircleHelp, FileDown, FileText, KeyRound, LoaderCircle, Mic, PanelRight, Paperclip, PlugZap, Plus, Settings2, Square, Video, Volume2, VolumeX, X } from "lucide-react";
import { Streamdown } from 'streamdown';
import { compactAssistantMessageForChat, priorUserAskedForCode } from "@/lib/compactChat";
import SmartBuildMark from "@/components/SmartBuildMark";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { detectApiSecret } from "@shared/apiSecretGuard";
import { AI_MODEL_IDS, type AiModelId } from "@shared/aiModels";
import { MAX_CHAT_ATTACHMENTS, type ChatAttachment } from "@shared/chatAttachments";
import { toast } from "sonner";
import { findSpeechVoice, italianLetterName, SPEECH_LANGUAGES, speechLanguageForText, speechTextFromMarkdown, type SpeechLanguage } from "@/lib/textToSpeech";
import { getAssistantTextSelection } from "@/lib/assistantTextSelection";

export type ChatMessage = { id: string; role: "user" | "assistant" | "system"; content: string; attachments?: ChatAttachment[]; createdAt?: string; kind?: "ask" | "build" | "build-acknowledgment" | "build-status" | "clarification" | "secret-request" | "secret-blocked" | "preference"; requestId?: string; trackingConnectionError?: boolean; requestFailed?: boolean; clarificationOptions?: Array<{ label: string; value: string }>; secretRequirement?: { provider: string; name: string }; secretProjectId?: number };
export type Message = ChatMessage;
export type ReferenceImage = { url: string; key?: string; name: string; mimeType?: string };
type UtilityPanel = "Plugins" | "Settings" | "Help" | null;
type SpeechRecognitionResultEvent = Event & { results: { [index: number]: { [index: number]: { transcript: string }; isFinal: boolean }; length: number } };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type SpeechRecognitionWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
type SelectedSpeechText = { text: string; top: number; left: number };
function textFromRenderedChildren(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromRenderedChildren).join(" ");
  if (isValidElement<{ children?: ReactNode }>(children)) return textFromRenderedChildren(children.props.children);
  return "";
}

function SpeakLetterButton({ messageId, letter, onSpeak }: { messageId: string; letter: string; onSpeak: (messageId: string, letter: string) => void }) {
  const id = useId();
  const letterName = italianLetterName(letter);
  if (!letterName) return null;
  return (
    <button
      type="button"
      onClick={() => onSpeak(`${messageId}:${id}`, letter)}
      aria-label={`انطق اسم الحرف ${letter} بالإيطالية`}
      title={`انطق اسم الحرف ${letter} بالإيطالية`}
      className="ml-1 inline-flex h-5 w-5 shrink-0 translate-y-0.5 items-center justify-center rounded text-cyan-300/80 transition hover:bg-cyan-200/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60"
    >
      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

type Props = {
  messages: ChatMessage[];
  streaming: boolean;
  selectedModel: AiModelId;
  disabled?: boolean;
  projectId?: number | null;
  conversationId?: number | null;
  references: ReferenceImage[];
  onReferencesChange: (images: ReferenceImage[]) => void;
  onUploadComplete?: (image: ReferenceImage) => void;
  onSend: (value: string, model?: string, preference?: boolean, attachments?: Array<{ key: string; name: string; mimeType: string }>) => Promise<void>;
  localAiNeedsDownload?: boolean;
  onPrepareLocalAi?: (onDownloadProgress: (loadedPercent: number) => void) => Promise<void>;
  onStop?: () => void;
  onSecretStored?: () => void;
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
};

export function AIChatBox({ messages, streaming, selectedModel, disabled, projectId, conversationId, references, onReferencesChange, onUploadComplete, onSend, localAiNeedsDownload, onPrepareLocalAi, onStop, onSecretStored, initialPrompt, onInitialPromptConsumed }: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [utility, setUtility] = useState<UtilityPanel>(null);
  const [compactReplies, setCompactReplies] = useState(true);
  const [autoResearch, setAutoResearch] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [codePanelAvailable, setCodePanelAvailable] = useState(false);
  const [preparingLocalAi, setPreparingLocalAi] = useState(false);
  const [localAiDownloadProgress, setLocalAiDownloadProgress] = useState<number | null>(null);
  const [localAiDownloadError, setLocalAiDownloadError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechVoicesRef = useRef(speechVoices);
  speechVoicesRef.current = speechVoices;
  const [selectedSpeechText, setSelectedSpeechText] = useState<SelectedSpeechText | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);

  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [secretSaving, setSecretSaving] = useState<Record<string, boolean>>({});
  const [secretSaved, setSecretSaved] = useState<Record<string, boolean>>({});
  const [secretErrors, setSecretErrors] = useState<Record<string, string>>({});
  const [capturedSecret, setCapturedSecret] = useState<{ value: string; provider: string; name: string } | null>(null);
  const [capturedSecretSaving, setCapturedSecretSaving] = useState(false);
  const [capturedSecretError, setCapturedSecretError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const referencesRef = useRef(references);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    referencesRef.current = references;
  }, [references]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synthesis = window.speechSynthesis;
    speechSynthesisRef.current = synthesis;
    const updateVoices = () => setSpeechVoices(synthesis.getVoices());
    updateVoices();
    synthesis.addEventListener("voiceschanged", updateVoices);
    return () => {
      synthesis.removeEventListener("voiceschanged", updateVoices);
      synthesis.cancel();
      speechSynthesisRef.current = null;
    };
  }, []);

  useEffect(() => {
    let updateTimer: number | undefined;
    const updateSelection = () => {
      if (updateTimer !== undefined) window.clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => {
        setSelectedSpeechText(getAssistantTextSelection(
          window.getSelection(),
          { width: window.innerWidth, height: window.innerHeight },
        ));
      }, 0);
    };

    document.addEventListener("selectionchange", updateSelection);
    document.addEventListener("pointerup", updateSelection);
    window.addEventListener("mouseup", updateSelection);
    window.addEventListener("keyup", updateSelection);
    window.addEventListener("scroll", updateSelection, true);
    window.addEventListener("resize", updateSelection);
    return () => {
      if (updateTimer !== undefined) window.clearTimeout(updateTimer);
      document.removeEventListener("selectionchange", updateSelection);
      document.removeEventListener("pointerup", updateSelection);
      window.removeEventListener("mouseup", updateSelection);
      window.removeEventListener("keyup", updateSelection);
      window.removeEventListener("scroll", updateSelection, true);
      window.removeEventListener("resize", updateSelection);
    };
  }, []);

  useEffect(() => {
    if (!streaming && speakingMessageId) {
      speechSynthesisRef.current?.cancel();
      setSpeakingMessageId(null);
    }
  }, [streaming]);

  const speakText = (messageId: string, text: string, contextText = text) => {
    const synthesis = speechSynthesisRef.current;
    if (!synthesis) {
      toast.error("Text-to-speech is not supported by this browser.");
      return;
    }
    if (speakingMessageId === messageId) {
      synthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    synthesis.cancel();
    const readableText = speechTextFromMarkdown(text);
    if (!readableText) return;
    const preferredLanguage: SpeechLanguage = "auto";
    const voices = speechVoicesRef.current;
    const forcedLanguage = contextText === "Italian alphabet" ? "it-IT" : undefined;
    const language = forcedLanguage || speechLanguageForText(readableText, preferredLanguage, contextText);
    const requireExactVoice = forcedLanguage !== undefined || preferredLanguage !== "auto";
    const voice = findSpeechVoice(voices, language, !requireExactVoice);
    if (voices.length > 0 && !voice && (requireExactVoice || language === "it-IT")) {
      const unavailableLanguage = requireExactVoice ? language : preferredLanguage;
      const label = SPEECH_LANGUAGES.find(option => option.value === unavailableLanguage)?.label || unavailableLanguage;
      toast.error(`No ${label} voice is installed in this browser. Install a matching voice in your system speech settings.`);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(readableText);
    utterance.lang = language;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeakingMessageId(messageId);
    utterance.onend = () => setSpeakingMessageId(current => current === messageId ? null : current);
    utterance.onerror = event => {
      setSpeakingMessageId(current => current === messageId ? null : current);
      if (event.error !== "canceled" && event.error !== "interrupted") {
        toast.error("The selected browser voice could not read this message.");
      }
    };
    setSpeakingMessageId(messageId);
    synthesis.speak(utterance);
  };

  const speakSelection = () => {
    if (!selectedSpeechText) return;
    const selectedText = selectedSpeechText.text;
    setSelectedSpeechText(null);
    if (speakingMessageId === "selection") {
      speechSynthesisRef.current?.cancel();
      setSpeakingMessageId(null);
      return;
    }
    speakText("selection", selectedText);
  };

  const changeReferences = (next: ReferenceImage[]) => {
    referencesRef.current = next;
    onReferencesChange(next);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!initialPrompt) return;
    setDraft(initialPrompt);
    requestAnimationFrame(() => composerRef.current?.focus());
    onInitialPromptConsumed?.();
  }, [initialPrompt, onInitialPromptConsumed]);

  useEffect(() => {
    setSecretValues({});
    setSecretSaving({});
    setSecretSaved({});
    setSecretErrors({});
    setCapturedSecret(null);
    setCapturedSecretError(null);
  }, [projectId]);

  const wasStreaming = useRef(false);
  useEffect(() => {
    const responseFinished = wasStreaming.current && !streaming;
    wasStreaming.current = streaming;
    if (responseFinished && !disabled) {
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }, [disabled, streaming]);

  useEffect(() => {
    const openUtility = (event: Event) => {
      const panel = (event as CustomEvent<UtilityPanel>).detail;
      if (panel === "Plugins" || panel === "Settings" || panel === "Help") setUtility(panel);
    };
    window.addEventListener("smart-builder:tool", openUtility);
    return () => window.removeEventListener("smart-builder:tool", openUtility);
  }, []);
  useEffect(() => {
    const updateCodePanelAvailability = (event: Event) => setCodePanelAvailable(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener("smartbuild:code-panel-availability", updateCodePanelAvailability);
    return () => window.removeEventListener("smartbuild:code-panel-availability", updateCodePanelAvailability);
  }, []);
  useEffect(() => {
    const handleProjectArchived = (event: Event) => {
      const payload = (event as CustomEvent<{ projectId?: number }>).detail;
      if (payload?.projectId == null) return;
      setDraft("");
      setUtility(null);
    };
    window.addEventListener("smartbuild:project-archived", handleProjectArchived);
    return () => window.removeEventListener("smartbuild:project-archived", handleProjectArchived);
  }, []);

  const saveCapturedSecret = async (secret: { value: string; provider: string; name: string }) => {
    if (!projectId || !secret.provider.trim() || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(secret.name) || capturedSecretSaving) return;
    setCapturedSecretSaving(true);
    setCapturedSecretError(null);
    try {
      const input = { provider: secret.provider, name: secret.name, value: secret.value };
      let response = await fetch(`/api/projects/${projectId}/secrets`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.status === 409) {
        const savedResponse = await fetch(`/api/projects/${projectId}/secrets`, { credentials: "include", cache: "no-store" });
        const savedPayload = await savedResponse.json().catch(() => ({})) as { secrets?: Array<{ id: number; provider: string; name: string }> };
        if (!savedResponse.ok) throw new Error("The existing key could not be checked before updating it.");
        const existing = savedPayload.secrets?.find(item => item.name === secret.name && item.provider.toLowerCase() === secret.provider.toLowerCase());
        if (existing) {
          response = await fetch(`/api/projects/${projectId}/secrets/${existing.id}`, {
            method: "PUT",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          });
        }
      }
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The API key could not be saved securely.");
      setCapturedSecret(null);
      toast.success("API key saved to Settings → Secrets.");
      onSecretStored?.();
    } catch (error) {
      setCapturedSecretError(error instanceof Error ? error.message : "The API key could not be saved securely.");
    } finally {
      setCapturedSecretSaving(false);
    }
  };

  const captureApiSecret = (value: string) => {
    const detected = detectApiSecret(value);
    if (!detected) return false;
    setDraft("");
    changeReferences([]);
    setCapturedSecretError(null);
    const secret = { value: detected.value, provider: detected.provider, name: detected.name };
    setCapturedSecret(secret);
    if (secret.provider && secret.name) void saveCapturedSecret(secret);
    return true;
  };

  const submitValue = async (value: string) => {
    if ((!value.trim() && !references.length) || sending || streaming || disabled || uploading) return;
    if (captureApiSecret(value)) return;
    setSending(true);
    try {
      const attachments = references.filter((file): file is ReferenceImage & { key: string; mimeType: string } => Boolean(file.key && file.mimeType));
      const request = value.trim();
      setDraft("");
      changeReferences([]);
      await onSend(request, selectedModel, false, attachments);
    } finally {
      setSending(false);
    }
  };
  const submitAsk = async () => submitValue(draft);

  const saveRequestedSecret = async (message: ChatMessage) => {
    if (!projectId || message.secretProjectId !== projectId || !message.secretRequirement || secretSaving[message.id] || secretSaved[message.id]) return;
    const value = secretValues[message.id]?.trim() || "";
    if (!value) return;
    setSecretSaving(current => ({ ...current, [message.id]: true }));
    setSecretErrors(current => ({ ...current, [message.id]: "" }));
    try {
      const response = await fetch(`/api/projects/${message.secretProjectId}/secrets`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...message.secretRequirement, value }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The API key could not be saved securely.");
      setSecretValues(current => ({ ...current, [message.id]: "" }));
      setSecretSaved(current => ({ ...current, [message.id]: true }));
      window.dispatchEvent(new Event("smartbuild:open-project-secrets"));
    } catch (error) {
      setSecretErrors(current => ({ ...current, [message.id]: error instanceof Error ? error.message : "The API key could not be saved securely." }));
    } finally {
      setSecretSaving(current => ({ ...current, [message.id]: false }));
    }
  };

  const toggleVoiceInput = () => {
    if (recording) {
      speechRecognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = (window as SpeechRecognitionWindow).SpeechRecognition || (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input is not supported by this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "";
    recognition.onresult = event => {
      const resultParts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (transcript) resultParts.push(transcript);
      }

      const transcript = resultParts.join(" ").trim();
      if (!transcript) return;

      setDraft(current => {
        const existing = current.trim();
        if (!existing) return transcript;
        if (transcript === existing || transcript.endsWith(existing)) return transcript;
        if (existing.endsWith(transcript)) return existing;
        if (transcript.startsWith(existing)) return transcript;
        return transcript;
      });
    };
    recognition.onend = () => {
      setRecording(false);
      speechRecognitionRef.current = null;
      composerRef.current?.focus();
    };
    recognition.onerror = event => {
      setRecording(false);
      speechRecognitionRef.current = null;
      const error = event as Event & { error?: string };
      toast.error(error.error === "not-allowed"
        ? "Microphone permission was denied. Allow microphone access and try again."
        : "Voice input stopped. Check microphone permission and try again.");
    };
    speechRecognitionRef.current = recognition;
    setRecording(true);
    recognition.start();
  };

  useEffect(() => () => {
    speechRecognitionRef.current?.stop();
  }, []);

  const uploadFiles = async (selectedFiles: File[]) => {
    if (!selectedFiles.length) return;
    const remainingSlots = MAX_CHAT_ATTACHMENTS - referencesRef.current.length;
    if (remainingSlots <= 0) {
      toast.error(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files to one message.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const validFiles = selectedFiles.filter(file => {
      const maxBytes = file.type.startsWith("image/") ? 5 * 1024 * 1024 : 25 * 1024 * 1024;
      if (file.size === 0 || file.size > maxBytes) {
        toast.error(`${file.name}: images must be 5 MB or smaller; other files must be 25 MB or smaller.`);
        return false;
      }
      return true;
    });
    const filesToUpload = validFiles.slice(0, remainingSlots);
    if (validFiles.length > remainingSlots) {
      toast.error(`Only ${remainingSlots} more file${remainingSlots === 1 ? "" : "s"} can be attached. The limit is ${MAX_CHAT_ATTACHMENTS} per message.`);
    }
    if (!filesToUpload.length) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    const uploadedFiles: ReferenceImage[] = [];
    try {
      for (const file of filesToUpload) {
        setUploadingName(file.name);
        const scope = new URLSearchParams();
        if (projectId) scope.set("projectId", String(projectId));
        if (conversationId) scope.set("conversationId", String(conversationId));
        scope.set("fileName", file.name);
        const mimeType = file.type || "application/octet-stream";
        const response = await fetch(`/api/attachments/image?${scope.toString()}`, { method: "POST", headers: { "content-type": mimeType }, body: file, credentials: "include" });
        const payload = await response.json().catch(() => ({})) as { url?: string; key?: string; mimeType?: string; error?: string };
        if (!response.ok || !payload.url) {
          toast.error(`${file.name}: ${payload.error || `Upload failed (HTTP ${response.status}).`}`);
          continue;
        }
        const attachment = { url: payload.url, key: payload.key, name: file.name, mimeType: payload.mimeType || file.type };
        uploadedFiles.push(attachment);
        onUploadComplete?.(attachment);
      }
      if (uploadedFiles.length) {
        changeReferences([...referencesRef.current, ...uploadedFiles]);
        toast.success(`${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"} attached to this message.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? `File upload failed: ${error.message}` : "File upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      setUploadingName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const upload = (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    const nextUpload = uploadQueueRef.current.then(() => uploadFiles(selectedFiles));
    uploadQueueRef.current = nextUpload.catch(error => {
      toast.error(error instanceof Error ? `File upload failed: ${error.message}` : "File upload failed. Check your connection and try again.");
    });
    return nextUpload;
  };

  const downloadProjectReport = async (format: "csv" | "pdf") => {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/workspace/projects/${projectId}/report.${format}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Report download returned ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `smartbuild-project-${projectId}-report.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} project report downloaded.`);
    } catch {
      toast.error(`Unable to download the ${format.toUpperCase()} project report.`);
    }
  };


  return (
    <section className="smartbuild-chat flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 pt-3 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <div className="min-w-36 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {projectId ? "Project workspace" : "Workspace ready"}
          </div>
        </div>
        {messages.length === 0 ? (
          <div className="smartbuild-entrance mx-auto flex h-full max-w-3xl flex-col justify-center px-1 pb-20 sm:px-4">
            <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06]">
              <SmartBuildMark size={28} />
            </div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Workspace ready</p>
            <h1 className="smartbuild-entrance-delay-1 max-w-xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Start with an idea or a question</h1>
            <p className="smartbuild-entrance-delay-2 mt-3 max-w-2xl text-sm leading-6 text-slate-400">Describe what you want to explore, ask a question, or share a file to get started.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-7">
            {messages.map((message, index) => {
              const isAssistant = message.role === "assistant";
              const presentation = isAssistant
                ? compactAssistantMessageForChat(message.content, !compactReplies || priorUserAskedForCode(messages, index))
                : null;
              const speechText = presentation?.content || "";
              const speakItalianLetter = (id: string, letter: string) => {
                const letterName = italianLetterName(letter);
                if (letterName) speakText(id, letterName, "Italian alphabet");
              };
              return <article key={message.id} className={`smartbuild-message ${message.role === "user" ? "smartbuild-user-message ml-auto translate-x-1 max-w-[88%] px-1 py-2 text-sm leading-6 text-[#dff4ff]" : "smartbuild-assistant-message max-w-[94%] rounded-xl px-4 py-3 text-sm leading-7 text-slate-200"}`}>
                {isAssistant ? <Streamdown components={{
                  td: ({ children, ...props }) => {
                    const cellText = textFromRenderedChildren(children).trim();
                    return <td {...props}>{children}{italianLetterName(cellText) && <SpeakLetterButton messageId={message.id} letter={cellText} onSpeak={speakItalianLetter} />}</td>;
                  },
                }}>{speechText}</Streamdown> : <>{message.content.trim() && <p className="whitespace-pre-wrap">{message.content}</p>}{message.attachments?.length ? <div className={`mt-2 flex flex-wrap gap-2 ${message.content.trim() ? "" : "mt-0"}`} aria-label="Message attachments">{message.attachments.map(file => {
                  const url = `/manus-storage/${file.key.split("/").map(encodeURIComponent).join("/")}`;
                  if (file.mimeType.startsWith("image/")) return <a key={file.key} href={url} target="_blank" rel="noreferrer" aria-label={`Open image ${file.name}`} className="block overflow-hidden rounded-xl border border-white/10 bg-black/20"><img src={url} alt={file.name} loading="lazy" className="max-h-72 max-w-full object-contain" /></a>;
                  if (file.mimeType.startsWith("video/")) return <video key={file.key} src={url} controls preload="metadata" aria-label={file.name} className="max-h-80 max-w-full rounded-xl border border-white/10 bg-black/30" />;
                  if (file.mimeType.startsWith("audio/")) return <div key={file.key} className="flex max-w-sm items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2"><FileText className="h-4 w-4 shrink-0 text-cyan-200" /><div className="min-w-0 flex-1"><span className="mb-1 block truncate text-xs text-slate-100">{file.name}</span><audio src={url} controls preload="metadata" aria-label={file.name} className="h-8 w-full" /></div></div>;
                  return <a key={file.key} href={url} download={file.name} className="flex max-w-xs items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left hover:bg-white/[0.1]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">{file.mimeType.startsWith("audio/") ? <Video className="h-4 w-4 text-cyan-200" /> : <FileText className="h-4 w-4 text-cyan-200" />}</span><span className="min-w-0"><span className="block max-w-52 truncate text-xs text-slate-100">{file.name}</span><span className="block text-[10px] text-slate-400">Download file</span></span></a>;
                })}</div> : null}</>}
                {message.kind === "secret-request" && message.secretRequirement && <form onSubmit={event => { event.preventDefault(); void saveRequestedSecret(message); }} className="mt-3 space-y-2 rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3">
                  {secretSaved[message.id] ? <p role="status" className="text-xs leading-5 text-emerald-200">Key saved. Provider integration is not enabled.</p> : <>
                    <label className="block text-[11px] text-slate-400">{message.secretRequirement.provider} API key<input type="password" value={secretValues[message.id] || ""} onChange={event => setSecretValues(current => ({ ...current, [message.id]: event.target.value }))} maxLength={10000} autoComplete="new-password" spellCheck={false} aria-label={`${message.secretRequirement.provider} API key`} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b121c] px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-cyan-200/40" /></label>
                    {secretErrors[message.id] && <p role="alert" className="text-xs text-rose-200">{secretErrors[message.id]}</p>}
                    {!projectId && <p role="alert" className="text-xs text-rose-200">Select a project before saving a key.</p>}
                    {message.secretProjectId !== projectId && projectId && <p role="alert" className="text-xs text-rose-200">Switch back to the project that requested this key before saving it.</p>}
                    <button type="submit" disabled={!projectId || message.secretProjectId !== projectId || !secretValues[message.id]?.trim() || secretSaving[message.id]} className="inline-flex items-center gap-2 rounded-md bg-cyan-200/15 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-200/25 disabled:cursor-not-allowed disabled:opacity-40">{secretSaving[message.id] ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}Save encrypted in Settings → Secrets</button>
                  </>}
                </form>}
              </article>;
            })}
            {capturedSecret && <form onSubmit={event => { event.preventDefault(); void saveCapturedSecret(capturedSecret); }} aria-label="Securely save detected API key" className="ml-auto max-w-[94%] space-y-2 rounded-xl border border-cyan-200/20 bg-cyan-200/[0.04] p-4 text-xs text-slate-200">
              <p className="font-medium text-cyan-100">API key detected. Choose where to save it securely.</p>
              <p className="leading-5 text-slate-400">The key stays masked and is saved directly to this project’s encrypted Settings → Secrets, not the conversation.</p>
              <label className="block text-[11px] text-slate-400">Service name<input required maxLength={80} value={capturedSecret.provider} onChange={event => setCapturedSecret(current => current ? { ...current, provider: event.target.value } : current)} placeholder="For example, Gemini" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b121c] px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-200/40" /></label>
              <label className="block text-[11px] text-slate-400">Key name<input required maxLength={64} pattern="[A-Za-z][A-Za-z0-9_\x2d]{0,63}" value={capturedSecret.name} onChange={event => setCapturedSecret(current => current ? { ...current, name: event.target.value } : current)} placeholder="For example, GEMINI_API_KEY" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b121c] px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-cyan-200/40" /></label>
              <label className="block text-[11px] text-slate-400">API key<input type="password" autoComplete="new-password" spellCheck={false} value={capturedSecret.value} onChange={event => setCapturedSecret(current => current ? { ...current, value: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b121c] px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-cyan-200/40" /></label>
              {capturedSecretError && <p role="alert" className="text-xs text-rose-200">{capturedSecretError}</p>}
              {!projectId && <p role="alert" className="text-xs text-rose-200">Select a project before saving this key.</p>}
              <div className="flex items-center justify-between gap-2"><p className="text-[10px] text-slate-500">{capturedSecretSaving ? "Saving encrypted…" : "Only the encrypted value is stored on the server."}</p><button type="submit" disabled={!projectId || !capturedSecret.provider.trim() || !capturedSecret.name.trim() || !capturedSecret.value.trim() || capturedSecretSaving} className="inline-flex items-center gap-2 rounded-md bg-cyan-200/15 px-3 py-1.5 font-medium text-cyan-100 transition hover:bg-cyan-200/25 disabled:cursor-not-allowed disabled:opacity-40">{capturedSecretSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}Save to Secrets</button></div>
            </form>}
        {streaming && <div className="smartbuild-loading flex items-center gap-2 text-sm text-slate-400" role="status"><LoaderCircle className="h-4 w-4 animate-spin text-slate-300" /> Working on your request…</div>}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="smartbuild-composer-wrap shrink-0 bg-gradient-to-t from-[#090c12] via-[#090c12] to-transparent px-4 pb-1 pt-1 sm:px-8 sm:pb-2">
        {localAiNeedsDownload && onPrepareLocalAi && <div className="mx-auto mb-2 flex max-w-[760px] flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs text-slate-300">
          <span>{localAiDownloadError || (preparingLocalAi ? `Downloading Chrome's local AI model${localAiDownloadProgress === null ? "…" : `: ${localAiDownloadProgress}%`}` : "Chrome's local model needs a one-time download before it can answer locally.")}</span>
          <button type="button" disabled={preparingLocalAi} onClick={() => {
            setPreparingLocalAi(true);
            setLocalAiDownloadError(null);
            setLocalAiDownloadProgress(null);
            void onPrepareLocalAi(percent => setLocalAiDownloadProgress(percent))
              .catch(error => setLocalAiDownloadError(error instanceof Error ? error.message : "Chrome's local AI model could not be prepared."))
              .finally(() => setPreparingLocalAi(false));
          }} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200/25 bg-cyan-200/10 px-2.5 py-1.5 font-medium text-cyan-100 transition hover:bg-cyan-200/20 disabled:cursor-wait disabled:opacity-60">
            {preparingLocalAi ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            {preparingLocalAi ? "Preparing…" : "Prepare local AI"}
          </button>
        </div>}
        <div className="smartbuild-composer mx-auto max-w-[760px] rounded-[1.35rem] border border-white/10 bg-[#0d1521] p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.26)] focus-within:border-cyan-300/35">
          {(references.length > 0 || uploading) && <div aria-live="polite" className="flex flex-wrap gap-2 px-2 pb-2"><span className="w-full text-[10px] text-slate-500">{references.length}/{MAX_CHAT_ATTACHMENTS} files attached</span>{references.map(file => <span key={file.url} className="group flex max-w-full items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] px-2 py-1.5 text-xs text-slate-200">{file.mimeType?.startsWith("image/") ? <img src={file.key ? `/manus-storage/${file.key.split("/").map(encodeURIComponent).join("/")}` : file.url} alt={file.name} className="h-12 w-12 shrink-0 rounded-md border border-white/10 object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.07]">{file.mimeType?.startsWith("video/") ? <Video className="h-3.5 w-3.5 text-cyan-200" /> : <FileText className="h-3.5 w-3.5 text-cyan-200" />}</span>}<span className="min-w-0"><span className="block max-w-52 truncate">{file.name}</span><span className="text-[10px] text-cyan-200/80">Attached</span></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => changeReferences(references.filter(item => item.url !== file.url))} className="ml-1 text-slate-400 hover:text-white">×</button></span>)}{uploading && <span role="status" className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Uploading {uploadingName || "file"}…</span>}</div>}
          <div className="flex items-center gap-2 px-1 py-1">
            <TooltipProvider delayDuration={180}><div className="flex items-center gap-1">
              <input ref={fileInputRef} type="file" multiple disabled={uploading} className="hidden" onChange={event => { if (event.target.files?.length) void upload(event.target.files); }} />
              <div className="relative"><button type="button" aria-label="Open attachments and tools" aria-expanded={attachmentMenuOpen} title="Attachments and tools" onClick={() => setAttachmentMenuOpen(open => !open)} className="smartbuild-attachment-button inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition disabled:opacity-50"><Plus className="h-4 w-4" /></button>{attachmentMenuOpen && <div className="smartbuild-attachment-menu absolute bottom-10 left-0 z-20 min-w-36 overflow-hidden rounded-xl border p-1 shadow-2xl"><button type="button" disabled={uploading} onClick={() => { setAttachmentMenuOpen(false); fileInputRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs disabled:opacity-50"><Paperclip className="h-3.5 w-3.5" />{uploading ? "Uploading…" : "Attach file"}</button>{projectId && <><button type="button" onClick={() => void downloadProjectReport("csv")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs"><FileDown className="h-3.5 w-3.5" />CSV</button><button type="button" onClick={() => void downloadProjectReport("pdf")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs"><FileDown className="h-3.5 w-3.5" />PDF</button></>}</div>}</div>
            </div></TooltipProvider>

            <label htmlFor="smartbuild-composer" className="sr-only">Ask SmartBuild</label>
            <textarea ref={composerRef} id="smartbuild-composer" value={draft} onChange={event => setDraft(event.target.value)} onPaste={event => {
              const images = Array.from(event.clipboardData.items)
                .filter(item => item.kind === "file" && item.type.startsWith("image/"))
                .map(item => item.getAsFile())
                .filter((file): file is File => file !== null);
              if (!images.length) return;
              event.preventDefault();
              if (!messages.length) {
                window.dispatchEvent(new CustomEvent("smartbuild:ai-image-check-paste", { detail: images }));
                return;
              }
              const files = images.map((file, index) => new File(
                [file],
                file.name || `pasted-image-${Date.now()}-${index + 1}.${file.type.split("/")[1] || "png"}`,
                { type: file.type, lastModified: file.lastModified },
              ));
              void upload(files);
            }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitAsk(); } }} disabled={disabled || streaming} placeholder="Ask SM+3.1 Pro a question…" aria-label="Chat with SM+3.1 Pro" rows={1} className="h-9 min-h-9 max-h-9 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1.5 text-[14px] leading-4 text-slate-100 shadow-none outline-none ring-0 placeholder:text-slate-500 disabled:cursor-not-allowed appearance-none" />

            <div className="flex items-center gap-2">
              <button type="button" aria-label={recording ? "Stop voice input" : "Start voice input"} aria-pressed={recording} disabled={disabled || streaming || sending} onClick={toggleVoiceInput} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition ${recording ? "border-rose-300/50 bg-rose-300/15 text-rose-100" : "border-white/10 text-slate-400 hover:border-cyan-300/35 hover:bg-white/[0.07] hover:text-slate-100"} disabled:cursor-not-allowed disabled:opacity-50`}><Mic className={`h-3.5 w-3.5 ${recording ? "animate-pulse" : ""}`} /></button>
              <button type="button" data-testid="composer-send" onClick={() => streaming ? onStop?.() : void submitAsk()} disabled={disabled || sending || uploading || (!streaming && !draft.trim() && !references.length)} aria-label={streaming ? "Stop response" : "Send message"} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#7ed8ff] text-[#07131e] shadow-[inset_0_0_0_1px_rgba(7,19,30,0.12)] transition hover:bg-[#9fe6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500">{streaming ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-3.5 w-3.5" />}</button>
            </div>
          </div>
        </div>
      </div>
      {utility && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={() => setUtility(null)}>
        <section aria-label={`${utility} panel`} className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.12] bg-[#121924] shadow-2xl" onMouseDown={event => event.stopPropagation()}>
          <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.08] text-slate-200">{utility === "Plugins" ? <PlugZap className="h-4 w-4" /> : utility === "Settings" ? <Settings2 className="h-4 w-4" /> : <CircleHelp className="h-4 w-4" />}</span><h2 className="text-sm font-semibold text-white">{utility}</h2></div><button onClick={() => setUtility(null)} aria-label="Close panel" className="rounded-md p-1 text-slate-500 hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button></header>
          {utility === "Plugins" && <div className="space-y-3 p-5"><p className="text-sm leading-6 text-slate-400">Choose a conversation helper.</p>{[["Architecture review", "Explain the main risks and interfaces in this architecture. Do not make or propose file changes."], ["Technical explanation", "Explain this technical approach and its tradeoffs. Do not create or modify project files."], ["Debug assistant", "Help me understand this issue. Ask for the smallest useful reproduction details first."]].map(([label, prompt]) => <button key={label} onClick={() => { setDraft(prompt); setUtility(null); }} className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-left text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"><span>{label}</span><ArrowUp className="h-3.5 w-3.5 text-slate-300" /></button>)}</div>}
          {utility === "Settings" && <div className="space-y-4 p-5"><p className="text-sm leading-6 text-slate-400">Workspace preferences are stored in this browser session. Authentication remains a private persistent cookie with no third-party sign-in.</p><label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3"><span><span className="block text-sm text-slate-200">Concise SM+3.1 Pro responses</span><span className="mt-0.5 block text-xs text-slate-500">Prefer focused, practical answers.</span></span><input checked={compactReplies} onChange={event => setCompactReplies(event.target.checked)} type="checkbox" className="h-4 w-4 accent-cyan-300" /></label><label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3"><span><span className="block text-sm text-slate-200">Research assistant</span><span className="mt-0.5 block text-xs text-slate-500">Keep the research panel ready for sources.</span></span><input checked={autoResearch} onChange={event => setAutoResearch(event.target.checked)} type="checkbox" className="h-4 w-4 accent-cyan-300" /></label></div>}
          {utility === "Help" && <div className="space-y-3 p-5"><p className="text-sm leading-6 text-slate-400">A quick path through the workspace:</p>{["Create a workspace to start a conversation.", "Ask a question or discuss a design idea.", "Use Research to save cited sources beside the chat.", "Open Files to inspect saved project files; editing is disabled."].map((step, index) => <div key={step} className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-semibold text-slate-200">{index + 1}</span><p className="text-sm leading-5 text-slate-300">{step}</p></div>)}<div className="flex items-center gap-2 pt-1 text-xs text-slate-200"><Check className="h-3.5 w-3.5" />Use <kbd className="rounded bg-white/[0.08] px-1.5 py-0.5">⌘K</kbd> to open quick actions.</div></div>}
        </section>
      </div>}
      {selectedSpeechText && createPortal(
        <button
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={speakSelection}
          aria-label={`انطق النص المحدد: ${selectedSpeechText.text.slice(0, 80)}`}
          title="انطق النص المحدد"
          className="fixed z-[100] inline-flex h-6 items-center gap-1 rounded-md px-1 text-[11px] font-medium text-cyan-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60"
          style={{ top: selectedSpeechText.top, left: selectedSpeechText.left }}
        >
          {speakingMessageId === "selection" ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          انطق
        </button>,
        document.body,
      )}
    </section>
  );
}

export default AIChatBox;
