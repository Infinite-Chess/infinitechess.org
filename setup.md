# Setting up your workspace #

This guide walks you through the initial setup phase of the infinitechess.org server on your machine. This only needs to be done once. Afterward, you will be able to write and modify code, suggesting changes to the github!

**This is a team project!!** Join [the discord](https://discord.gg/NFWFGZeNh5) server to work with others, discuss how to improve the website, and ask questions!



## Step 1: Download VSCode ##

This guide will use VSCode, but you may use another code editor if you wish, if it is compatible with Node, npm, and has source control features.

[Go here](https://code.visualstudio.com/) to download and install VSCode.



## Step 2: Install Node.js ##

[Go here](https://nodejs.org/en/download/package-manager) to download and install Node. The easiest method is to click the "Prebuilt Installer" tab, download that, and run the installer.



## Step 3: Forking the repository ##

Go to the [repository's home page](https://github.com/Infinite-Chess/infinitechess.org), then click "Fork"!

<img width="818" alt="21 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/287192ce-361e-4277-9ac2-249813852d2f">

On the next page, click "Create Fork".

Next, return to VSCode, and click "Clone Git Repository..."

<img width="1024" alt="18" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/282bc4e3-3f05-4160-9125-23fd9fb3ef58">

Click "Clone from GitHub". Then click "Allow" to sign in with your github account (create one if you have not already), and click "Authorize Visual-Studio-Code" if that option is available.

<img width="684" alt="19 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/fd0f4b09-d2e0-4c1f-8363-5b87b7511f09">

Search for "infinitechess.org" and click the one that looks similar to the following image, except the path will be to the fork you have just created on your personal github account:

<img width="698" alt="20" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/7e4d300b-2f1c-4969-bdbd-9039ed8520c2">

Choose a location on your machine to store the repository.



## Step 4: Install project dependancies ##

Open the web server project inside VSCode and open the terminal within it.

Run the following command:
```npm install```

Now run this to install nodemon (a dev dependency):
```npm install -g nodemon```

To test run the server, and start it up from now on, enter the command:
```
nodemon
```

Now you should see something like:
<img width="366" alt="1" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/b1cf7bab-8973-4446-902c-3aef3a538c44">

You should now be able to connect to the server through local host. Open a web browser and go to `https://localhost:3443`

You may be met with a message like this, don’t worry, we'll fix this!
<img width="667" alt="4" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/2aef8b21-dbad-404e-ac91-8d2fc301c63a">

However, if you see something like below, it means either the server hasn’t started, or you entered an incorrect url. Please verify those above until you receive a message similar to the above picture.
<img width="678" alt="6" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/79e97985-0156-45aa-a642-9e4d75c8514a">

Now, stop the server by clicking in the VSCode terminal window to re-focus it, and hit Ctrl > C.
If done correctly, you should be met with the following. This means the server has stopped.
<img width="250" alt="7" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/a880cfc0-5e92-4568-aa19-abe857448d40">



### Creating a self-signed certification ###

Now we need to create a certification so we can connect to the web server with a valid protocol.

The server should have created an empty `cert` folder in the project root directory. Stop the server from running by clicking on the project terminal to focus it, and hit Ctrl > C. Then, enter the command to move into the new `cert` folder:
```
cd cert
```

Now, enter this command to generate a self-signed private key:
```
openssl genres -out cert.key
```

Your `cert` folder should now look like:
<img width="135" alt="12" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/fb20ac73-1b74-4271-8e73-bedc93d013f2">

Next, enter this command to generate a certificate signing request (CSR):
```
openssl req -new -key cert.key -out csr.pem
```
You may skip the proceeding questions by pressing enter.

Your `cert` folder should now look like:
<img width="142" alt="13" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/57dceef5-307a-45a2-ba15-431eae6b83d9">

Finally, to generate our certificate, run this command:
```
openssl x509 -req -days 365 -in csr.pem -signkey cert.key -out cert.pem
```

Your `cert` folder should now look like:
<img width="147" alt="14" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/d2ee294c-c2e0-4e5e-9411-60ae8aa937f8">


Now delete the `csr.pem` file as it is no longer needed. The final `cert` folder should look like:
<img width="136" alt="11" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/07df9477-3c0f-44fc-9547-dedb2a498a93">

Restart the server with the command `nodemon`, and refresh your browser! It should no longer tell us it can’t provide a secure connection, but it may warn you it is unsafe. Just proceed anyway.

Now you should now be able to browse the website and all it’s contents! Hooray! In the next step we will get account creation working.
<img width="1011" alt="5 orig" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/7d9cda30-bda9-4cde-8b17-a8dcc9185b0d">



What is this pesky “Not Secure” message? This can safely be ignored as you develop. It IS possible to tell your computer to trust our newly created certificate, but it is not required, and these directions won’t include that. But for starters, you could search "getting chrome to trust a self signed certificate".
<img width="286" alt="2" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/393970f5-9b18-4ce8-b726-6fff33eb4908">



## Setting up the email service ##

While at this stage, you **do** have enough setup to be able to create new accounts while dev testing, you will not be able to receive account verification emails or password reset emails (planned) until we setup an email service. This step can optionally be skipped. If not setup, manual verification links are printed to the console when you create an account.

To do this, I recommend creating a brand new gmail account for this purpose. This account will be used to send emails on behalf of your locally running Infinite Chess server.

Note that gmail’s terms of service only allows automated email sending upon user-triggered events. Examples of okay emails to send are emails in response to a new account created, or a password reset request. An example of an against terms of service email would be a weekly newsletter. See gmail’s terms of service for more info.

After creating a new gmail account, turn on [2-Step Verification](https://support.google.com/accounts/answer/185839?sjid=17083970032576237275-NC), this is required.

Next, [go here](https://myaccount.google.com/apppasswords) where you will be able to create a new app password. If it tells you that App Passwords aren’t available for your account, you need to enable 2-Step Verification.

<img width="713" alt="8" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/3a6b1c9c-9450-4fb4-8954-369fd3d7d201">

For the name field, it is unimportant, but you can enter `Node`. Then click “Create”.

It will generate a new app password, your screen should look like this, with a unique password:

<img width="601" alt="9" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/8a0d7c78-235e-4a60-92a1-0c9026d711bf">

Copy the 16-digit app password onto your clipboard. Next, go back to the web server, and in the root directory, open the `.env` file, and paste your new app password next to the `EMAIL_APP_PASSWORD` variable. Then remove the spaces in the password.

Now, in the same `.env` file, fill in the `EMAIL_USERNAME` variable with the email of the gmail account you just created the app password for.

DO NOT LET your app password be leaked!!! If that happens, bad actors will be able to hack into your gmail account. If you only keep your app password within the `.env` file, it will not be uploaded to github, this is because ".env" is specified within the `.gitignore` file, which specifies what files to skip over when uploading to github.

If your app password is ever leaked, or you suspect it might be, return to your [app passwords](https://myaccount.google.com/apppasswords) page, and click the trash button to delete it. This invalidates that password so it can no longer be used in your account. Then you may generate a new app password.

At this stage, your `.env` file should be totally filled out, looking something like this:

<img width="716" alt="10" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/6dc717f1-b463-4cef-bbfe-9f2a07acba5c">


You do have the option of changing what port the server is hosted on locally, by modifying the `HTTPPORT_LOCAL` and `HTTPSPORT_LOCAL` variables. If you do, be sure you modify the url you are visiting to access the web server, according to the port you set. By default, you visit `https://localhost:3443`, but if you modify the port, the 3443 here needs to be changed to match what you set it to.

Now upon creating a new account, you should see a message "Email is sent to member ExampleUsername!". If you see an error, or "Email environment variables not specified. Not sending email.", than it was setup incorrectly.

Note that you will only be able to verify accounts you create on the same machine running the server, as the verification link contains `localhost` within it.


You are all set up now to start developing! 


## Navigating the workspace ##

The remainder of this guide will give you basic pointers of how to navigate the project, where to find the game’s code, and how to push commits for review on GitHub!

The game's code is located within `protected-owner/scripts/game`. This contains all the javascript code for the developomental version of the game! To access this developmental version, go to `https://localhost:3443/play/devversion`. This will forward you to the login page, because you need the owner role to access it.

There has been 3 automatically generated accounts for you to test with-
- Member: Has basic member permissions.
- Patron: Has patron-specific permissions (at the moment this holds no difference between member accounts).
- Owner: Has owner permissions, allowing access to otherwise innaccessible pages, including the game's developmental version.

The password for every one of these accounts is `aaaaaa`. Log in as "Owner" to access the developmental version of the game.

The html document for this page is found in `views/dev.html`, and the script where everything starts the game is `main.js`. All other game scripts include basic descriptions at the top of each of them. Ask for help in the discord for more understanding of how each script works!

After you make changes to the game code and refresh the dev page, get in the habit of hard refreshing the page, as sometimes the browser doesn't recognize that there's new code to load. In chrome, you can do this by right clicking the refresh button and selecting "Hard Refresh":
(img17)

You should have basic familiarity with your browser's developer tools.

To enable automatic hard refreshing, I recommend going to your developer tool settings:
(img15)

and under the "Preferences" tab, checking the box next to "Disable cache (while DevTools is open)". 
(img16)

Now, as long as you have developer tools open whenever you refresh, the game will always hard refresh and load your new code.


### How do I connect to the web server with other devices in my home network? ###

Connecting more devices, other than the machine that is hosting, to the web server is beneficial for dev testing (especially for mobile testing). The machine you’re using to run the server is the only device that connects through `https://localhost:3443`. To connect from other devices in your home network, first they need to be connected to the same wifi, then you need to replace `localhost` with the IP address of your computer running the server. You can find your computers IP address within the network settings on your computer. An example of what your IP may look like is `192.168.1.2`. If this was your computer's IP address, then to connect to the web server on other devices you would go to `https://192.168.1.2:3443`.

## Conclusion ##

Infinite Chess is a team project! Join [the discord](https://discord.gg/NFWFGZeNh5) to discuss with the other team members how we should go about things!
