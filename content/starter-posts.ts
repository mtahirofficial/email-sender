// Starter articles. Installed with one click from the blog manager; edit or
// delete them there afterwards. Content is Markdown (## and ### headings).

export type StarterPost = { slug: string; title: string; excerpt: string; tags: string[]; content: string };

export const STARTER_POSTS: StarterPost[] = [
  {
    slug: "send-email-from-your-own-gmail-address-without-spoofing",
    title: "How to Send Email From Your Own Gmail Address Without Spoofing",
    excerpt:
      "Typing someone else's address into a From field is spoofing, and inbox providers block it. Learn how SPF, DKIM and DMARC work, and how to send as yourself the right way.",
    tags: ["deliverability", "security", "gmail"],
    content: `Typing an address into a "From" field that your server does not control is spoofing, and modern inbox providers are built to stop it. If you want mail to arrive from your own address and actually reach the inbox, the right approach is to send through the provider that owns that address.

## What email spoofing is

Email was designed when nobody checked the sender. The "From" line is just text, so a server can claim to be anyone. Attackers abuse this for phishing, which is why Gmail, Outlook and Yahoo now verify who is really allowed to send for a domain.

## How providers check the sender

Three DNS-based standards work together:

- **SPF** lists the servers allowed to send mail for a domain.
- **DKIM** adds a cryptographic signature proving the message was authorised by the domain and not altered in transit.
- **DMARC** tells receivers what to do when SPF or DKIM fail, and lets the domain owner request reports.

If you put you@gmail.com in the From field and send from your own server, SPF and DKIM fail for gmail.com, because Google never authorised your server. The message is rejected or filed under spam, and it looks like exactly what it is.

## The legitimate ways to send as yourself

There are two honest options:

1. **Send from a domain you own.** Verify the domain with your email provider, publish the SPF and DKIM records it gives you, and send from any address on that domain.
2. **Send through your own mailbox.** You cannot edit DNS for gmail.com or outlook.com, so the only correct route is to let Google or Microsoft send the message for you, using OAuth.

With the second option the message is created by Gmail or Outlook, from your real account, and signed with their keys. SPF, DKIM and DMARC all pass because nothing is being faked.

## What to check before you trust a sending tool

- It asks for **send-only** permission (gmail.send for Gmail, Mail.Send for Outlook), not full access to your inbox.
- It stores tokens **encrypted** and lets you disconnect at any time.
- It never asks for your email password.
- Sent messages appear in your own Sent folder, which proves they really came from your account.

## The short version

Do not forge a From address. Connect the mailbox you own, let its provider deliver the message, and you get real authentication, better inbox placement and nothing to explain to a recipient who wonders why your email looks odd. That is exactly how [Outbox works](/#how-it-works), and the [security details](/#security) explain what access it asks for.

Related reading: [why emails go to spam](/blog/why-your-emails-go-to-spam) and [Gmail and Outlook sending limits](/blog/gmail-and-outlook-sending-limits-explained).`,
  },
  {
    slug: "cc-vs-bcc-vs-individual-emails",
    title: "Cc vs Bcc vs Individual Emails: Which Should You Use?",
    excerpt:
      "Cc exposes everyone, Bcc hides everyone, and separate emails let you personalise each message. Here is when each option is the right call, and the trade-offs of each.",
    tags: ["email tips", "privacy"],
    content: `When you email more than one person, you have three choices: put them in Cc, put them in Bcc, or send each person their own message. They look similar on screen but behave very differently once the email lands.

## Cc: everyone sees everyone

Cc (carbon copy) shows every recipient's address to every other recipient. That is the point when people need to see who else is involved, such as a project team or a meeting invite.

The downside is exposure. Anyone on the list can reply all, forward the thread, or copy the addresses. Never use Cc for people who do not know each other.

## Bcc: hidden, but not private

Bcc (blind carbon copy) hides recipients from each other. It stops address leaks, which makes it popular for announcements.

It has limits, though:

- Everyone gets the **same subject and body**, so you cannot personalise anything.
- One slip, such as putting the list in To or Cc by mistake, exposes every address, and you cannot undo it.
- Bcc blasts look like bulk mail, and filters treat them with more suspicion.
- Replies come back to you only, which is good, but recipients cannot tell the message was meant for a group.

## Individual emails: one message per person

Sending a separate email to each recipient avoids both problems. Nobody sees anyone else, and each message can carry its own greeting, details and subject line.

Individual emails shine when:

- the message includes personal details such as an invoice number or a name;
- recipients are customers, clients or leads who should never see each other;
- you want to know exactly which messages succeeded and which failed.

The trade-offs are time and limits. Sending 40 separate emails by hand is tedious, and every message counts against your provider's [daily sending limit](/blog/gmail-and-outlook-sending-limits-explained).

## A simple rule of thumb

- Use **Cc** when people need to see each other.
- Use **Bcc** for a one-way announcement where wording is identical.
- Use **individual emails** whenever the content or the relationship is personal.

[Outbox](/#features) is built for the third case: add as many recipients as you like and each one gets their own email from your real address, with the same subject or a different one for each person.

Related reading: [writing subject lines that get opened](/blog/email-subject-lines-that-get-opened) and [Gmail and Outlook sending limits](/blog/gmail-and-outlook-sending-limits-explained).`,
  },
  {
    slug: "why-your-emails-go-to-spam",
    title: "Why Your Emails Go to Spam and How to Fix It",
    excerpt:
      "Most spam-folder problems come from a handful of causes: weak authentication, a cold sender reputation, spammy wording, and sending too much too fast. Here is how to fix each one.",
    tags: ["deliverability", "email tips"],
    content: `Few things are more frustrating than writing a careful email and learning it landed in spam. The good news is that most cases come down to a short list of causes, and you can fix nearly all of them.

## 1. The sender is not authenticated

Receivers check SPF, DKIM and DMARC to confirm a message really came from the address it claims (we explain [how they work](/blog/send-email-from-your-own-gmail-address-without-spoofing)). If those checks fail, the message is likely to be filtered. Sending through the real mailbox, such as Gmail or Outlook itself, means the provider's own authentication applies automatically.

## 2. The sender has no reputation yet

A brand-new address or domain that suddenly sends many messages looks suspicious. Warm up gradually: start with a few messages a day to people who know you, and increase slowly over weeks.

## 3. The content looks like spam

Filters score wording and formatting. Common triggers are:

- ALL CAPS and lots of exclamation marks;
- phrases like "act now" or "100% free";
- large images with little text, or many links;
- link shorteners that hide the destination.

Write the way you would to one person. Short, plain messages perform best.

## 4. Everyone receives identical mail

Mailbox providers watch for the same message sent to many people at once. [Sending individual emails](/blog/cc-vs-bcc-vs-individual-emails) with personal details, and varying the subject where it makes sense, looks like normal human correspondence because it is.

## 5. Recipients do not want the message

Nothing hurts reputation like people marking your mail as spam. Only email people who expect to hear from you, say clearly who you are, and make it easy to say "no more".

## 6. You are sending too fast or too much

Every provider [caps daily sending](/blog/gmail-and-outlook-sending-limits-explained), and bursts look automated. Spread large batches out and stay well inside your limits.

## A quick checklist

- Send from a real, authenticated mailbox.
- Keep volume low and steady at first.
- Use a [clear subject](/blog/email-subject-lines-that-get-opened) that matches the content.
- Personalise each message.
- Ask a colleague to check the result in their inbox, then fix what you find.`,
  },
  {
    slug: "gmail-and-outlook-sending-limits-explained",
    title: "Gmail and Outlook Sending Limits Explained",
    excerpt:
      "Gmail and Outlook both cap how many emails you can send per day. Here is a plain-English guide to the limits, what happens when you hit them, and how to stay safe.",
    tags: ["gmail", "outlook", "limits"],
    content: `Every mailbox provider limits how much mail one account can send. The limits exist to stop spam, and they apply no matter which tool you use to send. Knowing them helps you plan a batch instead of finding out halfway through.

> Limits change over time and differ by plan. The figures below are approximate, so always confirm them in the provider's current documentation.

## Gmail and Google Workspace

- A personal Gmail account can send roughly **500 messages per day**.
- Google Workspace accounts have a higher allowance, around **2,000 messages per day**.
- Each message also has a cap on the number of recipients.

Google counts messages sent from the web app, a phone, and any connected app together.

## Outlook.com and Microsoft 365

- Outlook.com and Hotmail accounts allow roughly **300 messages per day**.
- Microsoft 365 (Exchange Online) accounts allow up to around **10,000 recipients per day**, with a rate limit of about **30 messages per minute**.

Newer accounts may be held to lower limits until they build a history.

## Why individual emails use more of your allowance

When you send one message to 50 people through [Cc or Bcc](/blog/cc-vs-bcc-vs-individual-emails), it often counts as a single send. When you send 50 separate emails, you use 50. That is the price of privacy and personalisation, and it is why it pays to know your limit before a large batch.

## What happens when you hit a limit

The provider temporarily blocks sending, usually for up to 24 hours, and may send a notice. Repeatedly hitting limits can also put your account under review, so it is worth avoiding.

## How to stay inside the limits

- Split big lists across several days.
- Do not send everything in a single burst.
- Remove invalid or old addresses, since bounces count against you (more on that in [why emails go to spam](/blog/why-your-emails-go-to-spam)).
- Use a Workspace or Microsoft 365 account for higher volume.
- Keep a record of what you sent, so you can resume where you stopped.

Outbox keeps a [Sent history](/#features) with the result of every message, which makes it easy to see what went out and what still needs sending.`,
  },
  {
    slug: "email-subject-lines-that-get-opened",
    title: "Writing Email Subject Lines That Get Opened",
    excerpt:
      "A good subject line is specific, short and honest. Practical rules for writing subject lines people open, with examples and a case for personalising them per recipient.",
    tags: ["email tips", "copywriting"],
    content: `The subject line decides whether your email is read at all. People scan their inbox in seconds, so you have very little time to earn a click. These rules work for everything from client updates to outreach.

## Be specific

A specific subject tells the reader exactly what is inside, which builds trust.

- Weak: "Update"
- Better: "Your October invoice is ready"

## Keep it short

Many inboxes cut subjects off around 40 to 60 characters, and mobile screens cut them sooner. Put the important words first so they survive the trim.

## Match the subject to the message

A subject that promises something the email does not deliver might win one open, but it costs you trust and increases spam reports. The best subject is an honest summary.

## Avoid spammy habits

- ALL CAPS and repeated punctuation ("FREE!!!");
- vague urgency like "Act now";
- fake "Re:" or "Fwd:" prefixes.

These also raise the chance of [landing in spam](/blog/why-your-emails-go-to-spam).

## Add a reason to open

Give the reader a benefit, a deadline that is real, or a question they care about:

- "Can we move Thursday's call to 3 pm?"
- "Three changes to your booking"
- "Draft for review before Friday"

## Personalise where it matters

A name, a company or a detail from your last conversation makes a message feel written for one person, because it is. Compare "Quick question" with "Quick question about Maya's proposal".

This is where [sending individual emails](/blog/cc-vs-bcc-vs-individual-emails) helps. When each person gets their own message, each one can have its own subject. In Outbox you can switch off "Same subject for all" and write a different subject for every recipient, so a batch of invoices, introductions or follow-ups still feels personal.

## Test and learn

Keep a note of which subjects get replies and reuse the patterns. Small, honest changes beat clever tricks every time. Questions about using Outbox? [Get in touch](/contact).`,
  },
];
