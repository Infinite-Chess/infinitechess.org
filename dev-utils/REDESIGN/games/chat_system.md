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