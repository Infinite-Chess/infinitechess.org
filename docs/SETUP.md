# Setting up your workspace #

This guide walks you through the initial setup phase of the infinitechess.org server on your machine. This only needs to be done once. Afterward, you will be able to write and modify code, suggesting changes to the github!

**This is a team project!!** Join [the discord](https://discord.gg/NFWFGZeNh5) server to work with others, discuss how to improve the website, and ask questions! If you have trouble during this setup process, request help in the [#help](https://discord.com/channels/1114425729569017918/1257506171376504916) channel!

**Summary of the setup process below for experienced users:** Install VSCode and Node.js. Fork the repository and install the project dependencies via `npm install`. Now you can run `nodemon` to launch a live infinite chess server at `https://localhost:3443`. Optionally, you can also set up an email serivce now. You are now ready to test changes and contribute to the main project after reading the [Navigation Guide](./NAVIGATING.md)! **All these steps are explained in great detail below:**

## Step 1: Download VSCode ##

This guide will use VSCode, but you may use another code editor if you wish, if it is compatible with Node, npm, and has source control features.

[Go here](https://code.visualstudio.com/) to download and install VSCode.



## Step 2: Install Node.js ##

[Go here](https://nodejs.org/en/download/package-manager) to download and install Node. The easiest method is to click the "Prebuilt Installer" tab, download that, and run the installer.

<img width="916" alt="22 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/9f0b5cab-f372-45f6-b648-cefef99e68a0">



## Step 3: Forking the repository ##

Go to the [repository's home page](https://github.com/Infinite-Chess/infinitechess.org), then click "Fork"! You will need a github account.

<img width="818" alt="21 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/287192ce-361e-4277-9ac2-249813852d2f">

On the next page, click "Create Fork".

Next, open VSCode, and click "Clone Git Repository..."

<img width="1024" alt="18" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/282bc4e3-3f05-4160-9125-23fd9fb3ef58">

Click "Clone from GitHub".

<img width="684" alt="19 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/fd0f4b09-d2e0-4c1f-8363-5b87b7511f09">

Then click "Allow" to sign in with your github account, and, in the browser window that opened, click "Open Visual Studio Code.app".

The fork you just created should be at or near the top of the list, click on it! Be sure it has your github username on it! If it says "Infinite-Chess", don't click that one as it is the main repository, which you don't have write access to.

<img width="674" alt="Screen Shot 2024-07-02 at 1 03 01 PM" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/25dff27c-f09f-444f-8fdd-2f68b344a1fb">

Choose a location on your machine to store the repository. Then when prompted whether or not to open the cloned repository, click "Open".



## Step 4: Install project dependancies ##

Inside the opened VSCode project, open a terminal window within it by going to Terminal > New Terminal.

Run the following command to auto-install all project dependancies:
```
npm install
```

To test run the server, and start it up from now on, enter the command:
```
nodemon
```

The first time you run this, you should see something like:

<img width="372" alt="345286338-2f0383ba-1a0d-4d82-808d-eeb9950a0d4a" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/81bfd3d2-3798-4d4d-9c58-f3b70b2c7e30">

Subsequent times you start up the server will look like:

<img width="369" alt="Screen Shot 2024-07-02 at 11 14 00 PM copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/19682ebe-1a7d-4f10-a282-2a7f37e072fd">

You should now be able to connect to the server through local host! Open a web browser and go to:
```
https://localhost:3443
```

It will warn us our connection is not private.

<img width="907" alt="345182644-ffedcc95-7ca8-46ab-bf67-26ff96dbe0f4 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/d03048fb-ddc2-4015-8dca-5a406866eae0">

Click "Advanced", then "Proceed to localhost (unsafe)"!

<img width="1029" alt="Screen Shot 2024-07-02 at 1 57 05 PM copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/f822ccdf-7cd9-495b-8e52-d65756b6a77c">

Now you should now be able to browse the website and all it’s contents! Hooray!

<img width="1011" alt="5 orig" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/7d9cda30-bda9-4cde-8b17-a8dcc9185b0d">

Don't worry about the url bar telling you it's not secure. This can safely be ignored as you develop. It IS possible to get your computer to trust our newly created certificate, but it is not required, and these directions won’t include that. [This one guy](https://stackoverflow.com/a/49784278) was able to figure it out though!

Now, stop the server by clicking in the VSCode terminal window to re-focus it, and hit Ctrl > C.
If done correctly, you should be met with the following. This means the server has stopped.

<img width="273" alt="Screen Shot 2024-07-02 at 11 16 22 PM copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/47c09831-1c17-490e-9eac-68e1a0cb5765">





## Step 5 (optional): Setting up the email service ##

While at this stage, you **do** have enough setup to be able to create new accounts while dev testing, you will not be able to receive account verification emails or password reset emails (planned) until we setup an email service. This step can optionally be skipped. If not setup, manual verification links are printed to the console when you create an account.

To do this, I recommend creating a brand new gmail account for this purpose. This account will be used to send emails on behalf of your locally running Infinite Chess server.

Note that gmail’s terms of service only allows automated email sending upon user-triggered events. Examples of okay emails to send are emails in response to a new account created, or a password reset request. An example of an against terms of service email would be a weekly newsletter. See gmail’s terms of service for more info.

After creating a new gmail account, turn on [2-Step Verification](https://support.google.com/accounts/answer/185839?sjid=17083970032576237275-NC), this is required.

Next, [go here](https://myaccount.google.com/apppasswords) where you will be able to create a new app password. If it tells you that App Passwords aren’t available for your account, you need to enable 2-Step Verification.

<img width="713" alt="8" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/3a6b1c9c-9450-4fb4-8954-369fd3d7d201">

For the name field, it is unimportant, but you can enter `Node.js`. Then click “Create”.

It will generate a new app password, your screen should look like this, with a unique password:

<img width="601" alt="9" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/8a0d7c78-235e-4a60-92a1-0c9026d711bf">

Copy the 16-digit app password onto your clipboard. Next, go back to VSCode, and, in the root directory, open the `.env` file:

<img width="1093" alt="Screen Shot 2024-07-02 at 11 33 07 PM copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/4dcf72df-dc99-46a9-9857-67cae68e9119">

Paste your new app password next to the `EMAIL_APP_PASSWORD` variable. Then remove the spaces in the password.

Now, fill in the `EMAIL_USERNAME` variable with the email of the gmail account you just created the app password for.

DO NOT LET your app password be leaked!!! If that happens, bad actors will be able to hack into your gmail account. If you only keep your app password within the `.env` file, it will not be uploaded to github, this is because ".env" is specified within the `.gitignore` file, which specifies what files to skip over when uploading to github.

If your app password is ever leaked, or you suspect it might be, return to your [app passwords](https://myaccount.google.com/apppasswords) page, and click the trash button to delete it. This invalidates that password so it can no longer be used in your account. Then you may generate a new app password.

At this stage, your `.env` file should be totally filled out, looking something like this:

<img width="716" alt="10" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/6dc717f1-b463-4cef-bbfe-9f2a07acba5c">


You do have the option of changing what port the server is hosted on locally, by modifying the `HTTPPORT_LOCAL` and `HTTPSPORT_LOCAL` variables. If you do, be sure you modify the url you are visiting to access the web server, according to the port you set. By default, you visit `https://localhost:3443`, but if you modify the port, the 3443 here needs to be changed to match what you set it to.

Now upon creating a new account, you should see a message "Email is sent to member ExampleUsername!". If you see an error, or "Email environment variables not specified. Not sending email.", then it was setup incorrectly.

Note that you will only be able click "Verify Account" in the verification emails if you  are on the same machine running the server, as the verification link contains `localhost` within it.


### **You are all set up now to start developing!** 🥳 ###

Let's move on to learn how to suggest changes to the repository! Or, skip right to the [Conclusion](#conclusion).



## Creating a Pull Request ##

After you have made some changes to the code, you can push those changes to your personal fork by going to the Source Control tab, entering a custom commit message, and clicking "Commit", followed by "Sync Changes"!

<img width="476" alt="23 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/298ec58f-8212-4943-9cde-ac091f4eb4fb">

It may prompt you to stage all your changes. Only staged changes are pushed to your repository. Click "Yes".

<img width="981" alt="Screen Shot 2024-07-02 at 11 22 42 PM" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/f483e102-9f0c-4957-93d2-d3e6ed77fff2">

If you ever get stuck on the following page, you need to click the checkmark in the top-right corner (after writing a brief commit message)!

<img width="1090" alt="Screen Shot 2024-07-03 at 12 09 01 AM copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/98c45969-fc7e-4691-b1bc-32a23266ad56">

Then click "Commit" in the top-left again, followed by "Sync Changes".

If you now visit the fork you created on your own github account, the changes you made should now be found there as well!

Next, let's suggest this change to the official infinitechess.org repository by creating a "Pull Request"!

On the home page of the fork you created ON YOUR GITHUB account, click on "Pull Requests"

<img width="816" alt="26 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/4405b906-bd76-4e34-9431-b6b2d8a2cdfe">

Now click "New pull request", followed by "Create pull request"! Your changes will be reviewed soon and either be accepted, rejected, or commented on!



## Conclusion ##

Infinite Chess is a team project! Join [the discord](https://discord.gg/NFWFGZeNh5) to discuss with the others how we should best go about things!

For pointers on how to navigate the workspace, including where the game's code is located, see [Navigating the Workspace](./NAVIGATING.md)!
