# Setting up your workspace

This guide walks you through the initial setup phase of the infinitechess.org server on your machine. This only needs to be done once. Afterward, you will be able to run the website locally on your computer, write and modify code, suggesting changes to the github!

[← Back to README](../README.md) | [Navigation Guide](./NAVIGATING.md) | [Contributing Guide](./CONTRIBUTING.md)

**This is a team project!!** Join [the discord](https://discord.gg/NFWFGZeNh5) server to work with others, discuss how to improve the website, and ask questions! If you have trouble during this setup process, many people are willing to assist you in the [#help](https://discord.com/channels/1114425729569017918/1257506171376504916) channel!

**SUMMARY of the setup process for experienced users:** Install Node.js. Fork the repo and install the project dependencies via `npm i`. Now you can run `npm run dev` to launch a live infinite chess server at `https://localhost:3443`. Using the suggested [list of VSCode Extensions](#step-6-install-vscode-extensions) is highly recommended but optional. Read the [Navigation Guide](./NAVIGATING.md) to get a brief rundown of the project structure.

## Step 1: Install Git

Let's check to make sure you have Git already installed. Open a command prompt (windows) or terminal (mac), and enter the following:

```
git version
```

If this outputs a version number, you have it installed, proceed to the next step! If it outputted unknown command, [follow this guide](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) to install it!

## Step 2: Download VSCode

This guide will use VSCode, which is **highly** recommended, but you may use another code editor if you wish, as long as it is compatible with Node, npm, and has source control features. This guide will walk you through the process using VSCode.

[Go here](https://code.visualstudio.com/) to download and install VSCode. Be sure you have Visual Studio **Code**, and not Visual Studio (they are different).

## Step 3: Install Node.js

[Go here](https://nodejs.org/en/download) to download and install Node. Select version `v22.21.1 (LTS)`, `x64` for the architecture, then download the Installer (.msi on Windows or .pkg on Mac). Then run the installer.

## Step 4: Forking the repository

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

Choose a location on your machine to store the repository. Then when prompted whether to open the cloned repository, click "Open".

## Step 5: Install project dependencies

Inside the opened VSCode project, open a terminal window within it by going to Terminal > New Terminal.

Run the following command to auto-install all project dependancies:

```
npm i
```

To test run the server, and start it up from now on, enter the command:

```
npm run dev
```

The first time you run this, you should see something like:

<img width="1187" height="481" alt="Screenshot 2025-09-19 at 9 52 21 PM" src="https://github.com/user-attachments/assets/52e70488-2126-47ad-a93f-b72d9a614b5e" />

Subsequent startups will look something like:

<img width="1185" height="209" alt="Screenshot 2025-09-19 at 9 53 17 PM" src="https://github.com/user-attachments/assets/474184a5-493e-4bae-a7a4-3ebd0ba325df" />

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

Don't worry about the url bar telling you it's not secure. This can safely be ignored as you develop. It IS possible to get your computer to trust our newly created certificate, but it is not required, and these directions won’t include that. [This one guy](https://stackoverflow.com/a/49784278) was able to figure it out though.

Now, stop the server by clicking in the VSCode terminal window to re-focus it, and hit Ctrl > C.
If done correctly, you should be met with the following. This means the server has stopped.

<img width="667" height="170" alt="Screenshot 2025-09-19 at 9 56 26 PM" src="https://github.com/user-attachments/assets/2e98bec2-8c1e-47e5-a1e3-a6139da03117" />

## Step 6: Install VSCode Extensions

1. **ESLint**

Installing the ESLint VSCode extension will help your pull requests be approved quicker, by holding your code semantics to the standards of the project! ESLint will give you errors when you have undefined variables, missing semicolons, and other items, making it easier to catch bugs before runtime!

Go to the extensions tab, search for "eslint", click the one by "Microsoft", then Click "Install"!

<img width="1081" alt="Screen Shot 2024-08-16 at 10 26 33 PM copy" src="https://github.com/user-attachments/assets/7df938ff-da69-4675-934f-4a61e93e69c1">
<br>
<br>

2. **Prettier - Code formatter**

Using this extension will help your code changes be stylistically consistent with the rest of the codebase. After installing this extension, open your VScode settings, set Prettier as your default code formatter in `Editor: Default Formatter` and enable `Editor: Format On Save`. This will automatically "prettify" the style every time you save a file; for example, it will fix indentation issues and replace double quotation marks with single quotation marks. You can have Prettier ignore a code block via `// prettier-ignore` if you think your style is more readable!

3. **SQLite Viewer**

Installing this extension will allow you to preview the contents of the database during development. The database stores all account information.

4. **GitHub Pull Requests**

Installing this extension is not required, but highly recommended. It allows you to test run the code of other peoples pull requests on your system, so you can give collective feedback!

### **You are all set up now to start developing!** 🥳

Let's move on to learn how to suggest changes to the repository! Or, skip right to the [Conclusion](#conclusion).

## Creating a Pull Request

All pull requests MUST meet the standards outlined in [Pull Request Requirements and Guidelines](./CONTRIBUTING.md)!

After you have made some changes to the code, you can push those changes to your personal fork by going to the Source Control tab.

<img width="887" alt="Screen Shot 2024-07-03 at 9 48 08 AM copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/a2280180-dc4a-4cd4-a411-db026591b6a2">

Only changes you "stage" will be sent to your fork! You can stage specific changes, or you can stage all your changes by clicking the "+" in the above image. Then click "Commit".

Enter a brief commit message, then click the checkmark in the top-right corner.

<img width="928" alt="Screen Shot 2024-07-03 at 9 56 51 AM copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/3f1f2351-62f7-450b-ae28-8a626dca4ab6">

Now click "Sync Changes" back in the top-left!

If you now visit the fork you created on your own github account, the changes you made should now be found there as well!

Next, let's suggest this change to the official infinitechess.org repository by creating a "Pull Request"!

On the home page of the fork you created ON YOUR GITHUB account, click on "Pull Requests"

<img width="816" alt="26 copy" src="https://github.com/Infinite-Chess/infinitechess.org/assets/163621561/4405b906-bd76-4e34-9431-b6b2d8a2cdfe">

Now click "New pull request", followed by "Create pull request"! Your changes will be reviewed soon and either be accepted, rejected, or commented on!

## Conclusion

Infinite Chess is a team project! Join [the discord](https://discord.gg/NFWFGZeNh5) to discuss with the others how we should best go about things!

Next, read the [Navigation Guide](./NAVIGATING.md) to get a rundown of the project structure, where the game code is located, etc.!

For a list of available tasks, please see the [Issues](https://github.com/Infinite-Chess/infinitechess.org/issues), or inquire in the [discord server](https://discord.gg/NFWFGZeNh5).

Also, read the [Pull Request Requirements and Guidelines](./CONTRIBUTING.md) to adopt the coding standards of the project!
