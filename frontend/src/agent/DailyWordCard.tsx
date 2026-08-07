import type { VocabularyItem, VocabularyRating } from "./types";


const ratings: Array<[VocabularyRating, string]> = [
  ["again", "再来"],
  ["hard", "较难"],
  ["good", "记得"],
  ["easy", "很熟"],
];

export function DailyWordCard({
  item,
  disabled = false,
  onReview,
  onSpeak,
}: {
  item: VocabularyItem;
  disabled?: boolean;
  onReview: (rating: VocabularyRating) => void;
  onSpeak: () => void;
}) {
  return (
    <section className="daily-word-card" aria-label={`今日词汇：${item.term}`}>
      <header>
        <div>
          <small>今日词汇</small>
          <h3>{item.term}</h3>
          {item.pronunciation && <span>{item.pronunciation}</span>}
        </div>
        <button type="button" aria-label={`朗读词汇 ${item.term}`} onClick={onSpeak}>朗读</button>
      </header>
      <p>{item.meaning}</p>
      {item.example && <blockquote>{item.example}</blockquote>}
      <footer aria-label="词汇熟悉程度">
        {ratings.map(([rating, label]) => (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onReview(rating)}
          >
            {label}
          </button>
        ))}
      </footer>
    </section>
  );
}
