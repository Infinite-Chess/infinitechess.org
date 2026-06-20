# Chat System — Design & Legal Compliance

## 1. Chat implementation requirements

- **In-chat report button.** A control on the chat letting a player flag the
  other's messages. The report record must capture: reporter, reported user,
  game ID, the message(s), timestamp, and reason. The reason is a pick from the
  list: Harassment, Child sexual content, Threats or violence, Other. After
  submitting, show the reporter a brief "report received" confirmation.
- **Hide chat.** A toggle to collapse the chat so a player can stop being
  exposed to unwanted messages.
- Only allow signed in users to send chat messages, so they can't abuse us not
  being able to ban them.
- **Message storage — retained permanently.** It is surfaced back to the two
  participants on the finished game's page.
    - Visible only to the two participants, never public or spectators.
    - On account deletion, keep the messages. They are permanently linked to the
      game. Their physical account row is already deleted, and ID never reused.
- **Moderation backend.** Reports should notify me via abuse@infinitechess.org.
  Cloudflare needs to forward emails from that to my physical email.
    - The Admin Panel page already contains the ability to ban users on repeated
      offense, and logs all admin actions to a log.
    - The Admin Panel page needs a way to delete all chat messages for a given
      game_id. Easily allows us to remove illegal content.
- **Rate limiting** on sent messages. Anti-spam.

## 3. ToS / Privacy Policy additions

**Privacy Policy:**

- Disclose that an in-game chat exists and that messages are retained
  permanently with the game record, allowing participants to review it later.
  Messages sent in chat are only ever visible by you and your opponent, never
  shared to spectators or to the public.
- State the **lawful basis**: providing the game-history feature, plus
  legitimate interest in safety/moderation.
- State that on **account deletion** chat messages are **retained but detached
  from the account** (account row deleted, username forgotten, `user_id` never
  reused, so the author displays "Deleted User").

**Terms of Service / Acceptable-Use Policy:**

- Prohibited content: harassment, threats, CSAM, illegal content, spam, doxxing.
- **Advise users not to share personal information in chat.**
- State that we **moderate**, can **remove content**, and can **ban**.
- Explain **how to report** abuse.
- State that we cooperate with law enforcement / report CSAM.
