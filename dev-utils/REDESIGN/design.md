## Summary of what should go on each page/component

# Components

## Header

- Site name + logo -> Home page
- Learn: Tutorial, Checkmate Practice
- Tools: Analysis Board, Editor
- Leaderboard
- News
- Donate
- Profile/Login
- Register/Logout
- Settings

### Site omega_one logo: displays a cool animation where two transparent shadows of the omega_one image quickly expand larger then the main image (one shortly following the other), then shrink to be smaller than the main image, remaining permanently there until the user re-hovers and the animation restarts. Both are centered on the main image.

### Settings:
- Add Appearance > Light/Dark theme toggle.
- Add a way to change keybinds.

## Footer

- About Infinite Chess
- Contact
- Terms of Service
- Privacy
- Credits
- GitHub
- Discord
- Youtube


# Pages


## Shared across all pages
- Each page has respective light/dark themes, according to the data-theme rules in global.css.
- Background: Static 2D checkerboard background, like that of the chess stack exchange.
- All input sliders are unique customized: The thumb is an svg of a pawn.



## Homepage
- Slowly-panning perspective mode board, with a very opaque black overlay. And a toggle for disabling the animation (panning) of the background.
- Splash text at the top. Examples: "Chess on an infinite plane!", "Open world Chess!", "Chess 2.0!", "Finite Chess!", "Games on an integer lattice!", "Mate in omega!", "Checkmate in w^3 * 27 + w^2 * 3006 + w * 4 + 78,350,543!", "Mate in Omega_one - 1!", "You will die before it ends.", "Don't mind the checks!", "Check! Check! Check! Check!" "Draw by indefinite play!", "I resign.", "How do pawns promote?", "Never-ending infinite sandbox game!". This text is animated, growing & shrinking infinitely, so long as the background animation toggle is on. The text should be attention-grabbing. Below that is a link "About Infinite Chess".
- A field that, if it detects the user is new (not logged in, and browser has never played a game), displays text and a link "New? Follow the tutorial.".
- Below that: Lobby.
- Adjacent Buttons: "Create lobby game", "Challenge a friend" (online/local), "Play against computer".
- Below that: Spectate live games.

### Lobby
- [ ] Determine the thresholds for what considers a game to be bullet, blitz, rapid, or classical (probably a combination of start time, increment, and average number of moves per (rated?) game, to estimate total game length).
- Each invite is one row and has columns for username container (whoever owns the invite, their patron badge + rating), game mode (group of variant, with the respective svg preceding its name), Time [control], Casual/Rated (with an svg of the speed of the game preceeding it - bullet for short time controls, then there's a flame, bunny, and a turtle).
- No columns are sortable.
- The background of the lobby container has a faint omega_one image (that of the logo), similar to the faint Lichess's knight logo in the background of their lobby.
- Clicking anywhere in an invite auto-accepts it (no accept/cancel button). Clicking your own invite cancels it. The title attribute of the invite shows "Accept invite" or "Cancel" accordingly.
- Hovering over invites renders a small tooltip-popup window that previews the board. Non-interactible, zoom is fixed on the starting position location, moving the mouse off the live game hides the tooltip.

#### Create lobby game modal

- When any modal is open, they are centered, and the rest of the page is covered by a semi-transparent dark overlay that prevents interaction with the rest of the page until the modal is closed. Clicking outside the modal auto-closes it.
- [ ] Determine the maximum piece count where images are barely below recognizable. Convert that to characters
- A way to choose what kind of game (existing variant, or custom).
- Choosing a variant has a nested popup of some kind, with variants grouped by "Infinite" (variants that support the Infinity leaderboard), "4 Dimensional" variants, "Unique" variants (remaining other than Showcases), and "Showcase" variants (non-competitive, mate in omega variants). Each group type has its own svg associated with that type, this is so that at a glance, open invites in the lobby show what group the game belongs to. Hovering over variant names displays a new small canvas tooltip which renders a preview of the variant's starting position. After selecting a variant, an edit button is visible which opens the ICN text field below, pre-filled with the selected variant's ICN.
- Selecting the custom variant shows an empty text field that can accept any ICN. Next to this ICN text field are two buttons, a paste clipboard button, and an edit button which will end up taking you to the board editor. Maximum piece count prevents dirty images.
- Choose between "Finite Time" and "Infinite Time". Selecting finite time shows sliders, inspired from Lichess's UI, for setting "Minutes per side" (start time), and "Increment" in seconds (increment). The default is 10m and 4s increment.
- Choose between "Game mode" "Casual" and "Rated".

#### Challenge a friend modal
- An extension of the create lobby game modal.
- Also has choice of "Side" (color) you play as, inspired from Lichess's UI.
- There should be no redundancy in the html between this modal and the create lobby game modal, they should be the same modal with some fields hidden/disabled when you select one of the two options.

#### Play against computer modal
- An extension of the create lobby game modal.
- Doesn't have the Game mode (Casual/Rated) option.
- Also has a "Strength" slider, which sets the HydroChess engine's strength. Inspired from Lichess's UI. Levels 1-8.
- Also has the "Side" (color) choice, inspired from Lichess's UI.

### Spectate live games
- A list of live games, similar to the lobby list.
- Columns: White username container & current clock, Black username container & current clock, game mode (group of variant, with the respective svg preceding its name), Casual/Rated (with an svg of the speed of the game preceeding it - bullet for short time controls, then there's a flame, bunny, and a turtle).
- Hovering over a game shows a new small canvas tooltip that renders a preview of the current position in the game, auto-subscribing to the game as a spectator, and updating the board live, animating pieces when they move, and rendering arrow indicators too. Non-interactible, zoom is fixed on the starting position location, moving the mouse off the live game hides the tooltip.


## Tutorial
- Interactive tutorial teaching users the basic controls, features, and rules, of Infinite Chess.

## Checkmate Practice
- Along the top is a bar displaying your percentage completion of all checkmates, with badges displayed at the percentages you will earn them. If the user is not logged in, display a clear warning that users cannot earn badges without an account.
- Large banners for each checkmate to play, similar to that of Lichess's learn page. Each banner is colored, with clear boundaries, and like the existing checkmate practice on the main branch, contains svgs of the pieces showing you the checkmate pattern you need to solve. Unsolved checkmates are blue. Solved are green, with a checkmark badge. Checkmates are categorized and clearly separated by difficulty.

## Analysis Board
- Lichess style. Make, undo, change move history to perform analysis on positions.
- Turn on the engine to display the top move, and the score.

## Board Editor
- Share games via url. Next to the link to copy notation. Maximum piece count / icn length prevents dirty images.
- Create an invite from the position. Maximum piece count / icn length prevents dirty images. Same model popup as creating an invite from the lobby.
- Move to Analysis Board

## Leaderboard

## News

## Donate
- Lichess inspired. Donating any amount gives you a cool badge next to your username.
- One-time and Monthly donation options.
- TODO: Study laws and regulations surrounding payment processing and accepting users credit cards and other private information.
- TODO: Answer whether regulations are stricter if a patron plan also gives you a cool skin in the future infinite-multiplayer game. It wouldn't provide players an advantage. One could argue the skin is just a cosmetic reward similar to that of the badge?
- When monthly dontations stop, badge is removed.
- Maybe a lifetime donation amount where the badge is permanent?
- Lichess offers golden wings after 5 years of active patron status. And instantly after a lifetime donation, unlocking all colors.

## Login

## Register

## Profile

- User info: Patron badge, username, member since, online/last online status. World ranking.
- Spectate (if in live game).
- Manage account: Change username, password, cancel patron plan, delete account.


## Games
- Online games navigatable to via a link.
- If the game has not yet begun (open invite), it displays the lobby game invite properties, and gives you an option to accept it.
- If the game is live, visiting the link as a non-participant allows spectating the game.
- If the game is over, visiting the link allows you to view game history. Buttons are visible to move to the analysis board, and to share the game.
- One vertical bar with clocks, moves, and chat, and material lost per side. ANSWER: Must a chat system have a reporting ability? Do laws require us to have that?
- Game history moves bar: Lichess style. Each move is prepended with a tiny silhouette of the piece type that moved. Move coordinates too long are truncated, but hovering over them shows the full coordinates via the title attribute. 


## About Infinite Chess
- Brief story about the game's inception, why it is interesting, and how users can learn more. Basically the stuff on the existing home page on the main branch, but more professional.

## Terms of Service
- English only, rendered from a Markdown file, with an optional notice that the English version is authoritative.

## Privacy Policy
- English only, same approach as ToS.

## Credits
- State the project is open source, conveniently link to the github.
- Thank all github contributors. List all contributors on the github, similarly to the existing home page on the main branch.
- Give appropriate credit for other aspects of the website and game - variants, textures, sounds, music, external code, language translations, etc. Similar to the existing credits page on the main branch.