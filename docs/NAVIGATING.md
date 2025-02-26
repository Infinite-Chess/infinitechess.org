# Navigating Guide #

This guide gives you several pointers on how to navigate the project, to help you get started with collaborating!

It is assumed you have already gone through the [Setup](./SETUP.md) process.

Whenever you run `npx nodemon` to start the server, [build.js](../build.js) automatically compiles all typescript to javascript, and deploys all assets of the project from [src](../src/) to the newly created folder `dist/`, and an infinite chess server at url `https://localhost:3443` is launched.

The entire source code of the project is located in [src](../src/). BUT, ONLY CODE INSIDE `dist/` IS EVER RUN!!! Nothing inside `src/` EVER. When you are developing inside `src/` and errors are inevitably printed to the console, they will link you to the copy of your file inside `dist/` generated at runtime, but you must navigate to your matching file in `src/` if you want to make lasting changes! The `dist/` file is erased on every server restart.



## Accounts ##

There are 3 automatically generated accounts for you to test with. The password for every one of these accounts is `1`-
- `Member`: Regular permissions.
- `Patron`: At the moment this holds no difference to member accounts.
- `Owner`: Is able to send commands on the admin panel page found at url `https://localhost:3443/admin`. Sending `help` will list the available commands. Some commands allow you to see member info from the database without having to open `database.db` with the SQLite extension. Members with the `admin` role are also allowed to send commands here, but there is no current default account with this role. The Owner is also able to create invites, even when invite creation is disabled inside `database/allowinvites.json`.


## Debugging Keyboard Shortcuts ##

While in the game on the Play page, there are a few keys that will activate useful debugging modes-
* `` ` ``: The backtick key, typically right below your escape button, will toggle the camera's debug mode. This places the camera position further back in space, allowing you to see a little beyond what you would normally see. In addition, a purple rectange will be rendered indicating the region where all legal moves of the selected piece are rendered inside. To see it though, you have to zoom out extremely slowly, as as soon as the normal screen area touches the box, it dynamically increases its size.
* `1`: If you are in a local game, this will toggle "Edit Mode", which allows you to move any piece anywhere else on the board, ignoring legal moves!
* `2`: Prints the gamefile, with all its properties, to the console. Useful for checking if it has the expected properties.
* `3`: Greatly slows the animation of pieces, and renders the spline path the piece will travel. Especially beautiful when observing the Rose's movement. Also useful when working with animated arrow indicators.
* `4`: Simulates 2 seconds of websocket sent-message latency. This helps you to discover bugs caused by low ping, something you have zero of when developing. There is an additional variable [config.simulatedWebsocketLatencyMillis](src/server/config/config.js) which you can adjust to add latency to the **server's** sent messages, if you want both ends to be balanced.
* `5`: Toggles wireframe voids. The void mesh is simplified greatly, as adjacent voids can be merged into one quad to decrease the total vertices in the vertex data. This is also a mesmerizing effect when observing positions with thousands of void squares.
* `6`: Copies the game as a single position, according to the move you are viewing. This is useful for stripping the moves list from a game so you can use it to continue that position by pasting it in a private online match.
* `7`: Indicates with a `+` sign what pieces still have their special rights (pawns that can double push, kings/rooks that can castle), and highlights the square enpassant capture is legal on, if it is.


## Client ##

[src/client](../src/client/) contains all clientside files and resources of the website, whether script, image, sound, etc. Any file inside here may be requested by and served to the client. Lots of scripts inside here are imported by server-side scripts inside `src/`, that is fine and helps us reduce redundancy by sharing common logic between the client and server ends.

[src/client/views](../src/client/views) contains all our EJS documents, which are converted to HTMLs on startup. The routers that actually send these as HTMLs to the client are located in [src/server/routes/root.js](../src/server/routes/root.js).

[src/client/scripts/esm/game](../src/client/scripts/esm/game/) contains all our javascript code for running the game on the play page of the website. The main script that contains the gameloop is [main.js](../src/client/scripts/esm/game/main.js). Every game script includes a basic description at the top. Feel free to ask for greater details on what a specific script does, or for help finding a script that does a specific task!



## Server ##

[src/server](../src/server/) contains all serverside files of the website. Everything starts running from [server.js](../src/server/server.js)! This configures and starts our http, https, and websocket servers, and it cleans up on closing.

[src/server/game](../src/server/game/) contains the server-side code for running online play, including the invites manager and game manager! Both of these managers use websockets to broadcast changes out to the clients in real-time.

The websocket server code is located [here](../src/server/socket/).



## Translations ##

This repository uses [i18next](https://www.npmjs.com/package/i18next) to provide translations of the website into different languages.

The [translation](../translation) directory contains a [TOML](https://toml.io/) file with translated text for each supported language - read more in the [translation guide](./TRANSLATIONS.md). Any time the English TOML file is edited, those changes must be recorded inside [translation/changes.json](..translation/changes.json), and the version number updated at the top of the English TOML. This is so that the other translators can know what has changed.

The EJS files in [src/client/views](../src/client/views) get converted into HTML files for each supported language during deployment to `dist/`. Each script that is included on an html page may require its own translations. When they do, they are stored in the `translations` object, which may be accessed as a global object in the script. The contents of this object depend on what is below below the `<head>` tag of each EJS file.



## Database ##

The server uses a SQLite database to store the profiles of all accounts, and to store the ids of deleted profiles. If you have the SQLite VSCode extension installed, you can view the contents of the database by opening the file `database.db` at the root of the project. This is automatically generated when you start the server for the first time. A few other files that have not yet been moved to the database, such as statistics, and banned users, are stored as json data inside the directory `database/`. 

All scripts that interact with the database in some way are located in [src/server/database/](../src/server/database/)

The admin panel page, located at url `https://localhost:3443/admin`, allows more interaction with the data in the database, without having to open `database.db` with the SQLite extension or to send SQL queries. To send commands you must be logged into the `Owner` account (password `1`). Send `help` for a list of available commands.



## Making changes to the repository ##

PLEASE seek approval in the [discord server](https://discord.com/channels/1114425729569017918/1115358966642393190) before you start making changes you expect will be merged! Occasionally someone will put in a lot of work in secret, open a PR, only for it to have lots of issues with how it's integrated, decreasing it's chances of being merged. Please plan with the others in the discord so we can be unified on the best course of action for integrating each feature! Thank you :)

After you make changes to the game code and refresh the page, get in the habit of hard refreshing it, as sometimes the browser doesn't recognize that there's new code to load. In chrome, you can do this by right clicking the refresh button and selecting "Hard Reload":

<img width="697" alt="17" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/92cdb828-1091-4b37-9d90-fe309b3e1cdd">

You should have basic familiarity with your browser's developer tools.

To enable automatic hard refreshing, I recommend going to your developer tool settings:

<img width="1134" alt="15" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/8dafd293-4817-460f-a877-aca2825ba2fb">

and under the "Preferences" tab, checking the box next to "Disable cache (while DevTools is open)". 

<img width="1131" alt="16" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/0be82a5a-c40f-43dc-8fc4-c2f0cc250b56">

Now, as long as you have developer tools open whenever you refresh, the game will always hard refresh and load your new code.



## Mobile Testing ##

Mobile devices differ from pc behavior because the user interacts with touch events instead of mouse events. There are 2 ways you can test your code to make sure it works on mobile:

* Chrome dev tools has a "Toggle device toolbar" button which allows you to interact with the page as if the mouse was your finger. It also easily lets you grow and shrink the size of the window to see how the content fits on each device width. However, it does not let you use multiple fingers. For that:

* Connect to the web server with another device in your home network (like your phone). The machine you’re using to run the server is the only device that connects through `https://localhost:3443`. To connect from other devices in your home network, first they need to be connected to the same wifi, then you need to replace `localhost` with the IP address of your computer running the server. You can find your computers IP address within the network settings on your computer. An example of what your IP may look like is `192.168.1.2`. If this was your computer's IP address, then to connect to the web server on other devices you would go to `https://192.168.1.2:3443`.



## Conclusion ##

Those are the basics! [Feel free to ask](https://discord.com/channels/1114425729569017918/1115358966642393190) in the discord for more pointers on where you can find certain implementations, or what the purpose of a script is!
