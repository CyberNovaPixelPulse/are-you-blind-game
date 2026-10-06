"use client";

import { use } from "react";
import { PkRoom } from "@/components/pk-room";

export default function PkRoomPage({ params }: PageProps<"/pk/[room_code]">) {
  const { room_code } = use(params);
  return <PkRoom roomCode={room_code} />;
}
