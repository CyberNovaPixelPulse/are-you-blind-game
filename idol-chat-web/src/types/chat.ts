export type CharacterId = "A" | "B" | "C" | "D" | "user";

export type ChannelType = "group" | "A" | "B" | "C" | "D";

export interface Message {
  id: string | number;
  channelId: string;
  senderId: CharacterId;
  senderName: string;
  text: string;
  timestamp: string;
  isMe: boolean;
}

export interface Channel {
  id: string;
  name: string;
  avatar: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: string;
}
