# Translation guide #

This guide will walk you through the process of creating translations for [InfiniteChess.org](https://www.infinitechess.org). What it won't tell you is how to setup your workspace, please refer to [SETUP.md](./SETUP.md) for that. It is assumed that you have gone through it (you can ignore step 5).

## Navigaton ##

Anything that matters to you as a translator should be located in the [translation](../translation/) directory. Translation files are stored in TOML format (you can read more about its syntax [here](https://toml.io/)). Generally, it is a very aproachable format, and you only need to understand the absolute basics of it, which are explained below.

## Translation files ##

### Name ###

Each file is named after its language [BCP 47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag). BCP 47 tags are composed of this format (notice the capitalization):

`lng-(script)-REGION-(extensions)`

For example, `en-US` for American English, `sv` for Swedish, `zh-Hant-HK` for Chinese spoken in Hong Kong written in traditional script.

You should name your file this way and only this way, otherwise it won't be correctly detected.

### Content ###

Translation files in TOML format consist of keys and values, table headers and comments, like this:

```toml
[table-header]
# Comment
key1 = "value1"
key2 = "value2"
```

> [!IMPORTANT]
> **You should only change values and comments. Please, leave everything else unmodified when translating!**.

## Translation process ##

In case you are translating a language that is currently not present in the project, you can start the process by copying [en-US.toml](../translation/en-US.toml) and renaming it as described above. If you are updating an existing language, the only thing you need to do is to update the `version` variable on top of your TOML document to the value of the `version` variable in [en-US.toml](../translation/en-US.toml).

> [!IMPORTANT]
> You should always use [en-US.toml](../translation/en-US.toml) as a reference. It is the only file that is up to date and comes straight from the developers. Do not use any other files!

Then you can start a test server with `npx nodemon` and start translating. If you head to your browser at address `https://localhost:3443` the website should be there and it should automatically update as you make your changes (after reloading the page). Make sure you have selected the language that you are editing in the website's UI. At the bottom, there is a footer with a language selection dropdown menu at the bottom of almost every page.

In case you are updating an existing language and you aren't sure what has changed since the last update, you can view changes of `en-US.toml` [here](https://github.com/Infinite-Chess/infinitechess.org/commits/main/translation/en-US.toml).

> [!IMPORTANT]
> If there is an HTML tag in the value you want to translate, do not modify it!
> 
> Example of an HTML tag:
> ```html
> <a href="https://www.google.com"> Hello World </a>
> ```
> In this example you should only change the words *Hello World*.

When you are finished, you should open a pull request as described in [SETUP.md](./SETUP.md).

## Conclusion ##

Thank you for your contribution! In case you have any troubles or questions, you can join [the discord](https://discord.gg/NFWFGZeNh5).
