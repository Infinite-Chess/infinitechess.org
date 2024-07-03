## Navigating the workspace ##

The remainder of this guide will give you basic pointers of how to navigate the project, and where to find the game’s code!

The game's code is located within [protected-owner/scripts/game](./protected-owner/scripts/game). This contains all the javascript code for the developomental version of the game! To access this developmental version in your browser, go to `https://localhost:3443/play/devversion`. This will forward you to the login page, because you need the owner role to access it.

There has been 3 automatically generated accounts for you to test with-
- Member: Has basic member permissions.
- Patron: Has patron-specific permissions (at the moment this holds no difference between member accounts).
- Owner: Has owner permissions, allowing access to otherwise innaccessible pages, including the game's developmental version.

The password for every one of these accounts is `1`. Log in as "Owner" to access the developmental version of the game.

The html document for this page is found in [views/dev.html](./views/dev.html), and the script where everything starts the game is [main.js](./protected-owner/scripts/game/main.js). All other game scripts include basic descriptions at the top of each of them. Ask for help in the discord for greater understanding of how each script works!

After you make changes to the game code and refresh the dev page, get in the habit of hard refreshing the page, as sometimes the browser doesn't recognize that there's new code to load. In chrome, you can do this by right clicking the refresh button and selecting "Hard Reload":

<img width="697" alt="17" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/92cdb828-1091-4b37-9d90-fe309b3e1cdd">


You should have basic familiarity with your browser's developer tools.

To enable automatic hard refreshing, I recommend going to your developer tool settings:

<img width="1134" alt="15" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/8dafd293-4817-460f-a877-aca2825ba2fb">


and under the "Preferences" tab, checking the box next to "Disable cache (while DevTools is open)". 

<img width="1131" alt="16" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/0be82a5a-c40f-43dc-8fc4-c2f0cc250b56">


Now, as long as you have developer tools open whenever you refresh, the game will always hard refresh and load your new code.


## FAQ ##

# How do I connect to the web server with other devices in my home network? #

Connecting more devices to the web server, other than the machine that is hosting, is beneficial for dev testing (especially for mobile). The machine you’re using to run the server is the only device that connects through `https://localhost:3443`. To connect from other devices in your home network, first they need to be connected to the same wifi, then you need to replace `localhost` with the IP address of your computer running the server. You can find your computers IP address within the network settings on your computer. An example of what your IP may look like is `192.168.1.2`. If this was your computer's IP address, then to connect to the web server on other devices you would go to `https://192.168.1.2:3443`.