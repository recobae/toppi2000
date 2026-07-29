// Shared between FollowingBar and ProfileStoryAvatar so an "active story"
// ring looks identical everywhere it appears.
export const STORY_RING_CLASS =
  "rounded-full p-[3px] bg-[conic-gradient(from_0deg,#f97316,#ec4899,#8b5cf6,#3b82f6,#10b981,#f97316)]";
// Same padding as STORY_RING_CLASS so avatars line up identically whether or
// not they currently have an active/unseen story -- just no color.
export const STORY_RING_CLASS_INACTIVE = "rounded-full p-[3px] bg-transparent";
