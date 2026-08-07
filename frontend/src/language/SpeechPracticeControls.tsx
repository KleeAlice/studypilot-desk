import { useEffect, useMemo, useRef, useState } from "react";
import { speakLanguageText, stopLanguageSpeech } from "./speech";

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => RecognitionInstance;

function recognitionConstructor() {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
}

function transcriptTokens(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase().trim();
  if (!normalized) return [];

  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized)) {
    return Array.from(normalized.replace(/[\p{P}\p{S}\s]+/gu, ""));
  }

  return normalized
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function longestCommonSubsequence(left: string[], right: string[]): number {
  const previous = new Array(right.length + 1).fill(0);
  for (const leftToken of left) {
    const current = new Array(right.length + 1).fill(0);
    for (let index = 1; index <= right.length; index += 1) {
      current[index] = leftToken === right[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1]);
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

export function transcriptCoverage(target: string, spoken: string): number {
  const targetTokens = transcriptTokens(target);
  if (!targetTokens.length) return 0;
  const spokenTokens = transcriptTokens(spoken);
  return Math.round((longestCommonSubsequence(targetTokens, spokenTokens) / targetTokens.length) * 100);
}

export function SpeechPracticeControls({
  term,
  languageTag,
  speechRate = 1,
  onComplete,
}: {
  term: string;
  languageTag: string;
  speechRate?: number;
  onComplete: (transcript: string) => void;
}) {
  const Recognition = useMemo(() => recognitionConstructor(), []);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [recognitionError, setRecognitionError] = useState("");

  const coverage = useMemo(
    () => transcript ? transcriptCoverage(term, transcript) : null,
    [term, transcript],
  );
  useEffect(() => () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopLanguageSpeech();
  }, []);

  function play(rate: number) {
    speakLanguageText(term, languageTag, rate);
  }

  function startRecognition() {
    if (!Recognition || listening) return;
    setRecognitionError("");
    const next = new Recognition();
    next.lang = languageTag;
    next.continuous = false;
    next.interimResults = false;
    next.onresult = (event) => {
      const latest = event.results[event.results.length - 1];
      setTranscript(latest?.[0]?.transcript?.trim() || "");
      setListening(false);
    };
    next.onerror = () => {
      setRecognitionError("语音识别没有成功，请重试或直接完成本次跟读。");
      setListening(false);
    };
    next.onend = () => setListening(false);
    recognitionRef.current = next;
    setListening(true);
    next.start();
  }

  return (
    <div className="speech-practice-controls">
      <div className="speech-playback-actions">
        <button type="button" onClick={() => play(speechRate)}>原速播放</button>
        <button type="button" onClick={() => play(Math.max(0.5, speechRate * 0.65))}>慢速播放</button>
        <button type="button" onClick={stopLanguageSpeech}>停止播放</button>
      </div>
      {Recognition ? (
        <>
          <button type="button" className="language-primary-action" onClick={startRecognition} disabled={listening}>
            {listening ? "正在听…" : "开始语音识别"}
          </button>
          {transcript && <p className="speech-transcript">识别转写：<strong>{transcript}</strong></p>}
          {coverage !== null && (
            <div className="speech-transcript-match" role="status">
              <strong>转写覆盖 {coverage}%</strong>
              <p>
                {coverage >= 85 ? "核心文字已基本覆盖，可以再听一次节奏和重音。" : "还有文字没有覆盖，请慢速听一遍后再说。"}
                这是文本匹配反馈，不是口音或声学发音评分。
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="language-practice__notice">
          当前系统未提供语音识别；你仍可原速或慢速跟读，但系统不会生成虚假发音分数。
        </p>
      )}
      {recognitionError && <p role="alert" className="error-message">{recognitionError}</p>}
      <button type="button" onClick={() => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        stopLanguageSpeech();
        onComplete(transcript);
      }}>完成跟读</button>
    </div>
  );
}
