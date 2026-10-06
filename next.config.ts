import type { NextConfig } from "next";

function quizImageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const imageHost = quizImageHost();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageHost
      ? [
          {
            protocol: "https",
            hostname: imageHost,
            pathname: "/storage/v1/object/public/quiz-images/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
