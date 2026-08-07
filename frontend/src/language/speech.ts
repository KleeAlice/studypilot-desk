import { useEffect } from "react";

export function stopLanguageSpeech(): void {
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
}

export function speakLanguageText(
  text: string,
  languageTag: string,
  rate = 1,
): SpeechSynthesisUtterance | null {
  if (
    typeof window === "undefined"
    || typeof SpeechSynthesisUtterance === "undefined"
    || !window.speechSynthesis
    || !text.trim()
  ) {
    return null;
  }
  stopLanguageSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageTag;
  utterance.rate = Math.min(1.5, Math.max(0.5, rate));
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function useStopLanguageSpeechOnUnmount(
  stopRecognition?: () => void,
): void {
  useEffect(() => () => {
    stopRecognition?.();
    stopLanguageSpeech();
  }, [stopRecognition]);
}
