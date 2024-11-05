# Navigating the workspace #

This guide gives you several pointers on how to navigate the project. The entire source code of the project is located in [src](../src/).

It is assumed you have already gone through the [Setup](./SETUP.md) process. Whenever you run `npx nodemon`, [build.js](../build.js) automatically deploys all clientside assets of the project from [src](../src/) to the newly created folder `dist`, and an infinite chess server at `https://localhost:3443` is launched.


## Server ##

[src/server](../src/server/) contains all serverside files of the website.

Everything starts running from [server.js](../src/server/server.js)!

This configures and starts our http, https, and websocket servers, and it cleans up on closing.

[src/server/game](../src/server/game/) contains the server-side code for running online play, including the invites manager and game manager!

Both of these managers use websockets to broadcast changes out to the clients in real-time.

The websocket server code is located [here](../src/server/wsserver.js).


## Client ##

[src/client](../src/client/) contains all clientside files of the website.

It has subfolders for all the EJS, CSS, JavaScript, sound and image files of the website.

[src/client/views](../src/client/views) contains all our EJS documents.

The routers that actually send these as HTMLs to the client are located in [src/server/routes/root.js](../src/server/routes/root.js).

[src/client/scripts/game](../src/client/scripts/esm/game/) contains all our javascipt code for running the game in the `/play` page in the user's browser.

The main script is [main.js](../src/client/scripts/esm/game/main.js), which initiates the WebGL context and input listeners, and runs the main game loop.


## Translations ##

This repository uses [i18next](https://www.npmjs.com/package/i18next) to provide translations of the website into different languages.

The [translation](../translation) directory contains a [TOML](https://toml.io/) file with translated text for each supported language - read more in the [translation guide](./TRANSLATIONS.md).

The EJS files in [src/client/views](../src/client/views) get converted into HTML files for each supported language during deployment to `dist`.

The translation text in each EJS file is directly inserted into the corresponding HTML file during deployment.

The translation text in each clientside javacript file is stored in the `translations` object, which is initiated directly below the `<head>` tag of each EJS file.


## Accounts ##

There are 3 automatically generated accounts for you to test with-
- `Member`: Has basic member permissions.
- `Patron`: Has patron-specific permissions (at the moment this holds no difference to member accounts).
- `Owner`: Has owner-specific permissions (at the moment this holds no difference to member accounts).

The password for every one of these accounts is `1`.


## Making changes to the repository ##

PLEASE PLEASE seek approval in the [discord server](https://discord.com/channels/1114425729569017918/1115358966642393190) before you start making changes you expect will be merged! Some people will put in a lot of work, to show us, only for someone to tell them oh we can't merge it yet because of this XX reason or we had previously discussed to do it another way. Please discuss with others in the discord so we can be unified on the best course of action for implementing each feature! Thank you :) :)

Every game script includes a basic description at the top. Feel free to ask for greater details on what something does.

After you make changes to the game code and refresh the page, get in the habit of hard refreshing it, as sometimes the browser doesn't recognize that there's new code to load. In chrome, you can do this by right clicking the refresh button and selecting "Hard Reload":

<img width="697" alt="17" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/92cdb828-1091-4b37-9d90-fe309b3e1cdd">

You should have basic familiarity with your browser's developer tools.

To enable automatic hard refreshing, I recommend going to your developer tool settings:

<img width="1134" alt="15" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/8dafd293-4817-460f-a877-aca2825ba2fb">

and under the "Preferences" tab, checking the box next to "Disable cache (while DevTools is open)". 

<img width="1131" alt="16" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/0be82a5a-c40f-43dc-8fc4-c2f0cc250b56">

Now, as long as you have developer tools open whenever you refresh, the game will always hard refresh and load your new code.


# FAQ #

### How do I connect to the web server with other devices in my home network? ###

Connecting more devices to the web server, other than the machine that is hosting, is beneficial for dev testing (especially for mobile). The machine you’re using to run the server is the only device that connects through `https://localhost:3443`. To connect from other devices in your home network, first they need to be connected to the same wifi, then you need to replace `localhost` with the IP address of your computer running the server. You can find your computers IP address within the network settings on your computer. An example of what your IP may look like is `192.168.1.2`. If this was your computer's IP address, then to connect to the web server on other devices you would go to `https://192.168.1.2:3443`.

## Conclusion ##

Those are the basics! [Feel free to ask](https://discord.com/channels/1114425729569017918/1115358966642393190) in the discord for more pointers on where you can find certain implementations, or what the purpose of a script is!
