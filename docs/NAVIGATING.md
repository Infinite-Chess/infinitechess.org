# Navigating the workspace #

This guide gives you several pointers on how to navigate the project, including where to find the game's code!

It is assumed you have already gone through the [Setup](./SETUP.md) process.



## Getting Started ##

There has been 3 automatically generated accounts for you to test with-
- Member: Has basic member permissions.
- Patron: Has patron-specific permissions (at the moment this holds no difference between member accounts).
- Owner: Has owner permissions, allowing access to otherwise innaccessible pages, including the game's developmental version.

The password for every one of these accounts is `1`.



## Server.js ##

Everything starts running from [server.js](../server.js)!

This configures and starts our http, https, and websocket servers, and it cleans up on closing.



## [views](../views) ##

This contains all our html documents.

The routers that actually send these htmls to the client are located in [../routes/root.js](../routes/root.js)



## Public assets ##

Public items such as css, scripts, audio, images, and more, that are **not** locked behind certain roles, are located in [public](../public).

The play page's minified game code is located in [../public/scripts/game](../public/scripts/game). [app.js](../public/scripts/game/app.js) is loaded separately, and [htmlscript.js](../public/scripts/game/htmlscript.js) is injected directly into the html before serving to the client!



## Protected assets ##

Items that are private (i.e. only served to users with the `owner` role), are located in [../protected-owner](../protected-owner).

The game's unminified code is located within [protected-owner/scripts/game](./protected-owner/scripts/game). This contains all the javascript code for the developmental version of the game! To access this developmental version in your browser, go to:
```
https://localhost:3443/play/devversion
```
This will forward you to the login page, login with the owner account to access it. The password is `1`.

Every game script includes a basic description at the top. [Ask for help](https://discord.com/channels/1114425729569017918/1115358966642393190) in the discord for greater understanding of how each script works!

After you make changes to the game code and refresh the dev page, get in the habit of hard refreshing the page, as sometimes the browser doesn't recognize that there's new code to load. In chrome, you can do this by right clicking the refresh button and selecting "Hard Reload":

<img width="697" alt="17" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/92cdb828-1091-4b37-9d90-fe309b3e1cdd">

You should have basic familiarity with your browser's developer tools.

To enable automatic hard refreshing, I recommend going to your developer tool settings:

<img width="1134" alt="15" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/8dafd293-4817-460f-a877-aca2825ba2fb">

and under the "Preferences" tab, checking the box next to "Disable cache (while DevTools is open)". 

<img width="1131" alt="16" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/0be82a5a-c40f-43dc-8fc4-c2f0cc250b56">

Now, as long as you have developer tools open whenever you refresh, the game will always hard refresh and load your new code.



## Game ##

[game](../game) contains the server-side code for running online play, including the [invites-manager](../game/invitesmanager.js) and the [game-manager](../game/gamemanager.js).

Both of these managers run use websockets to broadcast changes out to the clients in real-time.

The websocket server code is located [here](../wsserver.js).



# FAQ #

### How do I connect to the web server with other devices in my home network? ###

Connecting more devices to the web server, other than the machine that is hosting, is beneficial for dev testing (especially for mobile). The machine you’re using to run the server is the only device that connects through `https://localhost:3443`. To connect from other devices in your home network, first they need to be connected to the same wifi, then you need to replace `localhost` with the IP address of your computer running the server. You can find your computers IP address within the network settings on your computer. An example of what your IP may look like is `192.168.1.2`. If this was your computer's IP address, then to connect to the web server on other devices you would go to `https://192.168.1.2:3443`.

## Conclusion ##

Those are the basics! [Feel free to ask](https://discord.com/channels/1114425729569017918/1115358966642393190) in the discord for more pointers on where you can find certain implementations, or what the purpose of a script does!
