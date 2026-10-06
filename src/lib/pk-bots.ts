export type PkBotProfile = {
  username: string;
  seed: string;
};

export const PK_QUESTION_MS = 10_000;

export const PK_BOTS: PkBotProfile[] = [
  { username: "永和陳冠希", seed: "yonghe-cx" },
  { username: "只想睡覺的貓", seed: "sleepy-cat" },
  { username: "大同電鍋本體", seed: "tatung-pot" },
  { username: "期末考救救我", seed: "finals-help" },
  { username: "台南無糖綠", seed: "tainan-green" },
  { username: "半夜滑手機", seed: "midnight-scroll" },
  { username: "捷運讓座冠軍", seed: "mrt-seat" },
  { username: "珍珠奶茶半糖", seed: "boba-half" },
  { username: "圖書館佔位王", seed: "library-seat" },
  { username: "夜市雞排加辣", seed: "night-market" },
  { username: "系學會沒有人", seed: "club-empty" },
  { username: "週末回老家", seed: "weekend-home" },
  { username: "便當忘記加熱", seed: "cold-bento" },
  { username: "報告還沒開始", seed: "report-later" },
  { username: "腳踏車沒氣了", seed: "flat-bike" },
  { username: "超商第二名", seed: "store-second" },
  { username: "雨天沒帶傘", seed: "rain-no-umbrella" },
  { username: "修課衝堂中", seed: "schedule-clash" },
];

export function botAvatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

export function pickPkBot(usedNames: string[]) {
  const open = PK_BOTS.filter((bot) => !usedNames.includes(bot.username));
  const pool = open.length > 0 ? open : PK_BOTS;
  const bot = pool[Math.floor(Math.random() * pool.length)] ?? PK_BOTS[0];
  return { username: bot.username, avatarUrl: botAvatarUrl(bot.seed) };
}

export function pkBotDelayMs() {
  return 3500 + Math.random() * 2500;
}

export function pkAnswerScore(elapsedMs: number, correct: boolean) {
  if (!correct) return 0;
  const remaining = Math.max(0, PK_QUESTION_MS - elapsedMs);
  return 1000 + Math.floor(remaining * 0.2);
}
