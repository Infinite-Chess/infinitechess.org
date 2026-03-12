# Summary of what should go on each page/component

## Header

- Site name + logo -> Home page
- News
- Practice
- Editor
- Analysis
- Leaderboard
- Donate
- Profile/Login
- Register/Logout
- Settings

## Homepage
- Scrolling perspective mode board? Generally across the site though, a static 2D checkerboard background like that of the chess stack exchange.
- Lobby sits on the homepage.
- Below that: Spectate live games.

## Lobby
- [ ] Determine the maximum piece count where images are barely below recognizable. Convert that to characters
- Modal for creating an invite. Public/Private option. Private creates a url your friend can visit to view the invite and its properties. Option to provide custom position via ICN. Button to take selected variant to the editor. Maximum piece count prevents dirty images. Game modes available: Chess, 4 Dimensions, Showcases. Each has their own dropdowns with respective variants.
- Hovering over invites renders a small tooltip-popup window that previews the board, and custom gamerules, if any.

## Games
- Online games navigatable to via a link. Allows spectating if still live. Allows accepting a private invite if not yet joined.
- One vertical bar with clocks, moves, and chat, and material lost per side. Does chat have reporting? Do laws require it have reporting?
- The moves bar uses silhouettes of the piece svgs.

## Analysis Board
- Make, undo, change move history to perform analysis on positions.
- Turn on the engine to display the top move, and the score.

## Board Editor
- Share games via url. Next to the link to copy notation. Maximum piece count / icn length prevents dirty images.
- Create an invite from the position. Maximum piece count / icn length prevents dirty images. Same model popup as creating an invite from the lobby.
- Move to Analysis Board

## Profile

- Game history
- Change username

## Donation Page

Anyone that becomes a patron gets a cool badge next to their username.
Any monthly donation gives you the badge. $1+
When monthly dontations stop, badge is removed.
Maybe a lifetime donation amount where the badge is permanent?
Lichess offers golden wings after 5 years of active patron status. And instantly after a liftime donation, unlocking all colors.

## Light and Dark Theme

For light and dark themes, store colors once per theme as a small set of semantic variables, and every element in the entire codebase references those variables.

EXAMPLE THEME (for us we will have significantly fewer variables to start out):

/* src/client/css/themes.css */

:root,
[data-theme="light"] {
  --c-bg:            #f0efea;
  --c-surface:       #ffffff;
  --c-surface-raise: #e8e7e2;
  --c-surface-sink:  #dddcd6;
  --c-text:          #1a1a1a;
  --c-text-2:        #4a4a4a;
  --c-text-muted:    #757575;
  --c-text-inv:      #f0efea;
  --c-border:        #cccccc;
  --c-border-focus:  #5a9a5a;
  --c-brand:         #5a9a5a;
  --c-brand-hover:   #4a8a4a;
  --c-link:          #2060a0;
  --c-focus-ring:    rgba(90, 154, 90, 0.4);
  --c-error:         #cc2222;
  --c-warning:       #b06000;
  --c-success:       #2a7a2a;
}

[data-theme="dark"] {
  --c-bg:            #18181a;
  --c-surface:       #222226;
  --c-surface-raise: #2c2c30;
  --c-surface-sink:  #141416;
  --c-text:          #e2e2da;
  --c-text-2:        #b0b0a8;
  --c-text-muted:    #787870;
  --c-text-inv:      #18181a;
  --c-border:        #3a3a3e;
  --c-border-focus:  #70ba70;
  --c-brand:         #6aaa6a;
  --c-brand-hover:   #7aba7a;
  --c-link:          #6090d0;
  --c-focus-ring:    rgba(106, 170, 106, 0.4);
  --c-error:         #ee5555;
  --c-warning:       #e09020;
  --c-success:       #50aa50;
}