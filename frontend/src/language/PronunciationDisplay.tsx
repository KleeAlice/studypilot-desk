export function PronunciationDisplay({
  value,
  scheme,
  romanization,
}: {
  value: string;
  scheme?: string;
  romanization?: boolean;
}) {
  if (!value) return null;
  const labels: Record<string, string> = {
    ipa: "IPA",
    jyutping: "粤拼",
    kana: "假名",
    hangul: "韩文",
    romanization: "罗马字",
  };
  return (
    <span className="pronunciation-display">
      <small>{labels[scheme || ""] || (romanization ? "罗马字" : "读音")}</small>
      {value}
    </span>
  );
}
