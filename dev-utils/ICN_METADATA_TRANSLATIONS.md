# English Translations Required for ICN Metadata

ICN metadata must **always** be written in English, regardless of the user's language.

---

## 1. Player Names (`White` / `Black` metadata)

Used when a player is not signed in, or is the local user in engine games.

| TOML Key                          | English Value | Used In                                                                         |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `play.javascript.you_indicator`   | `(You)`       | Engine & board-editor engine games — assigned to the human player's color       |
| `play.javascript.guest_indicator` | `(Guest)`     | Online games — assigned to non-signed-in players (server-side, already English) |

---

## 2. Variant Names (`Variant` metadata / `Event` metadata)

The variant code (e.g. `CoaIP`) is translated to its English spoken name when writing the `Event` string
and when copying a game to ICN (the `Variant` metadata field).

| TOML Key                            | English Value                                      |
| ----------------------------------- | -------------------------------------------------- |
| `play.play-menu.Classical`          | `Classical`                                        |
| `play.play-menu.Confined_Classical` | `Confined Classical`                               |
| `play.play-menu.Classical_Plus`     | `Classical+`                                       |
| `play.play-menu.CoaIP`              | `Chess on an Infinite Plane`                       |
| `play.play-menu.Pawndard`           | `Pawndard`                                         |
| `play.play-menu.Knighted_Chess`     | `Knighted Chess`                                   |
| `play.play-menu.Palace`             | `Palace`                                           |
| `play.play-menu.Knightline`         | `Knightline`                                       |
| `play.play-menu.Core`               | `Core`                                             |
| `play.play-menu.Standarch`          | `Standarch`                                        |
| `play.play-menu.Pawn_Horde`         | `Pawn Horde`                                       |
| `play.play-menu.Space_Classic`      | `Space Classic`                                    |
| `play.play-menu.Space`              | `Space`                                            |
| `play.play-menu.Obstocean`          | `Obstocean`                                        |
| `play.play-menu.Abundance`          | `Abundance`                                        |
| `play.play-menu.Amazon_Chandelier`  | `Amazon Chandelier`                                |
| `play.play-menu.Containment`        | `Containment`                                      |
| `play.play-menu.Classical_Limit_7`  | `Classical - Limit 7`                              |
| `play.play-menu.CoaIP_Limit_7`      | `Coaip - Limit 7`                                  |
| `play.play-menu.Chess`              | `Chess`                                            |
| `play.play-menu.Classical_KOTH`     | `Experimental: Classical - KOTH`                   |
| `play.play-menu.CoaIP_KOTH`         | `Experimental: Coaip - KOTH`                       |
| `play.play-menu.CoaIP_HO`           | `Chess on an Infinite Plane - Huygens Option`      |
| `play.play-menu.CoaIP_RO`           | `Chess on an Infinite Plane - Roses Option`        |
| `play.play-menu.CoaIP_NO`           | `Chess on an Infinite Plane - Knightriders Option` |
| `play.play-menu.Omega`              | `Showcase: Omega`                                  |
| `play.play-menu.Omega_Squared`      | `Showcase: Omega^2`                                |
| `play.play-menu.Omega_Cubed`        | `Showcase: Omega^3`                                |
| `play.play-menu.Omega_Fourth`       | `Showcase: Omega^4`                                |
| `play.play-menu.4x4x4x4_Chess`      | `4×4×4×4 Chess`                                    |
| `play.play-menu.5D_Chess`           | `5D Chess`                                         |

---

## In the Future

During the website redesign, all of these required keys should be better restructured (they should more apparently be for the javascript, and not for any play-menu).

In addition, these are the only keys for which all English translations should be sent to the client, on top of their existing language-specific translations which should already be sent.
