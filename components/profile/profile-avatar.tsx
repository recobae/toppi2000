import Image from "next/image";

const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
];

function colorForUsername(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SIZE_CLASSES = {
  sm: { box: "h-10 w-10", text: "text-sm", sizes: "40px" },
  lg: { box: "h-24 w-24", text: "text-3xl", sizes: "96px" },
} as const;

export function ProfileAvatar({
  username,
  imageUrl,
  size = "lg",
}: {
  username: string;
  imageUrl: string | null;
  size?: "sm" | "lg";
}) {
  const { box, text, sizes } = SIZE_CLASSES[size];

  if (imageUrl) {
    return (
      <div className={`relative ${box} rounded-full overflow-hidden bg-muted shrink-0`}>
        <Image
          src={imageUrl}
          alt={username}
          fill
          sizes={sizes}
          className="object-cover"
        />
      </div>
    );
  }

  const initial = username.charAt(0).toUpperCase();

  return (
    <div
      className={`${box} rounded-full flex items-center justify-center ${text} font-semibold text-white shrink-0 ${colorForUsername(username)}`}
    >
      {initial}
    </div>
  );
}
