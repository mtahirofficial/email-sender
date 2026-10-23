// Built-in "Write with AI" presets for the guest posting process. They are used
// until the admin installs them into the database (Admin > AI presets), after
// which the admin can edit, hide, add and delete them there.

export type AiPreset = { id: string; label: string; prompt: string };
export type DefaultPreset = { slug: string; label: string; prompt: string };

export const DEFAULT_PRESETS: DefaultPreset[] = [
  {
    slug: "guest-post-inquiry",
    label: "Guest post inquiry",
    prompt:
      "Write a short, polite first email to the owner of a website asking whether they accept guest posts. Say I am a writer who would like to contribute a high-quality, original article that fits their audience. Ask if they have guest post guidelines and which topics they are looking for. Keep it friendly, concise and not salesy.",
  },
  {
    slug: "topic-ideas",
    label: "Topic ideas pitch",
    prompt:
      "Write a friendly email to a site owner who is open to guest posts. Offer to send 3 topic ideas tailored to their audience and ask which topics or categories they would most like to see. Mention that all my content is original, well researched and not published anywhere else. Keep it short.",
  },
  {
    slug: "follow-up",
    label: "Follow-up",
    prompt:
      "Write a polite follow-up to an email I sent about a guest post a few days ago that has not been answered. Gently remind them of my earlier message, restate the offer in one sentence and ask whether they are interested. Keep it very short and friendly, with no pressure.",
  },
  {
    slug: "final-follow-up",
    label: "Final follow-up",
    prompt:
      "Write a final, polite follow-up to a site owner who has not replied to my earlier guest post emails. Say I do not want to bother them, that this is my last message, and that they are welcome to reach out any time if they are interested. Keep it warm and under 80 words.",
  },
  {
    slug: "guidelines-pricing",
    label: "Guidelines & pricing",
    prompt:
      "Write a short email to a site owner who accepts guest posts, asking about their guest post guidelines and any fees. Ask about word count, link policy (how many links and what kind), turnaround time, and whether they charge for guest or sponsored posts. Keep it clear and polite.",
  },
  {
    slug: "article-submission",
    label: "Article submission",
    prompt:
      "Write an email to an editor saying the guest article they approved is finished and ready for review. Offer to share it as a Google Docs link, mention that it is original and follows their guidelines, and invite any feedback or edits. Keep it professional and brief.",
  },
  {
    slug: "publish-date-check",
    label: "Ask publish date",
    prompt:
      "Write a polite email to an editor asking when my submitted guest post is expected to be published. Mention that I sent it earlier, that I am happy to make changes if needed, and ask them to let me know the planned date. Keep it short and friendly.",
  },
  {
    slug: "link-update-request",
    label: "Link / edit request",
    prompt:
      "Write a polite email to a site owner asking for a small update to my published guest post, such as fixing or updating a link. Thank them for publishing it, explain the change simply, and ask them to reply if anything needs clarifying. Keep it brief and respectful.",
  },
  {
    slug: "thank-you-published",
    label: "Thank you after publishing",
    prompt:
      "Write a warm thank-you email to a site owner whose website published my guest post. Thank them for the opportunity, say I will share the article with my audience, and mention that I would love to contribute again in future. Keep it genuine and short.",
  },
  {
    slug: "more-articles",
    label: "Pitch more articles",
    prompt:
      "Write a friendly email to a site owner who published my earlier guest post, proposing to contribute more articles regularly. Say I can send a short list of new topic ideas and ask whether they would like that. Keep it brief and not pushy.",
  },
];
