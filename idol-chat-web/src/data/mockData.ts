import type { Channel, CharacterId, Message } from "@/types/chat";

export interface IdolProfile {
  id: Exclude<CharacterId, "user">;
  name: string;
  persona: string;
  avatar: string;
  channelName: string;
}

export const idols: Record<Exclude<CharacterId, "user">, IdolProfile> = {
  A: {
    id: "A",
    name: "Sora",
    persona: "外冷內奶 ACE",
    avatar: "🐱",
    channelName: "Sora (外冷內奶 ACE)",
  },
  B: {
    id: "B",
    name: "Jia",
    persona: "四次元大姐頭",
    avatar: "🐰",
    channelName: "Jia (四次元大姐頭)",
  },
  C: {
    id: "C",
    name: "Mina",
    persona: "浪漫主唱",
    avatar: "🐿️",
    channelName: "Mina (浪漫主唱)",
  },
  D: {
    id: "D",
    name: "Ruka",
    persona: "直球忙內",
    avatar: "🐣",
    channelName: "Ruka (直球忙內)",
  },
};

const groupLastMessage =
  "姐，鏡子不會眨眼。而且你上次承認自己是人類，是因為鬧鐘響了你還跟它道歉。";

const soraLastMessage =
  "……不是想你才傳的。只是群組太吵，我把通知關了，結果不小心把你的也關了。已經開回來。別誤會。";

export const initialChannels: Channel[] = [
  {
    id: "group",
    name: "Velvet 宿舍廢話群 (5)",
    avatar: "💜",
    isGroup: true,
    unreadCount: 2,
    lastMessage: groupLastMessage,
  },
  {
    id: "A",
    name: idols.A.channelName,
    avatar: idols.A.avatar,
    isGroup: false,
    unreadCount: 1,
    lastMessage: soraLastMessage,
  },
  {
    id: "B",
    name: idols.B.channelName,
    avatar: idols.B.avatar,
    isGroup: false,
    unreadCount: 0,
  },
  {
    id: "C",
    name: idols.C.channelName,
    avatar: idols.C.avatar,
    isGroup: false,
    unreadCount: 0,
  },
  {
    id: "D",
    name: idols.D.channelName,
    avatar: idols.D.avatar,
    isGroup: false,
    unreadCount: 0,
  },
];

export const initialMessages: Message[] = [
  {
    id: "group-1",
    channelId: "group",
    senderId: "B",
    senderName: idols.B.name,
    text: "本大姐剛跟練習室的鏡子對決，三秒內它先眨眼。今晚誰先睡，誰就承認自己是人類。",
    timestamp: "23:18",
    isMe: false,
  },
  {
    id: "group-2",
    channelId: "group",
    senderId: "D",
    senderName: idols.D.name,
    text: groupLastMessage,
    timestamp: "23:19",
    isMe: false,
  },
  {
    id: "A-1",
    channelId: "A",
    senderId: "A",
    senderName: idols.A.name,
    text: soraLastMessage,
    timestamp: "23:24",
    isMe: false,
  },
];
