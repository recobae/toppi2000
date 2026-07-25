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

export function ProfileAvatar({
  username,
  imageUrl,
}: {
  username: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted shrink-0">
        <Image
          src={imageUrl}
          alt={username}
          fill
          sizes="96px"
          className="object-cover"
        />
      </div>
    );
  }

  const initial = username.charAt(0).toUpperCase();

  return (
    <div
      className={`h-24 w-24 rounded-full flex items-center justify-center text-3xl font-semibold text-white shrink-0 ${colorForUsername(username)}`}
    >
      {initial}
    </div>
  );
}
