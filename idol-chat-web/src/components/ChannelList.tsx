"use client";

import type { Channel } from "@/types/chat";

interface ChannelListProps {
  channels: Channel[];
  activeChannelId: string;
  onSelectChannel: (id: string) => void;
}

export default function ChannelList({
  channels,
  activeChannelId,
  onSelectChannel,
}: ChannelListProps) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
      <header className="flex items-center gap-2 px-5 pb-3 pt-5">
        <h2 className="text-xl font-semibold tracking-tight text-gray-900">
          Messages
        </h2>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium tracking-wide text-purple-700">
          經紀人視角
        </span>
      </header>

      <ul className="flex-1 overflow-y-auto px-2 pb-3">
        {channels.map((channel) => {
          const isActive = channel.id === activeChannelId;

          return (
            <li key={channel.id}>
              <button
                type="button"
                onClick={() => onSelectChannel(channel.id)}
                aria-current={isActive ? "true" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isActive ? "bg-purple-50" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center text-2xl ${
                    channel.isGroup
                      ? "rounded-2xl bg-purple-100"
                      : "rounded-full bg-gray-100"
                  }`}
                >
                  {channel.avatar}
                  {channel.unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                      {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm text-gray-900 ${
                      isActive ? "font-bold" : "font-medium"
                    }`}
                  >
                    {channel.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    {channel.lastMessage ?? "尚無訊息"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
