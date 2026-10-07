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

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "images.unsplash.com",
    pathname: "/**",
  },
];

if (imageHost) {
  remotePatterns.unshift({
    protocol: "https",
    hostname: imageHost,
    pathname: "/storage/v1/object/public/quiz-images/**",
  });
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
  experimental: {
    proxyClientMaxBodySize: "12mb",
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
