/**
 * Module-specific `detail` shapes carried in ModulePayload.detail.
 * Only shapes that cross layer boundaries need to live here.
 */

export interface InstagramMedia {
  id: string;
  caption: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS" | string;
  productType?: string;     // "REELS" | "FEED" | …
  permalink: string;        // always from the live feed — never constructed
  thumbnail?: string;
  timestamp: string;
  likes?: number;
  comments?: number;
  reach?: number;
  plays?: number;
}

export interface InstagramDetail {
  username: string;
  /** Profile URL as derived from the live feed / API — never hard-coded. */
  profileUrl: string;
  /** Path the API was addressed through: "instagram-login" (IGAA) or "facebook-login" (EAA). */
  apiPath: "instagram-login" | "facebook-login";
  followers: number;
  follows?: number;
  mediaCount: number;
  /** Reconstructed running follower totals, oldest → newest, with ISO dates. */
  followerHistory: { date: string; total: number }[];
  reach28d?: number;
  engagementRate?: number;
  media: InstagramMedia[];
}
