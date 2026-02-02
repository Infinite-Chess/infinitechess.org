# Navigation Guide

This guide gives you several pointers on the project structure, to help you get started with collaborating!

[← Back to Setup Guide](./SETUP.md) | [Contributing Guide](./CONTRIBUTING.md)

It is assumed you have already gone through the Setup Guide.

## Terminal Output

After starting up the server via `npm run dev`, there are a few different processes that run in parallel. The green `[build]` is in charge of compiling all scripts into javascript, bundling them together, and copying them into the `dist/` directory, along with all other client assets. This directory is deleted and rebuilt automatically on every file change. The grey `[server]` logs are the output of the actual running server, these are mainly what you're gonna be interested in. And the blue `[tsc]` logs report any typescript errors, those don't prevent the server from running, but any that pop up should be patched as you go.

<img width="1324" height="226" alt="Screenshot 2025-09-19 at 10 05 44 PM" src="https://github.com/user-attachments/assets/9bb6ecfc-90d2-4479-8010-551689c7759b" />

## Project Structure

The entire source code of the project is located in [`src`](../src/). This contains all code that is ever run by either the server or client, and contains assets that are served to the client.

```
src/
├── client/     # Frontend code and assets
├── server/     # Backend Node.js server
└── shared/     # Common logic between client and server
```

| Directory                                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/client/`](../src/client/)                                   | Contains all clientside files and resources of the website, whether script, image, sound, etc. Any file inside here may be requested by and served to the client. No client-side code is ever imported by server-side scripts.                                                                                                                                                                                                                                                                                                                                    |
| [`src/server/`](../src/server/)                                   | Contains all server-side files. The server begins running from [`server.js`](../src/server/server.js). This configures and starts our http, https, and websocket servers, and cleans up on closing.                                                                                                                                                                                                                                                                                                                                                               |
| [`src/shared/`](../src/shared/)                                   | Contains all shared scripts between the server and client. This includes lots of chess logic that both need. No shared script should **ever** reference environment variables in the Node.js or browser environment. A couple examples are `document` or `window` in the browser.                                                                                                                                                                                                                                                                                 |
| [`src/client/views/`](../src/client/views)                        | Contains our EJS documents, which are converted to HTMLs on startup. Modify these to change the content on the website pages. In order to support multiple languages, these documents reference many of the translations in [`en-US.toml`](../translation/en-US.toml). Any changes to the toml file requires you increment the version number at the top of it, and record the change you made inside [`changes.json`](../translation/changes.json). Additional information on working other languages of the website is in [TRANSLATIONS.md](./TRANSLATIONS.md). |
| [`src/client/scripts/esm/game/`](../src/client/scripts/esm/game/) | Contains all our code for running the game on the play page of the website! It starts inside [`main.js`](../src/client/scripts/esm/game/main.js), which contains our game loop. Most scripts includes a basic description at the top. Feel free to ask for greater details on what a specific script does, or for help finding the code that does a specific task!                                                                                                                                                                                                |
| [`src/server/game/`](../src/server/game/)                         | Contains the server-side code for running online play, including the invites manager and game manager. Both of these use websocket messaging to broadcast changes out to the clients in real-time.                                                                                                                                                                                                                                                                                                                                                                |
| `database.db`                                                     | Automatically generated at the root level of the project. This stores all user accounts, login sessions, games, etc. You can view the contents of the database via the SQLite VSCode extension.                                                                                                                                                                                                                                                                                                                                                                   |

## Accounts

There are 4 automatically generated accounts for you to test with. The password for every one of these accounts is `1`-

- `Member`: Regular permissions.
- `Patron`: At the moment this holds no difference to member accounts.
- `Admin`: Is able to send commands on the admin panel page found at url `https://localhost:3443/admin`. Sending `help` will list the available commands.
- `Owner`: Includes all Admin permissions. In addition, when invite creation is disabled inside `database/allowinvites.json`, they are still able to create invites.

## Debugging Keyboard Shortcuts

While in-game, there are a few keys that will activate useful debugging modes-

- `` ` ``: The backtick key (typically right below your escape button) will toggle the camera's debug mode. This places the camera position further back in space, allowing you to see a little beyond the normal screen edges. Useful for making sure rendered items don't exceed the edge!
- `1`: If you are in a local game, this will toggle "Edit Mode", which allows you to move any piece anywhere else on the board, bar whether it's legal.
- `2`: Prints the entire gamefile to the console. Useful for checking for expected properties.
- `3`: Greatly slows the animation of pieces, and renders the spline path the piece will travel. Especially useful for debugging curved movement paths, such as the Rose.
- `4`: Simulates 1 second of websocket message latency. This helps you to catch bugs caused by low ping, something you have zero of when developing.
- `5`: Copies the currently loaded game as a single position, according to the move you are viewing. This strips the moves list from the resulting notation.
- `6`: Toggles specialrights highlights. This displays a `+` sign next to what pieces still have their special ability (pawns that can double push, kings/rooks that can castle). In addition, this also highlights the square enpassant capture is legal on, if possible.
- `7`: Toggles engine move generation highlights. This indicates all the moves the engine will consider in the position. Only works for the HydroChess engine.

## Making changes to the repository

All pull requests MUST meet the standards outlined in the [Contributing Guide](./CONTRIBUTING.md)!

Please seek approval in the [discord server](https://discord.com/channels/1114425729569017918/1115358966642393190) before you start making changes you expect will be merged! I am very particular about what gets added, I have a vision for the course of the project. Generally, if you've spoken about the desired change with me, and we're on the same page about how it will be implemented, you don't have to worry! Also, check out the [list of open issues](https://github.com/Infinite-Chess/infinitechess.org/issues) for tasks you could claim!

Sometimes after you modify a file, the browser doesn't detect that it was changed, so it doesn't load the new code after a refresh. To avoid this, I highly recommend enabling automatic hard refreshing in your browser's developer tools. Here's how to do that in Chrome:

<img width="1134" alt="15" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/8dafd293-4817-460f-a877-aca2825ba2fb">

And under the "Preferences" tab, check the box next to "Disable cache (while DevTools is open)".

<img width="1131" alt="16" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/0be82a5a-c40f-43dc-8fc4-c2f0cc250b56">

Now, as long as you have developer tools open whenever you refresh, the game will always hard refresh and load your new code.

## Mobile Testing

Mobile devices differ from pc behavior because the user interacts with touch events instead of mouse events. There are 2 ways you can test your code to make sure it works on mobile:

- Chrome dev tools has a "Toggle device toolbar" button which allows you to interact with the page as if the mouse was your finger. It also easily lets you grow and shrink the size of the window to see how the content fits on each device width. However, it does not let you use multiple fingers. For that:

- Connect to the web server with another device in your home network (like your phone). The machine you’re using to run the server is the only device that connects through `https://localhost:3443`. To connect from other devices in your home network, first they need to be connected to the same wifi, then you need to replace `localhost` with the IP address of your computer running the server. You can find your computers IP address within the network settings on your computer. An example of what your IP may look like is `192.168.1.2`. If this was your computer's IP address, then to connect to the web server on other devices you would go to `https://192.168.1.2:3443`.

## Conclusion

Those are the basics! Have at it! Check out the [Issues](https://github.com/Infinite-Chess/infinitechess.org/issues) for tasks you could assist with! Working on these directly helps the next update to come quicker! If you want easier ones, look for the ones with the "simple" tag!
